// The text quote card (Figma "car data - quote"), drawn onto any 1080×1350 canvas context, for the social editor’s
// text-quote and end-slide artboards.
// TextQuoteCard.draw(ctx, quoteEl, attrEl, editing) -> { regions, fits }: regions feed CanvasEdit; the block whose
// editor === editing is left for the on-canvas editor to show.
window.TextQuoteCard = (() => {
  // Frame spec from the Figma "car data - quote" template: 1080×1350 on cream, a column of brand arrows on the right,
  // Inter 48/160% quote and 40/160% attribution, 80px left inset, centered in an 872px-tall block with a 64px gap.
  const W = 1080, H = 1350, X = 80, BLOCK_TOP = 239, BLOCK_H = 872, GAP = 64;
  const Q = { size: 48, lh: 76.8, maxW: 764, color: 'rgba(7,7,7,.964)' };
  const A = { size: 40, lh: 64, maxW: 728, color: '#000' };
  const BG = '#FFFCF9', ARROW = '#F9F6F0';
  const FAMILY = '"Inter", system-ui, sans-serif';

  // The arrow from badge-ngn.svg, at 179px squares in two staggered columns (positions from the Figma vectors).
  const ARROW_PATH = new Path2D('M240.67 1.01L240.67 8.21L264.23 8.21L243.23 29.21L248.32 34.31L269.5 13.12L269.5 37.04L276.7 37.04L276.7 1.01Z');
  const ARROW_SIZE = 179, ARROWS = [[839, 48], [659, 227], [839, 407], [659, 586], [839, 764], [659, 943], [839, 1123]];

  // rich text -> runs, with curly quotes (same approach as the other tools)
  function runsFrom(el) {
    const runs = [];
    (function walk(node, b, i) {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { runs.push({ text: n.nodeValue, b, i }); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (tag === 'BR') { runs.push({ text: '\n', b, i }); continue; }
        const st = n.style || {};
        const nb = b || tag === 'B' || tag === 'STRONG' || parseInt(st.fontWeight) >= 600 || st.fontWeight === 'bold';
        const ni = i || tag === 'I' || tag === 'EM' || st.fontStyle === 'italic';
        if ((tag === 'DIV' || tag === 'P') && runs.length) runs.push({ text: '\n', b, i });
        walk(n, nb, ni);
      }
    })(el, false, false);
    let prev = ' ';
    for (const r of runs) {
      r.text = r.text.replace(/\u00a0/g, ' ').replace(/["']/g, (q, idx, s) => {
        const open = /[\s(\[\u2014\u2013-]/.test(idx ? s[idx - 1] : prev);
        return q === '"' ? (open ? '\u201c' : '\u201d') : (open ? '\u2018' : '\u2019');
      });
      if (r.text) prev = r.text[r.text.length - 1];
    }
    const out = runs.filter((r) => r.text);
    if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ''); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, ''); }
    return out.filter((r) => r.text);
  }
  function quoteRuns(quoteEl) {
    const runs = runsFrom(quoteEl);
    if (!runs.length) return runs;
    if (!/^\u201c/.test(runs[0].text)) runs[0].text = '\u201c' + runs[0].text;
    if (!/\u201d$/.test(runs[runs.length - 1].text)) runs[runs.length - 1].text += '\u201d';
    return runs;
  }

  const fontFor = (r, size) => `${r.i ? 'italic ' : ''}${r.b ? 700 : 400} ${size}px ${FAMILY}`;

  function layout(ctx, runs, size, maxW) {
    const words = [];
    let cur = [];
    const flush = () => { if (cur.length) words.push(cur); cur = []; };
    for (const r of runs) {
      for (const part of r.text.split(/(\n|[ \t]+)/)) {
        if (!part) continue;
        if (part === '\n') { flush(); words.push('\n'); }
        else if (/^[ \t]+$/.test(part)) flush();
        else { ctx.font = fontFor(r, size); cur.push({ text: part, font: ctx.font, w: ctx.measureText(part).width }); }
      }
    }
    flush();
    ctx.font = fontFor({}, size);
    const space = ctx.measureText(' ').width;
    const lines = [{ words: [], w: 0 }];
    for (const word of words) {
      if (word === '\n') { lines.push({ words: [], w: 0 }); continue; }
      const ww = word.reduce((s, seg) => s + seg.w, 0);
      const line = lines[lines.length - 1];
      const need = line.words.length ? line.w + space + ww : ww;
      if (line.words.length && need > maxW) lines.push({ words: [word], w: ww });
      else { line.words.push(word); line.w = need; }
    }
    return { lines, space };
  }

  // Like CSS text-wrap: balance: the narrowest width that keeps the greedy line count, so no orphans.
  function balance(ctx, runs, size, maxW) {
    const greedy = layout(ctx, runs, size, maxW);
    const n = greedy.lines.length;
    if (n < 2) return greedy;
    let lo = maxW / 2, hi = maxW, best = greedy;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2, b = layout(ctx, runs, size, mid);
      if (b.lines.length <= n) { best = b; hi = mid; } else lo = mid;
    }
    return best;
  }

  function drawBlock(ctx, block, spec, top) {
    ctx.fillStyle = spec.color; ctx.textBaseline = 'alphabetic';
    ctx.font = fontFor({}, spec.size);
    const m = ctx.measureText('Hg');
    const asc = m.fontBoundingBoxAscent ?? spec.size * 0.8, desc = m.fontBoundingBoxDescent ?? spec.size * 0.2;
    block.lines.forEach((line, n) => {
      const y = top + n * spec.lh + (spec.lh - (asc + desc)) / 2 + asc;
      let cx = X;
      line.words.forEach((word, wi) => {
        if (wi) cx += block.space;
        for (const seg of word) { ctx.font = seg.font; ctx.fillText(seg.text, cx, y); cx += seg.w; }
      });
    });
  }

  function background(ctx) {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ARROW;
    const s = ARROW_SIZE / 36.03;
    for (const [ax, ay] of ARROWS) {
      ctx.save(); ctx.translate(ax, ay); ctx.scale(s, s); ctx.translate(-240.67, -1.01); ctx.fill(ARROW_PATH); ctx.restore();
    }
  }

  // The closing carousel slide: same cream card, "Link in bio for the full story:" over the site name in bold.
  // Its top (543) is measured from the posted slides, where the pair sits a little above center.
  function drawEnd(ctx) {
    background(ctx);
    const block = (text, b) => ({ lines: [{ words: [[{ text, font: fontFor({ b }, Q.size), w: 0 }]], w: 0 }], space: 0 });
    drawBlock(ctx, block('Link in bio for the full story:', false), Q, 543);
    drawBlock(ctx, block('news.northeastern.edu', true), Q, 543 + Q.lh);
  }

  function draw(ctx, quoteEl, attrEl, editing) {
    background(ctx);
    const q = balance(ctx, quoteRuns(quoteEl), Q.size, Q.maxW);
    const attr = runsFrom(attrEl);
    const a = attr.length ? balance(ctx, attr, A.size, A.maxW) : null;
    const qh = q.lines.length * Q.lh, ah = a ? GAP + a.lines.length * A.lh : 0;
    const top = BLOCK_TOP + (BLOCK_H - qh - ah) / 2;
    const widest = (b) => Math.max(...b.lines.map((l) => l.w));
    const regions = [{ editor: quoteEl, x: X, y: top, w: widest(q), h: qh, size: Q.size, lh: Q.lh, family: FAMILY, color: Q.color }];
    if (a) regions.push({ editor: attrEl, x: X, y: top + qh + GAP, w: widest(a), h: ah - GAP, size: A.size, lh: A.lh, family: FAMILY, color: A.color });
    if (editing !== quoteEl) drawBlock(ctx, q, Q, top);
    if (a && editing !== attrEl) drawBlock(ctx, a, A, top + qh + GAP);
    return { regions, fits: qh + ah <= BLOCK_H };
  }

  /** Resolves once Inter's weights are ready, so the first draw measures with the real font. */
  const ready = () => Promise.all(['400', '700', 'italic 400', 'italic 700'].map((v) => document.fonts.load(`${v} 48px Inter`)));
  return { W, H, draw, drawEnd, ready };
})();
