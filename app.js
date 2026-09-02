import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const { PDFDocument } = window.PDFLib || {};

const A4 = { portrait: [595.28, 841.89], landscape: [841.89, 595.28] };
const PREVIEW_A4 = { portrait: [794, 1123], landscape: [1123, 794] };
const MAX_GRID = 20;

const PRESETS = {
  clean:      { brightness: 5, contrast: 18, background: 28, sharpness: 10, grayscale: false, invert: false, autoLight: true, pageNumbers: false },
  smartboard: { brightness: 8, contrast: 32, background: 72, sharpness: 24, grayscale: false, invert: false, autoLight: true, pageNumbers: false },
  grayscale:  { brightness: 7, contrast: 22, background: 42, sharpness: 15, grayscale: true, invert: false, autoLight: true, pageNumbers: false },
  contrast:    { brightness: 4, contrast: 48, background: 35, sharpness: 18, grayscale: false, invert: false, autoLight: true, pageNumbers: false },
  scan:       { brightness: 7, contrast: 28, background: 18, sharpness: 36, grayscale: true, invert: false, autoLight: false, pageNumbers: false },
  original:   { brightness: 0, contrast: 0, background: 0, sharpness: 0, grayscale: false, invert: false, autoLight: false, pageNumbers: false }
};

const state = {
  files: [],
  pages: [],
  currentPage: 0,
  orientation: 'portrait',
  rows: 2,
  cols: 2,
  margin: 8,
  gutter: 3,
  quality: 170,
  filters: { ...PRESETS.clean },
  activePreview: 'source',
  compare: 55,
  busy: false
};

const renderCache = new Map();
let previewTimer = 0;
let previewRequest = 0;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const refs = {
  fileInput: $('#fileInput'), addMoreInput: $('#addMoreInput'), dropZone: $('#dropZone'), emptyState: $('#emptyState'), appShell: $('#appShell'),
  fileList: $('#fileList'), fileCountText: $('#fileCountText'), pageGrid: $('#pageGrid'), previewCanvas: $('#previewCanvas'), previewStage: $('#previewStage'),
  compareFrame: $('#compareFrame'), beforeCanvas: $('#beforeCanvas'), afterCanvas: $('#afterCanvas'), compareHitarea: $('#compareHitarea'), compareSlider: $('#compareSlider'), compareHandle: $('#compareHandle'), compareLine: $('#compareLine'), compareText: $('#compareText'),
  compareStage: $('#compareStage'), beforeLabel: $('#beforeLabel'), afterLabel: $('#afterLabel'),
  previewTitle: $('#previewTitle'), pageIndicator: $('#pageIndicator'), pageSizeText: $('#pageSizeText'), pageFileText: $('#pageFileText'), pageSelectedText: $('#pageSelectedText'),
  prevPageBtn: $('#prevPageBtn'), nextPageBtn: $('#nextPageBtn'), clearAllBtn: $('#clearAllBtn'), selectAllBtn: $('#selectAllBtn'), selectNoneBtn: $('#selectNoneBtn'), removeSelectedPagesBtn: $('#removeSelectedPagesBtn'),
  layoutSelect: $('#layoutSelect'), gridRows: $('#gridRows'), gridCols: $('#gridCols'), gridRowsNum: $('#gridRowsNum'), gridColsNum: $('#gridColsNum'), gridRowsOut: $('#gridRowsOut'), gridColsOut: $('#gridColsOut'), gridCount: $('#gridCount'), gridPreset: $('#gridPreset'),
  presetSelect: $('#presetSelect'), brightness: $('#brightness'), contrast: $('#contrast'), background: $('#background'), sharpness: $('#sharpness'),
  brightnessOut: $('#brightnessOut'), contrastOut: $('#contrastOut'), backgroundOut: $('#backgroundOut'), sharpnessOut: $('#sharpnessOut'),
  grayscale: $('#grayscale'), invert: $('#invert'), autoLight: $('#autoLight'), pageNumbers: $('#pageNumbers'),
  margin: $('#margin'), gutter: $('#gutter'), quality: $('#quality'), marginOut: $('#marginOut'), gutterOut: $('#gutterOut'), qualityOut: $('#qualityOut'),
  resetFiltersBtn: $('#resetFiltersBtn'), exportSummary: $('#exportSummary'), exportBtn: $('#exportBtn'), previewSheetBtn: $('#previewSheetBtn'), progressWrap: $('#progressWrap'), progressBar: $('#progressBar'), progressText: $('#progressText'),
  toggleControlsBtn: $('#toggleControlsBtn'), controlsContent: $('#controlsContent'), sheetDialog: $('#sheetDialog'), sheetCanvas: $('#sheetCanvas'), closeDialogBtn: $('#closeDialogBtn'), sheetDialogTitle: $('#sheetDialogTitle'),
  layoutHint: $('#layoutHint'), outputBadge: $('#outputBadge'), detectedRatio: $('#detectedRatio'), sourceInfo: $('#sourceInfo'), sourcePreviewTab: $('#sourcePreviewTab'), sheetPreviewTab: $('#sheetPreviewTab'), smartNote: $('#smartNote')
};

function mustHave(...keys) {
  const missing = keys.filter((k) => !refs[k]);
  if (missing.length) console.warn('PdfCrafter missing UI elements:', missing.join(', '));
}
mustHave('fileInput','pageGrid','previewCanvas','previewStage','layoutSelect','exportBtn');

const clamp = (v, min = 0, max = 255) => Math.max(min, Math.min(max, Math.round(v)));
const formatBytes = (n) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
const selectedPages = () => state.pages.filter((p) => p.selected);
const activePage = () => state.pages[state.currentPage] || state.pages[0];
const sheetCount = () => state.rows * state.cols;
const filterKey = () => JSON.stringify(state.filters);

function safe(fn) { try { return fn(); } catch (e) { console.error(e); return undefined; } }
function invalidateFilterCache() { for (const k of renderCache.keys()) if (k.includes('|F:')) renderCache.delete(k); }
function schedulePreview(delay = 100) { clearTimeout(previewTimer); previewTimer = setTimeout(() => refreshPreview().catch(console.error), delay); }

function syncInputs() {
  const f = state.filters;
  const setValue = (el, v) => { if (el) el.value = v; };
  const setText = (el, v) => { if (el) el.textContent = v; };
  const setChecked = (el, v) => { if (el) el.checked = !!v; };
  setValue(refs.brightness, f.brightness); setValue(refs.contrast, f.contrast); setValue(refs.background, f.background); setValue(refs.sharpness, f.sharpness);
  setChecked(refs.grayscale, f.grayscale); setChecked(refs.invert, f.invert); setChecked(refs.autoLight, f.autoLight); setChecked(refs.pageNumbers, f.pageNumbers);
  setText(refs.brightnessOut, f.brightness); setText(refs.contrastOut, f.contrast); setText(refs.backgroundOut, f.background); setText(refs.sharpnessOut, f.sharpness);
  setValue(refs.margin, state.margin); setValue(refs.gutter, state.gutter); setValue(refs.quality, state.quality);
  setText(refs.marginOut, `${state.margin} mm`); setText(refs.gutterOut, `${state.gutter} mm`); setText(refs.qualityOut, `${state.quality} DPI`);
  setValue(refs.gridRows, state.rows); setValue(refs.gridCols, state.cols); setValue(refs.gridRowsNum, state.rows); setValue(refs.gridColsNum, state.cols);
  setText(refs.gridRowsOut, state.rows); setText(refs.gridColsOut, state.cols); setText(refs.gridCount, `${sheetCount()} slides / A4`);
  if (refs.compareSlider) refs.compareSlider.value = state.compare;
  updateCompareVisual();
}

function setGridValues(rows, cols) {
  const r = Math.max(1, Math.min(MAX_GRID, Math.round(Number(rows) || 1)));
  const c = Math.max(1, Math.min(MAX_GRID, Math.round(Number(cols) || 1)));
  state.rows = r; state.cols = c;
  if (refs.gridPreset) refs.gridPreset.value = 'custom';
  syncInputs(); updateLayoutHint(); renderSummary(); schedulePreview(70);
}

function setGridFromLegacySelect(value) {
  const presets = {
    '1': [1,1], '2': [2,1], '4': [2,2], '6': [3,2], '8': [4,2], '9': [3,3], '12': [4,3], '16': [4,4]
  };
  if (presets[String(value)]) setGridValues(...presets[String(value)]);
}

async function handleFiles(list) {
  const files = [...list].filter((f) => f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')));
  if (!files.length) return;
  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      state.files.push({ id, name: file.name, size: file.size, pdf });
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const view = page.getViewport({ scale: 1 });
        state.pages.push({ id: `${id}-${pageNumber}`, fileId: id, pageNumber, width: view.width, height: view.height, selected: true });
      }
    } catch (err) {
      console.error(err); alert(`Could not open ${file.name}. The file may be encrypted or invalid.`);
    }
  }
  if (!state.pages.length) return;
  state.currentPage = Math.max(0, state.pages.findIndex((p) => p.selected));
  refs.emptyState?.classList.add('hidden'); refs.appShell?.classList.remove('hidden');
  await renderAll();
}

function renderFiles() {
  if (!refs.fileList) return;
  refs.fileCountText.textContent = `${state.files.length} file${state.files.length === 1 ? '' : 's'}`;
  refs.fileList.innerHTML = state.files.map((file) => {
    const count = state.pages.filter((p) => p.fileId === file.id).length;
    return `<div class="file-item ${activePage()?.fileId === file.id ? 'active' : ''}"><div class="file-icon">PDF</div><div class="file-main"><strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)} · ${count} pages</span></div><button class="file-remove" type="button" data-remove-file="${file.id}" aria-label="Remove file">×</button></div>`;
  }).join('');
  $$('#fileList [data-remove-file]').forEach((btn) => btn.addEventListener('click', () => removeFile(btn.dataset.removeFile)));
}

function renderPageGrid() {
  if (!refs.pageGrid) return;
  refs.pageGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const p of state.pages) {
    const file = state.files.find((f) => f.id === p.fileId);
    const el = document.createElement('div');
    el.className = `page-thumb ${p.selected ? 'selected' : ''} ${state.pages[state.currentPage]?.id === p.id ? 'current' : ''}`;
    el.innerHTML = `<button type="button" class="thumb-select" aria-label="${p.selected ? 'Exclude' : 'Include'} page ${p.pageNumber}">${p.selected ? '✓' : '+'}</button><button type="button" class="thumb-delete" aria-label="Delete page ${p.pageNumber}">×</button><button type="button" class="thumb-preview"><canvas></canvas><small>Page ${p.pageNumber}</small><em>${escapeHtml(file?.name || '')}</em></button>`;

    el.querySelector('.thumb-preview').addEventListener('click', async () => {
      state.currentPage = state.pages.findIndex((x) => x.id === p.id);
      renderPageGrid(); renderFiles(); updatePageMeta(); updateSourceInfo();
      await renderSourcePreview();
    });
    el.querySelector('.thumb-select').addEventListener('click', (e) => {
      e.stopPropagation(); p.selected = !p.selected; state.currentPage = state.pages.findIndex((x) => x.id === p.id);
      renderPageGrid(); renderFiles(); updatePageMeta(); renderSummary(); schedulePreview(60);
    });
    el.querySelector('.thumb-delete').addEventListener('click', (e) => {
      e.stopPropagation(); deletePage(p.id);
    });
    frag.appendChild(el);
  }
  refs.pageGrid.appendChild(frag);
  paintThumbnailsProgressive();
}

function paintThumbnailsProgressive() {
  const items = [...refs.pageGrid.querySelectorAll('.page-thumb')].map((el, i) => ({ el, p: state.pages[i] })).filter((x) => x.p);
  let i = 0;
  const paint = async () => {
    const end = Math.min(i + 3, items.length);
    const batch = items.slice(i, end);
    await Promise.all(batch.map(async ({ el, p }) => {
      try {
        const img = await renderSourceToCanvas(p, 240, { applyFilters: false });
        const c = el.querySelector('canvas'); const scale = Math.min(1, 220 / img.width);
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      } catch (e) { console.warn(e); }
    }));
    i = end;
    if (i < items.length) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}

async function renderAll() {
  renderFiles(); renderPageGrid(); updateSourceInfo(); updateLayoutHint(); renderSummary(); await refreshPreview();
}

async function renderSourceToCanvas(p, targetWidth = 1000, opts = { applyFilters: true }) {
  const file = state.files.find((f) => f.id === p.fileId); if (!file) throw new Error('Missing PDF file');
  const key = `${p.id}|${Math.round(targetWidth)}|${opts.applyFilters ? 'F:' + filterKey() : 'RAW'}`;
  if (renderCache.has(key)) return renderCache.get(key);
  const page = await file.pdf.getPage(p.pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / Math.max(1, base.width);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const result = opts.applyFilters ? applyFilters(canvas, state.filters) : canvas;
  renderCache.set(key, result);
  return result;
}

function applyFilters(source, f) {
  if (!f.brightness && !f.contrast && !f.background && !f.sharpness && !f.grayscale && !f.invert && !f.autoLight) return source;
  const out = document.createElement('canvas'); out.width = source.width; out.height = source.height;
  const ctx = out.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height), d = image.data;
  const sampleStep = Math.max(4, Math.floor(Math.sqrt(d.length / 4 / 50000)) * 2);
  let lumSum = 0, count = 0;
  for (let i = 0; i < d.length; i += 4 * sampleStep) { lumSum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; count++; }
  const mean = lumSum / Math.max(1, count);
  const autoInvert = f.autoLight && mean < 118;
  const cFactor = (259 * (f.contrast * 2.55 + 255)) / (255 * (259 - f.contrast * 2.55));
  const b = f.brightness * 2.55, bg = f.background / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], bl = d[i + 2];
    if (autoInvert || f.invert) { r = 255 - r; g = 255 - g; bl = 255 - bl; }
    if (f.grayscale) { const y = 0.299 * r + 0.587 * g + 0.114 * bl; r = g = bl = y; }
    r = cFactor * (r - 128) + 128 + b; g = cFactor * (g - 128) + 128 + b; bl = cFactor * (bl - 128) + 128 + b;
    if (bg > 0) {
      const y = 0.299 * r + 0.587 * g + 0.114 * bl, threshold = 150 - bg * 55;
      const whiten = Math.max(0, Math.min(1, (y - threshold) / (255 - threshold))) * bg;
      r += (255 - r) * whiten; g += (255 - g) * whiten; bl += (255 - bl) * whiten;
      if (bg > 0.45 && y > 190) r = g = bl = 255;
    }
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(bl);
  }
  ctx.putImageData(image, 0, 0);
  return f.sharpness > 0 ? sharpen(out, f.sharpness / 100) : out;
}

function sharpen(canvas, amount) {
  const w = canvas.width, h = canvas.height; if (w < 3 || h < 3) return canvas;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h), s = src.data, d = new Uint8ClampedArray(s.length), a = amount * 0.65;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp(s[i + ch] * (1 + 4 * a) - a * (s[i - 4 + ch] + s[i + 4 + ch] + s[i - w * 4 + ch] + s[i + w * 4 + ch]));
    d[i + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = (y * w + x) * 4; d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255; }
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = (y * w + x) * 4; d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255; }
  const out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d').putImageData(new ImageData(d, w, h), 0, 0); return out;
}

function fitCanvasIntoFrame(before, frame) {
  const rect = frame.getBoundingClientRect();
  const maxW = Math.max(280, rect.width - 20), maxH = Math.max(260, rect.height - 20);
  const scale = Math.min(maxW / before.width, maxH / before.height, 1);
  return { w: Math.max(1, Math.round(before.width * scale)), h: Math.max(1, Math.round(before.height * scale)) };
}

async function renderSourcePreview() {
  const p = activePage(); if (!p || !refs.compareFrame) return;
  const requestId = ++previewRequest;
  refs.previewStage?.classList.add('loading');
  try {
    const [before, after] = await Promise.all([
      renderSourceToCanvas(p, 980, { applyFilters: false }),
      renderSourceToCanvas(p, 980, { applyFilters: true })
    ]);
    if (requestId !== previewRequest) return;
    const { w, h } = fitCanvasIntoFrame(before, refs.compareStage || refs.previewStage);
    refs.compareFrame.style.width = `${w}px`; refs.compareFrame.style.height = `${h}px`;
    for (const c of [refs.beforeCanvas, refs.afterCanvas]) {
      if (!c) continue; c.width = w; c.height = h; c.style.width = `${w}px`; c.style.height = `${h}px`;
    }
    refs.beforeCanvas?.getContext('2d').drawImage(before, 0, 0, w, h);
    refs.afterCanvas?.getContext('2d').drawImage(after, 0, 0, w, h);
    refs.previewCanvas?.classList.add('hidden');
    refs.compareFrame.classList.remove('hidden');
    updateCompareVisual(); updatePageMeta();
    refs.previewTitle.textContent = `PDF page ${p.pageNumber} — Before / After`;
  } catch (err) { console.error(err); }
  finally { if (requestId === previewRequest) refs.previewStage?.classList.remove('loading'); }
}

function updateCompareVisual() {
  const pct = Math.max(0, Math.min(100, Number(state.compare) || 0));
  if (refs.compareSlider && Number(refs.compareSlider.value) !== pct) refs.compareSlider.value = pct;
  if (refs.afterCanvas) refs.afterCanvas.style.clipPath = `inset(0 0 0 ${100 - pct}%)`;
  if (refs.compareHandle) refs.compareHandle.style.left = `${pct}%`;
  if (refs.compareLine) refs.compareLine.style.left = `${pct}%`;
  if (refs.compareText) refs.compareText.textContent = `${Math.round(pct)}% after`;
}

function updatePageMeta() {
  const p = activePage(); if (!p) return;
  const file = state.files.find((f) => f.id === p.fileId);
  refs.pageIndicator.textContent = `${state.currentPage + 1} / ${state.pages.length}`;
  refs.pageSizeText.textContent = `${Math.round(p.width || 0)} × ${Math.round(p.height || 0)} pt`;
  refs.pageFileText.textContent = file?.name || '—';
  refs.pageSelectedText.textContent = p.selected ? 'Included' : 'Excluded';
}

function updateSourceInfo() {
  const p = activePage(); if (!p) return;
  const ratio = p.width && p.height ? p.width / p.height : 0;
  const label = ratio > 1.55 && ratio < 1.9 ? '16:9 landscape' : `${ratio.toFixed(2)}:1`;
  refs.detectedRatio.textContent = label;
  refs.sourceInfo.textContent = `Detected source: ${label} · ${state.pages.length} total pages`;
}

function updateLayoutHint() {
  const n = sheetCount();
  refs.layoutHint.textContent = `${state.rows} rows × ${state.cols} columns = ${n} slides / A4. Complete slides are fitted inside each cell without cropping.`;
  refs.outputBadge.textContent = `A4 ${state.orientation === 'portrait' ? 'Portrait' : 'Landscape'} · ${state.rows} × ${state.cols}`;
  refs.gridCount.textContent = `${n} slides / A4`;
}

function renderSummary() {
  const count = selectedPages().length, sheets = Math.ceil(count / sheetCount()) || 0;
  refs.exportSummary.textContent = `${count} selected ${count === 1 ? 'page' : 'pages'} → ${sheets} A4 ${sheets === 1 ? 'sheet' : 'sheets'} · ${state.rows} × ${state.cols} grid · ${state.orientation}.`;
}

function cellGeometry(W, H) {
  const margin = state.margin * 2.83465, gap = state.gutter * 2.83465;
  const usableW = Math.max(1, W - 2 * margin), usableH = Math.max(1, H - 2 * margin);
  return { margin, gap, cellW: Math.max(1, (usableW - gap * (state.cols - 1)) / state.cols), cellH: Math.max(1, (usableH - gap * (state.rows - 1)) / state.rows) };
}

function drawImageContain(ctx, img, x, y, cellW, cellH) {
  const scale = Math.min(cellW / img.width, cellH / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  ctx.drawImage(img, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
}

async function drawA4Sheet(ctx, W, H, pages, docMode = false) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const { margin, gap, cellW, cellH } = cellGeometry(W, H);
  const batch = pages.slice(0, sheetCount());
  const target = docMode ? Math.min(1600, Math.max(260, Math.round(cellW * state.quality / 72))) : Math.min(600, Math.max(160, Math.round(cellW * 0.9)));
  for (let i = 0; i < batch.length; i++) {
    const img = await renderSourceToCanvas(batch[i], target, { applyFilters: true });
    const col = i % state.cols, row = Math.floor(i / state.cols);
    drawImageContain(ctx, img, margin + col * (cellW + gap), margin + row * (cellH + gap), cellW, cellH);
    if (!docMode && i % 3 === 2) await new Promise((r) => requestAnimationFrame(r));
  }
}

async function renderSheetTab() {
  const pages = selectedPages(); if (!pages.length) return;
  const [W, H] = PREVIEW_A4[state.orientation]; refs.previewCanvas.width = W; refs.previewCanvas.height = H;
  await drawA4Sheet(refs.previewCanvas.getContext('2d'), W, H, pages, false);
  refs.previewCanvas.classList.remove('hidden'); refs.compareFrame?.classList.add('hidden');
  refs.compareHandle?.classList.add('hidden'); refs.compareLine?.classList.add('hidden');
  refs.previewTitle.textContent = 'A4 output preview'; refs.outputBadge.textContent = `A4 ${state.orientation} · ${state.rows} × ${state.cols}`;
}

async function refreshPreview() {
  if (!state.pages.length) return;
  if (state.activePreview === 'sheet') {
    refs.compareStage?.classList.add('hidden'); await renderSheetTab(); refs.previewStage?.classList.remove('loading'); return;
  }
  refs.compareStage?.classList.remove('hidden'); refs.previewCanvas?.classList.add('hidden');
  refs.beforeCanvas?.classList.remove('hidden'); refs.afterCanvas?.classList.remove('hidden'); refs.compareHandle?.classList.remove('hidden'); refs.compareLine?.classList.remove('hidden');
  await renderSourcePreview();
}

async function previewSheet() {
  const pages = selectedPages();
  if (!pages.length) return alert('Select at least one page first.');
  if (state.busy) return;
  state.busy = true; if (refs.previewSheetBtn) refs.previewSheetBtn.disabled = true;
  try {
    const [W, H] = PREVIEW_A4[state.orientation];
    refs.sheetCanvas.width = W; refs.sheetCanvas.height = H;
    await drawA4Sheet(refs.sheetCanvas.getContext('2d'), W, H, pages, false);
    refs.sheetDialogTitle.textContent = `A4 ${state.orientation} · ${state.rows} × ${state.cols} · ${Math.min(sheetCount(), pages.length)} slide${Math.min(sheetCount(), pages.length) === 1 ? '' : 's'} on sheet`;
    if (refs.sheetDialog?.showModal) refs.sheetDialog.showModal(); else refs.sheetDialog?.setAttribute('open', '');
  } catch (e) { console.error(e); alert('Could not build the A4 preview. Try a smaller grid.'); }
  finally { state.busy = false; if (refs.previewSheetBtn) refs.previewSheetBtn.disabled = false; }
}

async function exportPdf() {
  const pages = selectedPages(); if (!pages.length) return alert('Select at least one page to export.');
  if (state.busy || !PDFDocument) return;
  state.busy = true; refs.exportBtn.disabled = true; refs.previewSheetBtn.disabled = true; refs.progressWrap?.classList.remove('hidden'); refs.progressBar.style.width = '0%';
  try {
    const doc = await PDFDocument.create(), [W, H] = A4[state.orientation], groups = [];
    for (let i = 0; i < pages.length; i += sheetCount()) groups.push(pages.slice(i, i + sheetCount()));
    for (let gi = 0; gi < groups.length; gi++) {
      const page = doc.addPage([W, H]), ctxCanvas = document.createElement('canvas'); ctxCanvas.width = Math.round(W * state.quality / 72); ctxCanvas.height = Math.round(H * state.quality / 72);
      // Use PDF points for geometry and a predictable raster size.
      const scale = ctxCanvas.width / W; const ctx = ctxCanvas.getContext('2d');
      await drawA4Sheet(ctx, ctxCanvas.width, ctxCanvas.height, groups[gi], true);
      const jpg = await doc.embedJpg(ctxCanvas.toDataURL('image/jpeg', 0.93));
      page.drawImage(jpg, { x: 0, y: 0, width: W, height: H });
      refs.progressBar.style.width = `${Math.round(((gi + 1) / groups.length) * 100)}%`; refs.progressText.textContent = `Building A4 sheet ${gi + 1} of ${groups.length}…`;
      await new Promise((r) => setTimeout(r, 0));
    }
    doc.setTitle(`PdfCrafter A4 Notes — ${new Date().toLocaleDateString('en-IN')}`); doc.setCreator('PdfCrafter');
    const bytes = await doc.save(); const blob = new Blob([bytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `PdfCrafter-A4-Notes-${new Date().toISOString().slice(0, 10)}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    refs.progressText.textContent = `Done — ${groups.length} A4 sheet${groups.length === 1 ? '' : 's'} exported.`;
  } catch (err) {
    console.error(err); alert('Export failed. Try a lower grid or DPI.'); refs.progressText.textContent = 'Export failed.';
  } finally { state.busy = false; refs.exportBtn.disabled = false; refs.previewSheetBtn.disabled = false; }
}

function deletePage(id) {
  const idx = state.pages.findIndex((p) => p.id === id); if (idx < 0) return;
  const removed = state.pages.splice(idx, 1)[0];
  for (const k of [...renderCache.keys()]) if (k.startsWith(removed.id + '|')) renderCache.delete(k);
  if (!state.pages.length) { state.files = []; state.currentPage = 0; refs.appShell.classList.add('hidden'); refs.emptyState.classList.remove('hidden'); renderAll(); return; }
  // Remove now-empty file if this was its last page.
  const stillHas = state.pages.some((p) => p.fileId === removed.fileId);
  if (!stillHas) state.files = state.files.filter((f) => f.id !== removed.fileId);
  state.currentPage = Math.min(idx, state.pages.length - 1);
  renderPageGrid(); renderFiles(); updatePageMeta(); updateSourceInfo(); renderSummary(); schedulePreview(40);
}

function removeSelectedPages() {
  const keep = state.pages.filter((p) => p.selected);
  if (!keep.length) return alert('Keep at least one page.');
  state.pages = keep;
  const fileIds = new Set(state.pages.map((p) => p.fileId)); state.files = state.files.filter((f) => fileIds.has(f.id));
  state.currentPage = Math.min(state.currentPage, state.pages.length - 1);
  renderPageGrid(); renderFiles(); updatePageMeta(); updateSourceInfo(); renderSummary(); schedulePreview(50);
}

function removeFile(id) {
  state.files = state.files.filter((f) => f.id !== id); state.pages = state.pages.filter((p) => p.fileId !== id);
  state.currentPage = Math.min(state.currentPage, Math.max(0, state.pages.length - 1));
  if (!state.pages.length) { refs.appShell.classList.add('hidden'); refs.emptyState.classList.remove('hidden'); }
  renderAll();
}

function clearAll() {
  state.files = []; state.pages = []; state.currentPage = 0; renderCache.clear(); refs.appShell.classList.add('hidden'); refs.emptyState.classList.remove('hidden');
}

function changePage(delta) {
  if (!state.pages.length) return;
  state.currentPage = (state.currentPage + delta + state.pages.length) % state.pages.length;
  renderPageGrid(); renderFiles(); updatePageMeta(); updateSourceInfo(); schedulePreview(20);
}

function applyPreset(name) { if (!PRESETS[name]) return; state.filters = { ...PRESETS[name] }; invalidateFilterCache(); syncInputs(); schedulePreview(50); }

function bind() {
  refs.fileInput?.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  refs.addMoreInput?.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
  refs.dropZone?.addEventListener('drop', (e) => { e.preventDefault(); refs.dropZone.classList.remove('drag'); handleFiles(e.dataTransfer.files); });
  ['dragenter','dragover'].forEach((type) => refs.dropZone?.addEventListener(type, (e) => { e.preventDefault(); refs.dropZone.classList.add('drag'); }));
  ['dragleave','drop'].forEach((type) => refs.dropZone?.addEventListener(type, (e) => { e.preventDefault(); refs.dropZone.classList.remove('drag'); }));
  refs.clearAllBtn?.addEventListener('click', clearAll); refs.removeSelectedPagesBtn?.addEventListener('click', removeSelectedPages);
  refs.selectAllBtn?.addEventListener('click', () => { state.pages.forEach((p) => p.selected = true); renderPageGrid(); renderSummary(); schedulePreview(40); });
  refs.selectNoneBtn?.addEventListener('click', () => { state.pages.forEach((p) => p.selected = false); renderPageGrid(); renderSummary(); schedulePreview(40); });
  refs.prevPageBtn?.addEventListener('click', () => changePage(-1)); refs.nextPageBtn?.addEventListener('click', () => changePage(1));

  refs.gridRows?.addEventListener('input', (e) => setGridValues(e.target.value, state.cols)); refs.gridCols?.addEventListener('input', (e) => setGridValues(state.rows, e.target.value));
  refs.gridRowsNum?.addEventListener('input', (e) => setGridValues(e.target.value, state.cols)); refs.gridColsNum?.addEventListener('input', (e) => setGridValues(state.rows, e.target.value));
  refs.gridPreset?.addEventListener('change', (e) => { const v = e.target.value; if (v !== 'custom') { const [r,c] = v.split('x').map(Number); setGridValues(r,c); } });
  refs.layoutSelect?.addEventListener('change', (e) => setGridFromLegacySelect(e.target.value));

  $$('[data-orientation]').forEach((btn) => btn.addEventListener('click', () => { state.orientation = btn.dataset.orientation; $$('[data-orientation]').forEach((x) => x.classList.toggle('active', x === btn)); updateLayoutHint(); renderSummary(); schedulePreview(40); }));
  refs.presetSelect?.addEventListener('change', (e) => applyPreset(e.target.value));
  ['brightness','contrast','background','sharpness'].forEach((id) => refs[id]?.addEventListener('input', (e) => { state.filters[id] = Number(e.target.value); refs[id + 'Out'].textContent = e.target.value; invalidateFilterCache(); schedulePreview(120); }));
  ['grayscale','invert','autoLight','pageNumbers'].forEach((id) => refs[id]?.addEventListener('change', (e) => { state.filters[id] = e.target.checked; invalidateFilterCache(); schedulePreview(60); }));
  refs.margin?.addEventListener('input', (e) => { state.margin = Number(e.target.value); refs.marginOut.textContent = `${state.margin} mm`; updateLayoutHint(); renderSummary(); schedulePreview(80); });
  refs.gutter?.addEventListener('input', (e) => { state.gutter = Number(e.target.value); refs.gutterOut.textContent = `${state.gutter} mm`; schedulePreview(80); });
  refs.quality?.addEventListener('input', (e) => { state.quality = Number(e.target.value); refs.qualityOut.textContent = `${state.quality} DPI`; });
  refs.resetFiltersBtn?.addEventListener('click', () => applyPreset('clean'));

  refs.sourcePreviewTab?.addEventListener('click', () => setActivePreview('source')); refs.sheetPreviewTab?.addEventListener('click', () => setActivePreview('sheet'));
  refs.previewSheetBtn?.addEventListener('click', previewSheet); refs.exportBtn?.addEventListener('click', exportPdf); refs.closeDialogBtn?.addEventListener('click', () => refs.sheetDialog?.close());
  refs.toggleControlsBtn?.addEventListener('click', () => { const hidden = refs.controlsContent.classList.toggle('hidden'); refs.toggleControlsBtn.textContent = hidden ? 'Show controls' : 'Hide controls'; });

  refs.compareSlider?.addEventListener('input', (e) => { state.compare = Number(e.target.value); updateCompareVisual(); });
  let dragging = false;
  const moveCompare = (clientX) => { const frame = refs.compareFrame; if (!frame) return; const r = frame.getBoundingClientRect(); state.compare = Math.max(0, Math.min(100, ((clientX - r.left) / Math.max(1, r.width)) * 100)); updateCompareVisual(); };
  refs.compareHitarea?.addEventListener('pointerdown', (e) => { dragging = true; refs.compareHitarea.setPointerCapture?.(e.pointerId); moveCompare(e.clientX); e.preventDefault(); });
  refs.compareHitarea?.addEventListener('pointermove', (e) => { if (dragging) moveCompare(e.clientX); });
  ['pointerup','pointercancel','lostpointercapture'].forEach((ev) => refs.compareHitarea?.addEventListener(ev, () => { dragging = false; }));
  refs.compareFrame?.addEventListener('click', (e) => { if (e.target !== refs.beforeCanvas && e.target !== refs.afterCanvas && !dragging) moveCompare(e.clientX); });
  window.addEventListener('resize', () => { if (state.pages.length) schedulePreview(160); });
}

async function setActivePreview(mode) {
  state.activePreview = mode;
  refs.sourcePreviewTab?.classList.toggle('active', mode === 'source'); refs.sheetPreviewTab?.classList.toggle('active', mode === 'sheet');
  await refreshPreview();
}

bind(); syncInputs(); updateLayoutHint();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=6').catch(() => {}));
