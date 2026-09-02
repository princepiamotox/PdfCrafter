# PdfCrafter

Static, browser-only PDF notes processor for GitHub Pages.

## What it does

- Converts lecture PDFs to printable A4 sheets
- A4 portrait or landscape
- 1, 2, 4, 6, 8, 9, 12, or 16 pages per sheet
- Multiple PDFs / batch workflow
- Page selection and removal
- Smart presets: Clean printable, Smart-board dark mode, Grayscale, High contrast, Scanned document, Original
- Live preview under the PDF with brightness, contrast, background removal, sharpness, grayscale, invert and page-number controls
- Exports a new PDF entirely in the browser
- No login, server upload, ads or watermark

## Run locally

Because the page uses ES modules, serve it with any static server. For example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

1. Upload all files in this folder to the repository root.
2. Enable **Settings → Pages → Deploy from branch**.
3. Select the branch and `/ (root)`.

The app uses jsDelivr for PDF.js and pdf-lib, while all uploaded PDFs remain in the browser.
