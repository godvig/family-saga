import { test, expect, fresh } from './fixtures.mjs';
import { family, partnerFamily } from './family.mjs';
import { CW, CG, closeVerticals, crossings, jogs, layoutIn } from './lines.mjs';

/* Classic tree with several partners (synthetic people only, see partnerFamily). */
const fam = partnerFamily();
async function lay(page, focus, opts) { await fresh(page); return layoutIn(page, fam, focus, opts); }
const x = (L, id) => { const n = L.nodes.find((n) => n.id === id); return n ? n.x : undefined; };
const ids = (L) => L.nodes.map((n) => n.id);
const lineTo = (L, id) => L.links.find((l) => l.type === 'desc' && l.t.id === id);

test("the focus person's partners stand in the order of their oldest child together, from the left", async ({ page }) => {
  const L = await lay(page, 'Mannen');
  // Tidig (b. 1968, children from 1990) before Sen (b. 1958, child 2005); Barnlös (b. 1950, no children) last
  expect(x(L, 'Tidig')).toBeLessThan(x(L, 'Mannen'));
  expect(x(L, 'Mannen')).toBeLessThan(x(L, 'Sen'));
  expect(x(L, 'Sen')).toBeLessThan(x(L, 'Barnlös'));
  expect(crossings(L)).toEqual([]);
});

test('partners in a side branch and an ancestor\'s other partners follow the same order', async ({ page }) => {
  // Mannen as the sister's brother, in a side branch
  let L = await lay(page, 'Syster', { kin: 1 });
  expect(x(L, 'Tidig')).toBeLessThan(x(L, 'Mannen'));
  expect(x(L, 'Mannen')).toBeLessThan(x(L, 'Sen'));
  expect(x(L, 'Sen')).toBeLessThan(x(L, 'Barnlös'));
  expect(crossings(L)).toEqual([]);
  // Mannen as a father: Sen beside him as the mother, his other partners outwards on his side,
  // the one with the oldest child together nearest
  L = await lay(page, 'SenBarn');
  expect(x(L, 'Mannen')).toBeLessThan(x(L, 'Sen'));
  expect(x(L, 'Tidig')).toBeLessThan(x(L, 'Mannen'));
  expect(x(L, 'Barnlös')).toBeLessThan(x(L, 'Tidig'));
  expect(x(L, 'Annan')).toBeGreaterThan(x(L, 'Sen'));
  expect(crossings(L)).toEqual([]);
});

test('a lone child hangs from its parents\' dot without a short jog; partners stay one step apart', async ({ page }) => {
  // under a couple among the descendants: the partners do not move apart to put the child below the dot;
  // the child's line is straight or steps at least a third of a card to the side
  let L = await lay(page, 'Mannen');
  const dot = (x(L, 'Mannen') + x(L, 'Sen')) / 2;
  expect(x(L, 'Sen') - x(L, 'Mannen')).toBe(CW + CG);
  expect(lineTo(L, 'SenBarn').s).toMatchObject({ x: dot, mid: true });
  const off = Math.abs(x(L, 'SenBarn') - dot);
  expect(off === 0 || off >= Math.round(CW / 3)).toBe(true);
  expect(jogs(L)).toEqual([]); expect(closeVerticals(L)).toEqual([]);
  // the focus person when brothers and sisters are not shown, with partners pulling the parents' cards aside
  L = await lay(page, 'SenBarn', { kin: 0 });
  const up = L.links.find((l) => l.type === 'desc' && l.t.x === 0 && l.t.y === 0 && l.s.y < 0); // the focus card is drawn at 0, 0
  expect(up.s).toMatchObject({ x: 0, mid: true });
  expect((x(L, 'Mannen') + x(L, 'Sen')) / 2).toBe(0);
  // and an ancestor below their own parents
  L = await lay(page, 'SenBarn', { anc: 2, kin: 0 });
  expect(lineTo(L, 'Mannen').s.x).toBe(x(L, 'Mannen'));
  expect(crossings(L)).toEqual([]);
  // drawn as one vertical stroke
  await page.evaluate(() => { app.ui.treeKey = null; app.renderAll(true); });
  const d = await page.locator('#treeSvg path.link').evaluateAll((ps) => ps.map((p) => p.getAttribute('d')));
  expect(d).toContain(`M0,${-130 + 0}V${-74 / 2}`);
});

test('brothers and sisters still hang from one line across, centred under their parents', async ({ page }) => {
  const L = await lay(page, 'Mannen');
  const dot = (x(L, 'Tidig') + x(L, 'Mannen')) / 2, a = x(L, 'TidigBarn1'), b = x(L, 'TidigBarn2');
  expect((a + b) / 2).toBe(dot);
  expect(b - a).toBe(CW + 20);
  for (const id of ['TidigBarn1', 'TidigBarn2']) { const l = lineTo(L, id); expect(l.s).toMatchObject({ x: dot, mid: true }); expect(l.t.x).not.toBe(dot); }
});

test("the descendants are the person's own children: a partner's children with someone else are not drawn", async ({ page }) => {
  let L = await lay(page, 'Tidig');
  expect(ids(L)).toEqual(expect.arrayContaining(['TidigBarn1', 'TidigBarn2', 'Mannen']));
  expect(ids(L)).not.toContain('SenBarn');
  L = await lay(page, 'Sen');
  expect(ids(L)).toEqual(expect.arrayContaining(['SenBarn', 'AnnanBarn']));
  for (const id of ['TidigBarn1', 'TidigBarn2']) expect(ids(L)).not.toContain(id);
  expect(crossings(L)).toEqual([]);
  // Mannen: all his children, each under the partner they have together
  L = await lay(page, 'Mannen');
  expect(ids(L)).not.toContain('AnnanBarn');
  for (const id of ['TidigBarn1', 'TidigBarn2']) expect(lineTo(L, id).s.x).toBe((x(L, 'Tidig') + x(L, 'Mannen')) / 2);
  expect(lineTo(L, 'SenBarn').s.x).toBe((x(L, 'Sen') + x(L, 'Mannen')) / 2);
  // the same in a side branch, and for an ancestor's partner
  L = await lay(page, 'Syster', { kin: 1 });
  expect(ids(L)).toEqual(expect.arrayContaining(['TidigBarn1', 'TidigBarn2', 'SenBarn']));
  expect(ids(L)).not.toContain('AnnanBarn');
  expect(crossings(L)).toEqual([]);
  L = await lay(page, 'TidigBarn1', { kin: 1 });
  expect(ids(L)).toContain('SenBarn'); // a half-sister through the father, alone, from his and Sen's dot
  expect(lineTo(L, 'SenBarn').s).toMatchObject({ x: (x(L, 'Mannen') + x(L, 'Sen')) / 2, mid: true });
  expect(Math.abs(x(L, 'Mannen') - x(L, 'Sen'))).toBe(CW + CG); // Sen stays next to Mannen; the line steps aside instead
  expect(jogs(L)).toEqual([]); expect(closeVerticals(L)).toEqual([]);
  expect(ids(L)).not.toContain('AnnanBarn');
  expect(crossings(L)).toEqual([]);
});

test('no lines cross in the large synthetic family', async ({ page }) => {
  const f = family();
  for (const o of [{ anc: 3, kin: 3, desc: 1, partners: false }, { anc: 3, kin: 3, desc: 1 }, { anc: 3, kin: 2 }, { anc: 2, kin: 2, desc: 2 }]) {
    await fresh(page);
    const L = await layoutIn(page, f.persons, f.me, o);
    expect(crossings(L), JSON.stringify(o)).toEqual([]);
  }
});
