// Editor behaviors both tools share, so they feel like a design tool rather than a form:
// canvas zoom and pan, quick tooltips with shortcut hints, typeable and scrubbable number fields,
// and the keyboard-shortcut sheet.
// Studio.init({ artHeight, artWidth, shortcuts }): the artboard's size in CSS px at 100% zoom. Pass artWidth when one wide
// artboard should fit the stage's width too; leave it out where several artboards sit side by side.
window.Studio = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  // Zoom. Artboards size from --art-h; "fit" tracks the stage height until someone zooms by hand.
  let stage, artH = 1350, artW = 0, scale = 1, fitting = true, echoing = false;
  const fitScale = () => {
    const pad = getComputedStyle(stage);
    const h = stage.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom) - 28; // frame label row
    const w = stage.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    return Math.max(0.1, Math.min(1, h / artH, artW ? w / artW : Infinity));
  };
  function setScale(s, anchor) {
    const old = scale;
    scale = Math.min(2, Math.max(0.1, s));
    stage.style.setProperty('--art-h', `${Math.round(artH * scale)}px`);
    stage.classList.toggle('zoom-small', artH * scale < 420); // slide labels drop the size when slides get small
    $('#zoomPct').textContent = `${Math.round(scale * 100)}%`;
    if (anchor) { // keep the point under the pointer still
      const k = scale / old, r = stage.getBoundingClientRect();
      const ax = anchor.x - r.left, ay = anchor.y - r.top;
      stage.scrollLeft = (stage.scrollLeft + ax) * k - ax;
      stage.scrollTop = (stage.scrollTop + ay) * k - ay;
    }
    dispatchEvent(new CustomEvent('studio:zoom'));
    // Overlays (text editor, gradient handles) re-measure on resize; the guard keeps our own resize handler out of it.
    echoing = true; dispatchEvent(new Event('resize')); echoing = false;
  }
  function fit() { if (!stage) return; fitting = true; setScale(fitScale()); }
  const zoomBy = (k, anchor) => { fitting = false; setScale(scale * k, anchor); };

  // The bottom toolbar, as in Figma: Move and Hand tools, the page's own tools, then zoom. Floats at the canvas's
  // bottom center. Tools: [{ id, label, key, icon (svg inner markup), run }].
  const ICONS = {
    move: '<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.12 1.58a2 2 0 0 0-1.44 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  };
  let hand = false;
  function setTool(t) {
    hand = t === 'hand';
    stage.classList.toggle('panning', hand);
    document.querySelectorAll('.dock [data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === t));
  }
  function initZoom(tools) {
    stage = $('.stage');
    if (!stage) return;
    const bar = document.createElement('div');
    bar.className = 'dock'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Tools');
    const tool = (id, label, key, icon) => `<button type="button" class="tool" data-tool="${id}" data-tip="${label}" data-key="${key}" aria-label="${label}"><svg class="i" viewBox="0 0 24 24">${icon}</svg></button>`;
    bar.innerHTML = `${tool('move', 'Move', 'V', ICONS.move)}${tool('hand', 'Hand tool', 'H', ICONS.hand)}
      ${tools.length ? `<span class="dock-sep"></span>${tools.map((t) => `<button type="button" class="tool" data-run="${t.id}" data-tip="${t.label}" data-key="${t.key}" aria-label="${t.label}"><svg class="i" viewBox="0 0 24 24">${t.icon}</svg></button>`).join('')}` : ''}
      <span class="dock-sep"></span>
      <button type="button" class="tool" data-z="out" data-tip="Zoom out" data-key="${mod} −" aria-label="Zoom out"><svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
      <button type="button" class="zoom-pct" id="zoomPct" data-tip="Zoom to fit" data-key="⇧ 1">100%</button>
      <button type="button" class="tool" data-z="in" data-tip="Zoom in" data-key="${mod} +" aria-label="Zoom in"><svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
    document.body.append(bar);
    const pin = () => {
      const r = stage.getBoundingClientRect();
      bar.hidden = !r.width || getComputedStyle(stage).display === 'none';
      bar.style.left = `${r.left + r.width / 2 - bar.offsetWidth / 2}px`;
      bar.style.top = `${r.bottom - bar.offsetHeight - 14}px`;
    };
    addEventListener('resize', pin);
    addEventListener('studio:view', pin);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      else if (b.dataset.run) tools.find((t) => t.id === b.dataset.run).run();
      else if (b.id === 'zoomPct') fit();
      else zoomBy(b.dataset.z === 'in' ? 1.25 : 0.8);
    });
    addEventListener('keydown', (e) => {
      if (typing(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey || !stage.getClientRects().length) return;
      if (e.key === 'v' || e.key === 'V') setTool('move');
      if (e.key === 'h' || e.key === 'H') setTool('hand');
      const t = tools.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) { e.preventDefault(); t.run(); }
    });
    setTool('move');
    // ⌘/Ctrl + wheel and trackpad pinch (which arrives as ctrl+wheel) zoom around the pointer.
    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.01), { x: e.clientX, y: e.clientY });
    }, { passive: false });
    // Space + drag, or the middle button, pans.
    let space = false, pan = null;
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !typing(document.activeElement) && !e.repeat) { space = true; stage.classList.add('panning'); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { if (e.code === 'Space') { space = false; if (!pan && !hand) stage.classList.remove('panning'); } });
    stage.addEventListener('pointerdown', (e) => {
      if (!(space || hand || e.button === 1)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      pan = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
      stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing');
    }, true);
    stage.addEventListener('pointermove', (e) => {
      if (!pan) return;
      stage.scrollLeft = pan.l - (e.clientX - pan.x); stage.scrollTop = pan.t - (e.clientY - pan.y);
    });
    stage.addEventListener('pointerup', () => {
      if (!pan) return;
      pan = null; stage.classList.remove('grabbing'); if (!space && !hand) stage.classList.remove('panning');
    });
    addEventListener('resize', () => { if (fitting && !echoing) setScale(fitScale()); });
    new ResizeObserver(() => { if (fitting) setScale(fitScale()); pin(); }).observe(stage);
    fit();
  }

  // Tooltips: Figma's quick dark labels with the shortcut. Any [title] becomes one; the first shows after a short
  // delay, and moving to a neighbour while one is up shows it at once.
  function initTips() {
    const tip = document.createElement('div');
    tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    document.body.append(tip);
    let timer, warmUntil = 0, owner = null;
    const adopt = (root) => root.querySelectorAll('[title]').forEach((el) => {
      if (el.closest('.files, svg')) return;
      el.dataset.tip = el.title.replace(/\s*\((⌘|Ctrl)[^)]*\)$/, '');
      const key = el.title.match(/\(((?:⌘|Ctrl)[^)]*)\)$/);
      if (key) el.dataset.key = key[1];
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tip);
      el.removeAttribute('title');
    });
    adopt(document);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && adopt(n)))).observe(document.body, { childList: true, subtree: true });
    const show = (el) => {
      // A label already on screen needs no tooltip (layout names, say, unless a variation hides them).
      if (el.textContent.includes(el.dataset.tip) && parseFloat(getComputedStyle(el).fontSize) > 0) return;
      owner = el;
      tip.innerHTML = '';
      tip.append(el.dataset.tip);
      if (el.dataset.key) { const k = document.createElement('kbd'); k.textContent = el.dataset.key; tip.append(k); }
      tip.hidden = false;
      const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
      let y = r.bottom + 8, x = r.left + r.width / 2 - t.width / 2;
      if (y + t.height > innerHeight - 8) y = r.top - t.height - 8;
      tip.style.left = `${Math.min(Math.max(8, x), innerWidth - t.width - 8)}px`;
      tip.style.top = `${y}px`;
    };
    const hide = () => { clearTimeout(timer); if (owner) warmUntil = Date.now() + 600; owner = null; tip.hidden = true; };
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el || el === owner) return;
      clearTimeout(timer);
      if (Date.now() < warmUntil || owner) show(el); else timer = setTimeout(() => show(el), 450);
    });
    document.addEventListener('pointerout', (e) => { const el = e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hide(); });
    document.addEventListener('pointerdown', hide, true);
    addEventListener('scroll', hide, true);
  }

  // Number fields: each slider's value can be typed into, and dragging on the row's label scrubs it.
  function initNumbers() {
    document.querySelectorAll('.prop').forEach((row) => {
      const range = $('input[type=range]', row), out = $('output', row), label = $(':scope > label', row);
      if (!range || !out) return;
      const set = (v) => {
        range.value = Math.min(+range.max, Math.max(+range.min, Math.round(v)));
        range.dispatchEvent(new Event('input', { bubbles: true }));
      };
      out.tabIndex = 0; out.dataset.tip = 'Click to type a value';
      out.addEventListener('click', () => {
        const input = document.createElement('input');
        input.className = 'val val-edit'; input.value = range.value; input.inputMode = 'numeric';
        out.hidden = true; out.after(input); input.select();
        let closed = false; // Enter removes the input, which blurs it: close once
        const done = (commit) => { if (closed) return; closed = true; if (commit && input.value.trim() !== '' && !isNaN(+input.value)) set(+input.value); input.remove(); out.hidden = false; };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); input.value = +input.value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1); }
        });
        input.addEventListener('blur', () => done(true));
      });
      out.addEventListener('keydown', (e) => { if (e.key === 'Enter') out.click(); });
      if (!label) return;
      label.classList.add('scrub'); label.dataset.tip = 'Drag to adjust';
      label.addEventListener('pointerdown', (e) => {
        e.preventDefault(); label.setPointerCapture(e.pointerId);
        const x0 = e.clientX, v0 = +range.value, span = +range.max - +range.min;
        document.body.classList.add('scrubbing');
        const move = (ev) => set(v0 + ((ev.clientX - x0) / 200) * span * (ev.shiftKey ? 0.25 : 1));
        const up = () => { label.removeEventListener('pointermove', move); label.removeEventListener('pointerup', up); document.body.classList.remove('scrubbing'); };
        label.addEventListener('pointermove', move); label.addEventListener('pointerup', up);
      });
    });
  }

  // The shortcut sheet, opened with ? and closed with Esc or a click outside.
  function initSheet(shortcuts) {
    const all = [...shortcuts,
      ['Move tool', 'V'], ['Hand tool (pan)', 'H'],
      ['Zoom in / out', `${mod} + / ${mod} −`], ['Zoom with the pointer', `${mod} + scroll, or pinch`], ['Zoom to fit', '⇧ 1'],
      ['Actual size', '⇧ 0'], ['Pan', 'Space + drag'], ['Show this list', '?']];
    const sheet = document.createElement('div');
    sheet.className = 'sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Keyboard shortcuts');
    sheet.innerHTML = `<div class="sheet-card"><div class="sheet-head"><h2>Keyboard shortcuts</h2><button type="button" class="btn icon" aria-label="Close"><svg class="i" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <dl>${all.map(([what, keys]) => `<div><dt>${what}</dt><dd>${keys.split(' / ').map((k) => `<kbd>${k}</kbd>`).join('<span>/</span>')}</dd></div>`).join('')}</dl></div>`;
    document.body.append(sheet);
    const close = () => { sheet.hidden = true; };
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.sheet-head button')) close(); });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !sheet.hidden) { close(); return; }
      if (typing(document.activeElement)) return;
      if (e.key === '?') { sheet.hidden = !sheet.hidden; e.preventDefault(); }
      if (!stage) return;
      if (e.shiftKey && e.code === 'Digit1') { fit(); e.preventDefault(); }
      if (e.shiftKey && e.code === 'Digit0') { fitting = false; setScale(1); e.preventDefault(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { zoomBy(1.25); e.preventDefault(); }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { zoomBy(0.8); e.preventDefault(); }
    });
  }

  // A personal touch: the editor greets you by name. Asked once from the avatar, kept in this browser only.
  const NAME_KEY = 'ngn-studio-name';
  const AVATAR_COLORS = ['#e8a33d', '#4c9f70', '#5b7fd6', '#c2577a', '#8a6bd1', '#d9663b', '#2f9e9e'];
  const getName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
  function initAvatar() {
    const actions = $('.top-actions');
    if (!actions) return;
    const wrap = document.createElement('div');
    wrap.className = 'avatar-wrap';
    wrap.innerHTML = `<button type="button" class="avatar" id="avatar" aria-haspopup="dialog"></button>
      <form class="avatar-pop" id="avatarPop" hidden><label for="avatarName">What should we call you?</label>
      <input class="field" id="avatarName" autocomplete="given-name" placeholder="Your first name"><p class="note">Only saved in this browser.</p></form>`;
    actions.append(wrap);
    const btn = $('#avatar'), pop = $('#avatarPop'), input = $('#avatarName');
    const paint = () => {
      const n = getName();
      btn.textContent = n ? n.trim()[0].toUpperCase() : '';
      if (!n) btn.innerHTML = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
      btn.style.background = n ? AVATAR_COLORS[[...n].reduce((h, c) => h + c.charCodeAt(0), 0) % AVATAR_COLORS.length] : '';
      btn.classList.toggle('named', !!n);
      btn.dataset.tip = n ? `${n} (that’s you)` : 'Add your name';
      btn.setAttribute('aria-label', btn.dataset.tip);
    };
    btn.addEventListener('click', () => { pop.hidden = !pop.hidden; if (!pop.hidden) { input.value = getName(); input.focus(); } });
    pop.addEventListener('submit', (e) => {
      e.preventDefault();
      try { localStorage.setItem(NAME_KEY, input.value.trim()); } catch { /* private window */ }
      pop.hidden = true; paint(); dispatchEvent(new Event('studio:name'));
    });
    addEventListener('pointerdown', (e) => { if (!wrap.contains(e.target)) pop.hidden = true; });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });
    paint();
  }
  function greeting() {
    const h = new Date().getHours(), part = h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const n = getName().trim().split(/\s+/)[0];
    return n ? `${part}, ${n}` : part;
  }

  return {
    greeting,
    mod, typing,
    init({ artHeight, artWidth = 0, shortcuts = [], tools = [] }) {
      artH = artHeight; artW = artWidth;
      initAvatar();
      initZoom(tools);
      initNumbers();
      initSheet(shortcuts);
      initTips();
    },
    fit,
    get scale() { return scale; },
  };
})();
