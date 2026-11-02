/* Shared live-content lenses for navigation; isolated wallpaper lenses for authentication. */
(function () {
  'use strict';
  var vendor = new URL('liquidGL.vendor.js?v=3.0.0-c2000.4', document.currentScript.src).href;
  if (!document.getElementById('liquid-scene')) return;
  var loginPage = document.body.classList.contains('login-page');
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  var forced = matchMedia('(forced-colors: active)');
  var active = new Map(), overlays = new Map(), serial = 0, pending = 0, refreshTimer = 0, geometryRaf = 0, loading = false, failed = false;
  var selectors = '.login-card,.mobile-nav,.liquid-selection,.sidebar,.header-menu,.theme-toggle,.account,.account-menu,.theme-control,.modal,.ui-modal,dialog[open],.cbi-page-actions,.cbi-dropdown > ul.dropdown,.ui-dropdown-panel,.toast';
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
    // Inert prevents interaction, not painting: a modal must not change background materials.
    var style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
    if (panel.matches('.cbi-page-actions') && style.position !== 'sticky') return false;
    return style.display !== 'none' && style.visibility === 'visible' && rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function layerFor(panel) { return panel.matches('.sidebar') && innerWidth <= 1100 ? 'drawer' : 'base'; }
  function getOverlay(layer) {
    var overlay = overlays.get(layer);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'liquid-overlay';
      overlay.dataset.glassLayer = layer;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('data-liquid-ignore', '');
      document.body.append(overlay);
      overlays.set(layer, overlay);
    }
    return overlay;
  }
  function sync(panel, entry) {
    var rect = panel.getBoundingClientRect(), style = getComputedStyle(panel);
    if (entry.lens) entry.lens.options.opacity = Number(style.opacity);
    if (entry.local) return;
    Object.assign(entry.pane.style, {
      left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px',
      borderRadius: style.borderRadius
    });
  }
  function geometry() {
    geometryRaf = 0;
    var moving = false;
    active.forEach(function (entry, panel) {
      sync(panel, entry);
      moving ||= panel.hasAttribute('data-motion-active') || (panel.getAnimations?.() || []).some(function (animation) { return animation.playState === 'running'; });
    });
    if (moving && permitted()) geometryRaf = requestAnimationFrame(geometry);
  }
  function trackGeometry() { if (!geometryRaf) geometryRaf = requestAnimationFrame(geometry); }
  function remove(panel, entry) {
    active.delete(panel); entry.disposed = true; clearTimeout(entry.timer);
    if (entry.lens) entry.lens.destroy();
    entry.pane.remove(); panel.removeAttribute('data-glass-state'); panel.removeAttribute('data-glass-pane');
    overlays.forEach(function (overlay, layer) {
      if (!Array.from(active.values()).some(function (item) { return !item.local && item.layer === layer; })) { overlay.remove(); overlays.delete(layer); }
    });
  }
  function reset() { active.forEach(function (entry, panel) { remove(panel, entry); }); }
  function attach(panel) {
    var local = loginPage || !!panel.closest('.modal,.ui-modal,dialog[open],#modal_overlay');
    var pane = document.createElement('div');
    pane.className = 'liquid-pane'; pane.id = 'liquid-pane-' + (++serial);
    pane.setAttribute('aria-hidden', 'true'); pane.setAttribute('data-liquid-ignore', '');
    var entry = { pane: pane, lens: null, local: local, layer: layerFor(panel), disposed: false };
    active.set(panel, entry);
    panel.setAttribute('data-glass-pane', pane.id); panel.setAttribute('data-glass-state', 'loading');
    if (local) panel.prepend(pane); else getOverlay(entry.layer).append(pane);
    sync(panel, entry);
    var compact = panel.matches('.header-menu,.theme-toggle,.account');
    var control = compact || panel.matches('.mobile-nav');
    var selection = panel.matches('.liquid-selection');
    var opticalScale = Math.min(1, innerHeight / Math.max(innerHeight, document.body.scrollHeight));
    var area = Math.max(1, document.body.scrollWidth * document.body.scrollHeight);
    try {
      entry.lens = window.liquidGL({
        target: '#' + pane.id, snapshot: loginPage ? '#liquid-scene' : 'body', content: selection ? '.mobile-nav-items' : false, zIndex: 0,
        resolution: loginPage ? Math.min(devicePixelRatio || 1, 1.25) : Math.max(.1, Math.min(1, Math.sqrt(2000000 / area))),
        // Shallow optics follow the upstream menu-bar lens; CSS supplies only a legibility wash.
        refraction: selection ? .016 * opticalScale : control ? .012 : .008,
        bevelDepth: selection ? .014 * opticalScale : control ? .024 : .018,
        bevelWidth: selection ? .071 : control ? .10 : .075, aberration: selection ? .6 : .025,
        frost: 0, snapshotBlur: loginPage ? 2 : 8, magnify: selection ? 1.05 : 1,
        tint: null, shadow: false, specular: true, animateSpecular: false, reveal: 'none', tilt: false,
        opacity: Number(getComputedStyle(panel).opacity),
        interaction: selection || control ? 'fluid' : 'none',
        interactionStrength: selection ? .5 : compact ? .28 : .22,
        interactionRadius: selection ? 1.2 : .30, interactionViscosity: selection ? .25 : .65,
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
      panel.setAttribute('data-glass', panel.matches('.login-card,.liquid-selection') ? 'clear' : 'regular');
      panel.setAttribute('data-liquid-ignore', '');
    });
    var candidates = panels.filter(visible);
    var persistent = candidates.filter(function (panel) { return panel.matches('.login-card,.mobile-nav,.liquid-selection,.sidebar,.header-menu,.theme-toggle,.account,.cbi-page-actions'); });
    var floating = candidates.filter(function (panel) { return !persistent.includes(panel); });
    floating.sort(function (a, b) {
      function priority(panel) {
        return panel.matches('.modal,.ui-modal,dialog,.login-card,.account-menu,.theme-control') ? 0 : panel.matches('.mobile-nav,.sidebar') ? 1 : 2;
      }
      return priority(a) - priority(b);
    });
    // Reserve permanent controls before admitting transient panels; opening a menu cannot evict an avatar.
    candidates = persistent.concat(floating.slice(0, Math.max(0, 8 - persistent.length)));
    if (!permitted() || failed) { reset(); return; }
    active.forEach(function (entry, panel) { if (!candidates.includes(panel) || (!entry.local && entry.layer !== layerFor(panel))) remove(panel, entry); });
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
