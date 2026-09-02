import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const { PDFDocument } = window.PDFLib;

const A4 = { portrait: [595.28, 841.89], landscape: [841.89, 595.28] };
const PREVIEW_A4 = { portrait: [794, 1123], landscape: [1123, 794] };

const PRESETS = {
  clean:      { brightness: 5, contrast: 18, background: 28, sharpness: 10, grayscale: false, invert: false, autoLight: true, pageNumbers: false },
  smartboard: { brightness: 8, contrast: 32, background: 72, sharpness: 24, grayscale: false, invert: false, autoLight: true, pageNumbers: false },
  grayscale:  { brightness: 7, contrast: 22, background: 42, sharpness: 15, grayscale: true, invert: false, autoLight: true, pageNumbers: false },
  contrast:    { brightness: 4, contrast: 48, background: 35, sharpness: 18, grayscale: false, invert: false, autoLight: true, pageNumbers: false },
  scan:       { brightness: 7, contrast: 28, background: 18, sharpness: 36, grayscale: true, invert: false, autoLight: false, pageNumbers: false },
  original:   { brightness: 0, contrast: 0, background: 0, sharpness: 0, grayscale: false, invert: false, autoLight: false, pageNumbers: false }
};

const renderCache = new Map();
let refreshTimer = 0;
let previewRequest = 0;
const filterKey = () => JSON.stringify(state.filters);
const invalidateFilterCache = () => { for (const k of renderCache.keys()) if (k.includes('|f:')) renderCache.delete(k); };
const schedulePreview = (delay=90) => { clearTimeout(refreshTimer); refreshTimer=setTimeout(()=>refreshPreviews(),delay); };
const state = {
  files: [], pages: [], currentPage: 0,
  orientation: 'portrait', rows: 2, cols: 2,
  margin: 8, gutter: 3, quality: 170,
  filters: { ...PRESETS.clean },
  busy: false, activePreview: 'source', compare: 55
};

const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];
const clamp = (v, min=0, max=255) => Math.max(min, Math.min(max, Math.round(v)));
const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatBytes = (n) => n < 1024*1024 ? `${Math.max(1, Math.round(n/1024))} KB` : `${(n/(1024*1024)).toFixed(1)} MB`;
const selectedPages = () => state.pages.filter(p => p.selected);
const activePage = () => state.pages[state.currentPage] || state.pages[0];
const sheetCount = () => state.rows * state.cols;

const refs = {
  fileInput:q('#fileInput'), addMoreInput:q('#addMoreInput'), dropZone:q('#dropZone'), emptyState:q('#emptyState'), appShell:q('#appShell'),
  fileList:q('#fileList'), fileCountText:q('#fileCountText'), pageGrid:q('#pageGrid'), previewCanvas:q('#previewCanvas'), previewStage:q('#previewStage'),
  beforeCanvas:q('#beforeCanvas'), afterCanvas:q('#afterCanvas'), compareFrame:q('#compareFrame'), compareSlider:q('#compareSlider'), compareHandle:q('#compareHandle'), compareLine:q('#compareLine'),
  previewTitle:q('#previewTitle'), pageIndicator:q('#pageIndicator'), pageSizeText:q('#pageSizeText'), pageFileText:q('#pageFileText'), pageSelectedText:q('#pageSelectedText'),
  prevPageBtn:q('#prevPageBtn'), nextPageBtn:q('#nextPageBtn'), clearAllBtn:q('#clearAllBtn'), selectAllBtn:q('#selectAllBtn'), selectNoneBtn:q('#selectNoneBtn'),
  rows:q('#gridRows'), cols:q('#gridCols'), rowsNum:q('#gridRowsNum'), colsNum:q('#gridColsNum'), rowsOut:q('#gridRowsOut'), colsOut:q('#gridColsOut'), gridCount:q('#gridCount'), gridPreset:q('#gridPreset'),
  presetSelect:q('#presetSelect'), brightness:q('#brightness'), contrast:q('#contrast'), background:q('#background'), sharpness:q('#sharpness'),
  brightnessOut:q('#brightnessOut'), contrastOut:q('#contrastOut'), backgroundOut:q('#backgroundOut'), sharpnessOut:q('#sharpnessOut'),
  grayscale:q('#grayscale'), invert:q('#invert'), autoLight:q('#autoLight'), pageNumbers:q('#pageNumbers'),
  margin:q('#margin'), gutter:q('#gutter'), quality:q('#quality'), marginOut:q('#marginOut'), gutterOut:q('#gutterOut'), qualityOut:q('#qualityOut'),
  resetFiltersBtn:q('#resetFiltersBtn'), exportSummary:q('#exportSummary'), exportBtn:q('#exportBtn'), previewSheetBtn:q('#previewSheetBtn'), progressWrap:q('#progressWrap'), progressBar:q('#progressBar'), progressText:q('#progressText'),
  toggleControlsBtn:q('#toggleControlsBtn'), controlsContent:q('#controlsContent'), sheetDialog:q('#sheetDialog'), sheetCanvas:q('#sheetCanvas'), closeDialogBtn:q('#closeDialogBtn'), sheetDialogTitle:q('#sheetDialogTitle'),
  layoutHint:q('#layoutHint'), outputBadge:q('#outputBadge'), detectedRatio:q('#detectedRatio'), sourceInfo:q('#sourceInfo'), sourcePreviewTab:q('#sourcePreviewTab'), sheetPreviewTab:q('#sheetPreviewTab'), smartNote:q('#smartNote'),
  beforeLabel:q('#beforeLabel'), afterLabel:q('#afterLabel'), compareText:q('#compareText')
};

function syncInputs(){
  const f=state.filters;
  refs.brightness.value=f.brightness; refs.contrast.value=f.contrast; refs.background.value=f.background; refs.sharpness.value=f.sharpness;
  refs.grayscale.checked=f.grayscale; refs.invert.checked=f.invert; refs.autoLight.checked=f.autoLight; refs.pageNumbers.checked=f.pageNumbers;
  refs.brightnessOut.textContent=f.brightness; refs.contrastOut.textContent=f.contrast; refs.backgroundOut.textContent=f.background; refs.sharpnessOut.textContent=f.sharpness;
  refs.margin.value=state.margin; refs.gutter.value=state.gutter; refs.quality.value=state.quality;
  refs.marginOut.textContent=`${state.margin} mm`; refs.gutterOut.textContent=`${state.gutter} mm`; refs.qualityOut.textContent=`${state.quality} DPI`;
  refs.rows.value=state.rows; refs.cols.value=state.cols; if(refs.rowsNum) refs.rowsNum.value=state.rows; if(refs.colsNum) refs.colsNum.value=state.cols; refs.rowsOut.textContent=state.rows; refs.colsOut.textContent=state.cols; refs.gridCount.textContent=`${sheetCount()} slides / A4`;
  refs.compareSlider.value=state.compare; updateCompareVisual();
}

function applyPreset(name){
  if(!PRESETS[name]) return;
  state.filters={...PRESETS[name]}; invalidateFilterCache(); syncInputs(); schedulePreview(40);
}

async function handleFiles(fileList){
  const files=[...fileList].filter(f=>f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf'));
  if(!files.length) return;
  for(const file of files){
    try{
      const bytes=await file.arrayBuffer();
      const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
      const id=crypto.randomUUID();
      state.files.push({id,name:file.name,size:file.size,pdf,bytes});
      for(let i=1;i<=pdf.numPages;i++) state.pages.push({id:`${id}-${i}`,fileId:id,pageNumber:i,selected:true,width:null,height:null});
      const firstPage=await pdf.getPage(1); const vb=firstPage.getViewport({scale:1});
      for(const p of state.pages.filter(x=>x.fileId===id)){p.width=vb.width;p.height=vb.height;}
    }catch(err){console.error(err);alert(`Could not open ${file.name}. The file may be encrypted or invalid.`);}
  }
  if(state.pages.length) state.currentPage=Math.max(0,state.pages.findIndex(p=>p.selected));
  refs.emptyState.classList.add('hidden'); refs.appShell.classList.remove('hidden');
  await renderAll();
}

async function renderAll(){
  renderFiles(); await renderPageGrid(); updateSourceInfo(); updateLayoutHint(); renderSummary(); await refreshPreviews();
}

function renderFiles(){
  refs.fileCountText.textContent=`${state.files.length} file${state.files.length===1?'':'s'}`;
  refs.fileList.innerHTML=state.files.map(file=>{
    const count=state.pages.filter(p=>p.fileId===file.id).length;
    return `<div class="file-item ${activePage()?.fileId===file.id?'active':''}"><div class="file-icon">PDF</div><div class="file-main"><strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)} · ${count} pages</span></div><button class="file-remove" data-remove-file="${file.id}" aria-label="Remove">×</button></div>`;
  }).join('');
  qa('[data-remove-file]').forEach(btn=>btn.addEventListener('click',()=>removeFile(btn.dataset.removeFile)));
}

async function renderPageGrid(){
  refs.pageGrid.innerHTML='';
  const fragment=document.createDocumentFragment();
  for(const p of state.pages){
    const file=state.files.find(f=>f.id===p.fileId);
    const el=document.createElement('div');
    el.className=`page-thumb ${p.selected?'selected':''} ${state.pages[state.currentPage]?.id===p.id?'current':''}`;
    el.innerHTML=`<button type="button" class="thumb-select" aria-label="${p.selected?'Exclude':'Include'} page ${p.pageNumber}">${p.selected?'✓':'+'}</button><button type="button" class="thumb-delete" aria-label="Delete page ${p.pageNumber}">×</button><button type="button" class="thumb-preview"><canvas></canvas><small>Page ${p.pageNumber}</small><em>${escapeHtml(file?.name||'')}</em></button>`;
    el.querySelector('.thumb-preview').addEventListener('click',async ()=>{ state.currentPage=state.pages.findIndex(x=>x.id===p.id); qa('.page-thumb').forEach(x=>x.classList.remove('current')); el.classList.add('current'); renderFiles(); updatePageMeta(); updateSourceInfo(); await renderSourcePreview(); });
    el.querySelector('.thumb-select').addEventListener('click',e=>{ e.stopPropagation(); p.selected=!p.selected; state.currentPage=state.pages.findIndex(x=>x.id===p.id); el.classList.toggle('selected',p.selected); el.querySelector('.thumb-select').textContent=p.selected?'✓':'+'; el.querySelector('.thumb-select').setAttribute('aria-label',`${p.selected?'Exclude':'Include'} page ${p.pageNumber}`); renderFiles(); updatePageMeta(); renderSummary(); schedulePreview(); });
    el.querySelector('.thumb-delete').addEventListener('click',async e=>{ e.stopPropagation(); await deletePage(p.id); });
    fragment.appendChild(el);
  }
  refs.pageGrid.appendChild(fragment);
  const items=[...refs.pageGrid.querySelectorAll('.page-thumb')];
  let i=0;
  const paint=async()=>{
    const slice=items.slice(i,i+6); i+=slice.length;
    await Promise.all(slice.map(async el=>{
      const pageId=state.pages[items.indexOf(el)]?.id; const p=state.pages.find(x=>x.id===pageId); if(!p)return;
      try{ const img=await renderSourceToCanvas(p,220,{applyFilters:false}); const c=el.querySelector('canvas'); const scale=Math.min(1,220/img.width); c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale)); c.getContext('2d').drawImage(img,0,0,c.width,c.height); }catch(err){ console.warn(err); }
    }));
    if(i<items.length) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}
async function renderSourcePreview(){
  const p=activePage(); if(!p) return;
  const requestId=++previewRequest;
  refs.previewStage.classList.add('loading');
  try{
    const before=await renderSourceToCanvas(p,980,{applyFilters:false});
    const after=await renderSourceToCanvas(p,980,{applyFilters:true});
    if(requestId!==previewRequest) return;
    const maxW=Math.max(300,refs.compareStage.clientWidth-20), maxH=Math.max(260,refs.compareStage.clientHeight-20);
    const scale=Math.min(maxW/before.width,maxH/before.height,1);
    const w=Math.max(1,Math.round(before.width*scale)), h=Math.max(1,Math.round(before.height*scale));
    refs.compareFrame.style.width=`${w}px`; refs.compareFrame.style.height=`${h}px`;
    for(const c of [refs.beforeCanvas,refs.afterCanvas]){ c.width=w; c.height=h; c.style.width=`${w}px`; c.style.height=`${h}px`; }
    refs.beforeCanvas.getContext('2d').drawImage(before,0,0,w,h); refs.afterCanvas.getContext('2d').drawImage(after,0,0,w,h);
    refs.previewCanvas.classList.add('hidden');
    updateCompareVisual(); updatePageMeta();
    refs.previewTitle.textContent=`PDF page ${p.pageNumber} — Before / After`;
  }catch(err){console.error(err);}
  finally{ if(requestId===previewRequest) refs.previewStage.classList.remove('loading'); }
}
function updateCompareVisual(){
  const pct=Math.max(0,Math.min(100,Number(state.compare)||0));
  if(refs.compareSlider && Number(refs.compareSlider.value)!==pct) refs.compareSlider.value=pct;
  if(refs.afterCanvas){
    refs.afterCanvas.style.clipPath=`inset(0 0 0 ${100-pct}%)`;
  }
  if(refs.compareHandle) refs.compareHandle.style.left=`${pct}%`;
  if(refs.compareLine) refs.compareLine.style.left=`${pct}%`;
  if(refs.compareText) refs.compareText.textContent=`${pct}% printable`;
}
function updatePageMeta(){
  const p=activePage(); if(!p) return; const file=state.files.find(f=>f.id===p.fileId);
  refs.pageIndicator.textContent=`${state.currentPage+1} / ${state.pages.length}`;
  refs.pageSizeText.textContent=`${Math.round(p.width||0)} × ${Math.round(p.height||0)} pt`;
  refs.pageFileText.textContent=file?.name||'—'; refs.pageSelectedText.textContent=p.selected?'Included':'Excluded';
}

function updateSourceInfo(){
  const p=activePage(); if(!p) return; const ratio=(p.width&&p.height)?p.width/p.height:0;
  const label=ratio>1.55&&ratio<1.9?'16:9 landscape':`${ratio.toFixed(2)}:1`;
  refs.detectedRatio.textContent=label; refs.sourceInfo.textContent=`Detected source: ${label} · ${state.pages.length} total pages`;
}

function updateLayoutHint(){
  const n=sheetCount(); const ratio=state.cols/state.rows;
  let note=`${state.rows} rows × ${state.cols} columns = ${n} slides / A4.`;
  if(state.orientation==='portrait' && n<=4 && ratio<1.2) note+=' Good for readable printed notes.';
  if(n>=9) note+=' Use higher density for revision sheets.';
  refs.layoutHint.textContent=note;
  refs.outputBadge.textContent=`A4 ${state.orientation==='portrait'?'Portrait':'Landscape'} · ${state.rows} × ${state.cols}`;
  refs.gridCount.textContent=`${n} slides / A4`;
}

function renderSummary(){
  const sel=selectedPages().length,sheets=Math.ceil(sel/sheetCount())||0;
  refs.exportSummary.textContent=`${sel} selected ${sel===1?'page':'pages'} → ${sheets} A4 ${sheets===1?'sheet':'sheets'} · ${state.rows} × ${state.cols} grid · ${state.orientation}.`;
}

async function renderSourceToCanvas(p,targetWidth=1200,opts={applyFilters:true}){
  const file=state.files.find(f=>f.id===p.fileId); if(!file) throw new Error('Missing PDF');
  const key=`${p.id}|${Math.round(targetWidth)}|${opts.applyFilters?'f:'+filterKey():'raw'}`;
  if(renderCache.has(key)) return renderCache.get(key);
  const page=await file.pdf.getPage(p.pageNumber),base=page.getViewport({scale:1}),scale=targetWidth/base.width,vp=page.getViewport({scale});
  const c=document.createElement('canvas'); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height);
  const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:ctx,viewport:vp}).promise;
  const out=opts.applyFilters?applyFilters(c,state.filters):c;
  renderCache.set(key,out); return out;
}
function applyFilters(source,f){
  if(!f.brightness&&!f.contrast&&!f.background&&!f.sharpness&&!f.grayscale&&!f.invert&&!f.autoLight) return source;
  const out=document.createElement('canvas');out.width=source.width;out.height=source.height;const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const img=ctx.getImageData(0,0,out.width,out.height),d=img.data; const sampleStep=Math.max(4,Math.floor(Math.sqrt(d.length/4/50000))*2);
  let lumSum=0,count=0; for(let i=0;i<d.length;i+=4*sampleStep){lumSum+=.299*d[i]+.587*d[i+1]+.114*d[i+2];count++;} const mean=lumSum/Math.max(1,count);
  const autoInvert=f.autoLight&&mean<118,cFactor=(259*(f.contrast*2.55+255))/(255*(259-f.contrast*2.55)),b=f.brightness*2.55,bg=f.background/100;
  for(let i=0;i<d.length;i+=4){
    let r=d[i],g=d[i+1],bl=d[i+2];
    if(autoInvert){r=255-r;g=255-g;bl=255-bl;} if(f.invert){r=255-r;g=255-g;bl=255-bl;} if(f.grayscale){const y=.299*r+.587*g+.114*bl;r=g=bl=y;}
    r=cFactor*(r-128)+128+b;g=cFactor*(g-128)+128+b;bl=cFactor*(bl-128)+128+b;
    if(bg>0){const y=.299*r+.587*g+.114*bl,threshold=150-(bg*55),whiten=Math.max(0,Math.min(1,(y-threshold)/(255-threshold)))*bg;r+=(255-r)*whiten;g+=(255-g)*whiten;bl+=(255-bl)*whiten;if(bg>0.45&&y>190)r=g=bl=255;}
    d[i]=clamp(r);d[i+1]=clamp(g);d[i+2]=clamp(bl);
  }
  ctx.putImageData(img,0,0); return f.sharpness>0?sharpen(out,f.sharpness/100):out;
}

function sharpen(canvas,amount){
  const w=canvas.width,h=canvas.height,src=canvas.getContext('2d').getImageData(0,0,w,h),s=src.data,d=new Uint8ClampedArray(s.length),a=amount*.9;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;for(let ch=0;ch<3;ch++){const center=s[i+ch],left=s[i-4+ch],right=s[i+4+ch],up=s[i-w*4+ch],down=s[i+w*4+ch];d[i+ch]=clamp(center*(1+4*a)-a*(left+right+up+down));}d[i+3]=255;}
  for(let x=0;x<w;x++)for(const y of [0,h-1]){const i=(y*w+x)*4;d[i]=s[i];d[i+1]=s[i+1];d[i+2]=s[i+2];d[i+3]=255;} for(let y=0;y<h;y++)for(const x of [0,w-1]){const i=(y*w+x)*4;d[i]=s[i];d[i+1]=s[i+1];d[i+2]=s[i+2];d[i+3]=255;}
  const out=document.createElement('canvas');out.width=w;out.height=h;out.getContext('2d').putImageData(new ImageData(d,w,h),0,0);return out;
}

function printDimensions(){return A4[state.orientation];}
function previewDimensions(){return PREVIEW_A4[state.orientation];}
function cellGeometry(W,H){
  const rows=state.rows,cols=state.cols,margin=state.margin*2.83465,gap=state.gutter*2.83465;
  const usableW=W-2*margin,usableH=H-2*margin,cellW=Math.max(1,(usableW-gap*(cols-1))/cols),cellH=Math.max(1,(usableH-gap*(rows-1))/rows);
  return {rows,cols,margin,gap,cellW,cellH};
}

async function drawA4Sheet(ctx,W,H,selected,docMode=false){
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  const {rows,cols,margin,gap,cellW,cellH}=cellGeometry(W,H), batch=selected.slice(0,sheetCount());
  const targetBase=docMode?Math.min(1900,Math.max(260,Math.round(cellW*state.quality/72))):Math.min(620,Math.max(180,Math.round(cellW*.95)));
  for(let i=0;i<batch.length;i++){
    const img=await renderSourceToCanvas(batch[i],targetBase,{applyFilters:true});
    const scale=Math.min(cellW/img.width,cellH/img.height),dw=img.width*scale,dh=img.height*scale;
    const col=i%cols,row=Math.floor(i/cols),x=margin+col*(cellW+gap)+(cellW-dw)/2,y=margin+row*(cellH+gap)+(cellH-dh)/2;
    ctx.drawImage(img,x,y,dw,dh);
    if(state.filters.pageNumbers){ctx.fillStyle='rgba(60,60,60,.82)';ctx.font=`${Math.max(7,W/120)}px Inter,Arial`;ctx.textAlign='right';ctx.fillText(String(selected.indexOf(batch[i])+1),x+dw,Math.min(H-margin/2,y+dh+11));}
    if(!docMode && i%4===3) await new Promise(requestAnimationFrame);
  }
}
async function drawSheetOnCanvas(canvas,compact=false){ const selected=selectedPages(); if(!selected.length)return; const [W,H]=compact?previewDimensions():[canvas.width,canvas.height]; canvas.width=W; canvas.height=H; await drawA4Sheet(canvas.getContext('2d'),W,H,selected,false); }
async function previewSheet(){
  const selected=selectedPages(); if(!selected.length)return alert('Select at least one page.'); if(state.busy)return;
  state.busy=true; refs.previewSheetBtn.disabled=true;
  try{ const [W,H]=previewDimensions(); refs.sheetCanvas.width=W; refs.sheetCanvas.height=H; await drawA4Sheet(refs.sheetCanvas.getContext('2d'),W,H,selected,false); refs.sheetDialogTitle.textContent=`A4 ${state.orientation} · ${state.rows} × ${state.cols} · ${Math.min(sheetCount(),selected.length)} slide${Math.min(sheetCount(),selected.length)===1?'':'s'} on sheet`; if(!refs.sheetDialog.open){ if(typeof refs.sheetDialog.showModal==='function') refs.sheetDialog.showModal(); else refs.sheetDialog.setAttribute('open',''); } }
  finally{state.busy=false;refs.previewSheetBtn.disabled=false;}
}
function renderSheetMiniPreview(){ /* intentionally lightweight; full preview opens from the button */ }
async function renderSheetTab(){
  const selected=selectedPages(); if(!selected.length)return;
  const [W,H]=PREVIEW_A4[state.orientation]; refs.previewCanvas.width=W;refs.previewCanvas.height=H;refs.previewCanvas.classList.remove('hidden');
  await drawA4Sheet(refs.previewCanvas.getContext('2d'),W,H,selected,false); refs.previewTitle.textContent='A4 output preview';
  refs.compareFrame?.classList.add('hidden'); refs.beforeCanvas.classList.add('hidden');refs.afterCanvas.classList.add('hidden');refs.compareHandle.classList.add('hidden');refs.compareLine.classList.add('hidden');
} 
async function refreshPreviews(){
  if(!state.pages.length)return;
  if(state.activePreview==='sheet') await renderSheetTab();
  else { refs.compareFrame?.classList.remove('hidden'); refs.beforeCanvas.classList.remove('hidden'); refs.afterCanvas.classList.remove('hidden'); refs.compareHandle.classList.remove('hidden'); refs.compareLine.classList.remove('hidden'); await renderSourcePreview(); }
}
async function exportPdf(){
  const selected=selectedPages();if(!selected.length)return alert('Select at least one page to export.');if(state.busy)return;state.busy=true;
  refs.exportBtn.disabled=true;refs.previewSheetBtn.disabled=true;refs.progressWrap.classList.remove('hidden');refs.progressBar.style.width='0%';
  try{
    const doc=await PDFDocument.create(),[W,H]=printDimensions(),groups=[];for(let i=0;i<selected.length;i+=sheetCount())groups.push(selected.slice(i,i+sheetCount()));
    for(let gi=0;gi<groups.length;gi++){
      const page=doc.addPage([W,H]),{rows,cols,margin,gap,cellW,cellH}=cellGeometry(W,H);
      for(let i=0;i<groups[gi].length;i++){
        const p=groups[gi][i],targetPx=Math.min(1900,Math.max(260,Math.round(cellW*state.quality/72))),canvas=await renderSourceToCanvas(p,targetPx,{applyFilters:true});
        const img=await doc.embedJpg(canvas.toDataURL('image/jpeg',.93));const scale=Math.min(cellW/img.width,cellH/img.height),dw=img.width*scale,dh=img.height*scale,col=i%cols,row=Math.floor(i/cols),x=margin+col*(cellW+gap)+(cellW-dw)/2,y=H-margin-row*(cellH+gap)-dh-(cellH-dh)/2;
        page.drawImage(img,{x,y,width:dw,height:dh});
      }
      refs.progressBar.style.width=`${Math.round(((gi+1)/groups.length)*100)}%`;refs.progressText.textContent=`Building A4 sheet ${gi+1} of ${groups.length}…`;await new Promise(r=>setTimeout(r,0));
    }
    doc.setTitle(`PdfCrafter A4 Notes — ${new Date().toLocaleDateString('en-IN')}`);doc.setProducer('PdfCrafter');doc.setCreator('PdfCrafter');
    const bytes=await doc.save(),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`PdfCrafter-A4-Notes-${new Date().toISOString().slice(0,10)}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
    refs.progressText.textContent=`Done — ${groups.length} A4 sheet${groups.length===1?'':'s'} exported.`;
  }catch(err){console.error(err);alert('Export failed. Try fewer slides per sheet or lower DPI.');refs.progressText.textContent='Export failed.';}
  finally{state.busy=false;refs.exportBtn.disabled=false;refs.previewSheetBtn.disabled=false;}
}

function removeFile(id){state.files=state.files.filter(f=>f.id!==id);state.pages=state.pages.filter(p=>p.fileId!==id);state.currentPage=Math.min(state.currentPage,Math.max(0,state.pages.length-1));if(!state.pages.length){refs.appShell.classList.add('hidden');refs.emptyState.classList.remove('hidden');}renderAll();}
async function deletePage(pageId){
  const idx=state.pages.findIndex(p=>p.id===pageId); if(idx<0) return;
  state.pages.splice(idx,1);
  if(!state.pages.length){state.files=[];state.currentPage=0;refs.appShell.classList.add('hidden');refs.emptyState.classList.remove('hidden');renderAll();return;}
  state.currentPage=Math.min(idx,state.pages.length-1);
  renderPageGrid(); renderFiles(); updateSourceInfo(); updatePageMeta(); renderSummary(); schedulePreview(40);
}
function removeSelectedPages(){
  const excluded=state.pages.filter(p=>!p.selected);
  if(!excluded.length){alert('First click ✓ on pages you want to remove. They will become +. Then use Delete excluded pages.');return;}
  state.pages=state.pages.filter(p=>p.selected);
  state.currentPage=Math.min(state.currentPage,Math.max(0,state.pages.length-1));
  renderPageGrid(); renderFiles(); updateSourceInfo(); updatePageMeta(); renderSummary(); schedulePreview(40);
}
function clearAll(){if(!state.files.length)return;state.files=[];state.pages=[];state.currentPage=0;refs.appShell.classList.add('hidden');refs.emptyState.classList.remove('hidden');renderAll();}
async function setActivePreview(mode){state.activePreview=mode;refs.sourcePreviewTab.classList.toggle('active',mode==='source');refs.sheetPreviewTab.classList.toggle('active',mode==='sheet');await refreshPreviews();}
function changePage(delta){if(!state.pages.length)return;state.currentPage=(state.currentPage+delta+state.pages.length)%state.pages.length;renderPageGrid();renderFiles();updateSourceInfo();renderSourcePreview();}
function setGridValues(rows,cols){
  state.rows=Math.max(1,Math.min(20,Number(rows)||1)); state.cols=Math.max(1,Math.min(20,Number(cols)||1));
  refs.gridPreset.value='custom'; syncInputs(); updateLayoutHint(); renderSummary(); schedulePreview(50);
}
function changeGrid(){setGridValues(refs.rows.value,refs.cols.value);}
function bind(){
  refs.fileInput.addEventListener('change',e=>handleFiles(e.target.files));refs.addMoreInput.addEventListener('change',e=>handleFiles(e.target.files));refs.clearAllBtn.addEventListener('click',clearAll);refs.removeSelectedPagesBtn.addEventListener('click',removeSelectedPages);
  refs.prevPageBtn.addEventListener('click',()=>changePage(-1));refs.nextPageBtn.addEventListener('click',()=>changePage(1));
  refs.selectAllBtn.addEventListener('click',()=>{state.pages.forEach(p=>p.selected=true);renderPageGrid();renderSummary();schedulePreview(40);});
  refs.selectNoneBtn.addEventListener('click',()=>{state.pages.forEach(p=>p.selected=false);renderPageGrid();renderSummary();schedulePreview(60);});
  refs.gridPreset.addEventListener('change',e=>{const v=e.target.value;if(v==='custom')return;const [r,c]=v.split('x').map(Number);setGridValues(r,c);});
  refs.rows.addEventListener('input',changeGrid); refs.cols.addEventListener('input',changeGrid);
  refs.rowsNum?.addEventListener('input',e=>setGridValues(e.target.value,state.cols)); refs.rowsNum?.addEventListener('change',e=>setGridValues(e.target.value,state.cols));
  refs.colsNum?.addEventListener('input',e=>setGridValues(state.rows,e.target.value)); refs.colsNum?.addEventListener('change',e=>setGridValues(state.rows,e.target.value));
  qa('[data-orientation]').forEach(btn=>btn.addEventListener('click',()=>{state.orientation=btn.dataset.orientation;qa('[data-orientation]').forEach(x=>x.classList.toggle('active',x===btn));updateLayoutHint();renderSummary();refreshPreviews();}));
  refs.presetSelect.addEventListener('change',e=>applyPreset(e.target.value));
  ['brightness','contrast','background','sharpness'].forEach(id=>refs[id].addEventListener('input',()=>{state.filters[id]=Number(refs[id].value);refs[id+'Out'].textContent=refs[id].value;invalidateFilterCache();schedulePreview(120);}));
  ['grayscale','invert','autoLight','pageNumbers'].forEach(id=>refs[id].addEventListener('change',()=>{state.filters[id]=refs[id].checked;invalidateFilterCache();schedulePreview(60);}));
  refs.margin.addEventListener('input',()=>{state.margin=Number(refs.margin.value);refs.marginOut.textContent=`${state.margin} mm`;updateLayoutHint();renderSummary();schedulePreview(70);});
  refs.gutter.addEventListener('input',()=>{state.gutter=Number(refs.gutter.value);refs.gutterOut.textContent=`${state.gutter} mm`;schedulePreview(70);});
  refs.quality.addEventListener('input',()=>{state.quality=Number(refs.quality.value);refs.qualityOut.textContent=`${state.quality} DPI`;});
  refs.resetFiltersBtn.addEventListener('click',()=>{state.filters={...PRESETS.clean};refs.presetSelect.value='clean';invalidateFilterCache();syncInputs();schedulePreview(50);});
  refs.exportBtn.addEventListener('click',exportPdf);refs.previewSheetBtn.addEventListener('click',previewSheet);refs.closeDialogBtn.addEventListener('click',()=>refs.sheetDialog.close());
  refs.sourcePreviewTab.addEventListener('click',()=>setActivePreview('source')); refs.sheetPreviewTab.addEventListener('click',()=>setActivePreview('sheet'));
  refs.compareSlider.addEventListener('input',e=>{state.compare=Number(e.target.value);updateCompareVisual();});
  let draggingCompare=false;
  const moveCompare=(clientX)=>{
    const frame=refs.compareFrame; if(!frame) return;
    const r=frame.getBoundingClientRect();
    const pct=Math.max(0,Math.min(100,((clientX-r.left)/Math.max(1,r.width))*100));
    state.compare=Math.round(pct); updateCompareVisual();
  };
  const startCompare=(e)=>{ if(e.button!==undefined && e.button!==0) return; draggingCompare=true; refs.compareHitarea?.setPointerCapture?.(e.pointerId); moveCompare(e.clientX); e.preventDefault(); };
  refs.compareHitarea?.addEventListener('pointerdown',startCompare);
  refs.compareHitarea?.addEventListener('pointermove',e=>{if(draggingCompare)moveCompare(e.clientX);});
  refs.compareHitarea?.addEventListener('pointerup',()=>draggingCompare=false); refs.compareHitarea?.addEventListener('pointercancel',()=>draggingCompare=false);
  refs.compareHitarea?.addEventListener('lostpointercapture',()=>draggingCompare=false);
  refs.toggleControlsBtn.addEventListener('click',()=>{const hidden=refs.controlsContent.classList.toggle('hidden');refs.toggleControlsBtn.textContent=hidden?'Show controls':'Hide controls';});
  ['dragenter','dragover'].forEach(ev=>refs.dropZone.addEventListener(ev,e=>{e.preventDefault();refs.dropZone.classList.add('drag');}));['dragleave','drop'].forEach(ev=>refs.dropZone.addEventListener(ev,e=>{e.preventDefault();refs.dropZone.classList.remove('drag');}));
  refs.dropZone.addEventListener('drop',e=>handleFiles(e.dataTransfer.files));window.addEventListener('resize',()=>{if(state.pages.length)schedulePreview(120);});
}

bind();syncInputs();updateLayoutHint();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
