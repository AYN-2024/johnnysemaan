/**
 * Sketches take turns being big (Alaa, 3 Nov 2026): every EVERY ms the big sketch goes back to normal size in a spot on
 * the wall while the sketch from that spot grows into the big place. Both glide, ease in and out, all the way to the
 * exact place, size and tilt they will have afterwards; then they swap what they show and drop the movement, which
 * changes nothing on screen (gliding only close to the end and then snapping into place looked like a jump).
 * Paused off the home page and while the tab is hidden. When the visitor prefers reduced motion nothing travels: the
 * two drawings fade out where they are and fade back in exchanged (appledesign: a gentle equivalent, not nothing).
 */
const EVERY = 6000, MOVE = 1600, EASE = 'cubic-bezier(.65,0,.35,1)', FADE = 450;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const XLINK = 'http://www.w3.org/1999/xlink';

const centre = r => [r.left + r.width / 2, r.top + r.height / 2];
const setHref = (image, src) => { image.setAttribute('href', src); image.setAttributeNS(XLINK, 'xlink:href', src); };
const ratioOf = item => (item.width || 1057) / (item.height || 1488);

/**
 * @param {{ sheets: Array<{ figure: HTMLElement, svg: SVGSVGElement, item: object, ratio: number }>, layout(): void,
 *           slotRect(i: number, ratio: number): { left: number, top: number, width: number, height: number, tilt: number } }} wall
 * @param {{ svg: SVGSVGElement, image: SVGImageElement, item: { image: string, width: number, height: number } }} hero
 * @returns {() => void} stop
 */
export function startRotation(wall, hero) {
  if (!wall.sheets.length) return () => {};
  const area = hero.svg.parentElement;  // #artwork: the big drawing is the largest box of its shape that fits here
  let turnNo = 0, busy = false;

  /** The big drawing's box on screen for an item, and the hero sized to exactly that box (no letterbox). */
  function bigRect(item) {
    const r = area.getBoundingClientRect(), ratio = ratioOf(item);
    let h = r.height, w = h * ratio; if (w > r.width) { w = r.width; h = w / ratio; }
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }
  function fitHero() { const b = bigRect(hero.item); hero.svg.style.width = `${b.width}px`; hero.svg.style.height = `${b.height}px`; }
  fitHero(); addEventListener('resize', fitHero);

  /** Set a start transform without animating, then animate to the end one. */
  function glide(el, from, to) {
    el.style.transition = 'none'; el.style.transform = from;
    void el.getBoundingClientRect();
    el.style.transition = `transform ${MOVE}ms ${EASE}`; el.style.transform = to;
  }

  function turn() {
    if (busy || document.hidden || document.body.dataset.view !== 'home') return;
    busy = true;
    const i = turnNo++ % wall.sheets.length, sheet = wall.sheets[i];
    if (reducedMotion()) { fade(i, sheet); return; }
    // Where each is now, and exactly where each will be after the swap.
    const heroNow = bigRect(hero.item), heroEnd = wall.slotRect(i, ratioOf(hero.item));
    const sheetNow = wall.slotRect(i, sheet.ratio), sheetEnd = bigRect(sheet.item);
    const [hx, hy] = centre(heroNow), [hex, hey] = centre(heroEnd), [sx, sy] = centre(sheetNow), [sex, sey] = centre(sheetEnd);
    sheet.figure.style.zIndex = '5';
    glide(hero.svg, 'translate(0px, 0px) scale(1) rotate(0deg)',
      `translate(${hex - hx}px, ${hey - hy}px) scale(${heroEnd.height / heroNow.height}) rotate(${heroEnd.tilt}deg)`);
    glide(sheet.figure, `translate(0px, 0px) scale(1) rotate(${sheetNow.tilt}deg)`,
      `translate(${sex - sx}px, ${sey - sy}px) scale(${sheetEnd.height / sheetNow.height}) rotate(0deg)`);
    setTimeout(() => swap(i, sheet), MOVE + 30);
  }

  /** Reduced motion: fade both out in place, exchange their drawings, fade both back in. Web Animations, because the
   *  reduced-motion CSS switches transitions off. */
  function fade(i, sheet) {
    const els = [hero.svg, sheet.figure];
    const out = els.map(el => el.animate({ opacity: [1, 0] }, { duration: FADE, easing: 'ease-in', fill: 'forwards' }));
    Promise.all(out.map(a => a.finished)).then(() => {
      swap(i, sheet);
      out.forEach(a => a.cancel());
      els.forEach(el => el.animate({ opacity: [0, 1] }, { duration: FADE, easing: 'ease-out' }));
    }, () => { busy = false; });
  }

  /** Each now stands exactly where the other belongs: give each the other's drawing and drop the movement. */
  function swap(i, sheet) {
    const was = hero.item, now = { ...sheet.item, width: sheet.item.width || 1057, height: sheet.item.height || 1488 };
    setHref(hero.image, now.image);
    hero.image.setAttribute('width', now.width); hero.image.setAttribute('height', now.height);
    hero.svg.setAttribute('viewBox', `0 0 ${now.width} ${now.height}`);
    hero.svg.style.aspectRatio = `${now.width} / ${now.height}`;
    hero.item = now;
    const image = sheet.svg.querySelector('image');
    setHref(image, was.image);
    image.setAttribute('width', was.width); image.setAttribute('height', was.height);
    sheet.svg.setAttribute('viewBox', `0 0 ${was.width} ${was.height}`);
    sheet.item = was; sheet.ratio = ratioOf(was);
    hero.svg.style.transition = 'none'; hero.svg.style.transform = '';
    fitHero();
    wall.layout();                         // the sheet in its spot at its new size, with its tilt (also clears its z-index)
    void hero.svg.getBoundingClientRect();
    hero.svg.style.transition = '';
    busy = false;
  }

  const timer = setInterval(turn, EVERY);
  return () => { clearInterval(timer); removeEventListener('resize', fitHero); };
}
