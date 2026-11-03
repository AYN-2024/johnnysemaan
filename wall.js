import { createSurfacing } from './surfacing.js';

/**
 * Sketch wall satellites. Seeded jitter inside a 1xN column (desktop) or Nx1 band (phone):
 * composed, not random. Each sheet surfaces with the same engine as the hero.
 */
const RATIO = 1057 / 1488, TILT = 4;
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const SVG = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';

export function buildWall(container, sketches, { seed = Date.now(), count = 3, onOpen } = {}) {
  const phone = matchMedia('(max-width: 720px)').matches, rng = mulberry(seed);
  const n = sketches.length ? Math.min(phone ? 2 : count, Math.max(sketches.length, phone ? 2 : count)) : 0;
  const pool = sketches.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const sheets = [];
  for (let i = 0; i < n; i++) {
    const item = pool[i % pool.length];
    const figure = document.createElement('figure'); figure.className = 'sheet';
    const iw = item.width || 1057, ih = item.height || 1488;
    const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', `0 0 ${iw} ${ih}`); svg.setAttribute('aria-hidden', 'true');
    const group = document.createElementNS(SVG, 'g'); group.setAttribute('opacity', '0');
    const image = document.createElementNS(SVG, 'image');
    image.setAttribute('href', item.image); image.setAttributeNS(XLINK, 'xlink:href', item.image);
    image.setAttribute('width', String(iw)); image.setAttribute('height', String(ih)); image.setAttribute('filter', 'url(#graphite)');
    group.append(image); svg.append(group); figure.append(svg);
    if (onOpen) { figure.tabIndex = 0; figure.setAttribute('role', 'button'); figure.setAttribute('aria-label', item.title || 'Sketch');
      figure.addEventListener('click', () => onOpen(item)); figure.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); } }); }
    container.append(figure);
    sheets.push({ figure, svg, group, item, ratio: iw / ih, tier: .72 + rng() * .16, jx: rng(), jy: rng(), tilt: (rng() * 2 - 1) * TILT, surfacing: createSurfacing(svg, group, { prefix: 'wall' + i }) });
  }
  /**
   * Where sheet i sits for a drawing of the given width/height ratio: its box in the wall (px) and its tilt. Phone: one
   * row; desktop: one column for up to 3 sheets, two columns beyond (the screen filled with sketches, Alaa, 3 Nov 2026).
   */
  function place(i, ratio) {
    const s = sheets[i], W = container.clientWidth, H = container.clientHeight, ph = matchMedia('(max-width: 720px)').matches;
    const cols = ph ? sheets.length : sheets.length > 3 ? 2 : 1, rows = Math.ceil(sheets.length / cols), cellW = W / cols, cellH = H / rows;
    let h = cellH * s.tier, w = h * ratio; if (w > cellW * .9) { w = cellW * .9; h = w / ratio; }
    const c = ph ? i : i % cols, r = ph ? 0 : Math.floor(i / cols);
    return { x: c * cellW + s.jx * (cellW - w), y: r * cellH + s.jy * (cellH - h), w, h, tilt: s.tilt };
  }
  function layout() {
    sheets.forEach((s, i) => {
      const { x, y, w, tilt } = place(i, s.ratio);
      s.figure.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;transform:rotate(${tilt.toFixed(2)}deg)`;
    });
  }
  /** Sheet i's box on screen (viewport px) for a drawing of the given ratio, untilted, plus its tilt. */
  function slotRect(i, ratio) {
    const box = container.getBoundingClientRect(), p = place(i, ratio);
    return { left: box.left + p.x, top: box.top + p.y, width: p.w, height: p.h, tilt: p.tilt };
  }
  layout(); addEventListener('resize', layout);
  let frame = 0;
  function finish() { cancelAnimationFrame(frame); sheets.forEach(s => s.surfacing.finish()); }
  function reveal({ delay = 900, stagger = 700 } = {}) {
    if (!sheets.length) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    const start = performance.now() + delay, duration = sheets[0].surfacing.duration;
    const tick = now => {
      let live = false;
      sheets.forEach((s, i) => { const t = now - start - i * stagger; if (t < 0) { live = true; return; } s.surfacing.render(Math.min(t, duration)); if (t < duration) live = true; });
      if (live) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  return { sheets, reveal, finish, layout, slotRect };
}
