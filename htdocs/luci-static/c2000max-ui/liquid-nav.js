/* Scrubbable navigation. Real anchors retain navigation, modifiers and keyboard activation. */
(function () {
  'use strict';
  if (document.documentElement.hasAttribute('data-content-frame')) return;
  var nav = document.querySelector('.mobile-nav'), itemsRoot = nav?.querySelector('.mobile-nav-items');
  if (!itemsRoot) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var items = Array.from(itemsRoot.children).filter(function (item) { return item.matches('a,button'); });
  var lens = document.createElement('span');
  lens.className = 'liquid-selection'; lens.setAttribute('aria-hidden', 'true'); lens.setAttribute('data-liquid-ignore', '');
  nav.prepend(lens); nav.classList.add('has-glass-selection');
  var pose = { x: 0, width: 0, scale: 1, vx: 0, vw: 0, vs: 0 };
  var target = { x: 0, width: 0, scale: 1 }, rects = [], raf = 0, lastTime = 0;
  var hover = -1, focus = -1, gesture = null, swallowClick = false, initialized = false;
  function signal() { document.dispatchEvent(new CustomEvent('c2000-motion')); }
  function activeIndex() {
    var index = items.findIndex(function (item) { return item.getAttribute('aria-expanded') === 'true'; });
    if (index < 0) index = items.findIndex(function (item) { return item.getAttribute('aria-current') === 'page'; });
    return Math.max(0, index);
  }
  function indexOf(node) { return items.findIndex(function (item) { return item === node || item.contains(node); }); }
  function measure() {
    rects = items.map(function (item) {
      return { x: itemsRoot.offsetLeft + item.offsetLeft, y: itemsRoot.offsetTop + item.offsetTop, width: item.offsetWidth, height: item.offsetHeight };
    });
  }
  function visual(index) {
    items.forEach(function (item, i) { item.classList.toggle('is-lens-target', i === index); });
    nav.classList.toggle('has-lens-preview', index !== activeIndex());
  }
  function paint() {
    lens.style.width = pose.width + 'px';
    lens.style.height = (rects[0]?.height || 62) + 'px';
    lens.style.transform = 'translate3d(' + pose.x + 'px,' + (rects[0]?.y || 5) + 'px,0) scale(' + pose.scale + ')';
    nav.style.setProperty('--lens-x', pose.x+'px'); nav.style.setProperty('--lens-y', (rects[0]?.y || 5)+'px');
    nav.style.setProperty('--lens-width', pose.width+'px'); nav.style.setProperty('--lens-height', (rects[0]?.height || 62)+'px');
    nav.style.setProperty('--lens-scale', pose.scale);
  }
  function frame(now) {
    raf = 0;
    var dt = Math.min(.032, Math.max(.001, (now - lastTime) / 1000)); lastTime = now;
    var moving = false;
    [['x','vx'],['width','vw'],['scale','vs']].forEach(function (axis) {
      var name = axis[0], speed = axis[1], left = dt;
      var stiffness = gesture?.dragged ? 1100 : name === 'scale' ? 650 : 460;
      var damping = gesture?.dragged ? 62 : name === 'scale' ? 36 : 29;
      while (left > 0) {
        var step = Math.min(left, 1 / 120);
        pose[speed] += (stiffness * (target[name] - pose[name]) - damping * pose[speed]) * step;
        pose[name] += pose[speed] * step; left -= step;
      }
      var epsilon = name === 'scale' ? .0001 : .04;
      if (Math.abs(pose[name] - target[name]) < epsilon && Math.abs(pose[speed]) < epsilon * 10) { pose[name] = target[name]; pose[speed] = 0; }
      else moving = true;
    });
    paint(); signal();
    if (moving) raf = requestAnimationFrame(frame);
    else lens.removeAttribute('data-motion-active');
  }
  function move(x, width, scale, immediate) {
    Object.assign(target, { x: x, width: width, scale: reduced.matches ? 1 : scale });
    if (immediate || reduced.matches || !initialized) {
      cancelAnimationFrame(raf); raf = 0;
      Object.assign(pose, target, { vx: 0, vw: 0, vs: 0 }); paint(); lens.removeAttribute('data-motion-active'); signal();
    } else {
      lens.setAttribute('data-motion-active', '');
      if (!raf) { lastTime = performance.now(); raf = requestAnimationFrame(frame); }
      signal();
    }
    initialized = true;
  }
  function preview(index, scale, immediate) {
    if (!rects[index]) return;
    visual(index); move(rects[index].x, rects[index].width, scale, immediate);
  }
  function restore(immediate) {
    var inert = nav.closest('[inert]');
    var index = !inert && focus >= 0 ? focus : activeIndex();
    preview(index, !inert && focus >= 0 ? 1.025 : 1, immediate);
  }
  function refresh() {
    measure();
    if (gesture && !nav.closest('[inert]')) return;
    if (gesture) cancelGesture();
    restore(!initialized);
  }
  function nearest(x) {
    var best = 0, distance = Infinity;
    rects.forEach(function (rect, index) {
      var next = Math.abs(rect.x + rect.width / 2 - x);
      if (next < distance) { distance = next; best = index; }
    });
    return best;
  }
  function cancelGesture() {
    var old = gesture; gesture = null;
    nav.classList.remove('is-dragging', 'is-nav-pressed');
    if (old && nav.hasPointerCapture?.(old.id)) nav.releasePointerCapture(old.id);
    restore(false);
  }
  nav.addEventListener('pointerover', function (event) {
    if (event.pointerType !== 'mouse') return;
    nav.dataset.input = 'pointer'; focus = -1;
    if (!gesture) restore(false);
  });
  nav.addEventListener('pointerleave', function () { hover = -1; if (!gesture) restore(false); });
  nav.addEventListener('pointerdown', function (event) {
    if (event.button !== 0 || event.isPrimary === false || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || nav.closest('[inert]')) return;
    var index = indexOf(event.target); if (index < 0 || items[index].disabled) return;
    nav.dataset.input = 'pointer';
    measure();
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, start: pose.x, lastX: event.clientX, lastTime: performance.now(), dragged: false, index: index };
    nav.classList.add('is-nav-pressed'); preview(index, 1.12, false);
  });
  window.addEventListener('pointermove', function (event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    var dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.dragged) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { cancelGesture(); return; }
      if (Math.abs(dx) < 6) return;
      gesture.dragged = true; gesture.start = pose.x;
      nav.setPointerCapture(event.pointerId); nav.classList.add('is-dragging');
    }
    event.preventDefault();
    var now = performance.now(), speed = Math.abs(event.clientX - gesture.lastX) / Math.max(1, now - gesture.lastTime);
    gesture.lastX = event.clientX; gesture.lastTime = now;
    var index = nearest(event.clientX - nav.getBoundingClientRect().left);
    var width = rects[index].width * (reduced.matches ? 1 : 1 + Math.min(.20, speed * .055));
    var x = Math.min(rects.at(-1).x + rects.at(-1).width - width, Math.max(rects[0].x, gesture.start + dx));
    visual(index); move(x, width, 1.12, false);
  }, { passive: false });
  window.addEventListener('pointerup', function (event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    var old = gesture; gesture = null;
    nav.classList.remove('is-dragging', 'is-nav-pressed');
    if (nav.hasPointerCapture?.(old.id)) nav.releasePointerCapture(old.id);
    if (!old.dragged) { if (event.pointerType !== 'mouse') hover = -1; restore(false); return; }
    event.preventDefault();
    var index = nearest(event.clientX - nav.getBoundingClientRect().left);
    hover = event.pointerType === 'mouse' ? index : -1;
    preview(index, hover >= 0 ? 1.04 : 1, false);
    swallowClick = true; setTimeout(function () { swallowClick = false; }, 0);
    if (nav.closest('[inert]')) return;
    if (index !== activeIndex() || items[index].matches('button')) items[index].click();
  }, { passive: false });
  window.addEventListener('pointercancel', function (event) { if (gesture?.id === event.pointerId) cancelGesture(); }, { passive: true });
  nav.addEventListener('lostpointercapture', function (event) { if (event.target === nav && gesture?.id === event.pointerId) cancelGesture(); });
  nav.addEventListener('dragstart', function (event) { event.preventDefault(); });
  nav.addEventListener('click', function (event) {
    if (swallowClick && event.isTrusted) { swallowClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  nav.addEventListener('focusin', function (event) { focus = event.target.matches(':focus-visible') ? indexOf(event.target) : -1; if (!gesture) restore(false); });
  nav.addEventListener('focusout', function (event) { if (!itemsRoot.contains(event.relatedTarget)) { focus = -1; if (!gesture) restore(false); } });
  nav.addEventListener('keydown', function (event) {
    nav.dataset.input = 'keyboard';
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var index = indexOf(event.target), next;
    if (index < 0) return;
    if (event.key === 'ArrowRight') next = Math.min(items.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'Escape') { cancelGesture(); return; }
    else return;
    event.preventDefault(); items[next].focus({ preventScroll: true });
  });
  new MutationObserver(refresh).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current','aria-expanded','inert','hidden'] });
  new ResizeObserver(refresh).observe(nav);
  window.addEventListener('blur', function () { hover = focus = -1; cancelGesture(); });
  reduced.addEventListener('change', function () { cancelGesture(); restore(true); });
  window.addEventListener('pagehide', function () { cancelGesture(); cancelAnimationFrame(raf); raf = 0; lens.removeAttribute('data-motion-active'); });
  window.addEventListener('pageshow', refresh);
  refresh();
})();
