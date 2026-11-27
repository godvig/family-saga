import { test, expect, fresh, example } from './fixtures.mjs';
import { partnerFamily, wideFamily } from './family.mjs';
import { CW, CG, closeVerticals, crossings, jogs, layoutIn, longCouples, overlaps, underLines } from './lines.mjs';

/* Compact partner rows, brackets to partners further out, and lighting up one family
   (synthetic people and the royal example only). Runs on a desktop and on a phone. */
const STEP = CW + CG;
const x = (L, id) => { const n = L.nodes.find((n) => n.id === id); return n ? n.x : undefined; };
const arcs = (L) => L.links.filter((l) => l.type === 'arc');
const lineTo = (L, id) => L.links.find((l) => l.type === 'desc' && l.t.id === id);
/** Nothing overlaps, no card under a line, no crossings, no lines of two families side by side, no short jogs. */
function clean(L, what) {
  expect(overlaps(L), what).toEqual([]);
  expect(underLines(L), what).toEqual([]);
  expect(crossings(L), what).toEqual([]);
  expect(closeVerticals(L), what).toEqual([]);
  expect(jogs(L), what).toEqual([]);
  expect(longCouples(L), what).toEqual([]);
}
/** Each card in `row` (left to right) stands exactly one card step from the one before. */
function steps(L, row) { for (let i = 1; i < row.length; i++) expect(x(L, row[i]) - x(L, row[i - 1]), row[i - 1] + ' → ' + row[i]).toBe(STEP); }

test('a wide family: partners one step apart, nothing overlaps, crosses or runs close', async ({ page }) => {
  await fresh(page);
  const fam = wideFamily();
  for (const [focus, o] of [['Stamfar', { desc: 2 }], ['Stamfar', { desc: 1 }], ['Andrabarn3', { anc: 1, kin: 1, desc: 1 }], ['Sonson1', { anc: 2, kin: 2 }], ['Barnbarn1', { anc: 2, kin: 2 }]]) {
    const L = await layoutIn(page, fam, focus, o);
    const what = focus + ' ' + JSON.stringify(o);
    clean(L, what);
    expect(arcs(L), what).toEqual([]); // two partners: both next to him, no bracket
    // a father's other partners stand outwards from the couple he forms with the mother
    if (focus === 'Sonson1') { steps(L, ['Första', 'Stamfar']); steps(L, ['Svärdotter2', 'Andrabarn3']); }
    else if (focus === 'Barnbarn1') steps(L, ['Andra', 'Stamfar']);
    else { steps(L, ['Första', 'Stamfar', 'Andra']); steps(L, ['Svärdotter1', 'Andrabarn3', 'Svärdotter2']); }
    if (x(L, 'Svärson') !== undefined) steps(L, ['Svärson', 'Andrabarn6']);
  }
});

test('partnerFamily: the bracket to the partner furthest out starts at the person\'s own card', async ({ page }) => {
  await fresh(page);
  const fam = partnerFamily();
  const within = (v, L, id) => Math.abs(v - x(L, id)) < CW / 2;
  // Mannen in focus: Tidig, Mannen, Sen, Barnlös
  let L = await layoutIn(page, fam, 'Mannen', { kin: 1 });
  clean(L, 'Mannen');
  steps(L, ['Tidig', 'Mannen', 'Sen', 'Barnlös']);
  expect(arcs(L)).toHaveLength(1);
  let a = arcs(L)[0];
  expect([a.a, a.b]).toEqual(['Mannen', 'Barnlös']);
  expect(within(a.x1, L, 'Mannen')).toBe(true); expect(within(a.x2, L, 'Barnlös')).toBe(true);
  expect(within(a.x1, L, 'Sen') || within(a.x2, L, 'Sen')).toBe(false);
  // above the row, clear of the line up to Mannen's parents
  expect(a.h).toBeLessThan(a.y);
  expect(Math.abs(a.x1 - x(L, 'Mannen'))).toBeGreaterThanOrEqual(14);
  // Mannen as a father (SenBarn in focus): his other partners outwards on his side, the bracket from his card, not Tidig's
  L = await layoutIn(page, fam, 'SenBarn', { anc: 1, kin: 1 });
  clean(L, 'SenBarn');
  steps(L, ['Barnlös', 'Tidig', 'Mannen', 'Sen']);
  a = arcs(L)[0];
  expect([a.a, a.b]).toEqual(['Mannen', 'Barnlös']);
  expect(within(a.x1, L, 'Mannen')).toBe(true); expect(within(a.x2, L, 'Barnlös')).toBe(true);
  expect(within(a.x1, L, 'Tidig') || within(a.x2, L, 'Tidig')).toBe(false);
  // in a side branch too
  L = await layoutIn(page, fam, 'Syster', { kin: 1 });
  clean(L, 'Syster');
  steps(L, ['Tidig', 'Mannen', 'Sen', 'Barnlös']);
});

test('children with the partner furthest out hang from a dot on the bracket', async ({ page }) => {
  await fresh(page);
  const fam = partnerFamily();
  fam.push({ id: 'SistaBarn', kind: 'person', given: 'SistaBarn', surname: 'Fiktiv', sex: 'K', birthDate: '2010', fatherId: 'Mannen', motherId: 'Barnlös', spouseIds: [] });
  const L = await layoutIn(page, fam, 'Mannen');
  clean(L, 'Mannen with a child with Barnlös');
  steps(L, ['Tidig', 'Mannen', 'Sen', 'Barnlös']);
  const a = arcs(L)[0], l = lineTo(L, 'SistaBarn');
  expect(l.s.top).toBe(a.h); // the line starts on the bracket …
  expect(l.s.x).toBe((x(L, 'Sen') + x(L, 'Barnlös')) / 2); // … above the gap between Sen and Barnlös
  expect(l.s.x).toBeGreaterThan(Math.min(a.x1, a.x2)); expect(l.s.x).toBeLessThan(Math.max(a.x1, a.x2));
  expect(L.links.some((d) => d.type === 'dot' && d.x === l.s.x && d.y === a.h)).toBe(true);
});

test('a click on a family\'s lines lights up that family, and a second click puts it out', async ({ page, isMobile }) => {
  await fresh(page);
  await layoutIn(page, partnerFamily(), 'Mannen', { kin: 1 });
  const hit = (title, sel) => page.locator(`#treeSvg ${sel}.hit`).filter({ has: page.locator('title', { hasText: title }) }).first();
  const press = (loc) => isMobile ? loc.tap({ force: true }) : loc.click({ force: true });
  const lit = () => page.locator('#treeSvg g.card.hl').evaluateAll((gs) => gs.map((g) => g.getAttribute('data-k')).sort());
  // the dot of Mannen and Tidig
  await press(hit('Barn till Mannen Fiktiv och Tidig Fiktiv', 'circle'));
  await expect.poll(lit).toEqual(['Mannen', 'Tidig', 'TidigBarn1', 'TidigBarn2'].sort());
  await expect(page.locator('#treeSvg')).toHaveClass(/relhl/);
  await expect(page.locator('#relBanner')).toContainText('Mannen Fiktiv och Tidig Fiktiv · 2 barn');
  const litLines = await page.locator('#treeSvg path.link.hl').evaluateAll((ps) => [...new Set(ps.map((p) => p.getAttribute('data-f')))]);
  expect(litLines).toEqual(['Mannen|Tidig']);
  // the couple line of the same family puts it out
  await press(hit('Barn till Mannen Fiktiv och Tidig Fiktiv', 'path'));
  await expect.poll(lit).toEqual([]);
  await expect(page.locator('#relBanner')).toHaveCount(0);
  // the bracket to Barnlös: just the two of them, and the × puts it out
  await press(hit('Mannen Fiktiv och Barnlös Fiktiv', 'path'));
  await expect.poll(lit).toEqual(['Barnlös', 'Mannen']);
  await expect(page.locator('#relBanner')).toContainText('inga gemensamma barn');
  await press(page.locator('#famOff'));
  await expect.poll(lit).toEqual([]);
  if (!isMobile) { // Esc, the background, and panning is not a click
    await page.locator('#treeSvg circle.hit').first().click({ force: true });
    await expect.poll(async () => (await lit()).length).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect.poll(lit).toEqual([]);
    await page.locator('#treeSvg circle.hit').first().click({ force: true });
    const box = await page.locator('#treeSvg').boundingBox();
    await page.mouse.move(box.x + 30, box.y + box.height - 30); await page.mouse.down(); await page.mouse.move(box.x + 140, box.y + box.height - 90, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(100); // d3 swallows the click that ends a drag until its next tick
    await expect.poll(async () => (await lit()).length).toBeGreaterThan(0);
    // a click on an empty spot of the background
    const empty = await page.evaluate(() => { const svg = document.querySelector('#treeSvg'), r = svg.getBoundingClientRect();
      for (let y = r.bottom - 20; y > r.top + 120; y -= 15) for (let x = r.left + 20; x < r.right - 20; x += 15) if (document.elementFromPoint(x, y) === svg) return { x, y };
      return null; });
    await page.mouse.click(empty.x, empty.y);
    await expect.poll(lit).toEqual([]);
  }
});

test('while a kinship path is lit, a family click does nothing', async ({ page }) => {
  await example(page);
  await page.evaluate(() => { app.showRelInTree('p_gustav1', 'p_karl9', app.relation('p_gustav1', 'p_karl9')); app.renderAll(true); });
  await expect(page.locator('#relBanner')).toBeVisible();
  const before = await page.locator('#treeSvg g.card.hl').evaluateAll((gs) => gs.map((g) => g.getAttribute('data-k')).sort());
  expect(before.length).toBeGreaterThan(1);
  await page.locator('#treeSvg circle.hit').first().click({ force: true });
  expect(await page.locator('#treeSvg g.card.hl').evaluateAll((gs) => gs.map((g) => g.getAttribute('data-k')).sort())).toEqual(before);
  expect(await page.evaluate(() => app.ui.famHL)).toBeFalsy();
  await expect(page.locator('#relBanner')).not.toHaveAttribute('data-kind', 'fam');
});

test('the royal example: Gustav Vasa stands one step from his partners', async ({ page }) => {
  await example(page);
  const o = { anc: 10, desc: 10, kin: 10, partners: true };
  let L = await layoutIn(page, null, 'p_gustav1', o);
  steps(L, ['p_kat_sachsen', 'p_gustav1', 'p_margareta', 'p_kat_stenbock']);
  expect(longCouples(L)).toEqual([]);
  /* Johan III in focus: Gustav Vasa is his father, and his other partners stand outwards from him.
     Margareta stands by the pedigree, above her son, as every ancestor couple does. */
  L = await layoutIn(page, null, 'p_johan3', o);
  steps(L, ['p_kat_stenbock', 'p_kat_sachsen', 'p_gustav1']);
  expect(longCouples(L)).toEqual([]);
});
