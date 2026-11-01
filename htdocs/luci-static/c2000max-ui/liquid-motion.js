/* Semantic, interruptible motion. Native focus, links and form submission remain immediate. */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var running = new Map(), decorated = new WeakSet(), themeIcons = new WeakMap(), visibility = new WeakMap(), pending = 0;
  var spring = 'cubic-bezier(.2,.8,.2,1)', pressed = null, pressedAnimation = null, symbolChangedByUser = false;
  function signal() { document.dispatchEvent(new CustomEvent('c2000-motion')); }
  function stop(element) {
    var record = running.get(element);
    if (!record) return;
    running.delete(element); record.animation.cancel(); record.cleanup?.();
  }
  function play(element, frames, duration, cleanup) {
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
    stop(panel);
    var display = getComputedStyle(panel).display;
    if (opening) {
      mutate();
      play(panel, [{ opacity: 0, transform: 'translateY(7px) scale(.97)' }, { opacity: 1, transform: 'none' }], 240);
      return;
    }
    if (reduced.matches || !panel.animate || display === 'none') { mutate(); return; }
    var oldInert = panel.inert, oldAria = panel.getAttribute('aria-hidden');
    panel.style.setProperty('--motion-display', display);
    panel.setAttribute('data-motion-exit', '');
    mutate(); panel.inert = true; panel.setAttribute('aria-hidden', 'true');
    play(panel, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(4px) scale(.98)' }], 160, function () {
      panel.removeAttribute('data-motion-exit'); panel.style.removeProperty('--motion-display'); panel.inert = oldInert;
      if (oldAria === null) panel.removeAttribute('aria-hidden'); else panel.setAttribute('aria-hidden', oldAria);
    });
  }
  function decorate() {
    document.querySelectorAll('.theme-toggle').forEach(function (button) {
      var icon = button.querySelector('svg.icon'), previous = themeIcons.get(button);
      if (icon && previous && icon !== previous && symbolChangedByUser) play(icon, [{ opacity: 0, transform: 'rotate(-20deg) scale(.94)' }, { opacity: 1, transform: 'none' }], 220);
      if (icon) themeIcons.set(button, icon);
    });
    symbolChangedByUser = false;
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
    var origin = nav.getBoundingClientRect(), rect = selected.getBoundingClientRect();
    Object.assign(indicator.style, { width: rect.width + 'px', height: rect.height + 'px', transform: 'translate3d(' + (rect.left - origin.left) + 'px,' + (rect.top - origin.top) + 'px,0)' });
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
    if (!target || target.disabled || target.closest('[inert]') || event.button !== 0) return;
    pressed = target;
    if (!reduced.matches && target.animate) {
      stop(target);
      pressedAnimation?.cancel();
      pressedAnimation = target.animate([{ transform: 'none' }, { transform: 'scale(.94)' }], { duration: 100, easing: spring, fill: 'forwards' });
      signal();
    }
  }, { passive: true });
  function release() {
    if (!pressed) return;
    var target = pressed; pressed = null;
    pressedAnimation?.cancel(); pressedAnimation = null;
    play(target, [{ transform: 'scale(.94)' }, { transform: 'scale(1.025)', offset: .7 }, { transform: 'none' }], 260);
  }
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', function () { pressedAnimation?.cancel(); pressedAnimation = null; if (pressed) stop(pressed); pressed = null; }, { passive: true });
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-theme-choice]')) symbolChangedByUser = true;
    var target = control(event), icon = target?.querySelector('svg.icon');
    if (!icon || target.disabled || target.closest('[inert]')) return;
    play(icon, [{ transform: 'scale(.94)' }, { transform: 'scale(1.02)', offset: .65 }, { transform: 'none' }], 220);
  });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-expanded', 'aria-current'] });
  window.addEventListener('resize', schedule, { passive: true });
  function clear() { Array.from(running.keys()).forEach(stop); pressedAnimation?.cancel(); pressedAnimation = null; pressed = null; }
  reduced.addEventListener('change', function () { clear(); schedule(); });
  window.addEventListener('pagehide', function () { cancelAnimationFrame(pending); pending = 0; clear(); });
  window.addEventListener('pageshow', schedule);
  window.C2000Motion = Object.freeze({ visibility: setVisible });
  observe();
})();
