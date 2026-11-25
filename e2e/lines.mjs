/** Tree geometry for the layout tests: small cards, as the tests lay the tree out with them. */
export const CW = 156, CH = 74;

/** Lay out the tree around one person in the page and return its cards and lines, plain data. */
export function layoutIn(page, persons, focus, { anc = 1, kin = 0, desc = 1, partners = true } = {}) {
  return page.evaluate(async ([persons, focus, anc, kin, desc, partners]) => {
    await app.Store.putMany(persons);
    Object.assign(app.ui, { ancGen: anc, kinDeg: kin, descGen: desc, showPartners: partners, cardSize: 'small' });
    app.setFocus(focus); location.hash = 'trad'; app.renderAll(true);
    app.setCardSize(true);
    const L = app.treeLayout(app.P(focus), partners);
    const id = (n) => n && n.data && n.data.p ? n.data.p.id : null;
    return {
      nodes: L.nodes.filter((n) => n.data.p).map((n) => ({ id: id(n), x: n.x, y: n.y })),
      links: L.links.map((l) => l.type === 'cp' ? { type: 'cp', x1: l.x1, x2: l.x2, y: l.y }
        : l.type === 'dot' ? { type: 'dot', x: l.x, y: l.y }
          : { type: l.type, s: { x: l.s.x, y: l.s.y, mid: !!l.s.mid }, t: { x: l.t.x, y: l.t.y, id: id(l.t) }, my: l.my }),
    };
  }, [persons, focus, anc, kin, desc, partners]);
}

/** The straight pieces a line is drawn with (the same path as the tree draws). */
function pieces(l) {
  if (l.type === 'cp') return [{ h: true, c: l.y, a: Math.min(l.x1, l.x2), b: Math.max(l.x1, l.x2) }];
  if (l.type !== 'desc') return [];
  const y1 = l.s.mid ? l.s.y : l.s.y + CH / 2, y2 = l.t.y - CH / 2;
  if (Math.abs(l.s.x - l.t.x) < 0.5) return [{ h: false, c: l.t.x, a: y1, b: y2 }];
  return [{ h: false, c: l.s.x, a: Math.min(y1, l.my), b: Math.max(y1, l.my) },
    { h: true, c: l.my, a: Math.min(l.s.x, l.t.x), b: Math.max(l.s.x, l.t.x) },
    { h: false, c: l.t.x, a: Math.min(l.my, y2), b: Math.max(l.my, y2) }];
}

/**
 * Lines of different families that cross or run on top of each other. Lines from the same dot (one
 * family) share their trunk, and a line may end on another (a child's line starts on the couple's line).
 */
export function crossings(L) {
  const E = 0.5, out = [];
  const segs = L.links.flatMap((l, i) => pieces(l).map((p) => ({ ...p, i, fam: l.type === 'desc' ? l.s.x + '|' + l.s.y : 'cp' + i, l })));
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = segs[i], q = segs[j]; if (p.fam === q.fam) continue;
    let bad = false;
    if (p.h !== q.h) { const [h, v] = p.h ? [p, q] : [q, p];
      bad = v.c > h.a + E && v.c < h.b - E && h.c > v.a + E && h.c < v.b - E; }
    else bad = Math.abs(p.c - q.c) < E && Math.min(p.b, q.b) - Math.max(p.a, q.a) > E;
    if (bad) out.push(JSON.stringify([p.l.t ? p.l.t.id : 'couple', q.l.t ? q.l.t.id : 'couple']));
  }
  return out;
}
