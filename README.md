# PdfCrafter

PdfCrafter is a static, browser-only lecture PDF processor designed for wide smart-board / 16:9 lecture PDFs.

## Core workflow
- Detect wide lecture pages and preserve the full slide (no cropping)
- Convert to A4 Portrait or A4 Landscape
- Pack 1, 2, 4, 6, 8, 9, 12 or 16 slides per A4 sheet
- Remove unwanted pages before export
- Live source-page and A4-sheet preview
- Brightness, contrast, background cleanup, sharpness
- Auto-light dark slides, grayscale, invert, page numbers
- Adjustable A4 margins and gutters
- Adjustable export DPI
- Multiple PDFs in one browser session
- Client-side only — source files are not sent to a server

## GitHub Pages
1. Upload all files in this folder to the repository root.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select `main` and `/(root)`.
5. Save and wait for the Pages deployment to finish.

The site has no backend and is intended for GitHub Pages or any static host.
