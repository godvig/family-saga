import { test, expect } from './fixtures.mjs';

test('if the app cannot start, the page says so instead of staying empty', async ({ page }) => {
  await page.route('**/src/app/research.js*', (r) => r.fulfill({ status: 404, body: 'Not found' }));
  await page.goto('/');
  await expect(page.locator('.boot-fail')).toContainText('Sidan kunde inte starta', { timeout: 15000 });
  await page.click('.boot-fail summary');
  await expect(page.locator('.boot-fail pre')).toContainText('main.js');
});

test('the app starts without any outside scripts', async ({ page }) => {
  const outside = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== 'localhost' && r.resourceType() === 'script') outside.push(r.url()); });
  await page.goto('/'); await expect(page.locator('#view')).not.toContainText('Laddar');
  expect(await page.evaluate(() => typeof d3 + typeof topojson)).toBe('objectobject');
  expect(outside).toEqual([]);
});
