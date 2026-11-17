// Shared deck bootstrap: reveal.js + KaTeX auto-render + lazy widget mounting.
// Usage in a deck: <script type="module" src="../../shared/deck.js"></script>
// Widgets: <div data-widget="warp2d" data-config='{"preset":"skew"}'></div>
import Reveal from '../vendor/reveal/reveal.mjs';
import Notes from '../vendor/reveal/plugin/notes.mjs';
import { applyTheme } from './theme.js';

const widgetModules = {
  // flow matching (from the Deep Neural Networks deck)
  gauss1d: () => import('./widgets/gauss1d.js'),
  melt: () => import('./widgets/melt.js'),
  chunkflow: () => import('./widgets/chunkflow.js'),
  jacdet: () => import('./widgets/jacdet.js'),
  // robot control (from the Robot Control deck)
  sfm3d: () => import('./widgets/sfm3d.js'),
  slam2d: () => import('./widgets/slam2d.js'),
  piddrone: () => import('./widgets/piddrone.js'),
  // provided by the talk's import map
  imagine: () => import('imagine'),
};

function renderMath(root) {
  window.renderMathInElement(root, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
    trust: ctx => ctx.command === '\\htmlClass',   // \htmlClass{name}{…}: a part of a formula that an arrow can point to (widgets/annotate.js)
    strict: code => (code === 'htmlExtension' ? 'ignore' : 'warn'),
    // \cq{q}: the data distribution (blue), \cp{p_\theta}: the model (accent), \cb{…}: blue, matching blue samples in a figure
    macros: { '\\cq': '\\htmlClass{cq}{#1}', '\\cp': '\\htmlClass{cp}{#1}', '\\cb': '\\htmlClass{cb}{#1}' },
  });
}

async function mountWidget(el) {
  if (el.dataset.mounted) return;
  el.dataset.mounted = '1';
  // the inline style the slide gave this element (its place in a grid, margins): unmounting has to put it back
  if (el.dataset.style0 === undefined) el.dataset.style0 = el.getAttribute('style') || '';
  const gen = el.dataset.gen = String((+el.dataset.gen || 0) + 1);
  const load = widgetModules[el.dataset.widget];
  if (!load) { el.textContent = `Unknown widget: ${el.dataset.widget}`; return; }
  const config = el.dataset.config ? JSON.parse(el.dataset.config) : {};
  const mod = await load();
  if (el.dataset.gen !== gen || !el.dataset.mounted) return; // unmounted while loading
  await mod.mount(el, config);
}

// Browsers allow only ~16 live WebGL contexts; release widgets on slides we are not near.
function unmountWidget(el) {
  if (!el.dataset.mounted) return;
  el.querySelectorAll('canvas').forEach(c => {
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  el.replaceChildren();
  // drop what the widget set (width, position), keep what the slide set: otherwise a widget that is mounted again
  // after a visit to a distant slide has lost its layout
  if (el.dataset.style0) el.setAttribute('style', el.dataset.style0); else el.removeAttribute('style');
  el.classList.remove('widget');
  delete el.dataset.mounted;
  el.dataset.gen = String((+el.dataset.gen || 0) + 1);
}

await applyTheme(); // light colours for ?print-pdf and ?light

const deck = new Reveal({
  width: 1280,
  height: 720,
  margin: 0.04,
  hash: true,
  slideNumber: 'c/t',
  transition: 'fade',
  transitionSpeed: 'fast',
  center: false,
  pdfSeparateFragments: false,
  plugins: [Notes],
});

await deck.initialize();
renderMath(document.querySelector('.reveal .slides'));

const frames = n => new Promise(res => { const f = k => (k ? requestAnimationFrame(() => f(k - 1)) : res()); f(n); });

// Print view: replace a rendered WebGL canvas by a still image and free its context, so that decks with
// more 3D figures than the browser's WebGL context limit (~16) still print every one of them.
function freezeWebGL(el) {
  el.querySelectorAll('canvas').forEach(c => {
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return;
    const img = new Image();
    img.src = c.toDataURL('image/png');
    img.style.cssText = c.style.cssText;
    // clientWidth is 0 while reveal is still building the print pages: fall back to the CSS size the widget set
    img.style.width = (c.clientWidth || parseFloat(c.style.width) || c.width) + 'px';
    img.style.height = (c.clientHeight || parseFloat(c.style.height) || c.height) + 'px';
    img.style.margin = '0';
    c.replaceWith(img);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  });
}

// Print view: mount every widget, one at a time, then set window.__deckReady (make-pdf.mjs waits for it).
async function mountAllForPrint() {
  // reveal builds the print layout over several animation frames after 'ready'; a widget mounted before its page
  // exists is laid out at size 0 (and its WebGL canvas would be frozen blank), so wait for the pages first.
  for (let i = 0; i < 600 && !document.querySelector('.pdf-page'); i++) await frames(1);
  await frames(3);
  for (const el of document.querySelectorAll('[data-widget]')) {
    await mountWidget(el);
    await frames(3);
    freezeWebGL(el);
  }
  // an animated GIF prints as its first frame: print a still (the last frame) instead
  for (const img of document.querySelectorAll('img[data-print-src]')) {
    img.src = img.dataset.printSrc;
    try { await img.decode(); } catch { /* a missing image must not block the PDF */ }
  }
  await document.fonts.ready;
  renderMath(document.querySelector('.reveal .slides'));
  await frames(3);
  window.__deckReady = true;
}

// Mount widgets on the current slide and its neighbours; in print view mount everything.
let printing = false;
function mountAround() {
  if (deck.isPrintView()) {
    if (!printing) { printing = true; mountAllForPrint(); }
    return;
  }
  const cur = deck.getCurrentSlide();
  const keep = [cur?.previousElementSibling, cur, cur?.nextElementSibling].filter(Boolean);
  document.querySelectorAll('.reveal .slides section').forEach(sec => {
    if (!keep.includes(sec)) sec.querySelectorAll('[data-widget][data-mounted]').forEach(unmountWidget);
  });
  keep.forEach(s => s.querySelectorAll('[data-widget]').forEach(mountWidget));
}

deck.on('ready', mountAround);
deck.on('slidechanged', mountAround);
mountAround();

// Chrome lays out SVG text at the size the figure had at that moment and may keep it when the figure is
// rescaled (reveal resizes the slides, a widget next to it mounts, fonts load): the labels drift away from their
// lines. Toggling an inherited text property forces a fresh text layout.
function relayoutSvgText(svgs) {
  svgs.forEach(s => { s.style.textRendering = 'geometricPrecision'; });
  requestAnimationFrame(() => svgs.forEach(s => { s.style.textRendering = ''; }));
}
const svgResize = new ResizeObserver(entries => relayoutSvgText(entries.map(e => e.target)));
document.querySelectorAll('.reveal .slides svg').forEach(s => svgResize.observe(s));
deck.on('resize', () => relayoutSvgText(document.querySelectorAll('.reveal .slides section.present svg')));
document.fonts.ready.then(() => relayoutSvgText(document.querySelectorAll('.reveal .slides svg')));

window.deck = deck;
