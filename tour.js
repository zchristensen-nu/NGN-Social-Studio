// Onboarding: a spotlight on one part of the tool at a time with a tooltip beside it. Runs once per tool on the
// first visit (remembered in localStorage) and again from the ? button in the bottom-left corner.
// Tour.init(key, steps): steps are { target: CSS selector, title, body, side: 'right' | 'left' | 'bottom' | 'top' }.
// Calling init again (a page with several views) swaps the steps the ? button replays and runs them once if unseen.
// Steps whose target isn't on screen are skipped.
window.Tour = (() => {
  let steps = [], i = 0, key = '', ring, tip, onKey, help;

  const seen = () => { try { return localStorage.getItem(key) === 'done'; } catch { return false; } };
  const remember = () => { try { localStorage.setItem(key, 'done'); } catch { /* private window: show again next time */ } };

  function show(n) {
    i = n;
    const step = steps[i], el = document.querySelector(step.target);
    if (!el || !el.getClientRects().length) { if (i < steps.length - 1) show(i + 1); else end(); return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tip.querySelector('.tour-count').textContent = `${i + 1} of ${steps.length}`;
    tip.querySelector('h3').textContent = step.title;
    tip.querySelector('p').textContent = step.body;
    tip.querySelector('[data-act=back]').hidden = i === 0;
    tip.querySelector('[data-act=next]').textContent = i === steps.length - 1 ? 'Done' : 'Next';
    position();
    tip.querySelector('[data-act=next]').focus({ preventScroll: true });
  }

  function position() {
    const step = steps[i], el = step && document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect(), pad = 6, gap = 14;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const tw = tip.offsetWidth, th = tip.offsetHeight, vw = innerWidth, vh = innerHeight;
    let side = step.side || 'bottom';
    // Flip when the preferred side has no room (narrow screens, stacked panels).
    const room = { right: vw - r.right, left: r.left, bottom: vh - r.bottom, top: r.top };
    const need = side === 'left' || side === 'right' ? tw + gap + 8 : th + gap + 8;
    if (room[side] < need) side = Object.keys(room).sort((a, b) => room[b] - room[a])[0];
    let x, y;
    if (side === 'right') { x = r.right + gap; y = r.top + r.height / 2 - th / 2; }
    if (side === 'left') { x = r.left - gap - tw; y = r.top + r.height / 2 - th / 2; }
    if (side === 'bottom') { x = r.left + r.width / 2 - tw / 2; y = r.bottom + gap; }
    if (side === 'top') { x = r.left + r.width / 2 - tw / 2; y = r.top - gap - th; }
    x = Math.min(Math.max(8, x), vw - tw - 8);
    y = Math.min(Math.max(8, y), vh - th - 8);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
    tip.dataset.side = side;
    // Point the arrow at the target's center, clamped to the card.
    const ax = Math.min(Math.max(16, r.left + r.width / 2 - x), tw - 16);
    const ay = Math.min(Math.max(16, r.top + r.height / 2 - y), th - 16);
    tip.style.setProperty('--ax', `${ax}px`); tip.style.setProperty('--ay', `${ay}px`);
  }

  function start() {
    if (ring) end(false);
    ring = document.createElement('div'); ring.className = 'tour-ring';
    tip = document.createElement('div'); tip.className = 'tour-tip'; tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-live', 'polite');
    tip.innerHTML = `<div class="tour-head"><span class="tour-count"></span><button type="button" class="tour-x" data-act="skip" aria-label="Close tour">
      <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <h3></h3><p></p>
      <div class="tour-actions"><button type="button" data-act="skip" class="tour-skip">Skip tour</button><span></span>
      <button type="button" data-act="back" class="btn outline">Back</button><button type="button" data-act="next" class="btn primary"></button></div>`;
    tip.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'next') i < steps.length - 1 ? show(i + 1) : end();
      if (act === 'back') show(i - 1);
      if (act === 'skip') end();
    });
    document.body.append(ring, tip);
    onKey = (e) => {
      if (e.key === 'Escape') end();
      if (e.key === 'ArrowRight') i < steps.length - 1 ? show(i + 1) : end();
      if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
    };
    addEventListener('keydown', onKey);
    addEventListener('resize', position);
    addEventListener('scroll', position, true);
    show(0);
  }

  function end(save = true) {
    ring?.remove(); tip?.remove(); ring = tip = null;
    removeEventListener('keydown', onKey);
    removeEventListener('resize', position);
    removeEventListener('scroll', position, true);
    if (save) remember();
  }

  return {
    init(k, s) {
      if (ring) end(false);
      key = `ngn-studio-tour:${k}`; steps = s;
      if (!help) {
        help = document.createElement('button');
        help.type = 'button'; help.className = 'help-btn'; help.title = 'Show the tour'; help.setAttribute('aria-label', 'Show the tour');
        help.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg>';
        help.addEventListener('click', start);
        document.body.append(help);
      }
      const k0 = key;
      if (!seen()) setTimeout(() => { if (key === k0 && !ring) start(); }, 600); // let the canvas and fonts settle so the spotlight lands on final positions
    },
    start,
  };
})();
