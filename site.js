import { startOpening } from './opening.js';

const $ = id => document.getElementById(id);
const views = ['home', 'paintings', 'exhibitions'];
const dialog = $('viewer');
let data = { paintings: [], exhibitions: [] }, opening, ready = false;
let viewerItems = [], viewerIndex = 0, zoomed = false, drag = null;
const node = (tag, className, text) => {
 const el = document.createElement(tag); if (className) el.className = className;
 if (text !== undefined) el.textContent = text; return el;
};
function currentView() { const hash = location.hash.slice(1); return views.includes(hash) ? hash : 'home'; }
function showView(view, focus = false) {
 if (dialog.open) dialog.close();
 document.body.dataset.view = view;
 for (const name of views) $(name).hidden = name !== view;
 $('site-header').hidden = view === 'home';
 document.querySelectorAll('#site-header nav a').forEach(a => {
  if (a.hash === '#' + view) a.setAttribute('aria-current', 'page');
  else a.removeAttribute('aria-current');
 });
 document.title = view === 'home' ? 'Johnny Semaan' : `${view === 'paintings' ? 'Painting' : 'Exhibitions'} — Johnny Semaan`;
 window.scrollTo(0, 0);
 if (focus) (view === 'home' ? $('home').querySelector('a') : $(view + '-title')).focus({ preventScroll: true });
}
function go() { opening?.finish(); showView(currentView(), true); }
addEventListener('hashchange', go);
document.querySelector('.skip-link').addEventListener('click', () => { opening?.finish(); showView('home', true); });

function showItem(index) {
 viewerIndex = index; const item = viewerItems[index];
 zoomed = false; $('viewer-image-wrap').classList.remove('zoomed');
 $('viewer-zoom').textContent = 'Zoom in'; $('viewer-zoom').setAttribute('aria-pressed', 'false');
 $('viewer-image').src = item.image; $('viewer-image').alt = item.title;
 $('viewer-title').textContent = item.title;
 $('viewer-detail').textContent = item.year ? [item.year, item.medium, item.dimensions].filter(Boolean).join(' · ') : [item.dates, item.kind, item.venue].filter(Boolean).join(' · ');
 $('viewer-count').textContent = `${String(index + 1).padStart(2,'0')} / ${String(viewerItems.length).padStart(2,'0')}`;
 $('viewer-prev').disabled = index === 0; $('viewer-next').disabled = index === viewerItems.length - 1;
}
function inspect(items, index) {
 viewerItems = items; showItem(index); dialog.showModal();
 document.body.style.overflow = 'hidden'; $('viewer-close').focus();
}
$('viewer-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { document.body.style.overflow = ''; drag = null; });
$('viewer-prev').addEventListener('click', () => showItem(viewerIndex - 1));
$('viewer-next').addEventListener('click', () => showItem(viewerIndex + 1));
dialog.addEventListener('keydown', e => {
 if (zoomed || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
 if (e.key === 'ArrowLeft' && viewerIndex > 0) { e.preventDefault(); showItem(viewerIndex - 1); }
 if (e.key === 'ArrowRight' && viewerIndex < viewerItems.length - 1) { e.preventDefault(); showItem(viewerIndex + 1); }
});
function toggleZoom() {
 const wrap = $('viewer-image-wrap'), img = $('viewer-image');
 if (!img.complete || !img.naturalWidth) return;
 zoomed = !zoomed;
 if (zoomed) {
  const scale = Math.min(wrap.clientWidth / img.naturalWidth, wrap.clientHeight / img.naturalHeight) * 2;
  wrap.style.setProperty('--zoom-width', `${Math.round(img.naturalWidth * scale)}px`);
  wrap.style.setProperty('--zoom-height', `${Math.round(img.naturalHeight * scale)}px`);
 }
 wrap.classList.toggle('zoomed', zoomed);
 wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; wrap.scrollTop = (wrap.scrollHeight - wrap.clientHeight) / 2;
 $('viewer-zoom').textContent = zoomed ? 'Fit artwork' : 'Zoom in';
 $('viewer-zoom').setAttribute('aria-pressed', String(zoomed));
}
$('viewer-zoom').addEventListener('click', toggleZoom);
const wrap = $('viewer-image-wrap');
wrap.addEventListener('pointerdown', e => { if (!zoomed || e.pointerType !== 'mouse' || e.button !== 0) return; drag = {x:e.clientX,y:e.clientY,left:wrap.scrollLeft,top:wrap.scrollTop,id:e.pointerId}; wrap.setPointerCapture(e.pointerId); e.preventDefault(); });
wrap.addEventListener('pointermove', e => { if (!drag) return; wrap.scrollLeft=drag.left+drag.x-e.clientX; wrap.scrollTop=drag.top+drag.y-e.clientY; });
for (const event of ['pointerup','pointercancel','lostpointercapture']) wrap.addEventListener(event, () => { drag=null; });

function fillPages() {
 data.paintings.forEach((item, index) => {
  const button = node('button','painting-card'); button.type='button'; button.setAttribute('aria-label',`View ${item.title}`);
  const figure=node('figure'), img=node('img'); img.src=item.image; img.alt=item.title; img.loading='lazy';
  const caption=node('figcaption'); caption.append(node('span','',item.title),node('time','',String(item.year)));
  figure.append(img,caption); button.append(figure); button.addEventListener('click',()=>inspect(data.paintings,index)); $('painting-list').append(button);
 });
 data.exhibitions.forEach((item,index) => {
  const button=node('button','exhibition-card'); button.type='button'; button.setAttribute('aria-label',`View ${item.title}`);
  const img=node('img'); img.src=item.image; img.alt=`${item.title} exhibition poster`; img.loading='lazy';
  const text=node('div'); text.append(node('h2','',item.title),node('p','dates',item.dates),node('p','kind',item.kind),node('span','view','View exhibition ↗'));
  button.append(img,text); button.addEventListener('click',()=>inspect(data.exhibitions,index)); $('exhibition-list').append(button);
 });
}
fetch('content.json').then(response => {if (!response.ok) throw Error('Content unavailable'); return response.json();}).then(content => {data=content;fillPages();ready=true;}).catch(error => {$('load-error').hidden=false;console.error(error);});

opening = startOpening({onComplete:() => showView(currentView())});
if (location.hash) { opening.finish(); showView(currentView()); }
