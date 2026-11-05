// The count (storyboard frame 2, reordered 5 Nov 2026). Alaa: "the loader should come just next to the black screen, let
// us start with the number .. show it first on 3g, let it be true .. the loading time .. this is the whole point of it".
// tools/build-takeover.cjs puts this script inside the page, right after #loader, so it runs with the first paint, before
// any other script has arrived. It counts what the landing needs, by its size on the line (the build writes the list on
// #loader: the page itself, the scripts, the hero's drawings, the signature) and waits for the fonts. It shows at least
// 2 s, as long as the line really needs, and never more than has arrived: the true value is the smaller of the 2 s clock
// and the bytes in, the shown number follows it (it flows, never jumps) and is rounded down. opening.js starts the light
// when it is complete (window.__count); what the landing does not need waits for it (window.__afterCount).
(function () {
  var loader = document.getElementById('loader'), text = loader && loader.querySelector('.pct');
  var query = new URLSearchParams(location.search), INFINITY = query.has('inf');
  var MIN_FILL = Number(query.get('fill')) > 0 ? Number(query.get('fill')) : 2000;
  var GIVE_UP = 30000;   // ms: past this the light starts anyway (the number keeps telling the truth until it fades)
  var FOLLOW = 120;      // ms: how closely the shown number follows the true one
  var FONT_WAIT = 6000;  // ms: the count stops waiting for the fonts' stylesheet after this (blocked or failed)
  var t0 = performance.now(), last = t0, items = {}, seen = {};
  var state = window.__count = { total: 0, done: 0, fonts: false, shown: 0, completeAt: null, gaveUp: false, waiting: [], arrivals: [] };
  var list = [];
  try { list = JSON.parse(loader.getAttribute('data-assets')) || []; } catch (error) { state.listError = String(error); }
  list.forEach(function (item) {
    var key = item[0] === '#document' ? '#document' : new URL(item[0], document.baseURI).href;
    items[key] = item[1]; state.total += item[1];
  });
  function arrived(url) {
    if (!(url in items) || seen[url]) return;
    seen[url] = true; state.done += items[url]; state.arrivals.push([Math.round(performance.now()), url.split('/').pop() || url]);
  }
  // Every file the browser finishes (also the ones finished before this script ran: buffered), and every file that fails
  // (a failed file is finished too: nobody waits for it).
  try {
    new PerformanceObserver(function (entries) { entries.getEntries().forEach(function (entry) { arrived(entry.name); }); })
      .observe({ type: 'resource', buffered: true });
  } catch (error) { state.observerError = String(error); }
  addEventListener('error', function (event) { var target = event.target; if (target && (target.src || target.href)) arrived(target.src || target.href); }, true);
  // The fonts: their stylesheet loads without holding the first paint (the build), then the faces the hero uses.
  (function fonts() {
    var link = document.getElementById('study-fonts'), settled = false;
    function faces() {
      if (settled) return; settled = true;
      var loading = document.fonts ? Promise.all(['300 16px Archivo', '600 16px Archivo'].map(function (face) { return document.fonts.load(face); })) : Promise.resolve();
      loading.then(function () { state.fonts = true; }, function () { state.fonts = true; });
    }
    if (!link || link.media === 'all') faces();
    else { link.addEventListener('load', faces); link.addEventListener('error', faces); setTimeout(faces, FONT_WAIT); }
  })();
  window.__afterCount = function (job) { if (state.completeAt !== null) job(); else state.waiting.push(job); };
  // What the first screen does not show waits for the count (the build marks it): pictures further down
  // (data-defer-src) and the statement's Arabic face (data-defer-href). Also once the page is fully read, for anything
  // the reader had not reached when the count completed. Any hero drawing still waiting in the chain goes too.
  function releaseDeferred() {
    Array.prototype.forEach.call(document.querySelectorAll('img[data-defer-src]'), function (image) { image.src = image.getAttribute('data-defer-src'); image.removeAttribute('data-defer-src'); });
    Array.prototype.forEach.call(document.querySelectorAll('link[data-defer-href]'), function (link) { link.href = link.getAttribute('data-defer-href'); link.removeAttribute('data-defer-href'); });
    Array.prototype.forEach.call(document.querySelectorAll('img[data-chain-src]'), function (image) { image.src = image.getAttribute('data-chain-src'); image.removeAttribute('data-chain-src'); });
  }
  // The hero's drawings, one after another (Alaa, 5 Nov: "one after another"): side by side they shared the line and all
  // finished within half a second, so the number waited on 10 % for ~5 s on 3G and then rushed. In turn, each one
  // finishes on its own and the number climbs in steps. The first is asked for from the head (preload); each next one
  // the moment the previous has arrived; each goes into the hero (data-chain-src, under the black) as it arrives.
  var chain = [], chained = {};
  try { chain = JSON.parse(loader.getAttribute('data-chain')) || []; } catch (error) { state.chainError = String(error); }
  function placeChained() {
    Array.prototype.forEach.call(document.querySelectorAll('img[data-chain-src]'), function (image) {
      var file = image.getAttribute('data-chain-src');
      if (chained[new URL(file, document.baseURI).href]) { image.src = file; image.removeAttribute('data-chain-src'); }
    });
  }
  function nextInChain(index) {
    if (index >= chain.length) return;
    var url = new URL(chain[index], document.baseURI).href, image = new Image();
    image.onload = image.onerror = function (event) {
      chained[url] = true;
      if (event.type === 'error') arrived(url);   // a failed drawing is finished too: nobody waits for it
      placeChained(); nextInChain(index + 1);
    };
    image.src = chain[index];
  }
  nextInChain(0);
  document.addEventListener('DOMContentLoaded', placeChained);
  function release() {
    releaseDeferred();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', releaseDeferred);
    var jobs = state.waiting.splice(0); jobs.forEach(function (job) { try { job(); } catch (error) { console.warn('count: after', error); } });
  }
  var smooth = function (n) { var x = Math.max(0, Math.min(1, n)); return x * x * (3 - 2 * x); };
  function frame(now) {
    var page = performance.getEntriesByType('navigation')[0];
    if (page && page.responseEnd > 0) arrived('#document');
    var byTime = smooth((now - t0) / MIN_FILL), byLoad = state.total ? state.done / state.total : 1;
    if (!state.fonts) byLoad = Math.min(byLoad, 0.99);
    var target = Math.min(byTime, byLoad), dt = now - last; last = now;
    if (target > state.shown) state.shown += (target - state.shown) * (1 - Math.exp(-dt / FOLLOW));
    if (target >= 1 && state.shown > 0.995) state.shown = 1;
    var percent = Math.floor(state.shown * 100);
    var label = INFINITY ? (state.shown >= 1 ? '∞' : Math.min(percent, 99) + ' %') : percent + ' %';
    if (text && text.textContent !== label) text.textContent = label;
    if (state.completeAt === null && (state.shown >= 1 || now - t0 >= GIVE_UP)) { state.completeAt = now; state.gaveUp = state.shown < 1; release(); }
    if (state.shown < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
