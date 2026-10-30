const SVG_NS = 'http://www.w3.org/2000/svg';
const DURATION = 3700;
let instanceCount = 0;

const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const smooth = (a, b, n) => {
  const x = clamp((n - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** Apply the approved surfacing treatment; the caller owns time and playback. */
export function createSurfacing(svg, contentGroup, { prefix = 'surface' } = {}) {
  const document = svg.ownerDocument;
  const safePrefix = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '-') || 'surface';
  let filterId;
  do {
    filterId = `${safePrefix}-${++instanceCount}-surfacing`;
  } while (document.getElementById(filterId));

  const original = Object.fromEntries(['opacity', 'filter'].map(name => [name, {
    attribute: contentGroup.getAttribute(name),
    style: contentGroup.style.getPropertyValue(name),
    priority: contentGroup.style.getPropertyPriority(name),
  }]));

  // Inline declarations would override the presentation attributes we animate.
  contentGroup.style.removeProperty('opacity');
  contentGroup.style.removeProperty('filter');

  function element(name, attributes, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    parent.appendChild(node);
    return node;
  }

  const defs = element('defs', {}, svg);
  const filter = element('filter', {
    id: filterId,
    x: '-3%', y: '-3%', width: '106%', height: '106%',
    'color-interpolation-filters': 'sRGB',
  }, defs);
  const noise = element('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '0.006 0.018',
    numOctaves: '1', seed: '7', result: 'water',
  }, filter);
  const refraction = element('feDisplacementMap', {
    in: 'SourceGraphic', in2: 'water', scale: '0',
    xChannelSelector: 'R', yChannelSelector: 'G', result: 'warped',
  }, filter);
  const softness = element('feGaussianBlur', {
    in: 'warped', stdDeviation: '0', result: 'soft',
  }, filter);
  element('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '0.0018 0.0035',
    numOctaves: '1', seed: '12', result: 'depth',
  }, filter);
  element('feColorMatrix', {
    in: 'depth', type: 'matrix',
    values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.333 0.333 0.334 0 0',
    result: 'depthAlpha',
  }, filter);
  const transfer = element('feComponentTransfer', {
    in: 'depthAlpha', result: 'surfaceAlpha',
  }, filter);
  const level = element('feFuncA', {
    type: 'linear', slope: '2.4', intercept: '-2',
  }, transfer);
  element('feComposite', {
    in: 'soft', in2: 'surfaceAlpha', operator: 'in',
  }, filter);

  let destroyed = false;

  function render(timeMs) {
    if (destroyed) return;
    const elapsed = clamp(Number(timeMs) || 0, 0, DURATION);
    const p = smooth(250, 3700, elapsed);
    contentGroup.setAttribute('opacity', smooth(250, 1100, elapsed).toFixed(4));
    if (p < 1) {
      contentGroup.setAttribute('filter', `url(#${filterId})`);
      const wave = 7.5 * Math.sin(Math.PI * p) * (1 - p * .65);
      refraction.setAttribute('scale', wave.toFixed(3));
      noise.setAttribute('baseFrequency', `${(.006 + .0005 * Math.sin(elapsed / 530)).toFixed(6)} ${(.018 + .001 * Math.cos(elapsed / 680)).toFixed(6)}`);
      softness.setAttribute('stdDeviation', (.85 * (1 - p)).toFixed(3));
      level.setAttribute('intercept', (-1.8 + 3.1 * p).toFixed(4));
    } else {
      contentGroup.removeAttribute('filter');
      contentGroup.setAttribute('opacity', '1');
    }
  }

  function finish() {
    render(DURATION);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    defs.remove();
    for (const [name, saved] of Object.entries(original)) {
      if (saved.attribute === null) contentGroup.removeAttribute(name);
      else contentGroup.setAttribute(name, saved.attribute);
      if (saved.style) contentGroup.style.setProperty(name, saved.style, saved.priority);
      else contentGroup.style.removeProperty(name);
    }
  }

  render(0);
  return { render, finish, duration: DURATION, destroy };
}
