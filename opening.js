import { createSurfacing } from './surfacing.js';

// Sequence: liquid-light intro reveals the identity on the dark field (INTRO) → hold → the same liquid surface
// grows to cover the field and lifts, revealing the finished page beneath (FLOOD: engine reveal phase, canvas
// turns transparent). The hero drawing surfaces during the flood; the router shows column + satellites under it.
const INTRO = 2600, HOLD = 1800, FLOOD = 2800;
const FLOOD_START = INTRO + HOLD, FLOOD_END = FLOOD_START + FLOOD;
const SURFACE_START = FLOOD_START, SURFACE_END = SURFACE_START + 3700;
const DURATION = Math.max(FLOOD_END, SURFACE_END) + 450;
const PAPER = '#f4f1ea';
// Liquid-light strength during the name/fish intro. 1 = Codex study (too bright); 0.55 first pass, 0.25 current.
const LIGHT_SOFTNESS = 0.25;
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = n => { const x = clamp(n); return x * x * (3 - 2 * x); };

/** Run once, then hand the page to its router. Destroy cancels without notifying. */
export function startOpening({ onComplete = () => {}, onFlood = () => {} } = {}) {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), front = $('still-front'), back = $('still-back');
  const sketch = $('sketch-scene'), content = $('surfacing-content');
  let flooded = false;
  const paperRect = $('sketch-paper'), lightImage = $('sketch-light'), inkImage = $('sketch-ink');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const lifetime = new AbortController();
  let surface = $('surface'), surfacing = null, engine = null;
  let completed = false, destroyed = false, ready = false, running = false;
  let phase = 'preparing', readiness = 'loading', elapsed = 0, raf = 0, anchor = 0, last = 0;

  function signal() {
    Object.assign(stage.dataset, {
      phase, readiness, running: String(running), time: elapsed.toFixed(1),
      progress: (elapsed / DURATION).toFixed(5), reducedMotion: String(reduced.matches),
    });
  }
  function layers(frontVisible, backVisible, canvasVisible = false, opacity = 1) {
    front.style.visibility = frontVisible ? 'visible' : 'hidden';
    front.style.opacity = String(opacity);
    back.style.visibility = backVisible ? 'visible' : 'hidden';
    surface.style.visibility = canvasVisible ? 'visible' : 'hidden';
    front.setAttribute('aria-hidden', String(!frontVisible));
    back.setAttribute('aria-hidden', String(!backVisible));
  }
  function stop() { running = false; cancelAnimationFrame(raf); raf = 0; }
  function releaseEngine() {
    try { engine?.destroy(); } catch (error) { console.warn('Opening cleanup:', error); }
    engine = null;
  }
  function removeListeners() {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('resize', resize);
    reduced.removeEventListener('change', motionPreference);
  }
  /** The drawing's final state: graphite on a transparent layer; the paper is the page itself. */
  function paperState() {
    paperRect.setAttribute('opacity', '0'); lightImage.setAttribute('opacity', '0'); inkImage.setAttribute('opacity', '1');
    back.style.setProperty('--wash', '0');
  }
  function fullSketch() {
    if (surfacing) surfacing.finish();
    else { content.removeAttribute('filter'); content.setAttribute('opacity', '1'); }
    paperState();
    layers(false, true);
  }
  function complete(reason = 'complete') {
    if (completed || destroyed) return;
    completed = true; stop(); lifetime.abort(); removeListeners(); releaseEngine();
    elapsed = DURATION; phase = 'complete';
    if (readiness !== 'error') readiness = 'ready';
    if (reason === 'asset-error') layers(false, false);
    else fullSketch();
    stage.dataset.completion = reason; signal();
    onComplete();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; stop(); lifetime.abort(); removeListeners(); releaseEngine();
    surfacing?.destroy(); surface.style.visibility = 'hidden';
    phase = 'destroyed'; signal();
  }
  function unavailable(error) {
    releaseEngine();
    stage.dataset.intro = 'native';
    console.warn('Opening uses the native identity before SVG surfacing.', error);
  }
  function render(time, dt = 0) {
    elapsed = clamp(time, 0, DURATION);
    if (elapsed < INTRO) {
      phase = 'intro';
      if (engine) {
        try {
          engine.frame({ time: elapsed / 1000, dt, phase: 'intro', progress: elapsed / INTRO,
            pointer: { x: innerWidth * .5, y: innerHeight * .6, vx: 0, vy: 0, down: false, active: false } });
        } catch (error) { unavailable(error); }
      }
      layers(!engine, false, Boolean(engine));
    } else if (elapsed < FLOOD_START) {
      phase = 'identity'; paperState(); layers(true, false);
    } else if (elapsed < FLOOD_END) {
      phase = 'flood';
      if (!flooded) { flooded = true; try { onFlood(); } catch (error) { console.warn('Opening onFlood:', error); } }
      const p = (elapsed - FLOOD_START) / FLOOD;
      surfacing.render(elapsed - SURFACE_START);
      if (engine) {
        try {
          engine.frame({ time: elapsed / 1000, dt, phase: 'reveal', progress: p,
            pointer: { x: innerWidth * .5, y: innerHeight * .6, vx: 0, vy: 0, down: false, active: false } });
        } catch (error) { unavailable(error); }
      }
      // Engine: the light sheet covers then lifts, going transparent over the real page and the surfacing hero.
      // Fallback: the identity layer crossfades away over the page.
      if (engine) layers(false, true, true); else layers(true, true, false, 1 - smooth(p));
    } else if (elapsed < SURFACE_END) {
      phase = 'surfacing';
      surfacing.render(elapsed - SURFACE_START);
      layers(false, true);
    } else {
      phase = 'sketch'; fullSketch();
    }
    signal();
  }
  function tick(now) {
    if (!running || completed || destroyed) return;
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    try { render(now - anchor, dt); }
    catch (error) {
      console.warn('Opening settled after a rendering error.', error);
      complete('render-error'); return;
    }
    if (elapsed >= DURATION) { complete(); return; }
    raf = requestAnimationFrame(tick);
  }
  function resume() {
    if (!ready || running || completed || destroyed || document.hidden) return;
    running = true; last = performance.now(); anchor = last - elapsed;
    signal(); raf = requestAnimationFrame(tick);
  }
  function visibility() {
    if (document.hidden) { stop(); signal(); }
    else resume();
  }
  function resize() { complete('resize'); }
  function motionPreference() { if (reduced.matches) complete('reduced-motion'); }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let timeout;
      function clean() {
        clearTimeout(timeout); image.onload = image.onerror = null;
        lifetime.signal.removeEventListener('abort', abort);
      }
      function fail(message) { clean(); reject(new Error(message)); }
      function abort() { fail('Opening cancelled.'); }
      if (lifetime.signal.aborted) { abort(); return; }
      image.onload = () => { clean(); resolve(image); };
      image.onerror = () => fail('Opening image could not load.');
      lifetime.signal.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(() => fail('Opening image timed out.'), 10000);
      image.src = source;
    });
  }
  async function textures(image) {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    const frontCanvas = document.createElement('canvas'), backCanvas = document.createElement('canvas');
    for (const canvas of [frontCanvas, backCanvas]) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const context = canvas.getContext('2d');
      context.fillStyle = '#080706'; context.fillRect(0, 0, canvas.width, canvas.height);
    }
    // Preserve the v09/v11 identity snapshot, including its full-viewport placement.
    const identity = ['name', 'fish'].map(id => {
      const element = $(id), box = element.getBoundingClientRect(), svg = element.querySelector('svg');
      return `<svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" viewBox="${svg.getAttribute('viewBox')}">${svg.innerHTML}</svg>`;
    }).join('');
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${frontCanvas.width}" height="${frontCanvas.height}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#080706"/>${identity}</svg>`;
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    try {
      const raster = await loadImage(url);
      frontCanvas.getContext('2d').drawImage(raster, 0, 0);
    } finally { URL.revokeObjectURL(url); }
    // The flood reveals plain paper; the drawing surfaces separately, after the field has turned.
    const context = backCanvas.getContext('2d');
    context.fillStyle = PAPER; context.fillRect(0, 0, backCanvas.width, backCanvas.height);
    return { frontCanvas, backCanvas, w, h, dpr, glow: LIGHT_SOFTNESS };
  }
  async function prepare() {
    let image;
    try {
      image = await loadImage(new URL('./assets/graphite-extraction-v01.png', import.meta.url).href);
    } catch (error) {
      if (completed || destroyed) return;
      readiness = 'error'; console.warn('Opening skipped because its sketch could not load.', error);
      complete('asset-error'); return;
    }
    if (completed || destroyed) return;
    try {
      const input = await textures(image);
      if (completed || destroyed) return;
      const replacement = document.createElement('canvas');
      replacement.id = 'surface'; replacement.setAttribute('aria-hidden', 'true');
      surface.replaceWith(replacement); surface = replacement;
      surface.style.visibility = 'hidden';
      engine = window.makePigment(surface, input);
      stage.dataset.intro = 'pigment';
    } catch (error) {
      if (completed || destroyed) return;
      unavailable(error);
    }
    if (completed || destroyed) return;
    ready = true; readiness = 'ready'; render(0); resume();
  }

  layers(true, false); signal();
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', resize);
  reduced.addEventListener('change', motionPreference);
  try { surfacing = createSurfacing(sketch, content); }
  catch (error) {
    console.warn('Opening skipped because its surfacing setup failed.', error);
    queueMicrotask(() => complete('setup-error'));
    return { finish: () => complete('skipped'), destroy };
  }
  if (reduced.matches) queueMicrotask(() => complete('reduced-motion'));
  else prepare();
  return { finish: () => complete('skipped'), destroy };
}
