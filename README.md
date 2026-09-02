# PdfCrafter — GitHub Pages

PdfCrafter is a client-side static web app for turning wide smart-board lecture PDFs into printable A4 notes.

## v6 fixes
- Independent vertical **Rows** and horizontal **Columns** controls (1–20 each).
- Quick presets plus direct numeric entry.
- Working **Before / After** live comparison slider: range control + drag directly on the preview.
- Working **Preview A4 sheet** dialog and A4-output tab.
- Working per-page **× delete** and **✓ / + include-exclude** controls.
- No duplicate button IDs; all controls bind safely even if one UI element is missing.
- Progressive thumbnail rendering and cached page renders for smoother interaction.
- Service-worker cache version bumped so GitHub Pages can pick up the new app files.

## Deploy on GitHub Pages
Upload the files in this folder to your repository root, commit them to `main`, and set:

- Settings → Pages
- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**

Then wait for the Pages deployment to finish and hard-refresh the live site with **Ctrl + Shift + R**.
