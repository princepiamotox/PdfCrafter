import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const { PDFDocument, rgb } = window.PDFLib;

document.addEventListener('DOMContentLoaded', () => {
  const state = { files: [], pages: [], currentPage: 0, orientation: 'portrait', layout: 4, filters: defaultFilters() };
  const refs = {
    fileInput: q('#fileInput'), addMoreInput: q('#addMoreInput'), dropZone: q('#dropZone'), emptyState: q('#emptyState'), appShell: q('#appShell'),
    fileList: q('#fileList'), fileCountText: q('#fileCountText'), pageGrid: q('#pageGrid'), previewCanvas: q('#previewCanvas'), previewStage: q('#previewStage'),
    previewTitle: q('#previewTitle'), pageIndicator: q('#pageIndicator'), pageSizeText: q('#pageSizeText'), pageFileText: q('#pageFileText'), pageSelectedText: q('#pageSelectedText'),
    prevPageBtn: q('#prevPageBtn'), nextPageBtn: q('#nextPageBtn'), clearAllBtn: q('#clearAllBtn'), selectAllBtn: q('#selectAllBtn'), selectNoneBtn: q('#selectNoneBtn'),
    layoutSelect: q('#layoutSelect'), presetSelect: q('#presetSelect'), brightness: q('#brightness'), contrast: q('#contrast'), background: q('#background'), sharpness: q('#sharpness'),
    brightnessOut: q('#brightnessOut'), contrastOut: q('#contrastOut'), backgroundOut: q('#backgroundOut'), sharpnessOut: q('#sharpnessOut'),
    grayscale: q('#grayscale'), invert: q('#invert'), keepDarkText: q('#keepDarkText'), pageNumbers: q('#pageNumbers'), resetFiltersBtn: q('#resetFiltersBtn'),
    exportSummary: q('#exportSummary'), exportBtn: q('#exportBtn'), previewSheetBtn: q('#previewSheetBtn'), progressWrap: q('#progressWrap'), progressBar: q('#progressBar'), progressText: q('#progressText'),
    toggleControlsBtn: q('#toggleControlsBtn'), controlsContent: q('#controlsContent'), sheetDialog: q('#sheetDialog'), sheetCanvas: q('#sheetCanvas'), closeDialogBtn: q('#closeDialogBtn'), sheetDialogTitle: q('#sheetDialogTitle'), layoutHint: q('#layoutHint')
  };

  wireDrop();
  refs.fileInput.addEventListener('change', e => handleFiles(e.target.files));
  refs.addMoreInput.addEventListener('change', e => handleFiles(e.target.files));
  refs.clearAllBtn.addEventListener('click', clearAll);
  refs.prevPageBtn.addEventListener('click', () => selectPage(state.currentPage - 1));
  refs.nextPageBtn.addEventListener('click', () => selectPage(state.currentPage + 1));
  refs.selectAllBtn.addEventListener('click', () => { state.pages.forEach(p => p.selected = true); renderAll(); });
  refs.selectNoneBtn.addEventListener('click', () => { state.pages.forEach(p => p.selected = false); renderAll(); });
  refs.layoutSelect.addEventListener('change', e => { state.layout = Number(e.target.value); updateLayoutHint(); renderPreview(); renderSummary(); });
  document.querySelectorAll('[data-orientation]').forEach(btn => btn.addEventListener('click', () => { state.orientation = btn.dataset.orientation; document.querySelectorAll('[data-orientation]').forEach(x => x.classList.toggle('active', x === btn)); renderPreview(); renderSummary(); }));
  refs.presetSelect.addEventListener('change', () => applyPreset(refs.presetSelect.value));
  [refs.brightness, refs.contrast, refs.background, refs.sharpness].forEach(el => el.addEventListener('input', syncFilters));
  [refs.grayscale, refs.invert, refs.keepDarkText, refs.pageNumbers].forEach(el => el.addEventListener('change', syncFilters));
  refs.resetFiltersBtn.addEventListener('click', () => { state.filters = defaultFilters(); refs.presetSelect.value = 'original'; updateFilterInputs(); renderPreview(); renderSummary(); });
  refs.exportBtn.addEventListener('click', () => exportPdf(state, refs));
  refs.previewSheetBtn.addEventListener('click', () => previewSheet(state, refs));
  refs.closeDialogBtn.addEventListener('click', () => refs.sheetDialog.close());
  refs.toggleControlsBtn.addEventListener('click', () => { const hidden = refs.controlsContent.classList.toggle('hidden'); refs.toggleControlsBtn.textContent = hidden ? 'Expand' : 'Collapse'; });

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  updateLayoutHint();

  async function handleFiles(fileList) {
    const files = [...fileList].filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!files.length) return;
    for (const file of files) {
      try {
        const bytes = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const fileId = crypto.randomUUID();
        state.files.push({ id: fileId, name: file.name, size: file.size, pdf, bytes });
        for (let i = 1; i <= pdf.numPages; i++) {
          state.pages.push({ id: `${fileId}-${i}`, fileId, pageNumber: i, selected: true, thumb: null });
        }
      } catch (err) {
        alert(`Could not open ${file.name}. The file may be encrypted or invalid.`);
      }
    }
    state.currentPage = Math.max(0, state.pages.findIndex(p => p.selected));
    refs.emptyState.classList.add('hidden'); refs.appShell.classList.remove('hidden');
    await renderAll();
  }

  async function renderAll() {
    renderFiles();
    renderPageGrid();
    await renderPreview();
    renderSummary();
  }

  function renderFiles() {
    refs.fileCountText.textContent = `${state.files.length} file${state.files.length === 1 ? '' : 's'}`;
    refs.fileList.innerHTML = state.files.map(file => {
      const pageCount = state.pages.filter(p => p.fileId === file.id).length;
      return `<div class="file-item ${activeFile(file.id) ? 'active' : ''}"><div class="file-icon">PDF</div><div class="file-main"><strong title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)}</span></div><div class="file-pages">${pageCount} pages</div><button class="file-remove" data-remove-file="${file.id}" aria-label="Remove ${escapeAttr(file.name)}">×</button></div>`;
    }).join('');
    refs.fileList.querySelectorAll('[data-remove-file]').forEach(btn => btn.addEventListener('click', () => removeFile(btn.dataset.removeFile)));
  }

  async function renderPageGrid() {
    refs.pageGrid.innerHTML = '';
    for (const p of state.pages) {
      const file = state.files.find(f => f.id === p.fileId);
      const el = document.createElement('button'); el.type = 'button'; el.className = `page-thumb ${p.selected ? 'selected' : ''}`;
      el.innerHTML = `<input type="checkbox" ${p.selected ? 'checked' : ''} aria-label="Select page ${p.pageNumber}"><canvas></canvas><small>Page ${p.pageNumber} · ${escapeHtml(file?.name || '')}</small>`;
      el.addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; state.currentPage = state.pages.findIndex(x => x.id === p.id); renderPageGridHighlight(); renderPreview(); });
      const cb = el.querySelector('input'); cb.addEventListener('change', () => { p.selected = cb.checked; el.classList.toggle('selected', p.selected); renderSummary(); renderPreview(); });
      refs.pageGrid.appendChild(el);
      renderThumbnail(p, el.querySelector('canvas')).catch(() => {});
    }
  }

  async function renderThumbnail(p, canvas) {
    const file = state.files.find(f => f.id === p.fileId); if (!file) return;
    const page = await file.pdf.getPage(p.pageNumber);
    const vp = page.getViewport({ scale: 0.22 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(vp.width * dpr); canvas.height = Math.ceil(vp.height * dpr);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); await page.render({ canvasContext: ctx, viewport: vp, transform: [dpr,0,0,dpr,0,0] }).promise;
  }

  async function renderPreview() {
    const p = state.pages[state.currentPage];
    const canvas = refs.previewCanvas; const placeholder = refs.previewStage.querySelector('.preview-placeholder');
    if (!p) { canvas.classList.add('hidden'); if (placeholder) placeholder.classList.remove('hidden'); refs.pageIndicator.textContent = '0 / 0'; return; }
    if (placeholder) placeholder.classList.add('hidden'); canvas.classList.remove('hidden'); refs.previewStage.querySelector('#previewLoading')?.classList.remove('hidden');
    const file = state.files.find(f => f.id === p.fileId); const page = await file.pdf.getPage(p.pageNumber);
    const base = page.getViewport({ scale: 1 });
    const maxW = Math.min(820, refs.previewStage.clientWidth - 45); const maxH = 640; const scale = Math.min(maxW / base.width, maxH / base.height);
    const vp = page.getViewport({ scale }); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(vp.width * dpr); canvas.height = Math.ceil(vp.height * dpr); canvas.style.width = `${Math.ceil(vp.width)}px`; canvas.style.height = `${Math.ceil(vp.height)}px`;
    const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height; const ctx = off.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, off.width, off.height);
    await page.render({ canvasContext: ctx, viewport: vp, transform: [dpr,0,0,dpr,0,0] }).promise;
    const out = applyFilters(off, state.filters); canvas.getContext('2d').drawImage(out, 0, 0);
    refs.previewTitle.textContent = `${file.name} · Page ${p.pageNumber}`; refs.pageIndicator.textContent = `${state.currentPage + 1} / ${state.pages.length}`;
    refs.pageSizeText.textContent = `${Math.round(base.width)} × ${Math.round(base.height)} px`; refs.pageFileText.textContent = file.name; refs.pageSelectedText.textContent = p.selected ? 'Included' : 'Excluded';
    refs.prevPageBtn.disabled = state.currentPage <= 0; refs.nextPageBtn.disabled = state.currentPage >= state.pages.length - 1;
    refs.previewStage.querySelector('#previewLoading')?.classList.add('hidden');
  }

  function selectPage(index) { if (index < 0 || index >= state.pages.length) return; state.currentPage = index; renderPreview(); renderPageGridHighlight(); }
  function renderPageGridHighlight() { refs.pageGrid.querySelectorAll('.page-thumb').forEach((el,i) => el.classList.toggle('is-current', i === state.currentPage)); }
  function removeFile(id) { state.files = state.files.filter(f => f.id !== id); state.pages = state.pages.filter(p => p.fileId !== id); state.currentPage = Math.min(state.currentPage, Math.max(0, state.pages.length - 1)); if (!state.files.length) clearAll(); else renderAll(); }
  function clearAll() { state.files = []; state.pages = []; state.currentPage = 0; refs.appShell.classList.add('hidden'); refs.emptyState.classList.remove('hidden'); refs.fileInput.value = ''; refs.addMoreInput.value = ''; }
  function activeFile(id) { const p = state.pages[state.currentPage]; return p?.fileId === id; }

  function syncFilters() {
    state.filters = { brightness: Number(refs.brightness.value), contrast: Number(refs.contrast.value), background: Number(refs.background.value), sharpness: Number(refs.sharpness.value), grayscale: refs.grayscale.checked, invert: refs.invert.checked, keepDarkText: refs.keepDarkText.checked, pageNumbers: refs.pageNumbers.checked };
    refs.presetSelect.value = 'custom';
    renderPreview(); renderSummary();
  }

  function applyPreset(name) {
    const presets = {
      clean: { brightness: 8, contrast: 18, background: 18, sharpness: 12, grayscale: false, invert: false, keepDarkText: true, pageNumbers: false },
      smartboard: { brightness: 15, contrast: 28, background: 78, sharpness: 28, grayscale: false, invert: false, keepDarkText: true, pageNumbers: false },
      grayscale: { brightness: 10, contrast: 18, background: 25, sharpness: 12, grayscale: true, invert: false, keepDarkText: true, pageNumbers: false },
      contrast: { brightness: 5, contrast: 48, background: 35, sharpness: 20, grayscale: false, invert: false, keepDarkText: true, pageNumbers: false },
      scan: { brightness: 7, contrast: 24, background: 12, sharpness: 40, grayscale: true, invert: false, keepDarkText: true, pageNumbers: false },
      original: defaultFilters()
    };
    state.filters = presets[name] ? { ...presets[name] } : state.filters; updateFilterInputs(); renderPreview(); renderSummary();
  }

  function updateFilterInputs() {
    const f = state.filters; refs.brightness.value = f.brightness; refs.contrast.value = f.contrast; refs.background.value = f.background; refs.sharpness.value = f.sharpness;
    refs.grayscale.checked = f.grayscale; refs.invert.checked = f.invert; refs.keepDarkText.checked = f.keepDarkText; refs.pageNumbers.checked = f.pageNumbers;
    refs.brightnessOut.value = ''; refs.brightnessOut.textContent = f.brightness; refs.contrastOut.textContent = f.contrast; refs.backgroundOut.textContent = f.background; refs.sharpnessOut.textContent = f.sharpness;
  }

  function applyFilters(source, f) {
    const out = document.createElement('canvas'); out.width = source.width; out.height = source.height; const ctx = out.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source,0,0);
    const img = ctx.getImageData(0,0,out.width,out.height); const d = img.data;
    const c = (259 * (f.contrast * 2.55 + 255)) / (255 * (259 - (f.contrast * 2.55))); const b = f.brightness * 2.55;
    const bg = f.background / 100;
    for (let i=0;i<d.length;i+=4) {
      let r=d[i],g=d[i+1],bl=d[i+2];
      if (f.grayscale) { const y = .299*r + .587*g + .114*bl; r=g=bl=y; }
      r = c*(r-128)+128+b; g = c*(g-128)+128+b; bl = c*(bl-128)+128+b;
      if (bg > 0) { const avg=(r+g+bl)/3; const boost = Math.max(0, (avg-110)/145) * bg; r += (255-r)*boost; g += (255-g)*boost; bl += (255-bl)*boost; }
      if (f.keepDarkText) { const lum = .299*r+.587*g+.114*bl; if (lum < 105) { r*=.76; g*=.76; bl*=.76; } }
      if (f.invert) { r=255-r; g=255-g; bl=255-bl; }
      d[i]=clamp(r); d[i+1]=clamp(g); d[i+2]=clamp(bl);
    }
    ctx.putImageData(img,0,0);
    if (f.sharpness > 0) return sharpen(out, f.sharpness/100);
    return out;
  }

  function sharpen(canvas, amount) {
    const w=canvas.width,h=canvas.height,src=canvas.getContext('2d').getImageData(0,0,w,h),dst=new ImageData(w,h),s=src.data,d=dst.data;
    const a=amount*1.15, k=[[0,-a,0],[-a,1+4*a,-a],[0,-a,0]];
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++) { let r=0,g=0,b=0; for(let ky=-1;ky<=1;ky++) for(let kx=-1;kx<=1;kx++){const idx=((y+ky)*w+(x+kx))*4,kv=k[ky+1][kx+1];r+=s[idx]*kv;g+=s[idx+1]*kv;b+=s[idx+2]*kv;} const i=(y*w+x)*4;d[i]=clamp(r);d[i+1]=clamp(g);d[i+2]=clamp(b);d[i+3]=255; }
    for(let x=0;x<w;x++){let i=x*4,j=((h-1)*w+x)*4; d[i]=s[i];d[i+1]=s[i+1];d[i+2]=s[i+2];d[i+3]=255; d[j]=s[j];d[j+1]=s[j+1];d[j+2]=s[j+2];d[j+3]=255;} for(let y=0;y<h;y++){let i=(y*w)*4,j=(y*w+w-1)*4;d[i]=s[i];d[i+1]=s[i+1];d[i+2]=s[i+2];d[i+3]=255;d[j]=s[j];d[j+1]=s[j+1];d[j+2]=s[j+2];d[j+3]=255;}
    const o=document.createElement('canvas');o.width=w;o.height=h;o.getContext('2d').putImageData(dst,0,0);return o;
  }

  async function renderSourceToCanvas(p, targetWidth=1200) {
    const file = state.files.find(f=>f.id===p.fileId); const page = await file.pdf.getPage(p.pageNumber); const base=page.getViewport({scale:1}); const scale=targetWidth/base.width; const vp=page.getViewport({scale}); const c=document.createElement('canvas'); c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);await page.render({canvasContext:ctx,viewport:vp}).promise;return applyFilters(c,state.filters);
  }

  function layoutSpec(n, orientation){
    if (n===1) return [1,1]; if (n===2) return [1,2]; if (n===4) return [2,2]; if (n===6) return [2,3]; if (n===8) return [2,4]; if (n===9) return [3,3]; if (n===12) return [3,4]; if (n===16) return [4,4]; return [2,2];
  }
  function previewSheetSize(orientation){ return orientation==='portrait' ? [794,1123] : [1123,794]; }
  function pdfSheetSize(orientation){ return orientation==='portrait' ? [595.28,841.89] : [841.89,595.28]; }
  function sheetSize(orientation){ return previewSheetSize(orientation); }

  async function previewSheet(state, refs) {
    const selected=state.pages.filter(p=>p.selected); if(!selected.length) return alert('Select at least one page.');
    const [W,H]=sheetSize(state.orientation); const canvas=refs.sheetCanvas; canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);const [rows,cols]=layoutSpec(state.layout,state.orientation);const gap=18, cellW=(W-gap*(cols+1))/cols, cellH=(H-gap*(rows+1))/rows;const batch=selected.slice(0,state.layout);
    for(let i=0;i<batch.length;i++){const img=await renderSourceToCanvas(batch[i],900); const scale=Math.min(cellW/img.width,cellH/img.height);const dw=img.width*scale,dh=img.height*scale;const x=gap+(i%cols)* (cellW+gap)+(cellW-dw)/2;const y=gap+Math.floor(i/cols)*(cellH+gap)+(cellH-dh)/2;ctx.drawImage(img,x,y,dw,dh); if(state.filters.pageNumbers){ctx.fillStyle='#444';ctx.font='12px sans-serif';ctx.fillText(String(i+1),x+dw-10,y+dh-8);} }
    refs.sheetDialogTitle.textContent=`A4 ${state.orientation} · ${Math.min(state.layout,selected.length)} page${Math.min(state.layout,selected.length)===1?'':'s'} on sheet`; refs.sheetDialog.showModal();
  }

  async function exportPdf(state, refs){
    const selected=state.pages.filter(p=>p.selected); if(!selected.length) return alert('Select at least one page to export.');
    refs.exportBtn.disabled=true; refs.previewSheetBtn.disabled=true; refs.progressWrap.classList.remove('hidden'); refs.progressBar.style.width='0%'; refs.progressText.textContent='Preparing A4 sheets…';
    try {
      const doc=await PDFDocument.create(); const [W,H]=pdfSheetSize(state.orientation); const [rows,cols]=layoutSpec(state.layout,state.orientation); const gap=18, cellW=(W-gap*(cols+1))/cols, cellH=(H-gap*(rows+1))/rows;
      const groups=[]; for(let i=0;i<selected.length;i+=state.layout) groups.push(selected.slice(i,i+state.layout));
      for(let gi=0;gi<groups.length;gi++){
        const sheet=doc.addPage([W,H]); for(let i=0;i<groups[gi].length;i++){
          const p=groups[gi][i]; const canvas=await renderSourceToCanvas(p,1000); const dataUrl=canvas.toDataURL('image/jpeg',.90); const img=await doc.embedJpg(dataUrl); const scale=Math.min(cellW/img.width,cellH/img.height); const dw=img.width*scale,dh=img.height*scale; const x=gap+(i%cols)*(cellW+gap)+(cellW-dw)/2; const y=H-gap-Math.floor(i/cols)*(cellH+gap)-dh-(cellH-dh)/2; sheet.drawImage(img,{x,y,width:dw,height:dh}); if(state.filters.pageNumbers){sheet.drawText(String(gi*state.layout+i+1),{x:x+dw-11,y:y+2,size:7,color:rgb(.25,.25,.25)});} }
          refs.progressBar.style.width=`${Math.round(((gi+1)/groups.length)*100)}%`; refs.progressText.textContent=`Creating sheet ${gi+1} of ${groups.length}…`;
      }
      const bytes=await doc.save(); const blob=new Blob([bytes],{type:'application/pdf'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`PdfCrafter-A4-Notes-${new Date().toISOString().slice(0,10)}.pdf`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000); refs.progressText.textContent='Done — your printable PDF is ready.';
    } catch(err){ console.error(err); alert('Export failed. Try fewer pages or a smaller source PDF.'); refs.progressText.textContent='Export failed.'; }
    finally { refs.exportBtn.disabled=false; refs.previewSheetBtn.disabled=false; }
  }

  function renderSummary(){const total=state.pages.length,sel=state.pages.filter(p=>p.selected).length,sheets=Math.ceil(sel/state.layout)||0;refs.exportSummary.textContent=`${sel} selected page${sel===1?'':'s'} → ${sheets} A4 sheet${sheets===1?'':'s'} · ${state.layout} per sheet · ${state.orientation}.`}
  function updateLayoutHint(){const n=state.layout;const map={1:'Best for maximum readability.',2:'Good balance of readability and paper saving.',4:'Best for detailed lecture notes.',6:'Compact handout layout.',8:'Ultra-compact review layout.',9:'Balanced dense reference sheet.',12:'Dense revision / handout layout.',16:'Maximum-density reference sheet.'};refs.layoutHint.textContent=map[n]||''}
  function wireDrop(){['dragenter','dragover'].forEach(ev=>refs.dropZone.addEventListener(ev,e=>{e.preventDefault();refs.dropZone.classList.add('drag')}));['dragleave','drop'].forEach(ev=>refs.dropZone.addEventListener(ev,e=>{e.preventDefault();refs.dropZone.classList.remove('drag')}));refs.dropZone.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));}
  function defaultFilters(){return {brightness:0,contrast:0,background:0,sharpness:0,grayscale:false,invert:false,keepDarkText:true,pageNumbers:false}}
  function q(s){return document.querySelector(s)} function clamp(v){return Math.max(0,Math.min(255,Math.round(v)))} function escapeHtml(s=''){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))} function escapeAttr(s=''){return escapeHtml(s)} function formatBytes(n){if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`;return `${(n/(1024*1024)).toFixed(1)} MB`}
});
