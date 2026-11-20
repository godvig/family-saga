import { test, expect, example, fresh } from './fixtures.mjs';

test('the example opens with a tree of cards', async ({ page }) => {
  await example(page);
  await expect(page.locator('#treeSvg g.card').first()).toBeVisible();
  expect(await page.locator('#treeSvg g.card').count()).toBeGreaterThan(10);
});

test('clicking a card keeps it in place while the tree rearranges around it', async ({ page }) => {
  await example(page);
  await expect(page.locator('#treeSvg g.card').first()).toBeVisible();
  // a card well inside the view that isn't the focus person
  const k = await page.evaluate(() => [...document.querySelectorAll('#treeSvg g.card:not(.focus)')].map((e) => [e.dataset.k, e.querySelector('rect.bg').getBoundingClientRect()])
    .find(([k, r]) => !k.startsWith('g:') && r.x > 260 && r.right < innerWidth - 620 && r.y > 260 && r.bottom < innerHeight - 120)[0]);
  const card = () => page.locator(`#treeSvg g.card[data-k="${k}"] rect.bg`);
  const before = await card().boundingBox();
  // click the card itself: its name text is part of the card and may cover any given point
  await page.locator(`#treeSvg g.card[data-k="${k}"]`).click({ position: { x: before.width - 30, y: 18 } });
  await expect.poll(() => page.evaluate(() => app.ui.focus)).toBe(k);
  const after = await card().boundingBox();
  expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeLessThan(2);
});

test('the kinship path lights up in the tree', async ({ page }) => {
  await example(page, 'slaktskap');
  await page.evaluate(() => { app.ui.relA = 'p_sigrid'; app.ui.relB = 'p_wladyslaw'; app.renderRel(); });
  await expect(page.locator('#view')).toContainText('halvkusins son');
  await page.click('#relTree');
  await expect(page.locator('#relBanner')).toContainText('Władysław IV');
  await expect(page.locator('#treeSvg g.card.hl')).toHaveCount(6);
  await page.click('#relOff');
  await expect(page.locator('#treeSvg g.card.hl')).toHaveCount(0);
});

test('undo and redo an edit with the keyboard', async ({ page }) => {
  await example(page);
  await page.evaluate(() => { const q = app.clone(app.P('p_karl9')); q.occupation = 'Testkung'; app.Store.put(q); });
  await page.keyboard.press('Control+z');
  await expect.poll(() => page.evaluate(() => app.P('p_karl9').occupation)).not.toBe('Testkung');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(() => page.evaluate(() => app.P('p_karl9').occupation)).toBe('Testkung');
});

test('deleting a person with all their links is one undo step', async ({ page }) => {
  await example(page);
  await page.evaluate(() => app.deletePerson('p_johan3'));
  await expect.poll(() => page.evaluate(() => !!app.P('p_johan3'))).toBe(false);
  await page.click('#undoBtn');
  await expect.poll(() => page.evaluate(() => Object.values(app.ALL.persons).filter((p) => p.fatherId === 'p_johan3').length)).toBe(3);
});

test('a locked tree grows to include someone picked outside it', async ({ page }) => {
  await example(page);
  await page.evaluate(() => { app.ui.ancGen = 1; app.ui.kinDeg = 0; app.setFocus('p_ga2'); app.ui.treeKey = null; app.renderAll(); });
  await page.click('#tLock');
  await expect.poll(() => page.evaluate(() => app.ui.treeShown.has('p_gustav1'))).toBe(false);
  await page.evaluate(() => app.followPerson('p_gustav1'));   // his grandfather, two generations up
  await expect(page.locator('.toast')).toContainText('Trädet växte');
  await expect.poll(() => page.evaluate(() => [app.ui.focus, app.ui.treeLock, app.ui.ancGen, app.ui.treeShown.has('p_gustav1')])).toEqual(['p_ga2', true, 2, true]);
  await expect(page.locator('#tAnc')).toHaveValue('2');   // the control follows
  await page.click('.toast-btn');   // "Ångra" puts the old view back
  await expect.poll(() => page.evaluate(() => app.ui.ancGen)).toBe(1);
});
test("a woman's husband sits to her left in side branches", async ({ page }) => {
  await fresh(page);
  const r = await page.evaluate(async () => {
    const P = (id, given, sex, extra = {}) => app.Store.put({ kind: 'person', id, given, surname: 'T', sex, birthDate: extra.b || '', spouseIds: extra.sp || [], fatherId: extra.f || '', motherId: extra.m || '' });
    await P('far', 'Far', 'M', { sp: ['mor'] }); await P('mor', 'Mor', 'K', { sp: ['far'] });
    await P('me', 'Jag', 'M', { f: 'far', m: 'mor' });
    await P('sis', 'Syster', 'K', { f: 'far', m: 'mor', sp: ['man'] }); await P('man', 'Svåger', 'M', { sp: ['sis'] });
    const L = app.treeLayout(app.P('me'), true); const x = (id) => L.nodes.find((n) => n.data.p && n.data.p.id === id).x;
    return x('man') < x('sis');
  });
  expect(r).toBe(true);
});

test('"Visa hela" fits every card into the view, however wide the tree', async ({ page }) => {
  await example(page);
  await page.selectOption('#tAnc', { index: (await page.locator('#tAnc option').count()) - 1 });
  await page.selectOption('#tKin', { index: (await page.locator('#tKin option').count()) - 1 });
  await page.click('#tFit');
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const s = document.querySelector('#treeSvg').getBoundingClientRect();
    const cs = [...document.querySelectorAll('#treeSvg g.card rect.bg')].map((e) => e.getBoundingClientRect());
    return { s, l: Math.min(...cs.map((c) => c.left)), r: Math.max(...cs.map((c) => c.right)), t: Math.min(...cs.map((c) => c.top)), b: Math.max(...cs.map((c) => c.bottom)) };
  });
  expect(r.l).toBeGreaterThanOrEqual(r.s.left - 1);
  expect(r.r).toBeLessThanOrEqual(r.s.right + 1);
  expect(r.t).toBeGreaterThanOrEqual(r.s.top - 1);
  expect(r.b).toBeLessThanOrEqual(r.s.bottom + 1);
});
