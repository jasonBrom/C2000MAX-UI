/* Only the decorative scene is rasterised, never UI text or credentials. */
(function () {
  'use strict';
  var vendor = new URL('liquidGL.vendor.js?v=3.0.0', document.currentScript.src).href;
  var scene = document.getElementById('liquid-scene');
  if (!scene) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  var forced = matchMedia('(forced-colors: active)');
  var active = new Map(), serial = 0, pending = 0, loading = false, failed = false;
  var selectors = '.login-card,.mobile-nav,.sidebar,.account-menu,.theme-control,.modal,.ui-modal,dialog[open],.cbi-page-actions,.cbi-dropdown > ul.dropdown,.ui-dropdown-panel,.toast';
  var appearance = palette();
  function palette() {
    return document.documentElement.dataset.theme + ':' + document.documentElement.dataset.skin;
  }
  function permitted() {
    return !document.hidden && !reduced.matches && !transparency.matches && !forced.matches &&
      !(navigator.connection && navigator.connection.saveData) &&
      !(navigator.deviceMemory && navigator.deviceMemory <= 2);
  }
  function visible(panel) {
    if (!panel.isConnected || panel.closest('[hidden]')) return false;
    var style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
    if (panel.matches('.cbi-page-actions') && style.position !== 'sticky') return false;
    return style.display !== 'none' && style.visibility === 'visible' && rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function remove(panel, entry) {
    active.delete(panel);
    entry.disposed = true;
    clearTimeout(entry.timer);
    if (entry.lens) entry.lens.destroy();
    entry.pane.remove();
    panel.removeAttribute('data-glass-state');
  }
  function reset() {
    active.forEach(function (entry, panel) { remove(panel, entry); });
  }
  function attach(panel) {
    var pane = document.createElement('div');
    pane.className = 'liquid-pane';
    pane.id = 'liquid-pane-' + (++serial);
    pane.setAttribute('aria-hidden', 'true');
    pane.setAttribute('data-liquid-ignore', '');
    panel.prepend(pane);
    var entry = { pane: pane, lens: null, disposed: false };
    active.set(panel, entry);
    panel.setAttribute('data-glass-state', 'loading');
    var login = panel.matches('.login-card');
    var dark = document.documentElement.dataset.theme === 'dark';
    try {
      entry.lens = window.liquidGL({
        target: '#' + pane.id, snapshot: '#liquid-scene', content: false, zIndex: 0,
        resolution: Math.min(devicePixelRatio || 1, 1.25),
        refraction: login ? .022 : .012, bevelDepth: login ? .085 : .055,
        bevelWidth: login ? .12 : .18, frost: login ? 2 : 4,
        tint: dark ? 'rgba(12, 20, 36, 0.14)' : 'rgba(245, 249, 255, 0.08)',
        shadow: false, specular: false, reveal: 'none', tilt: false, interaction: 'none',
        on: { init: function () {
          clearTimeout(entry.timer);
          if (!entry.disposed) panel.setAttribute('data-glass-state', 'gpu');
        } }
      });
      // Upstream CSS fallback doesn't fire on.init; retain our single CSS material layer.
      if (!entry.lens || !entry.lens.renderer) {
        if (entry.lens) entry.lens.destroy();
        entry.lens = null;
        panel.setAttribute('data-glass-state', 'css');
      } else {
        entry.timer = setTimeout(function () {
          if (entry.disposed || panel.dataset.glassState !== 'loading') return;
          entry.lens.destroy();
          entry.lens = null;
          panel.setAttribute('data-glass-state', 'css');
        }, 8000);
      }
    } catch (error) {
      remove(panel, entry);
      failed = true;
      reset();
      console.warn('Liquid glass uses the CSS material:', error);
    }
  }
  function reconcile() {
    pending = 0;
    var panels = Array.from(document.querySelectorAll(selectors));
    panels.forEach(function (panel) {
      panel.setAttribute('data-glass', panel.matches('.login-card') ? 'clear' : 'regular');
    });
    var candidates = panels.filter(visible);
    candidates.sort(function (a, b) {
      function priority(panel) { return panel.matches('.modal,dialog,.login-card') ? 0 : panel.matches('.mobile-nav,.sidebar') ? 1 : 2; }
      return priority(a) - priority(b);
    });
    candidates = candidates.slice(0, 4);
    if (!permitted() || failed) { reset(); return; }
    active.forEach(function (entry, panel) { if (!candidates.includes(panel)) remove(panel, entry); });
    if (!candidates.length) return;
    if (!window.liquidGL) {
      if (loading) return;
      loading = true;
      var tag = document.createElement('script');
      tag.src = vendor;
      tag.onload = function () { loading = false; schedule(); };
      tag.onerror = function () { loading = false; failed = true; reset(); };
      document.head.appendChild(tag);
      return;
    }
    candidates.forEach(function (panel) { if (!active.has(panel) && !failed) attach(panel); });
  }
  function schedule() { if (!pending) pending = setTimeout(reconcile, 80); }
  [reduced, transparency, forced].forEach(function (query) {
    query.addEventListener('change', function () { reset(); schedule(); });
  });
  new MutationObserver(function () {
    var next = palette();
    if (next !== appearance) { appearance = next; reset(); }
    schedule();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] });
  new MutationObserver(schedule).observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'open', 'class', 'aria-expanded']
  });
  scene.querySelectorAll('img').forEach(function (image) { image.addEventListener('load', function () { reset(); schedule(); }); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) reset(); else schedule(); });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pagehide', function () { clearTimeout(pending); pending = 0; reset(); });
  window.addEventListener('pageshow', schedule);
  if (navigator.connection) navigator.connection.addEventListener('change', function () { reset(); schedule(); });
  if ('requestIdleCallback' in window) requestIdleCallback(schedule, { timeout: 1000 });
  else schedule();
})();
