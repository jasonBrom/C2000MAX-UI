/* Keep the shell alive; each native LuCI view retains its own document and lifecycle. */
(function () {
  'use strict';
  var owner;
  try { owner = window.frameElement; } catch (_) {}
  if (owner?.classList.contains('c2000-view-frame')) {
    document.documentElement.dataset.contentFrame = '';
    document.addEventListener('DOMContentLoaded', function () {
      if (document.body.classList.contains('login-page')) { parent.location.assign(location.href); return; }
      var parentRouter = parent.C2000Navigation;
      if (parentRouter) parentRouter.connect(owner, window);
    }, { once: true });
    return;
  }
  var vendor = document.createElement('script');
  document.documentElement.dataset.navigationInstance = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  try { document.documentElement.dataset.navigationPrevious = sessionStorage.getItem('c2000-navigation-step') || ''; } catch (_) {}
  vendor.src = new URL('liquidGL.vendor.js?v=3.0.0-c2000.6', document.currentScript.src).href;
  vendor.async = true; vendor.dataset.liquidVendor = '';
  document.head.append(vendor);
  var initialized = false;
  function initialize() {
    if (initialized) return;
    var content = document.querySelector('#maincontent');
    if (!content || document.body.classList.contains('navigation-preview')) return;
    initialized = true;
    var frame = null, generation = 0, pending = null, dispose = null, stopped = false;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var scrolls = new Map(), current = location.pathname + location.search + location.hash;
    var formBaselines = new WeakMap(), editedForms = new WeakSet();
    var initialState = Object.assign({}, history.state, { c2000: true });
    history.replaceState(initialState, '', location.href);
    history.scrollRestoration = 'manual';
    var status = document.createElement('p');
    status.className = 'navigation-status'; status.setAttribute('role', 'status'); status.hidden = true;
    content.before(status);
    document.documentElement.dataset.navigationReady = '';
    function step(value) {
      document.documentElement.dataset.navigationStep = value;
      try { sessionStorage.setItem('c2000-navigation-step', value); } catch (_) {}
    }
    function nativePage(url, reason) { step('native:' + reason); location.assign(url); }

    function route(url) {
      try {
        var next = new URL(url, location.href);
        if (next.origin !== location.origin || !next.pathname.startsWith('/cgi-bin/luci/admin/') ||
            /\/(?:logout|reboot|flashops|download)(?:\/|$)/.test(next.pathname)) return null;
        return next;
      } catch (_) { return null; }
    }
    function updateShell(url) {
      document.querySelectorAll('.mobile-nav-items > a').forEach(function (link) {
        var active = url.pathname === link.pathname || url.pathname.startsWith(link.pathname + '/');
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      });
      document.body.dataset.page = url.pathname.replace(/^\/cgi-bin\/luci\//, '').replaceAll('/', '-');
      window.C2000Menu?.refresh();
      document.dispatchEvent(new CustomEvent('c2000-route-change'));
    }
    function stopInitialView() {
      if (stopped) return;
      stopped = true;
      // Native views in the frame own polling from now on; the shell must not poll the old view.
      if (window.L?.Poll) {
        L.Poll.stop();
        (L.Poll.queue || []).slice().forEach(function (entry) { L.Poll.remove(entry.fn); });
        L.Poll.add = function () { return false; };
      }
      document.dispatchEvent(new CustomEvent('c2000-view-leave'));
      document.querySelector('#tabmenu')?.replaceChildren();
      // A slow original view may finish loading after the first navigation.
      // Give its native initializer a sink, then detach its nodes before polling can start.
      var sink = document.createElement('div'); sink.id = 'view'; sink.hidden = true;
      sink.inert = true; sink.setAttribute('data-liquid-ignore', '');
      document.body.append(sink);
      new MutationObserver(function () { if (sink.childNodes.length) sink.replaceChildren(); }).observe(sink, { childList: true });
    }
    function fail(message) {
      status.replaceChildren(document.createTextNode(message + ' '));
      var retry = document.createElement('a'); retry.href = current; retry.textContent = '重新打开';
      retry.dataset.fullNavigation = ''; status.append(retry); status.hidden = false;
      content.removeAttribute('aria-busy');
    }
    function open(url, options) {
      options ||= {};
      var next = route(url); if (!next) { nativePage(url, 'route'); return; }
      var key = next.pathname + next.search + next.hash;
      if (key === current && !options.pop) return;
      scrolls.set(current, frame?.contentWindow.scrollY || scrollY);
      current = key;
      if (!options.pop) history.pushState({ c2000: true }, '', key);
      step('loading');
      updateShell(next);
      if (document.body.classList.contains('menu-open')) window.C2000Menu?.close();
      status.textContent = '正在打开页面…'; status.hidden = false; content.setAttribute('aria-busy', 'true');
      if (pending) { clearTimeout(pending.timer); pending.frame.remove(); }
      var nextFrame = document.createElement('iframe'), id = ++generation;
      nextFrame.className = 'c2000-view-frame'; nextFrame.title = 'LuCI 管理页面';
      nextFrame.setAttribute('scrolling', 'no'); nextFrame.setAttribute('data-route-pending', '');
      nextFrame.style.height = Math.max(240, innerHeight - content.getBoundingClientRect().top) + 'px';
      nextFrame.addEventListener('load', function () {
        if (id !== generation) return;
        try {
          if (!route(nextFrame.contentWindow.location.href) || nextFrame.contentDocument.body.classList.contains('login-page')) {
            nativePage(nextFrame.contentWindow.location.href, 'authentication'); return;
          }
          if (nextFrame.contentDocument.documentElement.hasAttribute('data-content-frame')) {
            if (frame === nextFrame) {
              var actual = new URL(nextFrame.contentWindow.location.href);
              var key = actual.pathname + actual.search + actual.hash;
              if (key !== current) { current = key; history.pushState({ c2000: true }, '', key); updateShell(actual); }
              frame = null; pending = { frame: nextFrame, timer: null, pop: false };
            }
            connect(nextFrame, nextFrame.contentWindow);
          } else {
            // Legacy/foreign themes keep their native top-level navigation.
            nativePage(nextFrame.contentWindow.location.href, 'content-bridge');
          }
        } catch (_) { fail('页面暂时无法打开。'); }
      });
      pending = { frame: nextFrame, id: id, pop: options.pop, timer: setTimeout(function () {
        if (id === generation && pending) fail('页面响应较慢。');
      }, 15000) };
      nextFrame.src = next.href; content.append(nextFrame);
    }
    function connect(nextFrame, child) {
      if (pending?.frame !== nextFrame || nextFrame === frame || !nextFrame.isConnected) return;
      var task = pending; pending = null; clearTimeout(task.timer);
      if (dispose) dispose();
      stopInitialView();
      frame = nextFrame;
      Array.from(content.children).forEach(function (element) { if (element !== frame) element.remove(); });
      frame.removeAttribute('data-route-pending');
      content.removeAttribute('aria-busy'); status.hidden = true;
      document.title = child.document.title;
      document.body.classList.add('has-content-frame');
      step('connected');
      var observer, raf = 0, refresh = 0;
      function modalState() {
        var modal = child.document.body.classList.contains('modal-overlay-active') || !!child.document.querySelector('dialog[open]');
        document.body.classList.toggle('content-modal-open', modal);
        document.querySelectorAll('.brand,.header-menu,.topbar,.mobile-nav').forEach(function (element) {
          element.inert = modal || (!element.matches('.topbar') && document.body.classList.contains('menu-open'));
        });
        var sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.inert = modal || (innerWidth <= 1100 && !document.body.classList.contains('menu-open'));
      }
      function notify() { document.dispatchEvent(new CustomEvent('c2000-view-update')); }
      function resize() {
        raf = 0;
        if (!frame?.isConnected || child.closed) return;
        if (!refresh) refresh = setTimeout(function () { refresh = 0; notify(); }, 160);
      }
      function queueScroll() { if (!raf) raf = requestAnimationFrame(resize); }
      function queue() { modalState(); nextFrame._liquidFrameVersion = (nextFrame._liquidFrameVersion || 0) + 1; queueScroll(); }
      function appearance() {
        var theme = window.C2000Theme;
        if (theme && child.C2000Theme) {
          child.C2000Theme.setSkin(theme.getSkin()); child.C2000Theme.set(theme.get());
        }
      }
      child.document.addEventListener('click', intercept);
      child.document.addEventListener('keydown', forwardKey);
      var forgetForm = trackFormEdits(child.document);
      child.addEventListener('load', queue, true);
      child.addEventListener('scroll', queueScroll, { passive: true });
      var indicator = document.querySelector('[data-indicator="poll-status"]'), indicatorCopy;
      function pollState() {
        if (indicatorCopy) indicatorCopy.setAttribute('data-style', child.L?.Poll?.active() ? 'active' : 'inactive');
      }
      if (indicator) {
        indicatorCopy = indicator.cloneNode(true); indicator.replaceWith(indicatorCopy);
        indicatorCopy.addEventListener('click', function () {
          var poll = child.L?.Poll; if (!poll) return;
          if (poll.active()) poll.stop(); else poll.start(); pollState();
        });
        child.document.addEventListener('poll-start', pollState); child.document.addEventListener('poll-stop', pollState);
        child.document.addEventListener('luci-loaded', pollState); pollState();
      }
      observer = new child.ResizeObserver(queue); observer.observe(child.document.body);
      var mutations = new child.MutationObserver(queue);
      mutations.observe(child.document.body, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['class','hidden','open','style'] });
      window.addEventListener('resize', queue);
      document.addEventListener('c2000-appearance-change', appearance);
      document.addEventListener('c2000-skin-change', appearance);
      dispose = function () {
        observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(raf); clearTimeout(refresh);
        window.removeEventListener('resize', queue);
        document.removeEventListener('c2000-appearance-change', appearance);
        document.removeEventListener('c2000-skin-change', appearance);
        child.document.removeEventListener('click', intercept); child.document.removeEventListener('keydown', forwardKey);
        child.removeEventListener('load', queue, true);
        forgetForm();
        child.removeEventListener('scroll', queueScroll);
        child.document.removeEventListener('poll-start', pollState); child.document.removeEventListener('poll-stop', pollState);
        child.document.removeEventListener('luci-loaded', pollState);
        document.body.classList.remove('content-modal-open');
      };
      appearance(); queue();
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (task.pop) child.scrollTo({ top: scrolls.get(current) || 0, behavior: 'instant' });
      if (!reduced.matches) frame.animate([{ opacity: .7 }, { opacity: 1 }], { duration: 140 });
      notify();
    }
    function forwardKey(event) {
      if (event.key === 'Escape') window.C2000Menu?.close();
    }
    function fields(map) {
      return Array.from(map.querySelectorAll('input,textarea,select')).filter(function (input) {
        return !input.disabled && !input.readOnly && !/^(button|submit|reset)$/.test(input.type);
      });
    }
    function fieldValue(input) {
      if (input.matches('select')) return Array.from(input.selectedOptions, function (option) { return option.value; }).join('\u0000');
      return /^(checkbox|radio)$/.test(input.type) ? input.checked : input.value;
    }
    function trackFormEdits(doc) {
      var recentMap, recentTime = 0;
      function remember(map) {
        if (!editedForms.has(map)) formBaselines.set(map, new Map(fields(map).map(function (input) { return [input, fieldValue(input)]; })));
      }
      function intent(event) {
        var map = event.target.closest?.('.cbi-map'); if (!map) return;
        remember(map);
        if (event.isTrusted && event.type !== 'focusin') { recentMap = map; recentTime = Date.now(); }
      }
      function changed(event) {
        var map = event.target.closest?.('.cbi-map'); if (!map) return;
        if (!event.isTrusted && (map !== recentMap || Date.now() - recentTime > 700)) return;
        if (formBaselines.has(map)) editedForms.add(map);
      }
      ['pointerdown','keydown','focusin'].forEach(function (name) { doc.addEventListener(name, intent, true); });
      ['input','change','widget-change'].forEach(function (name) { doc.addEventListener(name, changed, true); });
      return function () {
        ['pointerdown','keydown','focusin'].forEach(function (name) { doc.removeEventListener(name, intent, true); });
        ['input','change','widget-change'].forEach(function (name) { doc.removeEventListener(name, changed, true); });
      };
    }
    function dirty(doc) {
      return Array.from(doc.querySelectorAll('.cbi-map')).some(function (map) {
        if (!editedForms.has(map)) return false;
        var baseline = formBaselines.get(map), inputs = fields(map);
        return baseline && (inputs.length !== baseline.size || inputs.some(function (input) { return fieldValue(input) !== baseline.get(input); }));
      });
    }
    function intercept(event) {
      var link = event.target.closest?.('a[href]');
      if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
          link.hasAttribute('download') || link.hasAttribute('data-full-navigation') || (link.target && link.target !== '_self') || link.dataset.previewPanel &&
          link.closest('#menu-tree')?.dataset.demo === 'true') return;
      var next = route(link.href); if (!next) return;
      if (next.pathname === location.pathname && next.search === location.search && next.hash) return;
      if (dirty(frame?.contentDocument || document)) {
        event.preventDefault();
        if (!window.confirm('当前页面有未保存的修改，确定离开吗？')) return;
      }
      event.preventDefault(); open(next);
    }
    document.addEventListener('click', intercept);
    trackFormEdits(document);
    window.addEventListener('popstate', function () {
      if (dirty(frame?.contentDocument || document) && !window.confirm('当前页面有未保存的修改，确定离开吗？')) {
        history.pushState({ c2000: true }, '', current); return;
      }
      open(location.href, { pop: true });
    });
    window.addEventListener('pagehide', function () { if (dispose) dispose(); });
    window.addEventListener('pageshow', function (event) {
      if (event.persisted && frame) {
        var restored = frame; frame = null;
        pending = { frame: restored, timer: null, pop: true }; connect(restored, restored.contentWindow);
      }
    });
    window.C2000Navigation = Object.freeze({ open: open, connect: connect });
  }
  window.C2000StartNavigation = initialize;
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
