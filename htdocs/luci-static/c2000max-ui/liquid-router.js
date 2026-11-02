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
  vendor.src = new URL('liquidGL.vendor.js?v=3.0.0-c2000.6', document.currentScript.src).href;
  vendor.async = true; vendor.dataset.liquidVendor = '';
  document.head.append(vendor);
  document.addEventListener('DOMContentLoaded', function () {
    var content = document.querySelector('#maincontent');
    if (!content || document.body.classList.contains('navigation-preview')) return;
    var frame = null, generation = 0, pending = null, dispose = null, stopped = false;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var scrolls = new Map(), current = location.pathname + location.search + location.hash;
    var initialState = Object.assign({}, history.state, { c2000: true });
    history.replaceState(initialState, '', location.href);
    history.scrollRestoration = 'manual';
    var status = document.createElement('p');
    status.className = 'navigation-status'; status.setAttribute('role', 'status'); status.hidden = true;
    content.before(status);

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
      var next = route(url); if (!next) { location.assign(url); return; }
      var key = next.pathname + next.search + next.hash;
      if (key === current && !options.pop) return;
      scrolls.set(current, frame?.contentWindow.scrollY || scrollY);
      current = key;
      if (!options.pop) history.pushState({ c2000: true }, '', key);
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
            location.assign(nextFrame.contentWindow.location.href); return;
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
            location.assign(nextFrame.contentWindow.location.href);
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
    function dirty(doc) {
      return !!doc.querySelector('[data-changed="true"],.cbi-input-invalid') ||
        Array.from(doc.querySelectorAll('.cbi-map input,.cbi-map textarea,.cbi-map select')).some(function (input) {
          if (input.type === 'password' || input.type === 'hidden' || input.disabled) return false;
          if (input.matches('select')) return Array.from(input.options).some(function (option) { return option.selected !== option.defaultSelected; });
          if (/^(checkbox|radio)$/.test(input.type)) return input.checked !== input.defaultChecked;
          return input.value !== input.defaultValue;
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
  }, { once: true });
})();
