<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/500nonwhite.png">
    <img src="assets/500nonblack.png" alt="GATESOFT Logo" width="220" />
  </picture>
</p>

# GATESOFT — Ultimate Files Converter
**Version: BETA 0.5 — Premium Dark Edition**


[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/pincakez/GATESoft-UFC)
[![GitHub Stars](https://img.shields.io/github/stars/pincakez/GATESoft-UFC?style=social)](https://github.com/pincakez/GATESoft-UFC)

> **Universal AI-powered file conversion engine**. Natively supports ingesting and exporting between PDF, DOCX, ODT, TXT, Markdown, PNG, and JPG. Optimized for Arabic (RTL) and multilingual documents with full table, heading reconstruction, and AI-driven Rephrasing/Grammar enhancement. Powered by Google Gemini API with intelligent rate limiting and instantaneous text-to-image rendering. **Now featuring native Dark Mode by default.**
Github Live Pgae https://pincakez.github.io/GATESoft-UFC

---

## ✨ Features

- **Universal Any-to-Any Converter**: Input **and** Output in PDF, DOCX, ODT, TXT, MD, PNG, and JPG.
- **AI-Powered Semantic Extraction**: Google Gemini API analyzes document structures, handwriting, tables, and nested content.
- **Premium Dark Mode**: Starts in dark mode for a professional, eye-friendly experience with dynamic theme switching.
- **Text-to-Image AI Rendering**: Enhance your grammar/vocabulary and immediately export the reconstructed elegant document as a new PNG/JPG.
- **Native Browser Processing**: Parses Word (Mammoth.js) and OpenDocument (JSZip) files locally with zero backend uploads!
- **Arabic & RTL Support**: Full Right-to-Left text handling with bi-directional (`bidi`) paragraph attributes.
- **Intelligent Error Recovery**: Auto-retry on rate limits (429), server overload (503), with dynamic repetition loop detection.
- **Thinking Modes & Enhancements**: Trade speed for accuracy using reasoning delays, Rephrase, and Grammar correction.
- **Questions Auto Answer**: Built-in classroom intelligence that identifies and solves questions within documents.
- **Precision Alignment**: Global control over text direction (AUTO, RTL, LTR, CENTER) for perfect semantic output.

---

## 🗂 Project Structure

```
GATESoft-UFC/
├── index.html               ← Main entry point (starts in Dark Mode)
├── css/
│   └── styles.css           ← All styles (premium dark-first theme, model selector)
├── js/
│   └── app.js               ← All logic, model configs, Gemini API integration
├── assets/
│   ├── 500nonblack.png      ← GATESOFT logo (Light Mode)
│   └── 500nonwhite.png      ← GATESOFT logo (Dark Mode)
└── README.md                ← This file
```

---

## 📋 Prerequisites

- **Web Browser**: Chrome, Edge, Firefox, or Safari (latest versions recommended)
- **Google API Key**: Free tier from [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Local Server**: Live Server extension (VS Code) or any local HTTP server (needed to avoid PDF.js CORS issues)

---

## 🚀 How to Run

### Option 1: VS Code Live Server (Recommended)
1. Open the project folder in VS Code
2. Right-click `index.html` → **"Open with Live Server"**
3. App opens at `http://127.0.0.1:5500/index.html`

> Live Server extension (`ritwickdey.LiveServer`) is already installed.

### Option 2: Direct Browser File
- Open `index.html` directly in Chrome or Edge
- ⚠️ PDF.js may have CORS issues with some local PDFs via `file://`
- **Recommended:** Always use Live Server for reliability

### Option 3: Python Simple HTTP Server
```bash
cd GATESoft-UFC
python -m http.server 8000
# Open http://localhost:8000/index.html
```

---

## 🔑 API Key Setup

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a free API key (starts with `AIza...`)
3. Paste it into the **API KEY** field in the app (Step 1)
4. Choose your preferred AI model (Step 2)
5. Upload a PDF and start converting (Step 3)

---

## ✅ Recent Updates

### 🌙 Dark Mode First (v0.5)
- The application now defaults to **Dark Mode** for a high-end, premium aesthetic.
- Logic added to `index.html` to prevent theme flickering on load.
- Automatically swaps company logos between `500nonwhite.png` (Dark) and `500nonblack.png` (Light).

### 🔧 Model Name Fixed
The app now defaults to `gemini-3.1-flash-lite-preview` and lets you switch between all supported free-tier models.

### 🔄 UI & UX Polishing
- Completely rebuilt the Processing Logs UI for readable wrap-around dynamic status messages.
- Added smooth window auto-scrolling on execution.
- Wired the **Stop Conversion** button to an `AbortController` to instantly sever live LLM network requests!

### 🌐 Universal Extractor & Render Pipeline
- Shifted the architecture from "PDF to X" to **"Any to Any"**.
- Input vectors like DOCX/ODT are parsed locally into semantic strings, fed directly to Gemini via text parameters, and natively reassembled.

---

## 🤖 AI Models (Free Tier)

Step 2 in the app lets you choose your model. Each model gets a **calculated safe delay** between pages to avoid hitting rate limits.

| Model | API Identifier | RPM/RPD | Delay | Thinking? | Best For |
|---|---|---|---|---|---|
| ⚡ **Gemini 3.1 Flash-Lite** | `gemini-3.1-flash-lite-preview` | 15 / 1K | **6s** | ✅ Yes | Simple & medium docs, fast |
| 🚀 **Gemini 2.5 Flash-Lite** | `gemini-2.5-flash-lite` | 15 / 1K | **6s** | ❌ No | ✨ Dense Arabic text & bulk docs |
| 🎯 **Gemini 2.5 Flash** | `gemini-2.5-flash` | 10 / 500 | **8s** | ✅ Yes | Complex layouts, mixed languages |
| 🔬 **Gemini 3 Flash (Preview)**| `gemini-3-flash-preview` | 10 / 250 | **8s** | ✅ Yes | Handwriting, max quality |

---

## 📄 Supported Input & Output Formats

| Format | Description (Input & Output Support) |
|--------|-------------|
| **DOCX** | Microsoft Word, RTL-aware, Arabic fonts, full table support |
| **ODT** | OpenDocument Text (LibreOffice) |
| **TXT** | Plain text, minimal formatting |
| **MD** | Structured Markdown with headings and tables |
| **PNG / JPG** | Renders documents to image. If Enhancements are ON, uses AI to create custom graphic outputs. |
| **PDF (Split)** | Slices PDF pages into rasterized individual Image files (no AI call) |
| **PDF (Reconstruct)** | AI deeply extracts content → Markdown → HTML → print to PDF pipeline |

---

## ⚙️ AI Enhancement Options

### Scan Resolution (DPI)
| Setting | DPI | Use Case |
|---------|-----|----------|
| DRAFT | 72 | Fast preview, simple text |
| BALANCED | 100 | General documents |
| QUALITY *(default)* | 150 | Complex layouts, Arabic text |

### Thinking Level
Some models (like 2.5 Flash-Lite) do NOT support thinking. When selected, thinking options are hidden. For models that do support it, a **REC** tag marks the recommended level.

| Level | Description |
|-------|-------------|
| OFF | Fast, great for clear printed text |
| LIGHT | Light reasoning for semi-clear documents |
| STANDARD | Careful analysis of ambiguous content |
| DEEP | Deep spatial analysis — handwriting, complex tables, noisy scans |

---

## 🌐 RTL & Arabic Support

- Full Right-to-Left reading order detection
- Arabic text rendered with `Traditional Arabic` font in DOCX/ODT output
- BiDirectional (`bidi`) paragraphs in Word documents
- Tables reconstructed with correct cell alignment

---

## 📦 Dependencies (CDN)

- **PDF.js**: PDF rasterization
- **Mammoth.js**: DOCX parsing
- **JSZip**: ODT extraction
- **docx.js**: DOCX generation
- **html2canvas**: PNG rendering

---

## 🔒 Privacy

- Your API key is **never stored**.
- PDF files are processed **entirely in your browser**.
- Only extracted text is sent to Google's Gemini API.

---

## 📝 License

This project is proprietary software. © 2025 GATESOFT SOFTWARE — All rights reserved.

---

*Last updated: 2026-04-21 07:40:00*
