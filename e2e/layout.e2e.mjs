import { test, expect, fresh } from './fixtures.mjs';
import { family } from './family.mjs';

/** Lay out the synthetic family around "Jag" and return every card with its place. */
async function layout(page, { anc = 3, kin = 3, desc = 1, partners = false } = {}) {
  const fam = family();
  await fresh(page);
  return page.evaluate(async ([fam, anc, kin, desc, partners]) => {
    await app.Store.putMany(fam.persons);
    Object.assign(app.ui, { ancGen: anc, kinDeg: kin, descGen: desc, showPartners: partners, cardSize: 'small' });
    app.setFocus(fam.me); location.hash = 'trad'; app.renderAll(true);
    app.setCardSize(true);
    const L = app.treeLayout(app.P(fam.me), partners);
    return { cw: 156, nodes: L.nodes.filter((n) => n.data.p).map((n) => ({ id: n.data.p.id, name: n.data.p.given, x: n.x, y: n.y, more: n.data.more || 0 })) };
  }, [fam, anc, kin, desc, partners]);
}
const at = (L, p) => L.nodes.find((n) => n.id === p.id);
const xs = (L, ps) => ps.map((p) => at(L, p)).filter(Boolean).map((n) => n.x);

test('no two cards overlap', async ({ page }) => {
  for (const o of [{}, { partners: true }, { anc: 3, kin: 2 }, { anc: 2, kin: 2, desc: 2 }]) {
    const L = await layout(page, o);
    const rows = {}; for (const n of L.nodes) (rows[Math.round(n.y)] = rows[Math.round(n.y)] || []).push(n);
    for (const row of Object.values(rows)) { row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) expect(row[i].x - row[i - 1].x, `${row[i - 1].name} / ${row[i].name}`).toBeGreaterThanOrEqual(L.cw); }
    expect(new Set(L.nodes.map((n) => n.id)).size).toBe(L.nodes.length); // nobody twice
  }
});

test('brothers and sisters stand next to their own: his to the left, hers to the right', async ({ page }) => {
  const L = await layout(page); const { ids } = family();
  const step = L.cw + 20;
  // farmor and morfar are on the inner lines: their siblings stand shoulder to shoulder with them
  expect(xs(L, ids.fmS).sort((a, b) => a - b)).toEqual([1, 2, 3].map((i) => at(L, ids.FM).x + i * step));
  expect(xs(L, ids.mfS).sort((a, b) => a - b)).toEqual([2, 1].map((i) => at(L, ids.MF).x - i * step));
  // farfar's stand to his left, mormor's to her right, the nearest one shoulder to shoulder
  expect(Math.max(...xs(L, ids.ffS))).toBe(at(L, ids.FF).x - step);
  expect(Math.min(...xs(L, ids.mmS))).toBe(at(L, ids.MM).x + step);
  for (const x of xs(L, ids.faS)) expect(x).toBeLessThan(at(L, ids.Fa).x);
  for (const x of xs(L, ids.moS)) expect(x).toBeGreaterThan(at(L, ids.Mo).x);
});

test("the father's side stays left of the mother's side in every generation", async ({ page }) => {
  const L = await layout(page); const { ids } = family();
  // farmor's family is never further out than farfar's, and never beyond morfar's
  for (const x of xs(L, ids.fmS)) { expect(x).toBeGreaterThan(at(L, ids.FF).x); expect(x).toBeLessThan(Math.min(...xs(L, ids.mfS), at(L, ids.MF).x)); }
  expect(Math.max(...xs(L, [...ids.ffS, ids.FF, ids.FM, ...ids.fmS]))).toBeLessThan(Math.min(...xs(L, [...ids.mfS, ids.MF, ids.MM, ...ids.mmS])));
  expect(Math.max(...xs(L, [...ids.faS, ids.Fa, ...ids.cousinsF]))).toBeLessThan(Math.min(...xs(L, [ids.Mo, ...ids.moS, ...ids.cousinsM])));
});

test('branches on the inner lines are counted, not drawn; lone siblings stand nearest', async ({ page }) => {
  const L = await layout(page); const { ids } = family();
  expect(at(L, ids.fmS[1]).more).toBe(3); // two children and a grandchild
  expect(at(L, ids.fmS[0]).more).toBe(0);
  for (const p of ids.fm1) expect(at(L, p)).toBeUndefined();
  // farfar's brothers and sisters: the one without children nearest, the widest branch furthest out
  const [wide, lone, small] = ids.ffS.map((p) => at(L, p).x);
  expect(lone).toBeGreaterThan(small); expect(small).toBeGreaterThan(wide);
});
