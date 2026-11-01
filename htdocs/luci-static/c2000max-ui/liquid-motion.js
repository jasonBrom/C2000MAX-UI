/* Semantic, interruptible motion. Native focus, links and form submission remain immediate. */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var running = new Map(), decorated = new WeakSet(), visibility = new WeakMap(), pending = 0;
  var spring = 'cubic-bezier(.2,.8,.2,1)', pressed = null;
  var springs = new Map(), springRaf = 0, springTime = 0;
  function signal() { document.dispatchEvent(new CustomEvent('c2000-motion')); }
  function stop(element) {
    var record = running.get(element);
    if (!record) return;
    running.delete(element); record.animation.cancel(); record.cleanup?.();
  }
  function play(element, frames, duration, cleanup) {
    if (running.has(element)) {
      var current = getComputedStyle(element);
      Object.keys(frames[0]).forEach(function (property) { if (property in current) frames[0][property] = current[property]; });
    }
    stop(element);
    if (reduced.matches || !element.animate) { cleanup?.(); return; }
    var animation = element.animate(frames, { duration: duration, easing: spring });
    var record = { animation: animation, cleanup: cleanup };
    running.set(element, record); signal();
    animation.finished.then(function () {
      if (running.get(element) === record) { running.delete(element); cleanup?.(); signal(); }
    }, function () {});
  }
  function setVisible(panel, opening, mutate) {
    if (!panel) { mutate(); return; }
    var style = getComputedStyle(panel), display = style.display;
    var from = running.has(panel) ? { opacity: style.opacity, transform: style.transform } : null;
    stop(panel);
    if (opening) {
      mutate();
      play(panel, [from || { opacity: 0, transform: 'translateY(7px) scale(.97)' }, { opacity: 1, transform: 'none' }], 240);
      return;
    }
    if (reduced.matches || !panel.animate || display === 'none') { mutate(); return; }
    var oldInert = panel.inert, oldAria = panel.getAttribute('aria-hidden');
    panel.style.setProperty('--motion-display', display);
    panel.setAttribute('data-motion-exit', '');
    mutate(); panel.inert = true; panel.setAttribute('aria-hidden', 'true');
    play(panel, [from || { opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(4px) scale(.98)' }], 160, function () {
      panel.removeAttribute('data-motion-exit'); panel.style.removeProperty('--motion-display'); panel.inert = oldInert;
      if (oldAria === null) panel.removeAttribute('aria-hidden'); else panel.setAttribute('aria-hidden', oldAria);
    });
  }
  function restoreScale(element, state) {
    if (state.original) element.style.setProperty('scale', state.original, state.priority); else element.style.removeProperty('scale');
    element.removeAttribute('data-motion-active');
  }
  function stepSprings(now) {
    springRaf = 0;
    var dt = Math.min(.032, Math.max(.001, (now - springTime) / 1000)), moving = false;
    springTime = now;
    springs.forEach(function (state, element) {
      if (!element.isConnected) { restoreScale(element, state); springs.delete(element); return; }
      var remaining = dt;
      while (remaining > 0) {
        var step = Math.min(remaining, 1 / 120), damping = state.target < 1 ? 48 : 28;
        state.velocity += ((state.target < 1 ? 900 : 650) * (state.target - state.position) - damping * state.velocity) * step;
        state.position += state.velocity * step; remaining -= step;
      }
      if (Math.abs(state.position - state.target) < .0001 && Math.abs(state.velocity) < .001) {
        state.position = state.target; state.velocity = 0;
        element.removeAttribute('data-motion-active');
        if (state.target === 1) { restoreScale(element, state); springs.delete(element); return; }
      } else moving = true;
      element.style.scale = String(state.position);
    });
    signal();
    if (moving) springRaf = requestAnimationFrame(stepSprings);
  }
  function springTo(element, target, impulse) {
    if (reduced.matches) return;
    var state = springs.get(element);
    if (!state) {
      state = { position: parseFloat(getComputedStyle(element).scale) || 1, velocity: 0, target: target,
        original: element.style.getPropertyValue('scale'), priority: element.style.getPropertyPriority('scale') };
      springs.set(element, state);
    }
    // Retarget the same spring. Position and velocity survive repeated presses and reversals.
    state.target = target; state.velocity = Math.max(-2, Math.min(2, state.velocity + (impulse || 0)));
    element.setAttribute('data-motion-active', '');
    if (!springRaf) { springTime = performance.now(); springRaf = requestAnimationFrame(stepSprings); }
    signal();
  }
  function decorate() {
    document.querySelectorAll('[data-menu-toggle] svg.icon use').forEach(function (use) {
      var next = use.closest('[data-menu-toggle]').getAttribute('aria-expanded') === 'true' ? '#close' : '#menu';
      if (use.getAttribute('href') !== next) use.setAttribute('href', next);
    });
    document.querySelectorAll('svg.icon').forEach(function (icon) {
      if (decorated.has(icon)) return;
      decorated.add(icon);
      if (!icon.hasAttribute('aria-label') && icon.getAttribute('role') !== 'img') {
        icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false');
      }
      if (!icon.closest('.mobile-nav,.nav-home')) return;
      var outline = icon.querySelector('use');
      if (!outline) return;
      var name = outline.getAttribute('href')?.slice(1);
      if (!document.getElementById(name + '-selected')) return;
      outline.classList.add('symbol-outline');
      var selected = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      selected.setAttribute('href', '#' + name + '-selected'); selected.classList.add('symbol-selected'); icon.append(selected);
    });
  }
  function selection() {
    var nav = document.querySelector('.mobile-nav');
    if (!nav || !nav.getClientRects().length) return;
    var selected = nav.querySelector('[aria-expanded="true"]') || nav.querySelector('[aria-current="page"]');
    if (!selected) return;
    var indicator = nav.querySelector('.liquid-selection');
    if (!indicator) {
      indicator = document.createElement('span'); indicator.className = 'liquid-selection';
      indicator.setAttribute('aria-hidden', 'true'); nav.prepend(indicator);
    }
    // Layout coordinates exclude the transient press scale, so the selection cannot freeze mid-press.
    Object.assign(indicator.style, { width: selected.offsetWidth + 'px', height: selected.offsetHeight + 'px', transform: 'translate3d(' + selected.offsetLeft + 'px,' + selected.offsetTop + 'px,0)' });
    if (!nav.classList.contains('has-glass-selection')) nav.classList.add('has-glass-selection');
    if (!indicator.hasAttribute('data-selection-ready')) requestAnimationFrame(function () { indicator.setAttribute('data-selection-ready', ''); });
  }
  function observe() {
    pending = 0; decorate(); selection();
    document.querySelectorAll('.theme-control,.account-menu,.modal,.ui-modal,dialog[open]').forEach(function (panel) {
      var now = !panel.closest('[hidden]') && getComputedStyle(panel).display !== 'none';
      var previous = visibility.get(panel);
      if ((previous === false || (previous === undefined && panel.matches('.modal,.ui-modal,dialog'))) && now && !running.has(panel)) {
        play(panel, [{ opacity: 0, transform: 'translateY(7px) scale(.97)' }, { opacity: 1, transform: 'none' }], 240);
      }
      visibility.set(panel, now);
    });
  }
  function schedule() { if (!pending) pending = requestAnimationFrame(observe); }
  function control(event) { return event.composedPath().find(function (node) { return node.matches?.('button,a[href],summary'); }); }
  function arm() { document.documentElement.setAttribute('data-motion-ready', ''); }
  document.addEventListener('pointerdown', arm, { once: true, capture: true, passive: true });
  document.addEventListener('keydown', arm, { once: true, capture: true });
  document.addEventListener('pointerdown', function (event) {
    var target = control(event);
    if (!target || target.disabled || target.closest('[inert]') || event.button !== 0 || event.isPrimary === false) return;
    if (pressed) springTo(pressed.element, 1);
    pressed = { element: target, pointerId: event.pointerId };
    springTo(target, .94);
  }, { passive: true });
  function release(event) {
    if (!pressed || event.pointerId !== pressed.pointerId) return;
    var target = pressed.element; pressed = null;
    springTo(target, 1);
  }
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('click', function (event) {
    var target = control(event), icon = target?.querySelector('svg.icon');
    if (!icon || target.disabled || target.closest('[inert]')) return;
    springTo(icon, 1, -1.1);
  });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-expanded', 'aria-current'] });
  window.addEventListener('resize', schedule, { passive: true });
  function clear() {
    Array.from(running.keys()).forEach(stop);
    cancelAnimationFrame(springRaf); springRaf = 0;
    springs.forEach(function (state, element) { restoreScale(element, state); }); springs.clear(); pressed = null; signal();
  }
  reduced.addEventListener('change', function () { clear(); schedule(); });
  window.addEventListener('pagehide', function () { cancelAnimationFrame(pending); pending = 0; clear(); });
  window.addEventListener('pageshow', schedule);
  window.C2000Motion = Object.freeze({ visibility: setVisible });
  observe();
})();
