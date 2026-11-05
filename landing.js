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
})();
