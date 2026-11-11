// Frame 4, the landing (storyboard v2, final 5 Nov 2026, second session, from Alaa's review). Inlined by
// tools/build-takeover.cjs after the study's own script. 1. The small signature shows only when the big name is not
// fully on screen. 2. The year in the line under the name is the current one. 3. Phones: the burger opens the four
// words in Johnny's hand on the opening's black. Everything eases on the site's curve (landing.css).
(function () {
  'use strict';
  var nav = document.getElementById('nav');
  if (!nav) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var phone = matchMedia('(max-width: 760px)');
  function navHeight() { return Math.round(nav.getBoundingClientRect().height); }
  function setNavHeight() { document.documentElement.style.setProperty('--nav-h', navHeight() + 'px'); }

  /* 1. Either the small signature or the big name, never both (Alaa: "we will have it back if we don't have the full
     huge name on the screen"). The big name counts as on screen when all of it is below the nav. */
  var name = document.querySelector('.hero .name'), observer = null;
  function watchName() {
    if (observer) observer.disconnect();
    if (!name || !('IntersectionObserver' in window)) { nav.classList.add('has-brand'); return; }
    observer = new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      nav.classList.toggle('has-brand', !entry.isIntersecting || entry.intersectionRatio < 0.98);
    }, { rootMargin: '-' + navHeight() + 'px 0px 0px 0px', threshold: [0, 0.98, 1] });
    observer.observe(name);
  }
  watchName(); setNavHeight();
  var resizing = 0;
  addEventListener('resize', function () { clearTimeout(resizing); resizing = setTimeout(function () { setNavHeight(); watchName(); }, 150); });

  /* 2. The current year (Alaa: "current year .. like a check in"). */
  var year = document.querySelector('#herorow .year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* 3. Phones: the burger and the four words in Johnny's hand (Paintings and Exhibitions in his lettering; Workshops and
     Contact in a stand-in hand until he writes them). */
  var burger = nav.querySelector('.burger'), panel = null;
  function goTo(hash) {
    var target = document.querySelector(hash);
    if (target) target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth' });
  }
  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'menu-panel'; panel.id = 'menu-panel'; panel.setAttribute('aria-label', 'Menu');
    panel.innerHTML =
      '<a href="#works"><img src="assets/painting-lettering-paper.svg" alt="Paintings" style="width:56vw"></a>' +
      '<a href="#exhibition"><img src="assets/exhibitions-lettering-paper.svg" alt="Exhibitions" style="width:60vw"></a>' +
      '<a class="hand" aria-disabled="true">Workshops</a>' +
      '<a class="hand" href="#contact">Contact</a>';
    panel.addEventListener('click', function (event) {
      var link = event.target.closest('a[href]');
      if (!link) return;
      event.preventDefault(); setOpen(false); goTo(link.getAttribute('href'));
    });
    document.body.appendChild(panel);
    placeOrigin();   // the circle starts at the burger from the first open (measured: it slid ~40 px when set on open)
    return panel;
  }
  /** The panel grows out of the burger: the circle's centre is the burger's centre, in the panel's own coordinates. */
  function placeOrigin() {
    var r = burger.getBoundingClientRect();
    panel.style.setProperty('--from-x', Math.round(r.left + r.width / 2) + 'px');
    panel.style.setProperty('--from-y', Math.round(r.top + r.height / 2 - navHeight()) + 'px');
  }
  function setOpen(open) {
    buildPanel(); setNavHeight();
    // The centre is set with the transition off for that instant, so only the circle's size moves, never its centre
    // (measured: it slid 10 px when the panel was made while the nav was still easing in).
    panel.style.transition = 'none'; placeOrigin(); void panel.offsetWidth; panel.style.transition = '';
    void panel.offsetWidth;
    panel.classList.toggle('open', open); nav.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
  }
  if (burger) {
    burger.addEventListener('click', function () { setOpen(!(panel && panel.classList.contains('open'))); });
    addEventListener('keydown', function (event) { if (event.key === 'Escape' && panel && panel.classList.contains('open')) setOpen(false); });
    // On phones the panel and its lettering are made once the count is complete, so they are there when it opens.
    if (phone.matches) (window.__afterCount || function (job) { job(); })(buildPanel);
  }

  /* 4. Johnny's notes (6 Nov 2026; TRIAL on branch johnny-notes). The square's second place to try, for review only:
     ?square=left puts it top left, behind the start of the name (landing.css). */
  if (new URLSearchParams(location.search).get('square') === 'left') document.documentElement.classList.add('square-left');

  /* 5. One drawing at a time, each at a new place (Johnny: "only one sketch"; Alaa, 11 Nov: "we will need them all to
     stay but to make sure we have only 1 shown .. the rest will be shown randomly each one will remain for 3 or 6 or 9
     secs also randomly", then: "why the sketch is appearing at the same place ?? let it show randomly"). The first is in
     the page (.on). Once the opening is over, each drawing stays whole for 3, 6 or 9 s (drawn at random), then gives its
     place to another one drawn at random, never itself; both move in step (landing.css). Every drawing, the first one
     too, gets a place drawn at random before it shows: below the menu, whole on the screen, never over the line under
     the name, and not where the one before it was. A drawing that has not arrived yet is not drawn; while the hero is
     out of sight or the tab is hidden nothing turns. Reduced motion: the first drawing stays. window.__drawings is the
     black box. */
  var drawings = Array.prototype.slice.call(document.querySelectorAll('.hero-sk .dr'));
  var hero = document.querySelector('.hero');
  if (drawings.length > 1 && hero) {
    var HOLDS = [3000, 6000, 9000], TURN = 1600;   // TURN: the change itself, the same 1.6 s as in landing.css
    var current = 0, timer = 0, started = false, inSight = true, lastSpot = null;
    for (var d = 0; d < drawings.length; d++) if (drawings[d].classList.contains('on')) { current = d; break; }
    var record = window.__drawings = { current: current, hold: 0, turns: 0, waited: 0, running: false, spot: null };
    var arrived = function (image) { return image.complete && image.naturalWidth > 0; };
    var draw = function (list) { return list[Math.floor(Math.random() * list.length)]; };
    /** A place for this drawing, drawn at random inside the hero; left as the stylesheet has it if there is no room. */
    var place = function (image) {
      var box = hero.getBoundingClientRect(), size = image.getBoundingClientRect(), w = size.width, h = size.height;
      var edge = 16, minY = navHeight() + 8, maxX = document.documentElement.clientWidth - w - edge, maxY = box.height - h - 8;
      if (!(w > 0 && h > 0) || maxX < edge || maxY < minY) return;
      var text = document.querySelector('#herorow .big'), keep = null;
      if (text) { var t = text.getBoundingClientRect(); keep = { l: t.left - box.left - 14, r: t.right - box.left + 14, t: t.top - box.top - 14, b: t.bottom - box.top + 14 }; }
      for (var n = 0; n < 24; n++) {
        var x = edge + Math.random() * (maxX - edge), y = minY + Math.random() * (maxY - minY);
        var onText = keep && x < keep.r && x + w > keep.l && y < keep.b && y + h > keep.t;
        var sameSpot = lastSpot && n < 16 && Math.abs(x - lastSpot.x) + Math.abs(y - lastSpot.y) < box.width * 0.2;
        if (onText || sameSpot) continue;
        image.style.left = Math.round(x) + 'px'; image.style.top = Math.round(y) + 'px';
        lastSpot = { x: x, y: y }; record.spot = [Math.round(x), Math.round(y)];
        return;
      }
    };
    var wait = function () {
      var should = started && inSight && !document.hidden && !reduced.matches;
      record.running = should;
      if (!should) { clearTimeout(timer); timer = 0; return; }
      if (timer) return;   // this stay is already being counted (the observers call in more than once)
      record.hold = draw(HOLDS);
      timer = setTimeout(turn, TURN + record.hold);
    };
    var turn = function () {
      timer = 0;
      var others = drawings.filter(function (image, index) { return index !== current && arrived(image); });
      if (others.length) {
        var next = drawings.indexOf(draw(others));
        place(drawings[next]);   // while it is still unseen: nothing moves on screen
        drawings[current].classList.remove('on'); drawings[next].classList.add('on');
        current = record.current = next; record.turns++;
      } else record.waited++;   // nothing else has arrived yet: the one on screen stays
      wait();
    };
    // The first drawing takes its place as soon as it has a size, under the black of the opening.
    var first = drawings[current];
    if (first.getBoundingClientRect().height > 0) place(first); else first.addEventListener('load', function () { if (!started) place(first); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) { inSight = entries[entries.length - 1].isIntersecting; wait(); }).observe(hero);
    document.addEventListener('visibilitychange', wait);
    if (reduced.addEventListener) reduced.addEventListener('change', wait);
    // The opening is over when the page has the phase "page" (opening.js); the first stay starts there.
    var begin = function () { if (started || document.body.dataset.phase !== 'page') return; started = true; wait(); };
    if ('MutationObserver' in window) new MutationObserver(begin).observe(document.body, { attributes: true, attributeFilter: ['data-phase'] });
    begin();
  }

  /* 6. One painting per screen, and the page stops on it (Johnny's note; Alaa, 11 Nov: "we will have an auto flip .. or
     let us say an auto scroll auto stop on the perfect fit for the painting"). landing.css gives every painting one
     screen and one place. Here: when the scrolling has stopped among the paintings, the page glides on to the painting
     it was heading for. From a painting it rested on, a push of 60 px (or 8 % of the screen if that is less) flips to
     the next one that way and a smaller one returns; with the keyboard any move flips. Leaving upward from the first or
     downward from the last is free. The glide eases in and out (Alaa: "the flip is nice but we can make it ease in and
     out a bit more"): 0.9 s for a whole screen, GSAP's power2.inOut; the wheel, a finger or a key takes the page back at
     once. While a painting's screen is in view the menu stays (.nav-stay, read by the study's nav script: the build).
     Each painting gets its shadow when it is first seen (.seen, landing.css). Reduced motion: no auto scroll.
     window.__wall is the black box. */
  var seenOnce = function (elements, margin, job) {
    if (!('IntersectionObserver' in window)) { elements.forEach(job); return; }
    var watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) { watcher.unobserve(entry.target); job(entry.target); } });
    }, { rootMargin: margin });
    elements.forEach(function (element) { watcher.observe(element); });
  };
  var wall = document.getElementById('wall');
  var works = wall ? Array.prototype.slice.call(wall.querySelectorAll('.work')) : [];
  if (works.length > 1 && getComputedStyle(works[0]).display === 'flex') {   // only with the one-per-screen layout
    var root = document.documentElement, tops = [], lastY = scrollY, lastWidth = innerWidth, heading = 0, pending = 0, touching = false, keyed = false, glide = null;
    var GLIDE = 0.9;   // s, for a whole screen
    var log = window.__wall = { settles: 0, at: -1, to: null, gliding: false };
    var measure = function () { var y = scrollY; tops = works.map(function (work) { return Math.round(work.getBoundingClientRect().top + y); }); };
    // Among the paintings: the view's top is between half a screen before the first one and half a screen past the last.
    var among = function () {
      var half = innerHeight / 2;
      return works[0].getBoundingClientRect().top <= half && works[works.length - 1].getBoundingClientRect().top >= -half;
    };
    var jump = function (y) { window.scrollTo({ top: y, behavior: 'instant' }); };
    var stop = function () { if (glide) { glide.kill(); glide = null; log.gliding = false; } };
    var go = function (index) {
      log.at = index; log.to = tops[index];
      var from = scrollY, to = tops[index], far = Math.abs(to - from);
      if (far < 2) return;
      log.settles++;
      if (!window.gsap) { window.scrollTo({ top: to, behavior: 'smooth' }); return; }   // no GSAP: the browser's own
      var at = { y: from };
      stop(); log.gliding = true;
      glide = window.gsap.to(at, {
        y: to, duration: Math.max(0.45, GLIDE * Math.min(1, far / innerHeight)), ease: 'power2.inOut',
        onUpdate: function () { jump(at.y); },
        onComplete: function () { glide = null; log.gliding = false; jump(to); }
      });
    };
    var settle = function () {
      pending = 0;
      if (glide || touching || reduced.matches || document.body.dataset.phase !== 'page' || document.body.style.overflow === 'hidden') return;   // hidden: a painting is open alone
      measure();
      var y = scrollY, end = tops.length - 1, flip = keyed ? 2 : Math.min(60, innerHeight * 0.08), from = log.at;
      keyed = false;
      if (!among()) { log.at = -1; return; }
      // From a painting it was resting on, less than a screen away: a real push flips to the next one that way, a
      // small one returns; a push away from the first (up) or the last (down) leaves the paintings freely.
      if (from >= 0 && Math.abs(y - tops[from]) < innerHeight) {
        var moved = y - tops[from], next = from + (moved > 0 ? 1 : -1);
        if (Math.abs(moved) <= flip) go(from);
        else if (next < 0 || next > end) log.at = -1;
        else go(next);
        return;
      }
      // Arriving from outside, or after a long run: the painting that fills most of the view.
      if (y < tops[0]) { if (heading > 0) go(0); else log.at = -1; return; }
      if (y > tops[end]) { if (heading < 0) go(end); else log.at = -1; return; }
      var k = 0; while (k < end && tops[k + 1] <= y) k++;
      go(k === end || y - tops[k] < tops[k + 1] - y ? k : k + 1);
    };
    var later = function () { clearTimeout(pending); pending = setTimeout(settle, 90); };
    addEventListener('scroll', function (event) {
      if (event.target !== document) return;   // a scroller inside the page (the menu, a caption) is not the page
      var y = scrollY;
      if (y !== lastY) heading = y > lastY ? 1 : -1;
      lastY = y;
      root.classList.toggle('nav-stay', among());
      clearTimeout(pending); pending = 0;
      if (!('onscrollend' in window)) pending = setTimeout(settle, 160);   // no scrollend event: wait for the scroll to rest
    }, { passive: true, capture: true });   // capture: before the study's nav script reads .nav-stay on the same scroll (measured: a single jump onto a painting left the menu hidden)
    if ('onscrollend' in window) addEventListener('scrollend', later);
    // The visitor's own hand always wins: the wheel, a finger or a key stops a glide; the page settles again after it.
    addEventListener('wheel', stop, { passive: true });
    addEventListener('touchstart', function () { touching = true; stop(); clearTimeout(pending); pending = 0; }, { passive: true });
    var lifted = function () { touching = false; later(); };
    addEventListener('touchend', lifted, { passive: true }); addEventListener('touchcancel', lifted, { passive: true });
    addEventListener('keydown', function (event) { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar', 'Home', 'End'].indexOf(event.key) >= 0) { keyed = true; stop(); } });
    // A phone's address bar changes only the height (in the middle of a scroll): only a new width settles again.
    addEventListener('resize', function () { if (innerWidth === lastWidth) return; lastWidth = innerWidth; later(); });
    // The shadow comes with the painting: the same line the study's wipe starts on (top at 84 % of the screen).
    seenOnce(works, '0px 0px -16% 0px', function (work) { work.classList.add('seen'); });
  }

  /* 7. The artist (frame 5): the section comes in when it is reached (landing.css). */
  var about = document.querySelector('.about');
  if (about) seenOnce([about], '0px 0px -20% 0px', function (section) { section.classList.add('seen'); });

  /* 8. The sketchbook on a touch screen: the page you smudge takes every touch, so two small buttons on it lead out
     (Alaa: "a special scrolling button here .. like skip .. or continue"). Shown only where the pointer is a finger
     (landing.css). A touch on a button is not a smudge. */
  var skStage = document.getElementById('skstage');
  if (skStage && works.length) {
    [['up', 'Back', function () { return works[works.length - 1]; }], ['down', 'Continue', function () { return document.getElementById('exhibition'); }]].forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'sk-leave lbl ' + item[0]; button.textContent = item[0] === 'up' ? '↑ ' + item[1] : item[1] + ' ↓';
      ['pointerdown', 'touchstart', 'mousedown'].forEach(function (type) { button.addEventListener(type, function (event) { event.stopPropagation(); }, { passive: true }); });
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        var target = item[2]();
        if (target) target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      });
      skStage.appendChild(button);
    });
  }

  /* 9. What has been loaded stays loaded (Alaa, 11 Nov: "cash it so the user doesnt have to load it again"): sw.js keeps
     the site's pictures in the browser, so a later visit shows them without the network. Registered once the page has
     loaded, never in the way of the first visit; when the paintings have all arrived (count.js) their addresses are
     handed over to be kept. window.__keep is the black box. */
  var keeper = window.__keep = { state: 'none', kept: 0, error: null };
  var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    var register = function () {
      navigator.serviceWorker.register('sw.js').then(function () {
        keeper.state = 'registered';
        if (navigator.connection && navigator.connection.saveData) { keeper.state = 'registered, no hand-over (data saver)'; return; }
        (window.__afterPaintings || function (job) { job(); })(function () {
          navigator.serviceWorker.ready.then(function (registration) {
            var pictures = Array.prototype.map.call(document.images, function (image) { return image.currentSrc || image.src; })
              .filter(function (address, index, all) { return address && address.indexOf(location.origin) === 0 && all.indexOf(address) === index; });
            if (registration.active) { registration.active.postMessage({ type: 'keep', urls: pictures }); keeper.kept = pictures.length; keeper.state = 'handed over'; }
          });
        });
      }).catch(function (error) { keeper.state = 'failed'; keeper.error = String(error); });
    };
    if (document.readyState === 'complete') register(); else addEventListener('load', register);
  }
})();
