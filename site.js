import { startOpening } from './opening.js';
import { buildWall } from './wall.js';
import { startRotation } from './rotate.js';

const $ = id => document.getElementById(id);
const views = ['home', 'paintings', 'exhibitions'];
const dialog = $('viewer');
let data = { sketches: [], paintings: [], exhibitions: [] }, opening, ready = false, wall = null;
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
 closeBurger();
 document.querySelectorAll('#site-menu nav a, #burger-panel a').forEach(a => {
  if (a.hash === '#' + view) a.setAttribute('aria-current', 'page');
  else a.removeAttribute('aria-current');
 });
 document.title = view === 'home' ? 'Johnny Semaan' : `${view === 'paintings' ? 'Painting' : 'Exhibitions'} — Johnny Semaan`;
 window.scrollTo(0, 0);
 if (focus) (view === 'home' ? document.querySelector('#site-menu a') : $(view + '-title')).focus({ preventScroll: true });
 if (view === 'home') startWall();
}
/** First time the home shows with content ready: build the satellites and surface them after the column slides in. */
function startWall() {
 if (wall || !ready) return;
 wall = buildWall($('wall'), data.sketches || [], { seed: Date.now(), count: 6 }); // the screen filled: every sketch on the wall (Alaa, 3 Nov 2026)
 // During the flood the sketches are whole under the black and the light uncovers them; otherwise they surface.
 if (document.body.dataset.flooding && $('stage').dataset.intro === 'pigment') wall.finish();
 else wall.reveal({ delay: 300, stagger: 650 });
 // Every 6 s the big sketch goes back to normal size and a small one grows into its place.
 startRotation(wall, { svg: $('sketch-scene'), image: $('sketch-ink'), item: { image: 'assets/graphite-extraction-v01.png', width: 1057, height: 1488 } });
 setTimeout(() => { document.body.dataset.homeShown = '1'; }, 1400);
}
// Portrait: Painting stays in the bar, the rest sits behind the burger (Workshops and Contact disabled for now).
const burger = document.querySelector('.burger'), panel = $('burger-panel');
// The panel grows out of the burger and closes back into it (site.css): its transform origin is the burger's centre.
const burgerOpen = () => 'open' in panel.dataset;
function closeBurger() { delete panel.dataset.open; burger.setAttribute('aria-expanded', 'false'); }
function openBurger() {
 panel.style.setProperty('--from-x', `${burger.offsetLeft + burger.offsetWidth / 2 - panel.offsetLeft}px`);
 panel.style.setProperty('--from-y', `${burger.offsetTop + burger.offsetHeight / 2 - panel.offsetTop}px`);
 panel.dataset.open = ''; burger.setAttribute('aria-expanded', 'true');
}
burger.addEventListener('click', () => (burgerOpen() ? closeBurger() : openBurger()));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && burgerOpen()) { closeBurger(); burger.focus(); } });
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
const loaded = fetch('content.json').then(response => {if (!response.ok) throw Error('Content unavailable'); return response.json();}).then(content => {data=content;fillPages();ready=true;if(document.body.dataset.view==='home')startWall();return content;});
loaded.catch(error => {$('load-error').hidden=false;console.error(error);});

opening = startOpening({
 onFlood: () => { document.body.dataset.homeShown = '1'; document.body.dataset.flooding = '1'; showView('home'); },
 onComplete: () => { delete document.body.dataset.flooding; showView(currentView()); },
 assets: loaded.then(content => (content.sketches || []).map(item => item.image)),   // the loading page waits for the wall's drawings too
});
if (location.hash) { opening.finish(); showView(currentView()); }
