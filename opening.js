// The opening of the site (storyboard v2, frames 1 to 3, final 5 Nov 2026). The liquid light writes the identity on
// black (INTRO, 4.5 s), the hold is the loading page (the number under the signature), then the light swims from the
// fish to the start of the name and lifts the black onto the page (FLOOD). The page under it is Alaa's Immersive study,
// exact: its own hero intro, the name writing itself and the block arriving, starts the moment the black begins to lift
// (window.__studyHero.start, defined in the study's script in index.html). pigment.js is unchanged.
// Review flags on the address: ?stay (park after the count), ?stay=loop (write again and again), ?intro=<ms>,
// ?fill=<ms> (minimum count time), ?inf (count to 99 then ∞, postponed), ?nogl (no engine: the native fallback).
const QUERY = new URLSearchParams(location.search);
const STAY = QUERY.has('stay') ? (QUERY.get('stay') === 'loop' ? 'loop' : 'hold') : null;
const LOOP_PAUSE = 1200;
const INTRO = Number(QUERY.get('intro')) > 0 ? Number(QUERY.get('intro')) : 4500;   // 2.6 s until 5 Nov; Alaa: "a bit slower, 4.5 sec"
// The count takes at least MIN_FILL (eased), never less than the pictures, rests REST at 100 %, then the flood. If the
// pictures are not all in after GIVE_UP it completes anyway: nobody is left on black.
const MIN_FILL = Number(QUERY.get('fill')) > 0 ? Number(QUERY.get('fill')) : 2000, REST = 400, GIVE_UP = 20000;
const INFINITY = QUERY.has('inf');
const FLOOD = 3300, SETTLE = 450;
const LIGHT_SOFTNESS = 0.25, DARK = '#080706', PAPER = '#ebeae5';   // the study's paper
/** The pictures the hold waits for: the three drawings of the study's hero. */
const HERO_ASSETS = ['assets/sk4.webp', 'assets/sk2.webp', 'assets/sk1.webp'];
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = n => { const x = clamp(n); return x * x * (3 - 2 * x); };

export function startOpening() {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), front = $('still-front'), loader = $('loader'), loaderText = loader?.querySelector('.pct');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let surface = $('surface'), engine = null, ready = false, running = false, completed = false;
  let elapsed = 0, anchor = 0, last = 0, raf = 0, phase = 'preparing', intro = 'none';
  let floodStart = Infinity, floodEnd = Infinity, duration = Infinity, fillDoneAt = null, lastSize = [innerWidth, innerHeight];
  const assets = { total: 0, done: 0, known: false, shown: '' };
  const box = { frames: 0, floodFrames: 0, worst: 0, failures: [], startedAt: 0 };   // the black box
  window.__opening = box;

  function signal() { Object.assign(stage.dataset, { phase, intro, time: elapsed.toFixed(0) }); }
  function fail(label, error) { box.failures.push(`${label}: ${error?.message || error}`); console.warn('Opening:', label, error); }
  const pointer = () => ({ x: innerWidth * .5, y: innerHeight * .6, vx: 0, vy: 0, down: false, active: false });
  const heroStart = () => { try { window.__studyHero?.start(); } catch (error) { fail('hero start', error); } };

  /* Scroll lock. The page's scroll state never changes (no overflow switch: Chrome recomputes vw for a layout pass when a
     scrollbar is created, and the hero's sketches wobbled). Until the full reveal, wheel, touch and the scrolling keys
     are swallowed and any scroll is put back to the top; the browser's own scroll restoration is off for the run. */
  const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar']);
  const swallow = event => { if (!completed) event.preventDefault(); };
  const onKey = event => { if (!completed && SCROLL_KEYS.has(event.key)) event.preventDefault(); };
  const onScroll = () => { if (!completed && (scrollX || scrollY)) scrollTo(0, 0); };
  function lockScroll() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    scrollTo(0, 0);
    addEventListener('wheel', swallow, { passive: false }); addEventListener('touchmove', swallow, { passive: false });
    addEventListener('keydown', onKey); addEventListener('scroll', onScroll, { passive: true });
  }
  function unlockScroll() {
    removeEventListener('wheel', swallow); removeEventListener('touchmove', swallow);
    removeEventListener('keydown', onKey); removeEventListener('scroll', onScroll);
  }

  /* The loading page */
  function trackAssets(urls) {
    assets.total = urls.length; assets.known = true;
    for (const url of urls) { const image = new Image(); image.onload = image.onerror = () => { assets.done++; }; image.src = url; }
  }
  /** The number sits under the start of the signature, placed from the box the light writes into. */
  function placeLoader() {
    if (!loader) return;
    const name = $('light-name').getBoundingClientRect(), gap = Math.max(10, name.height * .12);
    loader.style.left = `${name.left}px`; loader.style.top = `${name.bottom + gap}px`; loader.style.width = `${name.width}px`;
  }
  /** Show the count `sinceHold` ms into the hold and return its progress, 0..1. */
  function loaderProgress(sinceHold) {
    const byTime = smooth(sinceHold / MIN_FILL), byLoad = assets.known ? assets.done / Math.max(assets.total, 1) : 0;
    const p = sinceHold >= GIVE_UP ? byTime : Math.min(byTime, byLoad);
    if (loader) {
      loader.classList.add('on');
      const text = INFINITY ? (p >= 1 ? '∞' : `${Math.min(Math.round(p * 100), 99)} %`) : `${Math.round(p * 100)} %`;
      if (text !== assets.shown) { assets.shown = text; loaderText.textContent = text; }
    }
    return p;
  }
  function hideLoader() { loader?.classList.add('off'); }
  /**
   * The count is full and has rested: the flood begins. The page under the canvas turns to paper now, while the canvas
   * is still opaque (a page that stays black until the end arrives in one frame, Alaa, 5 Nov), and the study's hero
   * starts writing itself, so the light arrives where the page's own writing begins.
   */
  function startFlood(at) {
    floodStart = at; floodEnd = at + FLOOD; duration = floodEnd + SETTLE;
    hideLoader();
    document.body.dataset.phase = 'flood'; document.documentElement.dataset.phase = 'flood';
    heroStart();
  }

  /**
   * The strip outside the page (the scrollbar's space, there from the first frame) shows the root's colour and the
   * scrollbar. It follows the reveal: the black clears from the strip exactly as it clears from the page's right edge,
   * and the study's own scrollbar arrives with it (Alaa, 5 Nov: "let it sync with the whole reveal", "the scroll bar is
   * needed only on reveal"). Frame by frame from here, never a CSS transition on the root: a running transition on the
   * root made Chrome recompute vw for its duration and the hero's sketches wobbled (5 Nov 2026).
   */
  // The bar fades in over the black (the black stays under it), so the strip's progress is the edge's progress exactly:
  // a strip that also lightened underneath ran ahead of the edge (69 % against 45 %, measured 5 Nov). The bar's track is
  // opaque when full, so the root's own change to paper at the release happens unseen under it.
  const STRIP_DARK = 'rgb(8,7,6)';
  const THUMB = '139,139,139', TRACK = '252,252,252';   // Chrome's own scrollbar on Windows 11, measured on the study, 5 Nov
  let stripShown = 0;   // 0: black and no bar (the stylesheet's opening state); 1: the study's bar, full
  function paintStrip(amount, force = false) {
    const k = clamp(amount);
    if (k === stripShown && !force) return;   // scrollbar-color is inherited by the whole page: restyle only when it changes
    stripShown = k;
    const root = document.documentElement;
    root.style.backgroundColor = STRIP_DARK;   // held even after the page phase turns the stylesheet's root to paper
    root.style.scrollbarColor = `rgba(${THUMB},${k.toFixed(3)}) rgba(${TRACK},${k.toFixed(3)})`;
  }
  /** Back to the stylesheet: paper, and scrollbar-color:auto, the browser's own bar (the same pixels as the study's). */
  function releaseStrip() { stripShown = 1; document.documentElement.style.backgroundColor = ''; document.documentElement.style.scrollbarColor = ''; }
  /**
   * After a full flood the strip is already the page's. Any other ending (a resize, a deep link, a skip, an engine
   * failure) finishes it on the site's curve, 0.6 s, exponential ease-out.
   */
  function finishStrip() {
    if (reduced.matches || stripShown >= 1) { releaseStrip(); return; }
    paintStrip(stripShown, true);   // this frame already: the page phase has just turned the stylesheet's root to paper
    const from = stripShown, ms = 600, t0 = performance.now();
    const step = now => {
      const x = clamp((now - t0) / ms);
      if (x < 1) { paintStrip(from + (1 - from) * (1 - Math.pow(2, -10 * x))); requestAnimationFrame(step); } else releaseStrip();
    };
    requestAnimationFrame(step);
  }
  function complete(reason = 'complete') {
    if (completed) return;
    completed = true; running = false; cancelAnimationFrame(raf);
    try { engine?.destroy(); } catch (error) { fail('destroy', error); }
    engine = null; phase = 'page'; if (Number.isFinite(duration)) elapsed = duration;
    unlockScroll();
    stage.classList.add('done'); surface.style.visibility = 'hidden'; front.style.visibility = 'hidden'; hideLoader();
    document.body.dataset.phase = 'page'; document.documentElement.dataset.phase = 'page'; stage.dataset.completion = reason;
    finishStrip();
    heroStart();
    try { window.ScrollTrigger?.refresh(); } catch (error) { fail('refresh', error); }
    signal();
  }
  function showLayers(useCanvas) {
    front.style.visibility = useCanvas ? 'hidden' : 'visible';
    surface.style.visibility = useCanvas ? 'visible' : 'hidden';
  }
  function engineFrame(frame, label) {
    try { engine.frame({ ...frame, pointer: pointer() }); } catch (error) { fail(label, error); engine = null; intro = 'native'; }
  }
  /** ?stay: the writing, then its last frame and the count, for as long as the page is open; ?stay=loop writes again and again. */
  function renderStay(time, dt) {
    const t = STAY === 'loop' ? time % (INTRO + LOOP_PAUSE) : Math.min(time, INTRO);
    elapsed = t; phase = t < INTRO ? 'intro' : 'hold';
    if (STAY === 'hold' && time >= INTRO) loaderProgress(time - INTRO);
    if (engine) engineFrame({ time: time / 1000, dt, phase: 'intro', progress: Math.min(t / INTRO, 1) }, 'stay frame');
    showLayers(Boolean(engine));
  }
  function render(time, dt) {
    if (STAY) { renderStay(time, dt); signal(); return; }
    elapsed = Math.min(time, duration);
    if (elapsed < INTRO) {
      phase = 'intro';
      if (engine) engineFrame({ time: elapsed / 1000, dt, phase: 'intro', progress: elapsed / INTRO }, 'intro frame');
      showLayers(Boolean(engine));
    } else if (elapsed < floodStart) {
      phase = 'hold';
      if (loaderProgress(elapsed - INTRO) >= 1 && fillDoneAt === null) fillDoneAt = elapsed;
      if (fillDoneAt !== null && elapsed >= fillDoneAt + REST) startFlood(elapsed);
      if (engine) engineFrame({ time: elapsed / 1000, dt, phase: 'intro', progress: 1 }, 'hold frame');
      showLayers(Boolean(engine));
    } else if (elapsed < floodEnd) {
      phase = 'flood';
      const p = (elapsed - floodStart) / FLOOD;
      if (engine) { engineFrame({ time: elapsed / 1000, dt, phase: 'reveal', progress: p }, 'flood frame'); box.floodFrames++; showLayers(true); }
      else { front.style.visibility = 'visible'; front.style.opacity = String(1 - smooth(p)); surface.style.visibility = 'hidden'; }   // no engine: the identity crossfades away over the page
      // The strip clears with the page's right edge: the shader clears the black everywhere on smoothstep(.6, .85, p)
      // (pigment.js; measured at the edge in a real window, 5 Nov); without the engine the identity fades on smooth(p).
      paintStrip(engine ? smooth((p - .6) / .25) : smooth(p));
    } else {
      // Settle. No engine frame at progress 1: there the shader returns flat opaque paper over a page that is already
      // fully visible (the hero vanished and popped back, Alaa, 5 Nov). The flood ended transparent; the canvas simply goes.
      phase = 'settle'; surface.style.visibility = 'hidden'; front.style.visibility = 'hidden'; paintStrip(1);
    }
    signal();
  }
  function tick(now) {
    if (!running || completed) return;
    const raw = Math.max(0, (now - last) / 1000), dt = Math.min(.05, raw);
    if (raw > 0 && phase === 'flood') { const fps = 1 / raw; if (!box.worst || fps < box.worst) box.worst = Math.round(fps); }
    last = now; box.frames++;
    try { render(now - anchor, dt); } catch (error) { fail('render', error); complete('render-error'); return; }
    if (elapsed >= duration) { complete(); return; }
    raf = requestAnimationFrame(tick);
  }
  function resume() {
    if (!ready || running || completed || document.hidden) return;
    running = true; last = performance.now(); anchor = last - elapsed; raf = requestAnimationFrame(tick);
  }
  function onVisibility() { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else resume(); }
  /** A phone's address bar changes only the height; only a width change ends the opening. */
  function onResize() {
    if (!ready) return;
    const next = [innerWidth, innerHeight], ends = lastSize[0] !== next[0];
    lastSize = next;
    if (ends) complete('resize');
  }
  function onMotionPreference() { if (reduced.matches) complete('reduced-motion'); }
  /** A tab opened in the background may have no size yet; the opening waits for one. */
  function whenViewportReady(callback) {
    const okay = () => innerWidth > 0 && innerHeight > 0 && !document.hidden;
    if (okay()) { callback(); return; }
    const check = () => { if (!okay()) return; window.removeEventListener('resize', check); document.removeEventListener('visibilitychange', check); callback(); };
    window.addEventListener('resize', check); document.addEventListener('visibilitychange', check);
  }
  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image(); const timeout = setTimeout(() => reject(new Error('timed out')), 10000);
      image.onload = () => { clearTimeout(timeout); resolve(image); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('could not load')); };
      image.src = source;
    });
  }
  /** Front texture: the identity exactly as laid out on the black field. Back texture: paper (never shown: the flood ends transparent). */
  async function textures() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    const frontCanvas = document.createElement('canvas'), backCanvas = document.createElement('canvas');
    for (const canvas of [frontCanvas, backCanvas]) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const identity = ['light-name', 'light-fish'].map(id => {
      const element = $(id), rect = element.getBoundingClientRect(), svg = element.querySelector('svg');
      return `<svg x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" viewBox="${svg.getAttribute('viewBox')}">${svg.innerHTML}</svg>`;
    }).join('');
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${frontCanvas.width}" height="${frontCanvas.height}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${DARK}"/>${identity}</svg>`;
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    try { frontCanvas.getContext('2d').drawImage(await loadImage(url), 0, 0); } finally { URL.revokeObjectURL(url); }
    const back = backCanvas.getContext('2d'); back.fillStyle = PAPER; back.fillRect(0, 0, backCanvas.width, backCanvas.height);
    // The light swims from the fish to the start of the study's name, where the page's own writing begins.
    const fish = $('light-fish').getBoundingClientRect();
    const name = (document.querySelector('.hero .name') || $('light-name')).getBoundingClientRect();
    const flood = { from: [fish.left + fish.width / 2, fish.top + fish.height / 2], to: [name.left + name.width * .04, name.top + name.height * .5] };
    return { frontCanvas, backCanvas, w, h, dpr, glow: LIGHT_SOFTNESS, flood, menu: null };
  }
  async function prepare() {
    if (completed) return;
    box.startedAt = Math.round(performance.now()); lastSize = [innerWidth, innerHeight];
    trackAssets(HERO_ASSETS); placeLoader();
    if (QUERY.has('nogl') || typeof window.makePigment !== 'function') intro = 'native';
    else {
      try {
        const input = await textures();
        const replacement = document.createElement('canvas'); replacement.id = 'surface'; replacement.setAttribute('aria-hidden', 'true');
        surface.replaceWith(replacement); surface = replacement;
        engine = window.makePigment(surface, input); intro = 'pigment';
      } catch (error) { fail('engine', error); engine = null; intro = 'native'; }
    }
    if (completed) return;
    ready = true; render(0, 0); resume();
  }

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
  reduced.addEventListener('change', onMotionPreference);
  if (STAY) stage.dataset.stay = STAY;
  signal();
  if (reduced.matches) queueMicrotask(() => complete('reduced-motion'));
  else if (location.hash && !STAY) queueMicrotask(() => complete('hash'));   // a deep link goes straight to its section
  else { lockScroll(); whenViewportReady(prepare); }
  return { finish: (reason = 'skipped') => complete(reason) };
}

startOpening();
