/** Tree geometry for the layout tests: small cards, as the tests lay the tree out with them. */
export const CW = 156, CH = 74, CG = 14, ROW = CH + 56;

/** The tree's cards and lines as plain data (runs in the page, where `app` is). */
export function layoutData(focus, partners) {
  const L = app.treeLayout(app.P(focus), partners);
  const id = (n) => n && n.data && n.data.p ? n.data.p.id : null;
  return {
    nodes: L.nodes.filter((n) => n.data.p).map((n) => ({ id: id(n), x: n.x, y: n.y })),
    links: L.links.map((l) => l.type === 'cp' ? { type: 'cp', x1: l.x1, x2: l.x2, y: l.y, anc: !!l.anc, fam: l.fam || 0 }
      : l.type === 'arc' ? { type: 'arc', x1: l.x1, x2: l.x2, y: l.y, h: l.h, fam: l.fam || 0, a: l.a, b: l.b }
        : l.type === 'dot' ? { type: 'dot', x: l.x, y: l.y, fam: l.fam || 0 }
          : { type: l.type, s: { x: l.s.x, y: l.s.y, mid: !!l.s.mid, top: l.s.arc ? l.s.arc.h : undefined }, t: { x: l.t.x, y: l.t.y, id: id(l.t) }, my: l.my, fam: l.fam || 0 }),
  };
}

/** Lay out the tree around one person in the page and return its cards and lines, plain data. */
export function layoutIn(page, persons, focus, { anc = 1, kin = 0, desc = 1, partners = true } = {}) {
  return page.evaluate(async ([persons, focus, anc, kin, desc, partners, fn]) => {
    if (persons) await app.Store.putMany(persons);
    Object.assign(app.ui, { ancGen: anc, kinDeg: kin, descGen: desc, showPartners: partners, cardSize: 'small' });
    app.setFocus(focus); location.hash = 'trad'; app.renderAll(true);
    app.setCardSize(true);
    return (0, eval)('(' + fn + ')')(focus, partners);
  }, [persons, focus, anc, kin, desc, partners, layoutData.toString()]);
}

/** The straight pieces a line is drawn with (the same path as the tree draws). */
function pieces(l) {
  if (l.type === 'cp') return [{ h: true, c: l.y, a: Math.min(l.x1, l.x2), b: Math.max(l.x1, l.x2) }];
  if (l.type === 'arc') return [{ h: false, c: l.x1, a: l.h, b: l.y }, { h: true, c: l.h, a: Math.min(l.x1, l.x2), b: Math.max(l.x1, l.x2) }, { h: false, c: l.x2, a: l.h, b: l.y }];
  if (l.type !== 'desc') return [];
  const y1 = l.s.top != null ? l.s.top : l.s.mid ? l.s.y : l.s.y + CH / 2, y2 = l.t.y - CH / 2;
  if (Math.abs(l.s.x - l.t.x) < 0.5) return [{ h: false, c: l.t.x, a: Math.min(y1, y2), b: Math.max(y1, y2) }];
  return [{ h: false, c: l.s.x, a: Math.min(y1, l.my), b: Math.max(y1, l.my) },
    { h: true, c: l.my, a: Math.min(l.s.x, l.t.x), b: Math.max(l.s.x, l.t.x) },
    { h: false, c: l.t.x, a: Math.min(l.my, y2), b: Math.max(l.my, y2) }];
}
const famOf = (l, i) => l.type === 'desc' ? l.s.x + '|' + l.s.y : 'cp' + i;
const segments = (L) => L.links.flatMap((l, i) => pieces(l).map((p) => ({ ...p, i, fam: famOf(l, i), l })));
const name = (l) => l.t ? l.t.id : l.type === 'arc' ? 'arc ' + l.a + '–' + l.b : 'couple';

/**
 * Lines of different families that cross or run on top of each other. Lines from the same dot (one
 * family) share their trunk, and a line may end on another (a child's line starts on the couple's line).
 */
export function crossings(L) {
  const E = 0.5, out = [];
  const segs = segments(L);
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]; if (p.fam === q.fam) continue;
    let bad = false;
    if (p.h !== q.h) { const [h, v] = p.h ? [p, q] : [q, p];
      bad = v.c > h.a + E && v.c < h.b - E && h.c > v.a + E && h.c < v.b - E; }
    else bad = Math.abs(p.c - q.c) < E && Math.min(p.b, q.b) - Math.max(p.a, q.a) > E;
    if (bad) out.push(JSON.stringify([name(p.l), name(q.l)]));
  }
  return out;
}

/** Cards that a line runs through (a line may only touch the cards it starts or ends at, on their edge). */
export function underLines(L) {
  const E = 0.5, out = [];
  for (const s of segments(L)) for (const n of L.nodes) {
    const x0 = n.x - CW / 2 + E, x1 = n.x + CW / 2 - E, y0 = n.y - CH / 2 + E, y1 = n.y + CH / 2 - E;
    const hit = s.h ? s.c > y0 && s.c < y1 && s.b > x0 && s.a < x1 : s.c > x0 && s.c < x1 && s.b > y0 && s.a < y1;
    if (hit) out.push(n.id + ' under ' + name(s.l));
  }
  return out;
}

/** Cards on the same row closer than a card's width (they would overlap). */
export function overlaps(L) {
  const out = [], rows = {};
  for (const n of L.nodes) (rows[Math.round(n.y)] = rows[Math.round(n.y)] || []).push(n);
  for (const row of Object.values(rows)) { row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) if (row[i].x - row[i - 1].x < CW - 0.5) out.push(row[i - 1].id + ' / ' + row[i].id); }
  return out;
}

/**
 * Upright lines of different families in the same gap between two rows that stand closer than `d` px
 * (exactly in line included: one family's line would seem to go on into the other's).
 */
export function closeVerticals(L, d = 14) {
  const out = [], vs = segments(L).filter((s) => !s.h && s.b - s.a > 0.5);
  const gap = (s) => Math.floor(((s.a + s.b) / 2) / ROW);
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    const p = vs[i], q = vs[j]; if (p.fam === q.fam || gap(p) !== gap(q)) continue;
    if (Math.abs(p.c - q.c) < d) out.push(JSON.stringify([name(p.l), name(q.l), Math.round(Math.abs(p.c - q.c))]));
  }
  return out;
}

/** Lines from a dot that step sideways by less than `t` px on the way down to the child (a short jog). */
export function jogs(L, t = CW / 3) {
  return L.links.filter((l) => l.type === 'desc' && Math.abs(l.s.x - l.t.x) > 0.5 && Math.abs(l.s.x - l.t.x) < t)
    .map((l) => l.t.id + ' ' + Math.round(Math.abs(l.s.x - l.t.x)));
}

/** Partner lines (not an ancestor couple, whose cards stand over their own ancestors) longer than the gap between two neighbouring cards. */
export function longCouples(L) {
  return L.links.filter((l) => l.type === 'cp' && !l.anc && Math.abs(l.x2 - l.x1) > CG + 0.5)
    .map((l) => Math.round(Math.abs(l.x2 - l.x1)) + ' px @' + Math.round(l.y));
}

/** Width of the tree from the outer edge of the leftmost card to the outer edge of the rightmost. */
export const width = (L) => Math.max(...L.nodes.map((n) => n.x)) - Math.min(...L.nodes.map((n) => n.x)) + CW;
