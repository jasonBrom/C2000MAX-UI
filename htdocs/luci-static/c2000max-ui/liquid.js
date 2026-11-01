/* Shared live-content lenses for navigation; isolated wallpaper lenses for authentication. */
(function () {
  'use strict';
  var vendor = new URL('liquidGL.vendor.js?v=3.0.0-c2000.2', document.currentScript.src).href;
  if (!document.getElementById('liquid-scene')) return;
  var loginPage = document.body.classList.contains('login-page');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  var forced = matchMedia('(forced-colors: active)');
  var active = new Map(), serial = 0, pending = 0, refreshTimer = 0, geometryRaf = 0, overlay = null, loading = false, failed = false;
  var selectors = '.login-card,.mobile-nav,.sidebar,.header-menu,.theme-toggle,.account,.account-menu,.theme-control,.modal,.ui-modal,dialog[open],.cbi-page-actions,.cbi-dropdown > ul.dropdown,.ui-dropdown-panel,.toast';
  var appearance = palette();
  var enhancementAfter = performance.now() + (loginPage ? 0 : 800);
  function palette() { return document.documentElement.dataset.theme + ':' + document.documentElement.dataset.skin; }
  function permitted() {
    return !document.hidden && !reduced.matches && !transparency.matches && !forced.matches &&
      !(navigator.connection && navigator.connection.saveData) && !(navigator.deviceMemory && navigator.deviceMemory <= 2);
  }
  function visible(panel) {
    var exiting = panel.hasAttribute('data-motion-exit');
    if (!panel.isConnected || (panel.closest('[hidden]') && !exiting)) return false;
    var inert = panel.closest('[inert]');
    if (inert && !(inert === panel && exiting)) return false;
    var style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
    if (panel.matches('.cbi-page-actions') && style.position !== 'sticky') return false;
    return style.display !== 'none' && style.visibility === 'visible' && rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function getOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'liquid-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('data-liquid-ignore', '');
      document.body.append(overlay);
    }
    overlay.style.zIndex = document.body.classList.contains('menu-open') ? '29' : '9';
    return overlay;
  }
  function sync(panel, entry) {
    if (entry.local) return;
    var rect = panel.getBoundingClientRect(), style = getComputedStyle(panel);
    Object.assign(entry.pane.style, {
      left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px',
      borderRadius: style.borderRadius
    });
  }
  function geometry() {
    geometryRaf = 0;
    if (overlay) overlay.style.zIndex = document.body.classList.contains('menu-open') ? '29' : '9';
    var moving = false;
    active.forEach(function (entry, panel) {
      sync(panel, entry);
      moving ||= (panel.getAnimations?.() || []).some(function (animation) { return animation.playState === 'running'; });
    });
    if (moving && permitted()) geometryRaf = requestAnimationFrame(geometry);
  }
  function trackGeometry() { if (!geometryRaf) geometryRaf = requestAnimationFrame(geometry); }
  function remove(panel, entry) {
    active.delete(panel); entry.disposed = true; clearTimeout(entry.timer);
    if (entry.lens) entry.lens.destroy();
    entry.pane.remove(); panel.removeAttribute('data-glass-state'); panel.removeAttribute('data-glass-pane');
    if (!active.size && overlay) { overlay.remove(); overlay = null; }
  }
  function reset() { active.forEach(function (entry, panel) { remove(panel, entry); }); }
  function attach(panel) {
    var local = loginPage || !!panel.closest('.modal,.ui-modal,dialog[open],#modal_overlay');
    var pane = document.createElement('div');
    pane.className = 'liquid-pane'; pane.id = 'liquid-pane-' + (++serial);
    pane.setAttribute('aria-hidden', 'true'); pane.setAttribute('data-liquid-ignore', '');
    var entry = { pane: pane, lens: null, local: local, disposed: false };
    active.set(panel, entry);
    panel.setAttribute('data-glass-pane', pane.id); panel.setAttribute('data-glass-state', 'loading');
    if (local) panel.prepend(pane); else getOverlay().append(pane);
    sync(panel, entry);
    var compact = panel.matches('.header-menu,.theme-toggle,.account');
    var control = compact || panel.matches('.mobile-nav');
    var area = Math.max(1, document.body.scrollWidth * document.body.scrollHeight);
    try {
      entry.lens = window.liquidGL({
        target: '#' + pane.id, snapshot: loginPage ? '#liquid-scene' : 'body', content: false, zIndex: 0,
        resolution: loginPage ? Math.min(devicePixelRatio || 1, 1.25) : Math.max(.1, Math.min(1, Math.sqrt(2000000 / area))),
        // Shallow optics follow the upstream menu-bar lens; CSS supplies only a legibility wash.
        refraction: control ? .012 : .008, bevelDepth: control ? .024 : .018,
        bevelWidth: control ? .10 : .075, aberration: .025, frost: 0, snapshotBlur: loginPage ? 2 : 8,
        tint: null, shadow: false, specular: true, animateSpecular: false, reveal: 'none', tilt: false,
        interaction: control ? 'fluid' : 'none',
        interactionStrength: compact ? .28 : .22, interactionRadius: .30, interactionViscosity: .65,
        on: { init: function () {
          clearTimeout(entry.timer);
          if (!entry.disposed) panel.setAttribute('data-glass-state', 'gpu');
        } }
      });
      if (!entry.lens || !entry.lens.renderer) {
        if (entry.lens) entry.lens.destroy();
        entry.lens = null; panel.setAttribute('data-glass-state', 'css');
      } else {
        entry.timer = setTimeout(function () {
          if (entry.disposed || panel.dataset.glassState !== 'loading') return;
          entry.lens.destroy(); entry.lens = null; panel.setAttribute('data-glass-state', 'css');
        }, 8000);
      }
    } catch (error) {
      remove(panel, entry); failed = true; reset();
      console.warn('Liquid glass uses the CSS material:', error);
    }
    trackGeometry();
  }
  function reconcile() {
    pending = 0;
    // Never include form values, editable content or controls in authenticated-page snapshots.
    document.querySelectorAll('input,textarea,select,[contenteditable]:not([contenteditable="false"])').forEach(function (input) { input.setAttribute('data-liquid-ignore', ''); });
    document.querySelectorAll('.sidebar-backdrop,.icon-definitions').forEach(function (element) { element.setAttribute('data-liquid-ignore', ''); });
    if (!loginPage) {
      var limit = Math.max(.1, Math.min(1, Math.sqrt(2000000 / Math.max(1, document.body.scrollWidth * document.body.scrollHeight))));
      if (Array.from(active.values()).some(function (entry) { return !entry.local && entry.lens?.renderer?._snapshotResolution > limit + .02; })) reset();
    }
    var panels = Array.from(document.querySelectorAll(selectors));
    panels.forEach(function (panel) {
      panel.setAttribute('data-glass', panel.matches('.login-card') ? 'clear' : 'regular');
      panel.setAttribute('data-liquid-ignore', '');
    });
    var candidates = panels.filter(visible);
    candidates.sort(function (a, b) {
      function priority(panel) {
        return panel.matches('.modal,.ui-modal,dialog,.login-card,.account-menu,.theme-control') ? 0 : panel.matches('.mobile-nav,.sidebar') ? 1 : 2;
      }
      return priority(a) - priority(b);
    });
    candidates = candidates.slice(0, 4);
    if (!permitted() || failed) { reset(); return; }
    active.forEach(function (entry, panel) { if (!candidates.includes(panel)) remove(panel, entry); });
    if (!candidates.length) return;
    // Let first-paint resource transitions finish before compiling/rasterising the GPU enhancement.
    if (!active.size && !loginPage && performance.now() < enhancementAfter) {
      pending = setTimeout(reconcile, 120); return;
    }
    if (!window.liquidGL) {
      if (loading) return;
      loading = true;
      var tag = document.createElement('script'); tag.src = vendor;
      tag.onload = function () { loading = false; schedule(); };
      tag.onerror = function () { loading = false; failed = true; reset(); };
      document.head.append(tag); return;
    }
    candidates.forEach(function (panel) { if (!active.has(panel) && !failed) attach(panel); });
    trackGeometry();
  }
  function schedule() { if (!pending) pending = setTimeout(reconcile, 60); }
  [reduced, transparency, forced].forEach(function (query) { query.addEventListener('change', function () { reset(); schedule(); }); });
  new MutationObserver(function () {
    var next = palette(); if (next !== appearance) { appearance = next; reset(); }
    schedule();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin'] });
  new MutationObserver(function (records) {
    schedule();
    if (loginPage || refreshTimer || !permitted()) return;
    if (!records.some(function (record) {
      var element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return element?.closest('.main') && !element.closest('[data-liquid-ignore]');
    })) return;
    refreshTimer = setTimeout(function () {
      refreshTimer = 0;
      if (!permitted()) return;
      var renderers = new Set();
      active.forEach(function (entry) { if (!entry.local && entry.lens?.renderer) renderers.add(entry.lens.renderer); });
      renderers.forEach(function (renderer) { renderer.captureSnapshot(); });
    }, 500);
  }).observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'open', 'class', 'aria-expanded', 'inert', 'data-motion-exit']
  });
  document.querySelectorAll('#liquid-scene img').forEach(function (image) { image.addEventListener('load', function () { reset(); schedule(); }); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) reset(); else schedule(); });
  document.addEventListener('c2000-motion', trackGeometry);
  document.addEventListener('transitionrun', trackGeometry);
  window.addEventListener('resize', function () { trackGeometry(); schedule(); }, { passive: true });
  window.addEventListener('scroll', function () { trackGeometry(); schedule(); }, { passive: true });
  window.addEventListener('pagehide', function () { clearTimeout(pending); clearTimeout(refreshTimer); cancelAnimationFrame(geometryRaf); pending = refreshTimer = geometryRaf = 0; reset(); });
  window.addEventListener('pageshow', schedule);
  if (navigator.connection) navigator.connection.addEventListener('change', function () { reset(); schedule(); });
  if ('requestIdleCallback' in window) requestIdleCallback(schedule, { timeout: 1000 }); else schedule();
})();
