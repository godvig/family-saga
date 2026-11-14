import { test, expect, fresh } from './fixtures.mjs';

async function family(page) {
  await fresh(page);
  await page.evaluate(async () => {
    const P = (id, given, sex, extra = {}) => app.Store.put({ kind: 'person', id, given, callName: extra.call || '', surname: extra.s || 'Sjöberg', sex, birthDate: extra.b || '', spouseIds: extra.sp || [], fatherId: extra.f || '', motherId: extra.m || '', events: extra.ev || [] });
    await P('an', 'Lars Anders', 'M', { b: '1944', call: 'Anders', sp: ['el'], ev: [{ id: 'e1', type: 'Vigsel', date: '1965-06-12', withId: 'el' }] });
    await P('el', 'Elisabeth', 'K', { b: '1946', s: 'Lundborg', sp: ['an'] });
    await P('maria', 'Maria', 'K', { b: '1969', f: 'an', m: 'el' });
    await P('lena', 'Lena', 'K', { b: '1966', s: 'Rosengren', f: 'an', m: 'el' });
    await P('tommy', 'Tommy', 'M', { b: '1967', f: 'an', m: 'el' });
  });
}

test('initials use the name someone went by', async ({ page }) => {
  await family(page);
  expect(await page.evaluate(() => app.initials(app.P('an')))).toBe('AS');
});

test('an event with a second person shows for both, once', async ({ page }) => {
  await family(page);
  await page.evaluate(() => { location.hash = 'trad'; app.setFocus('el'); app.select('person', 'el'); });
  const ev = page.locator('#panel .ev', { hasText: 'Vigsel' });
  await expect(ev).toHaveCount(1);
  await expect(ev).toContainText('Lars Anders Sjöberg');
  // A copy entered on her side too doesn't make two.
  await page.evaluate(async () => { const p = app.P('el'); await app.Store.put({ ...p, events: [{ id: 'e2', type: 'Vigsel', date: '1965-06-12', withId: 'an' }] }); });
  await expect(page.locator('#panel .ev', { hasText: 'Vigsel' })).toHaveCount(1);
});

test('former names are kept, shown and searchable', async ({ page }) => {
  await family(page);
  await page.evaluate(() => { location.hash = 'trad'; app.setFocus('lena'); app.select('person', 'lena'); });
  await page.click('#panel [data-act="edit"]');
  await page.click('#mFNadd');
  await page.locator('.fn-row [data-fn="surname"]').fill('Sjöberg');
  await page.click('.modal [data-ok]');
  expect(await page.evaluate(() => app.P('lena').formerNames)).toEqual([{ given: '', surname: 'Sjöberg', type: 'birth' }]);
  await expect(page.locator('#panel .fname')).toHaveText('f. Sjöberg');
  await page.fill('#q', 'lena sjöberg');
  await expect(page.locator('#qres')).toContainText('Lena Rosengren');
});

test('notes typed in the panel survive opening Redigera', async ({ page }) => {
  await family(page);
  await page.evaluate(() => { location.hash = 'trad'; app.select('person', 'maria'); });
  await page.fill('#notes', 'Bodde på Lidingö');
  await page.click('#panel [data-act="edit"]');
  await page.click('.modal [data-ok]');
  expect(await page.evaluate(() => app.P('maria').notes)).toBe('Bodde på Lidingö');
});

test('brothers and sisters spread to both sides of the focus', async ({ page }) => {
  await family(page);
  const x = await page.evaluate(() => { const L = app.treeLayout(app.P('maria'), false); const at = (id) => L.nodes.find((n) => n.data.p && n.data.p.id === id).x; return [at('lena'), at('tommy')]; });
  expect(x[0]).toBeLessThan(0); expect(x[1]).toBeGreaterThan(0);
});
