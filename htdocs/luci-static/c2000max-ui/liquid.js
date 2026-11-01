/* Enhance only the fixed navigation surface; the rest works without WebGL. */
(function () {
  'use strict';
  var script = document.currentScript;
  var vendor = new URL('liquidGL.vendor.js', script.src).href;
  var mobile = matchMedia('(max-width: 700px)');
  var desktop = matchMedia('(min-width: 1101px)');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  var forced = matchMedia('(forced-colors: active)');
  var lens = null, activePanel = null, loading = false, failed = false, token = 0;

  function permitted() {
    return !document.hidden && !reduced.matches && !transparency.matches && !forced.matches &&
      !(navigator.connection && navigator.connection.saveData) &&
      !(navigator.deviceMemory && navigator.deviceMemory <= 2) && (mobile.matches || desktop.matches);
  }
  function destroy() {
    token++;
    if (activePanel) activePanel.removeAttribute('data-liquid-active');
    activePanel = null;
    if (lens && typeof lens.destroy === 'function') lens.destroy();
    lens = null;
  }
  function start() {
    destroy();
    if (!permitted() || failed) return;
    if (!window.liquidGL) {
      if (loading) return;
      loading = true;
      var tag = document.createElement('script');
      tag.src = vendor;
      tag.onload = function () { loading = false; start(); };
      tag.onerror = function () { loading = false; failed = true; };
      document.head.appendChild(tag);
      return;
    }
    var current = token;
    try {
      lens = window.liquidGL({
        target: mobile.matches ? '.liquid-mobile' : '.liquid-sidebar',
        snapshot: 'body', resolution: .5, content: false,
        refraction: .015, bevelDepth: .06, bevelWidth: .16, frost: 1,
        shadow: false, specular: false, reveal: 'none', interaction: 'none',
        on: { init: function (instance) {
          if (current !== token) { instance.destroy(); return; }
          activePanel = instance.el.parentElement;
          activePanel.setAttribute('data-liquid-active', '');
        } }
      });
    } catch (error) {
      failed = true;
      destroy();
      console.warn('Liquid glass enhancement unavailable:', error);
    }
  }
  [mobile, desktop, reduced, transparency, forced].forEach(function (query) {
    if (query.addEventListener) query.addEventListener('change', start);
    else if (query.addListener) query.addListener(start);
  });
  document.addEventListener('visibilitychange', start);
  var appearance = document.documentElement.dataset.theme + ':' + document.documentElement.dataset.skin;
  new MutationObserver(function () {
    var next = document.documentElement.dataset.theme + ':' + document.documentElement.dataset.skin;
    if (next === appearance) return;
    appearance = next;
    start(); // Rebuild the snapshot when its background palette changes.
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] });
  window.addEventListener('pagehide', destroy);
  window.addEventListener('pageshow', function (event) { if (event.persisted) start(); });
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2000 });
  else setTimeout(start, 300);
})();
