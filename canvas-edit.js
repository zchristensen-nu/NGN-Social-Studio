// Click text on the canvas to edit it in place. A contenteditable is laid over the drawn text in the same font,
// size, line height and wrap width; it mirrors into the panel editor on every keystroke and the canvas redraws
// underneath with that block hidden. Each page supplies its text regions in canvas units.
//
// attach({ canvas, wrap, root, W, regions, redraw }): canvas and wrap may be functions when the active artboard
// changes; root (default: the canvas) receives the pointer listeners, which only act on the active canvas.
// Region: { editor, x, y, w, h, size, lh, family, color, align }, plus optionally { box: { x, w }, anchor, min, max,
// onResize(w) } for a resizable wrap width: handles on the box edges set it, growing away from the anchored side.
// The page's draw() skips the block whose editor === CanvasEdit.editing, and must not redraw from inside
// a region lookup. Width is the drawn block's widest line, so the browser's greedy wrap reproduces the
// canvas lines exactly (balanced lines all fit inside it, and nothing extra does).
window.CanvasEdit = (() => {
  let opts, box = null, hover, current = null, frame = null;

  const cv = () => (typeof opts.canvas === 'function' ? opts.canvas() : opts.canvas);
  const wrap = () => (typeof opts.wrap === 'function' ? opts.wrap() : opts.wrap);
  const rect = () => cv().getBoundingClientRect();
  const scale = () => rect().width / opts.W;
  const point = (e) => { const r = rect(); return { x: (e.clientX - r.left) / scale(), y: (e.clientY - r.top) / scale() }; };
  const hit = (p) => opts.regions().find((r) => p.x >= r.x - 12 && p.x <= r.x + r.w + 12 && p.y >= r.y - 12 && p.y <= r.y + r.h + 12);

  // Position an element over a region, in CSS pixels relative to the wrapper.
  function cover(el, r, pad = 0) {
    if (el.parentNode !== wrap()) wrap().append(el);
    const s = scale(), c = rect(), w = wrap().getBoundingClientRect();
    el.style.left = `${c.left - w.left + (r.x - pad) * s}px`;
    el.style.top = `${c.top - w.top + (r.y - pad) * s}px`;
    el.style.width = `${(r.w + pad * 2) * s}px`;
    el.style.height = `${(r.h + pad * 2) * s}px`;
  }

  function place() {
    const r = opts.regions().find((x) => x.editor === current);
    if (!box || !r) return;
    const s = scale();
    cover(box, { ...r, w: r.w + 2 }); // 2 canvas px of slack for sub-pixel measuring differences
    box.style.height = 'auto';
    box.style.minHeight = `${r.lh * s}px`;
    box.style.font = `400 ${r.size * s}px/${r.lh * s}px ${r.family}`;
    box.style.color = r.color;
    box.style.textAlign = r.align || 'left';
    if (frame) cover(frame, { ...r, x: r.box.x, w: r.box.w });
  }

  // Wrap-width handles: only the edges that can move given the anchor (a left-anchored block grows to the right).
  function addFrame(r) {
    frame = document.createElement('div');
    frame.className = 'wrap-frame';
    const sides = r.anchor === 'left' ? ['right'] : r.anchor === 'right' ? ['left'] : ['left', 'right'];
    for (const side of sides) {
      const h = document.createElement('div');
      h.className = `wrap-handle ${side}`;
      h.title = 'Drag to change the text width';
      // Keep focus in the editor: pressing a non-editable element would otherwise blur it and end editing.
      h.addEventListener('mousedown', (e) => e.preventDefault());
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        h.setPointerCapture(e.pointerId);
        const r0 = opts.regions().find((x) => x.editor === current), x0 = e.clientX, w0 = r0.box.w;
        const k = (side === 'right' ? 1 : -1) * (r0.anchor === 'center' ? 2 : 1);
        const move = (ev) => {
          const w = Math.round(Math.min(r0.max, Math.max(r0.min, w0 + (k * (ev.clientX - x0)) / scale())));
          r0.onResize(w); opts.redraw(); place();
        };
        const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); box?.focus(); };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
      });
      frame.append(h);
    }
    wrap().append(frame);
  }

  function start(r) {
    current = r.editor;
    hover.hidden = true;
    box = document.createElement('div');
    box.className = 'canvas-editor';
    box.contentEditable = 'true';
    box.spellcheck = false;
    box.innerHTML = r.editor.innerHTML;
    wrap().append(box);
    if (r.onResize) addFrame(r);
    opts.redraw();
    place();
    box.focus();
    const sel = getSelection(), range = document.createRange();
    range.selectNodeContents(box); range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);
    box.addEventListener('input', () => { current.innerHTML = box.innerHTML; opts.redraw(); place(); });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.blur(); });
    box.addEventListener('blur', stop);
  }

  function stop() {
    if (!box) return;
    box.removeEventListener('blur', stop);
    box.remove(); box = null; current = null;
    frame?.remove(); frame = null;
    opts.redraw();
  }

  return {
    attach(o) {
      opts = o;
      hover = document.createElement('div');
      hover.className = 'canvas-hover'; hover.hidden = true;
      const root = o.root || cv();
      root.addEventListener('pointermove', (e) => {
        const r = e.target === cv() && !box && !e.buttons && hit(point(e));
        cv().style.cursor = r ? 'text' : '';
        hover.hidden = !r;
        if (r) cover(hover, r, 8);
      });
      root.addEventListener('pointerleave', () => { hover.hidden = true; });
      root.addEventListener('click', (e) => { if (e.target !== cv()) return; const r = hit(point(e)); if (r) start(r); });
      addEventListener('resize', place);
    },
    /** True when a canvas point is on editable text, so photo click/drag handlers can stand aside. */
    hit: (p) => !!(opts && hit(p)),
    stop,
    get editing() { return current; },
    /** True when the node sits inside the on-canvas editor (for the panel's B / I buttons). */
    owns: (node) => !!box && box.contains(node),
  };
})();
