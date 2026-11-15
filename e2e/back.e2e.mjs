import { test, expect, example } from './fixtures.mjs';

test('the person card steps back through the people looked at, and "Personkort" folds the side panel', async ({ page }) => {
  await example(page);
  const a = await page.evaluate(() => { app.select('person', app.ui.focus); return app.ui.focus; });
  await expect(page.locator('#panel [data-act="card"]')).toBeVisible();
  await page.locator('#panel [data-act="card"]').click();
  await expect.poll(() => page.evaluate(() => app.ui.view)).toBe('personkort');
  expect(await page.evaluate(() => app.ui.sel)).toBeNull();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('[data-pc="back"]')).toHaveCount(0);
  // on to a relative, and on to one of theirs
  const b = await page.evaluate(() => { const id = app.children(app.ui.cardId)[0].id; app.openCard(id); return id; });
  const c = await page.evaluate(() => { const p = app.P(app.ui.cardId); const id = p.motherId || app.children(p.id)[0].id; app.openCard(id); return id; });
  expect(new Set([a, b, c]).size).toBe(3);
  await expect(page.locator('[data-pc="back"]')).toContainText('Tillbaka till');
  await page.click('[data-pc="back"]');
  await expect.poll(() => page.evaluate(() => app.ui.cardId)).toBe(b);
  await page.goBack(); // the browser's own back button
  await expect.poll(() => page.evaluate(() => app.ui.cardId)).toBe(a);
  await expect(page.locator('[data-pc="back"]')).toHaveCount(0);
  await page.goForward();
  await expect.poll(() => page.evaluate(() => app.ui.cardId)).toBe(b);
});

test('the side panel has a way back to the person before', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'desktop layout');
  await example(page);
  const [a, b] = await page.evaluate(() => { const a = app.ui.focus, b = app.children(a)[0].id; app.select('person', a); app.followPerson(b); return [a, b]; });
  await expect.poll(() => page.evaluate(() => app.ui.sel.id)).toBe(b);
  await page.locator('#panel [data-act="back"]').click();
  await expect.poll(() => page.evaluate(() => app.ui.sel.id)).toBe(a);
  await expect(page.locator('#panel [data-act="back"]')).toHaveCount(0);
});

test('"Mer" comes right after "Personer", with "Läs in & spara" last', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'desktop layout');
  await page.setViewportSize({ width: 1400, height: 800 });
  await example(page);
  const x = (sel) => page.locator(sel).boundingBox().then((r) => r.x);
  const [pers, mer, imp] = [await x('#nav a[data-v="personer"]'), await x('#moreBtn'), await x('#nav > a[data-v="import"]')];
  expect(pers).toBeLessThan(mer); expect(mer).toBeLessThan(imp);
  await page.click('#moreBtn');
  await expect(page.locator('#morePop a[data-v="slaktskap"]')).toBeVisible();
});
