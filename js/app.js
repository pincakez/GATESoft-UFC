/* =====================================================================
   GATESOFT — Ultimate Files Converter  |  js/app.js
   ===================================================================== */

// ── PDF.JS Worker ──
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── IMAGE SETTINGS ──
// Max canvas dimension in pixels to keep token usage under TPM limits.
// At 150 DPI, an A4 page = ~1240×1754px which is fine.
// We enforce a max long-edge of 1600px when the page is very large.
const IMAGE_MAX_PX   = 1600;   // max long-edge pixels
const IMAGE_QUALITY  = 0.80;   // JPEG quality — 0.80 is the sweet spot for Arabic OCR accuracy vs token count

// ── MODEL CONFIGS ──
//
// delay      = safe between-page delay = 60s ÷ RPM + 2s buffer
// retryDelay = initial wait when a retry is triggered (doubles each attempt)
// preview    = true means 503 Service Unavailable errors are common (limited capacity)
//
const MODEL_CONFIGS = {
  'gemini-3.1-flash-lite-preview': {
    label:               'Gemini 3.1 Flash-Lite',
    rpm:                 15,
    rpd:                 1000,
    delay:               6000,
    retryDelay:          30000,
    badge:               '15 RPM · 1K RPD',
    tag:                 '⚡ FASTEST',
    preview:             true,
    supportsThinking:    true,
    recommendedThinking: 'low'   // light thinking is enough for simple docs
  },
  'gemini-2.5-flash-lite': {
    label:               'Gemini 2.5 Flash-Lite',
    rpm:                 15,
    rpd:                 1000,
    delay:               6000,
    retryDelay:          25000,
    badge:               '15 RPM · 1K RPD',
    tag:                 '🚀 FAST',
    preview:             false,
    supportsThinking:    false,
    recommendedThinking: null    // no thinking support
  },
  'gemini-2.5-flash': {
    label:               'Gemini 2.5 Flash',
    rpm:                 10,
    rpd:                 500,
    delay:               8000,
    retryDelay:          20000,
    badge:               '10 RPM · 500 RPD',
    tag:                 '🎯 BALANCED',
    preview:             false,
    supportsThinking:    true,
    recommendedThinking: 'medium' // standard thinking for complex Arabic docs
  },
  'gemini-3-flash-preview': {
    label:               'Gemini 3 Flash (Preview)',
    rpm:                 10,
    rpd:                 250,
    delay:               8000,
    retryDelay:          35000,
    badge:               '10 RPM · 250 RPD',
    tag:                 '🔬 SHARPEST',
    preview:             true,
    supportsThinking:    true,
    recommendedThinking: 'high'  // deep thinking for handwriting & max quality
  }
};

// ── THEME ──
let isDark = false;

function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
  document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
  const logo = document.getElementById('brandLogo');
  if (logo) logo.src = isDark ? 'assets/500nonwhite.png' : 'assets/500nonblack.png';
}


// ── STATE ──
const S = {
  file: null, pdfDoc: null, totalPages: 0,
  inputType: null, textContent: null,
  fmt: 'docx', pdfMode: 'split',
  dpi: 150, thinking: 'none',
  align: 'auto',
  rephrase: false, grammar: false, autoAnswer: false,
  processing: false, cancelled: false,
  results: [], apiValid: false,
  model: 'gemini-3.1-flash-lite-preview'   // default model
};

function selAlign(el, align) {
  document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  S.align = align;
}

// ── MODEL SELECTOR ──
function selectModel(modelId) {
  if (!MODEL_CONFIGS[modelId]) return;
  S.model = modelId;
  const cfg = MODEL_CONFIGS[modelId];

  // Update model buttons
  document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('sel'));
  const btn = document.getElementById('mbtn-' + modelId);
  if (btn) btn.classList.add('sel');

  // Update SESSION INFO
  document.getElementById('mStat').textContent    = cfg.label;
  document.getElementById('rpmStat').textContent   = cfg.badge;
  document.getElementById('delayStat').textContent = `${cfg.delay/1000}s page · ${cfg.retryDelay/1000}s retry`;

  // Show / hide thinking section entirely for non-thinking models
  const thinkSection = document.getElementById('thinkSection');
  const thinkDivider = document.getElementById('thinkDivider');
  if (thinkSection) thinkSection.style.display = cfg.supportsThinking ? '' : 'none';
  if (thinkDivider) thinkDivider.style.display  = cfg.supportsThinking ? '' : 'none';

  // Show RECOMMENDED badge on the right thinking level
  ['none','low','medium','high'].forEach(lvl => {
    const rec = document.getElementById('trec-' + lvl);
    if (rec) rec.style.display = (cfg.recommendedThinking === lvl) ? 'inline-block' : 'none';
  });

  // Auto-select the recommended thinking level when switching models
  if (cfg.supportsThinking && cfg.recommendedThinking) {
    const recBtn = document.getElementById('tbtn-' + cfg.recommendedThinking);
    if (recBtn && !recBtn.classList.contains('sel')) {
      document.querySelectorAll('.think-btn').forEach(b => b.classList.remove('sel'));
      recBtn.classList.add('sel');
      S.thinking = cfg.recommendedThinking;
      const statMap = { none:'MINIMAL', low:'LOW', medium:'MEDIUM', high:'HIGH' };
      document.getElementById('tStat').textContent = statMap[cfg.recommendedThinking] || cfg.recommendedThinking.toUpperCase();
    }
  }

  // Toast
  if (cfg.preview) {
    toast('warn', '⚠️', `${cfg.label} is a preview model — 503 errors are common, app will auto-retry.`);
  } else if (!cfg.supportsThinking) {
    toast('warn', '💡', `${cfg.label}: no thinking support. Best for fast bulk conversions of Arabic text.`);
  } else {
    toast('info', '🤖', `${cfg.label} · Recommended thinking: ${cfg.recommendedThinking?.toUpperCase() || 'OFF'}`);
  }
}

// ── API KEY ──
let keyTimer = null;
let abortController = null;

function onKeyInput() {
  const val   = document.getElementById('keyInput').value.trim();
  const inp   = document.getElementById('keyInput');
  const hint  = document.getElementById('keyHint');
  const badge = document.getElementById('engineBadge');
  const etxt  = document.getElementById('eText');

  clearTimeout(keyTimer);
  inp.className  = 'key-input k-typing';
  hint.className = 'key-hint h-typing';
  hint.textContent = '⚡ Validating...';

  keyTimer = setTimeout(() => {
    if (val.startsWith('AIza') && val.length > 20) {
      inp.className  = 'key-input k-valid';
      hint.className = 'key-hint h-ok';
      hint.textContent = '✅ API key accepted — ready to convert';
      badge.className  = 'engine-badge ready';
      etxt.textContent = 'ONLINE';
      S.apiValid = true;
    } else if (val.length > 0) {
      inp.className  = 'key-input k-error';
      hint.className = 'key-hint h-err';
      hint.textContent = '❌ Invalid format — key should start with AIza';
      badge.className  = 'engine-badge';
      etxt.textContent = 'INVALID KEY';
      S.apiValid = false;
    } else {
      inp.className  = 'key-input';
      hint.className = 'key-hint';
      hint.textContent = 'Enter your Google AI Studio API key to unlock conversion';
      badge.className  = 'engine-badge';
      etxt.textContent = 'READY';
      S.apiValid = false;
    }
    updateRun();
  }, 500);
}

function toggleKeyVis() {
  const inp = document.getElementById('keyInput');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ── FILE ──
function triggerFile() { if (!S.processing) document.getElementById('fileInput').click(); }
function onDragOver(e) { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag'); }
function onDragLeave()  { document.getElementById('uploadZone').classList.remove('drag'); }
function onDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) loadFile(f);
}
function onFileSelect(e) { const f = e.target.files[0]; if (f) loadFile(f); }

async function loadFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const supported = ['pdf','png','jpg','jpeg','txt','md','docx','odt'];
  if (!supported.includes(ext)) { toast('err','❌','Unsupported file type.'); return; }
  if (file.size > 100*1024*1024) { toast('err','❌',`File too large (${fmtSize(file.size)}). Max 100 MB.`); return; }
  
  S.file = file;
  document.getElementById('chipName').textContent = file.name;
  document.getElementById('fileChip').classList.add('show');
  document.getElementById('uploadZone').classList.add('has-file');

  try {
    if (ext === 'pdf') {
      S.inputType = 'pdf';
      const buf = await file.arrayBuffer();
      S.pdfDoc  = await pdfjsLib.getDocument({ data: buf }).promise;
      S.totalPages = S.pdfDoc.numPages;
    } else if (['png','jpg','jpeg'].includes(ext)) {
      S.inputType = 'image';
      S.totalPages = 1;
    } else if (['txt','md'].includes(ext)) {
      S.inputType = 'text';
      S.textContent = await file.text();
      S.totalPages = 1;
    } else if (ext === 'docx') {
      S.inputType = 'text';
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({arrayBuffer: buf});
      S.textContent = result.value;
      S.totalPages = 1;
    } else if (ext === 'odt') {
      S.inputType = 'text';
      const zip = await JSZip.loadAsync(file);
      const contentXml = zip.file("content.xml");
      if (contentXml) {
        const xml = await contentXml.async("string");
        S.textContent = xml.replace(/<text:p[^>]*>/g, '\n').replace(/<[^>]+>/g, '');
      } else {
        S.textContent = "";
      }
      S.totalPages = 1;
    }

    document.getElementById('chipMeta').textContent = `${fmtSize(file.size)} · ${S.totalPages} item(s)`;
    document.getElementById('pgBadge').textContent  = `${S.totalPages} ITEM(S)`;
    document.getElementById('pageTo').value          = S.totalPages;
    document.getElementById('pageFrom').max          = S.totalPages;
    document.getElementById('pageTo').max            = S.totalPages;
    document.querySelector('.chip-icon').textContent = ext.toUpperCase();
    updateRun();
    toast('ok','✅',`Loaded "${file.name}"`);
  } catch(e) { toast('err','❌','Failed to read file. It may be corrupted.'); console.error(e); }
}

function removeFile() {
  S.file = null; S.pdfDoc = null; S.totalPages = 0; S.inputType = null; S.textContent = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('fileChip').classList.remove('show');
  document.getElementById('uploadZone').classList.remove('has-file');
  document.getElementById('pgBadge').textContent = '';
  updateRun();
}

// ── TOGGLES ──
function onRangeToggle() {
  const on = document.getElementById('rangeToggle').checked;
  document.getElementById('pageFrom').disabled = !on;
  document.getElementById('pageTo').disabled   = !on;
}

function onSpliceToggle() {
  const on = document.getElementById('spliceToggle').checked;
  document.getElementById('spliceGroup').style.display = on ? 'block' : 'none';
}

// ── FORMAT ──
function selFmt(el, fmt) {
  document.querySelectorAll('.fmt-btn:not(.align-btn)').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  S.fmt = fmt;
  document.getElementById('pdfSub').className = 'pdf-sub' + (fmt === 'pdf' ? ' show' : '');
  document.getElementById('aiOptionsCard').style.display = ''; // ALWAYS show
  document.getElementById('fStat').textContent = fmt.toUpperCase();
}

function selAlign(el, align) {
  document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  S.align = align;
}

function selPdfOpt(mode) {
  S.pdfMode = mode;
  document.getElementById('pdfOptSplit').className = 'pdf-opt' + (mode === 'split' ? ' sel' : '');
  document.getElementById('pdfOptRecon').className = 'pdf-opt' + (mode === 'recon' ? ' sel' : '');
  document.getElementById('aiOptionsCard').style.display = ''; // ALWAYS show
}

// ── AI OPTIONS ──
function selDpi(el, dpi) {
  document.querySelectorAll('.dpi-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  S.dpi = dpi;
  document.getElementById('sStat').textContent = `${dpi} DPI`;
}

function selThink(el, level) {
  document.querySelectorAll('.think-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  S.thinking = level;
  const statMap = { none:'MINIMAL', low:'LOW', medium:'MEDIUM', high:'HIGH' };
  document.getElementById('tStat').textContent = statMap[level] || level.toUpperCase();
}

function toggleEnhance(type) {
  S[type] = !S[type];
  const idBase = type === 'autoAnswer' ? 'AutoAnswer' : type.charAt(0).toUpperCase() + type.slice(1);
  document.getElementById('opt' + idBase).classList.toggle('sel', S[type]);
  document.getElementById('chk' + idBase).textContent = S[type] ? '✓' : '';
  
  if (type === 'autoAnswer' && S[type]) {
    // Recommend High thinking if auto-answer is enabled
    if (S.thinking === 'none' || S.thinking === 'low') {
      const hBtn = document.getElementById('tbtn-medium');
      if (hBtn) selThink(hBtn, 'medium');
      toast('info', '🧠', 'Recommended: Enabled Medium Thinking for better question answering.');
    }
  }
  updateEnhanceStat();
}

function updateEnhanceStat() {
  const parts = [];
  if (S.rephrase)   parts.push('REPHRASE');
  if (S.grammar)    parts.push('GRAMMAR');
  if (S.autoAnswer) parts.push('ANSWERS');
  document.getElementById('eStat').textContent = parts.length ? parts.join(' + ') : 'NONE';
}

// ── RUN BUTTON ──
function updateRun() {
  document.getElementById('btnRun').disabled = !(S.apiValid && S.file && !S.processing);
}

// ── PROCESSING ──
async function startProcessing() {
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.log("startProcessing called!");
    if (!S.file) { alert("Missing file"); return; }
    if (!S.apiValid) { alert("API key not valid"); return; }
    if (S.inputType === 'pdf' && !S.pdfDoc) { alert("PDF doc missing"); return; }

    if (abortController) abortController.abort();
    abortController = new AbortController();

    const apiKey     = document.getElementById('keyInput').value.trim();
    const fmt        = S.fmt;
    const isImg      = fmt === 'png' || fmt === 'jpg';
    const isPdfSplit = fmt === 'pdf' && S.pdfMode === 'split';

    const rangeOn = document.getElementById('rangeToggle').checked;
    let from = rangeOn ? parseInt(document.getElementById('pageFrom').value) : 1;
    let to   = rangeOn ? parseInt(document.getElementById('pageTo').value)   : S.totalPages;
    from = Math.max(1, Math.min(from, S.totalPages || 1));
    to   = Math.max(from, Math.min(to, S.totalPages || 1));

    const spliceOn = document.getElementById('spliceToggle').checked;
    const spliceN  = spliceOn ? Math.max(1, parseInt(document.getElementById('spliceEvery').value)||5) : 0;

    // Get delay for the selected model
    const modelCfg  = MODEL_CONFIGS[S.model];
    const pageDelay = modelCfg ? modelCfg.delay : 5000;

    S.processing = true; S.cancelled = false; S.results = [];
    document.getElementById('btnRun').disabled = true;
    document.getElementById('btnStop').style.display = 'block';
    document.getElementById('resultsCard').style.display = 'none';
    document.getElementById('resultsList').innerHTML = '';

    renderLog();

    const pages  = [];
    for (let p = from; p <= to; p++) pages.push(p);
    const groups = spliceOn ? chunkArr(pages, spliceN) : [pages];
    const total  = pages.length;
  let done     = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    if (S.cancelled) break;
    const group = groups[gi];
    const texts = [];
    const imgs  = [];

    for (let pi = 0; pi < group.length; pi++) {
      if (S.cancelled) break;
      const pg = group[pi];
      addLog(pg, 'proc', '🔄 Rendering page...');

      try {
        let b64 = null;
        let textInput = null;

        // Calculate if we need AI.
        // Cases where we DON'T need AI:
        // 1. PDF input, user wants Split output (isPdfSplit is true)
        // 2. PDF input, user wants PNG/JPG output, AND neither rephrase nor grammar are toggled.
        // 3. Image input, user wants PNG/JPG output, AND neither rephrase nor grammar are toggled.
        let needsAi = true;
        if (isPdfSplit) needsAi = false;
        if (isImg && !S.rephrase && !S.grammar && (S.inputType === 'pdf' || S.inputType === 'image')) needsAi = false;

        if (S.inputType === 'pdf') {
          const canvas = await renderPage(pg, S.dpi);
          if (!needsAi) {
            // Direct pass-through
            const mime   = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
            const dataUrl = canvas.toDataURL(mime, 0.88);
            imgs.push({ pg, dataUrl, fmt: isImg ? fmt : 'png' });
            updateLog(pg, 'ok', '✅ Page rendered');
          } else {
            // Prepare for AI
            b64 = canvas.toDataURL('image/jpeg', IMAGE_QUALITY).split(',')[1];
          }
        } else if (S.inputType === 'image') {
          const dataUrl = await fileToDataUrl(S.file);
          if (!needsAi) {
            // Pass-through rasterization
            imgs.push({ pg, dataUrl, fmt: fmt });
            updateLog(pg, 'ok', '✅ Image loaded');
          } else {
            // Prepare for AI
            b64 = dataUrl.split(',')[1];
          }
        } else if (S.inputType === 'text') {
          textInput = S.textContent;
        }

        if (needsAi) {
          updateLog(pg, 'proc', `🧠 AI processing (${modelCfg?.label || S.model})...`);
          const text = await callWithRetry(apiKey, b64, textInput, fmt, pg);
          texts.push({ pg, text });
          updateLog(pg, 'ok', `✅ Done · ${text.length} chars`);
          
          if (isImg) {
            updateLog(pg, 'proc', `🖼️ Rendering AI output to image...`);
            const html = markdownToHtml(text);
            const dataUrl = await htmlToDataUrl(html);
            // Replace the array since this replaces the input image
            imgs.push({ pg, dataUrl, fmt: fmt });
            updateLog(pg, 'ok', `✅ Image rendered`);
          }
        }


        done++;
        updProg(done, total);
        document.getElementById('pgCounter').textContent = `${done}/${total}`;

      } catch(err) {
        updateLog(pg, 'err', `❌ ${err.message}`);
        texts.push({ pg, text: `[PAGE ${pg} ERROR: ${err.message}]` });
        done++;
        updProg(done, total);
        toast('warn','⚠️',`Page ${pg}: ${err.message}`);
      }

      // ── RATE-LIMIT GUARD: wait between pages (not after the last one) ──
      if (pi < group.length - 1 && !S.cancelled && !isImg && !isPdfSplit) {
        updateLog(pg, 'ok', `✅ Done · waiting ${pageDelay/1000}s (rate safety)…`);
        await sleep(pageDelay);
      }
    }

    if (S.cancelled) break;

    const suffix = groups.length > 1 ? `_part${gi+1}` : '';
    const base   = S.file.name.replace(/\.[^/.]+$/, '') + suffix;

    if (isImg) {
      for (const img of imgs) addResult(`${base}_p${img.pg}.${img.fmt}`, img.dataUrl, img.fmt);
    } else if (isPdfSplit) {
      await buildSplitPdf(imgs, base);
    } else {
      await buildOutput(fmt, texts, base);
    }
  }

  S.processing = false;
  updateRun();
  document.getElementById('btnStop').style.display = 'none';

  const progFill = document.getElementById('progFill');
  if (progFill) progFill.classList.add('done');

  if (!S.cancelled) {
    toast('ok','🎉',`Done! ${S.results.length} file(s) ready.`);
    document.getElementById('resultsCard').style.display = '';
  } else {
    toast('warn','⛔','Processing stopped.');
  }
  } catch (err) {
    alert("FATAL ERROR IN PIPELINE:\n" + err.message + "\n\n" + err.stack);
    console.error(err);
    S.processing = false;
    updateRun();
  }
}

function stopProcessing() { 
  S.cancelled = true; 
  if (abortController) abortController.abort();
}

// ── RENDER PAGE ──
// Enforces IMAGE_MAX_PX cap so token usage stays within TPM limits.
async function renderPage(pg, dpi) {
  const page  = await S.pdfDoc.getPage(pg);
  let scale   = dpi / 72;
  let vp      = page.getViewport({ scale });

  // Scale down if either dimension exceeds the cap
  const longEdge = Math.max(vp.width, vp.height);
  if (longEdge > IMAGE_MAX_PX) {
    scale = scale * (IMAGE_MAX_PX / longEdge);
    vp    = page.getViewport({ scale });
  }

  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas;
}

// ── GEMINI API WITH RETRY ──
//
// Handles two distinct server-side error types:
//
//  429 TooManyRequests  → Rate limit (RPM/TPM) hit. Wait retryDelay × attempt, then retry.
//  503 ServiceUnavailable → Server overloaded (common with preview models).
//                           Wait retryDelay × 2 per attempt (longer, since it's capacity not quota).
//
// Max 4 attempts total (1 original + 3 retries).
//
async function callWithRetry(apiKey, b64, textInput, fmt, pg, attempt=1, forceNoThink=false) {
  const cfg = MODEL_CONFIGS[S.model] || {};
  const baseDelay = cfg.retryDelay || 25000;
  const MAX_ATTEMPTS = 4;

  try {
    const text = await callGemini(apiKey, b64, textInput, fmt, forceNoThink);

    // Repetition loop detection — if model got stuck, retry once without thinking
    if (detectRepetition(text)) {
      if (attempt < MAX_ATTEMPTS) {
        updateLog(pg, 'retry',
          `🔁 Repetition loop detected — retrying with adjusted settings (attempt ${attempt}/${MAX_ATTEMPTS-1})…`);
        await sleep(3000);
        // On repetition: force no-think mode and retry (avoids the model going in circles)
        return callWithRetry(apiKey, b64, textInput, fmt, pg, attempt + 1, true);
      } else {
        // Mark in output so user can see which pages had issues
        return text + '\n\n⚠️ [GATESOFT: Repetition loop detected on this page. Model struggled with the content. Try Gemini 2.5 Flash with Thinking = MEDIUM for better results.]';
      }
    }

    return text;
  } catch(e) {
    const is429 = e.message.includes('RATE') || e.message.includes('429') || e.message.includes('quota');
    const is503 = e.message.includes('503') || e.message.includes('SERVICE') || e.message.includes('UNAVAILABLE') || e.message.includes('overloaded');

    if ((is429 || is503) && attempt < MAX_ATTEMPTS) {
      const multiplier = is503 ? attempt * 2 : attempt;
      const wait = baseDelay * multiplier;
      const errorType = is503 ? '503 Service Unavailable (server overloaded)' : '429 Rate Limit';
      updateLog(pg, 'retry',
        `⏳ ${errorType} — waiting ${Math.round(wait/1000)}s before retry ${attempt}/${MAX_ATTEMPTS-1}…`);
      await sleep(wait);
      return callWithRetry(apiKey, b64, textInput, fmt, pg, attempt + 1, forceNoThink);
    }

    throw e;
  }
}

// ── REPETITION LOOP DETECTOR ──
// Catches when the model gets stuck repeating the same phrase (common on dense Arabic text
// when the model has no thinking support or the image was too blurry).
// Returns true if any word-phrase of length 3-6 words repeats 6+ times.
function detectRepetition(text) {
  const words = text.trim().split(/\s+/);
  if (words.length < 30) return false;  // short output is fine
  for (let phraseLen = 3; phraseLen <= 7; phraseLen++) {
    const seen = {};
    for (let i = 0; i <= words.length - phraseLen; i++) {
      const phrase = words.slice(i, i + phraseLen).join(' ');
      seen[phrase] = (seen[phrase] || 0) + 1;
      if (seen[phrase] >= 6) return true;
    }
  }
  return false;
}

async function callGemini(apiKey, b64, textInput, fmt, forceNoThink = false) {
  const model = S.model;   // use whatever the user selected

  const modelCfg = MODEL_CONFIGS[model] || {};

  // Only apply thinking instructions if the model actually supports it
  const canThink = modelCfg.supportsThinking && !forceNoThink;

  const fmtInstr = {
    docx:   'Output as Markdown. Use # ## ### for headings. Use | col | col | for tables. Use - for lists.',
    txt:    'Output plain text only, no Markdown symbols.',
    md:     'Output well-structured Markdown with proper heading hierarchy and tables.',
    'md-ai':'Output clean semantic Markdown optimized for AI processing. Clear sections, no decorative elements.',
    pdf:    'Output as clean structured Markdown preserving all layout.'
  };

  const thinkInstr = !canThink ? '' : {
    none:   '',
    low:    ' Apply minimal reasoning before output.',
    medium: ' Reason carefully through ambiguous text before outputting.',
    high:   ' Take time to deeply analyze every element — especially handwriting, tables, and noise — before outputting. Accuracy over speed.'
  }[S.thinking] || '';

  let enhanceLines = [];
  if (S.rephrase)   enhanceLines.push('Rephrase sentences for better clarity while preserving exact meaning.');
  if (S.grammar)    enhanceLines.push('Fix all grammar and spelling errors.');
  if (S.autoAnswer) enhanceLines.push('CRITICAL: Identify any questions in the document. Infer the course/subject context and provide accurate answers or solutions for each question immediately after the question text.');
  
  const enhanceInstr = enhanceLines.length ? '\n\nENHANCEMENT REQUESTS:\n- ' + enhanceLines.join('\n- ') : '';

  const prompt = `You are an expert Arabic and multilingual document OCR and reconstruction engine.

TASK: Extract and output ALL content from this document image with maximum fidelity.${thinkInstr}

CRITICAL ANTI-REPETITION RULES (follow strictly):
- NEVER repeat the same phrase, clause, or sentence more than once.
- Each line of output must be UNIQUE. If you catch yourself repeating, STOP and move to the next visible element.
- If a word or phrase appears repeated in the image itself, output it ONCE followed by … — do not copy the repetition.
- These rules override everything else.

EXTRACTION RULES:
- Output ONLY the extracted content. Zero preamble, zero commentary.
- Reading order: RIGHT-TO-LEFT for Arabic, LEFT-TO-RIGHT for Latin/English.
- Tables: detect cell boundaries → output as Markdown table (| col | col |\\n|---|---|\\n| val | val |).
- Headings: detect visual size/weight hierarchy → use # ## ### accordingly.
- Handwriting: decode stroke by stroke before committing to output.
- Scan noise (dots, lines, smudges): ignore completely.
- Blank dotted answer lines: output as a single blank line.
- Do NOT say "I cannot", "Here is", "The image shows" or any filler.
- Start with the very first character of content immediately.${enhanceInstr}

FORMAT: ${fmtInstr[fmt] || fmtInstr.txt}

Begin:`;

  const parts = [];
  if (b64) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
  } else if (textInput) {
    parts.push({ text: "SOURCE TEXT:\n" + textInput + "\n\n" });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature:     0.1,    // small variance helps escape repetition loops (was 0.0)
      maxOutputTokens: 8192,
      topK:            10,     // wider beam = better at avoiding stuck loops (was 1)
      topP:            0.85    // allow more diversity in token selection (was 0.05)
    },
    safetySettings: [
      { category:'HARM_CATEGORY_HARASSMENT',        threshold:'BLOCK_NONE' },
      { category:'HARM_CATEGORY_HATE_SPEECH',       threshold:'BLOCK_NONE' },
      { category:'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold:'BLOCK_NONE' },
      { category:'HARM_CATEGORY_DANGEROUS_CONTENT', threshold:'BLOCK_NONE' }
    ]
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController?.signal
    });
  } catch(e) { 
    if (e.name === 'AbortError') throw new Error('Canceled by user');
    throw new Error('Network error — check your internet connection'); 
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    if (res.status === 429) throw new Error('RATE LIMIT: ' + msg.slice(0, 80));
    if (res.status === 404) throw new Error(`Model "${model}" not found. Try a different model.`);
    throw new Error(msg.slice(0, 100));
  }

  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

// ── BUILD OUTPUT ──
async function buildOutput(fmt, pages, base) {
  const content = pages.map(p => p.text).join('\n\n---\n\n');
  if (fmt === 'txt') {
    addResult(`${base}.txt`, blobUrl(content, 'text/plain'), 'txt');
  } else if (fmt === 'md' || fmt === 'md-ai') {
    addResult(`${base}.md`, blobUrl(content, 'text/markdown'), 'md');
  } else if (fmt === 'docx') {
    await buildDocx(pages, base);
  } else if (fmt === 'odt') {
    await buildOdt(content, base);
  } else if (fmt === 'pdf') {
    await buildReconPdf(pages, base);
  }
}

async function buildDocx(pages, base) {
  try {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            HeadingLevel, AlignmentType, BorderStyle, WidthType, PageBreak } = window.docx;

    const children = [];

    const docAlign = S.align === 'ltr' ? AlignmentType.LEFT : S.align === 'center' ? AlignmentType.CENTER : AlignmentType.RIGHT;
    const isBidi   = S.align === 'ltr' ? false : true;

    for (let pi = 0; pi < pages.length; pi++) {
      const { pg, text } = pages[pi];

      if (pi > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      const lines = text.split('\n');
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trim();

        if (line.startsWith('### ')) {
          children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3, bidirectional: isBidi, alignment: docAlign }));
        } else if (line.startsWith('## ')) {
          children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2, bidirectional: isBidi, alignment: docAlign }));
        } else if (line.startsWith('# ')) {
          children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1, bidirectional: isBidi, alignment: docAlign }));
        } else if (line.startsWith('|') && i+1 < lines.length && lines[i+1].trim().match(/^\|[-| :]+\|$/)) {
          const tableLines = [];
          while (i < lines.length && lines[i].trim().startsWith('|')) {
            const r = lines[i].trim();
            if (!r.match(/^\|[-| :]+\|$/)) tableLines.push(r);
            i++;
          }
          if (tableLines.length > 0) {
            const rows = tableLines.map(row => {
              const cells = row.split('|').filter((_,idx,arr) => idx>0 && idx<arr.length-1);
              return new TableRow({
                children: cells.map(cell => new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: cell.trim(), font:'Traditional Arabic', size:22 })],
                    bidirectional: isBidi, alignment: docAlign
                  })],
                  borders: {
                    top:   {style:BorderStyle.SINGLE,size:1,color:'cccccc'},
                    bottom:{style:BorderStyle.SINGLE,size:1,color:'cccccc'},
                    left:  {style:BorderStyle.SINGLE,size:1,color:'cccccc'},
                    right: {style:BorderStyle.SINGLE,size:1,color:'cccccc'}
                  }
                }))
              });
            });
            children.push(new Table({ rows, width:{size:100,type:WidthType.PERCENTAGE} }));
            children.push(new Paragraph({text:''}));
            continue;
          }
        } else if (line === '---' || line === '') {
          children.push(new Paragraph({text:''}));
        } else {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, font:'Traditional Arabic', size:24 })],
            bidirectional: isBidi, alignment: docAlign, spacing:{after:80}
          }));
        }
        i++;
      }
    }

    const doc = new Document({
      sections: [{ properties:{bidi:isBidi}, children }],
      styles: { default:{ document:{ run:{font:'Traditional Arabic',size:24} } } }
    });

    const blob = await Packer.toBlob(doc);
    addResult(`${base}.docx`, URL.createObjectURL(blob), 'docx');
  } catch(e) {
    console.error('DOCX error:', e);
    toast('warn','⚠️','DOCX generation failed — saving as TXT');
    const txt = pages.map(p => p.text).join('\n\n---\n\n');
    addResult(`${base}.txt`, blobUrl(txt,'text/plain'), 'txt');
  }
}

async function buildOdt(content, base) {
  try {
    let alignAtt = 'right';
    let modeAtt  = 'rl-tb'; // Right to left, top to bottom
    if (S.align === 'ltr') { alignAtt = 'left'; modeAtt = 'lr-tb'; }
    else if (S.align === 'center') { alignAtt = 'center'; }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.3">
<office:automatic-styles>
  <style:style style:name="rtl" style:family="paragraph">
    <style:paragraph-properties fo:text-align="${alignAtt}" style:writing-mode="${modeAtt}"/>
    <style:text-properties fo:font-size="14pt"/>
  </style:style>
</office:automatic-styles>
<office:body><office:text>
${content.split('\n').map(l => `<text:p text:style-name="rtl">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</text:p>`).join('\n')}
</office:text></office:body></office:document-content>`;

    const blob = new Blob([xml], { type:'application/vnd.oasis.opendocument.text' });
    addResult(`${base}.odt`, URL.createObjectURL(blob), 'odt');
    toast('info','ℹ️','ODT saved — for full formatting, open in LibreOffice');
  } catch(e) {
    toast('warn','⚠️','ODT failed — saving as TXT');
    addResult(`${base}.txt`, blobUrl(content,'text/plain'), 'txt');
  }
}

async function buildSplitPdf(imgs, base) {
  for (const img of imgs) {
    addResult(`${base}_p${img.pg}.png`, img.dataUrl, 'png');
  }
}

async function buildReconPdf(pages, base) {
  let dir  = 'rtl'; 
  let aln  = 'right'; 
  if (S.align === 'ltr') { dir = 'ltr'; aln = 'left'; }
  else if (S.align === 'center') { dir = 'auto'; aln = 'center'; }
  else if (S.align === 'auto') { dir = 'rtl'; aln = 'right'; }

  const htmlContent = `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<style>
  body{font-family:'Traditional Arabic',serif;direction:${dir};text-align:${aln};padding:40px;font-size:14px;line-height:1.8;}
  h1{font-size:22px;} h2{font-size:18px;} h3{font-size:16px;}
  table{width:100%;border-collapse:collapse;margin:12px 0;}
  td,th{border:1px solid #ccc;padding:8px;text-align:right;}
  hr{border:1px solid #eee;margin:20px 0;}
  .page-break{page-break-before:always;}
</style></head><body>
${pages.map((p,i) => `${i>0?'<div class="page-break"></div>':''}${markdownToHtml(p.text)}`).join('')}
</body></html>`;

  const blob = new Blob([htmlContent], { type:'text/html;charset=utf-8' });
  addResult(`${base}_reconstructed.html`, URL.createObjectURL(blob), 'html');
  toast('info','ℹ️','Saved as HTML — open in browser → Print → Save as PDF for best results');
}

function markdownToHtml(md) {
  return md
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/^\|(.+)\|$/gm, (m) => {
      if (m.match(/^\|[-| :]+\|$/)) return '';
      const cells = m.split('|').filter((_,i,a) => i>0 && i<a.length-1);
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, m => `<table>${m}</table>`)
    .replace(/^---$/gm,'<hr/>')
    .replace(/^(?!<[h|t|h]).+$/gm, m => m ? `<p>${m}</p>` : '')
    .replace(/\n{3,}/g,'\n\n');
}

// ── LOG UI ──
function renderLog() {
  document.getElementById('logCard').innerHTML = `
    <div style="margin-bottom:16px">
      <div class="prog-header">
        <span class="prog-lbl">OVERALL PROGRESS</span>
        <span class="prog-pct" id="pctLbl">0%</span>
      </div>
      <div class="prog-track"><div class="prog-fill" id="progFill" style="width:0%"></div></div>
    </div>
    <div class="log-scroll" id="logScroll"></div>
  `;
}

function updProg(done, total) {
  const pct = Math.round(done/total*100);
  const f = document.getElementById('progFill');
  const l = document.getElementById('pctLbl');
  if (f) f.style.width = pct + '%';
  if (l) l.textContent = pct + '%';
}

function addLog(pg, type, msg) {
  const scroll = document.getElementById('logScroll');
  if (!scroll) return;
  const cls = { proc:'lv-proc', ok:'lv-ok', err:'lv-err', retry:'lv-retry' }[type] || '';
  const el  = document.createElement('div');
  el.className = `log-item ${cls}`;
  el.id = `log-${pg}`;
  el.innerHTML = `<div class="log-item-header"><span class="log-pg">PG.${String(pg).padStart(3,'0')}</span><span class="log-ico"></span></div><div class="log-msg">${msg}</div>`;
  scroll.appendChild(el);
  scroll.scrollTop = scroll.scrollHeight;
}

function updateLog(pg, type, msg) {
  let el = document.getElementById(`log-${pg}`);
  if (!el) return;
  
  // Clone and replace to force CSS animations to restart (like checkmark smash)
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  el = clone; // reference the new element

  const cls = { proc:'lv-proc', ok:'lv-ok', err:'lv-err', retry:'lv-retry' }[type] || '';
  el.className = `log-item ${cls}`;
  el.querySelector('.log-msg').textContent = msg;
}

// ── RESULTS ──
function addResult(name, url, ext) {
  S.results.push({ name, url, ext });
  document.getElementById('resultsCard').style.display = '';
  const list = document.getElementById('resultsList');
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `<span style="font-size:17px">${extIco(ext)}</span><span class="result-name">${name}</span><button class="btn-dl" onclick="dl('${url}','${name}')">⬇ DOWNLOAD</button>`;
  list.appendChild(item);
}

function dl(url, name) { const a = document.createElement('a'); a.href=url; a.download=name; a.click(); }
function extIco(e) { return {txt:'📝',md:'⬇️',docx:'📘',odt:'📗',png:'🖼️',jpg:'📷',html:'🌐',pdf:'📕'}[e]||'📄'; }

// ── HELPERS ──
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function htmlToDataUrl(html) {
  return new Promise(async (resolve) => {
    let dir  = 'auto';
    let aln  = 'inherit';
    if (S.align === 'rtl' || S.align === 'auto') { dir = 'rtl'; aln = 'right'; }
    else if (S.align === 'ltr') { dir = 'ltr'; aln = 'left'; }
    else if (S.align === 'center') { aln = 'center'; }

    const div = document.createElement('div');
    div.innerHTML = `<div dir="${dir}" style="text-align:${aln}">${html}</div>`;
    div.style.width = '800px';
    div.style.padding = '40px';
    div.style.background = isDark ? '#1a1d27' : '#ffffff';
    div.style.color = isDark ? '#ffffff' : '#000000';
    div.style.fontFamily = 'sans-serif';
    div.style.fontSize = '16px';
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    document.body.appendChild(div);
    const canvas = await html2canvas(div);
    document.body.removeChild(div);
    resolve(canvas.toDataURL('image/png'));
  });
}

function blobUrl(t, mime) { return URL.createObjectURL(new Blob([t],{type:mime+';charset=utf-8'})); }
function fmtSize(b) { if(b<1024)return b+' B'; if(b<1048576)return(b/1024).toFixed(1)+' KB'; return(b/1048576).toFixed(1)+' MB'; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function chunkArr(arr, n) { const c=[]; for(let i=0;i<arr.length;i+=n) c.push(arr.slice(i,i+n)); return c; }

// ── TOAST ──
function toast(type, ico, msg) {
  const wrap = document.getElementById('toastWrap');
  const el   = document.createElement('div');
  const cls  = {err:'t-err',ok:'t-ok',warn:'t-warn',info:'t-info'}[type]||'';
  el.className = `toast ${cls}`;
  el.innerHTML = `<span class="toast-ico">${ico}</span><span class="toast-body">${msg}</span><button class="toast-x" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(el);
  setTimeout(() => { if(el.parentElement) el.remove(); }, 7000);
}
