import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';

/* The move from klansagan.godvig.com to saga.godvig.com, with both addresses served
   from this checkout: the old one first runs the app (to save an archive there), then the
   page from move/old-address/. */
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function serve(dir) {
  return (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.includes('/rest/v1/')) return route.abort();
    let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    const f = join(dir, p);
    if (!existsSync(f)) return existsSync(join(dir, '404.html')) ? route.fulfill({ status: 404, path: join(dir, '404.html'), contentType: 'text/html' }) : route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: f, contentType: TYPES[extname(f)] || 'application/octet-stream' });
  };
}

test('an archive saved under the old address moves to the new one, photos and shared trees included', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  let oldServes = '.';
  await ctx.route('https://klansagan.godvig.com/**', (r) => serve(oldServes)(r));
  await ctx.route('https://saga.godvig.com/**', serve('.'));
  const page = await ctx.newPage();

  // 1. Someone used the app on the old address: an archive, a photo and a shared tree.
  await page.goto('https://klansagan.godvig.com/');
  await expect.poll(() => page.evaluate(() => typeof app !== 'undefined')).toBe(true);
  await page.evaluate(async () => {
    await app.Store.put({ kind: 'person', id: 'p_ana', given: 'Anna', surname: 'Flytt', sex: 'K', birthDate: '1900' });
    const id = await app.storeBlob('data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
    await app.Store.put({ ...app.P('p_ana'), media: [{ url: 'kl:' + id, contentType: 'image/gif', name: 'a.gif' }] });
    localStorage.setItem('klansagan-shares', JSON.stringify({ active: null, trees: { 'tree-1': { v: 2, r: 'R', e: 'E', version: 3 } } }));
    await app.Store.saveNow();
  });

  // 2. The old address now serves the move page.
  oldServes = 'move/old-address';
  await page.goto('https://klansagan.godvig.com/#dela-abc'); await page.reload();
  await expect(page.locator('#ask')).toBeVisible();
  await expect(page.locator('#what')).toContainText('1 personer');
  const popupP = page.waitForEvent('popup');
  await page.click('#go');
  const popup = await popupP;
  await expect(popup.locator('#msg')).toContainText('Klart', { timeout: 15000 });
  await expect(page.locator('#msg')).toContainText('Klart');

  // 3. The app on the new address has it all, and the link still carries the hash.
  await expect(popup.locator('#acts a')).toHaveAttribute('href', './#dela-abc');
  await popup.goto('https://saga.godvig.com/');
  await expect.poll(() => popup.evaluate(() => typeof app !== 'undefined' && !!app.P('p_ana'))).toBe(true);
  const r = await popup.evaluate(async () => ({ name: app.P('p_ana').given, photo: (await app.blobUrl(app.P('p_ana').media[0])).slice(0, 14), shares: Object.keys(JSON.parse(localStorage.getItem('klansagan-shares')).trees) }));
  expect(r).toEqual({ name: 'Anna', photo: 'data:image/gif', shares: ['tree-1'] });

  // 4. Next time the old address just sends you on.
  await page.goto('https://klansagan.godvig.com/#visa-x'); await page.reload();
  await expect.poll(() => page.url()).toBe('https://saga.godvig.com/#visa-x');
  await ctx.close();
});

test('someone with nothing saved under the old address is sent straight on, link intact', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.route('https://klansagan.godvig.com/**', serve('move/old-address'));
  await ctx.route('https://saga.godvig.com/**', serve('.'));
  const page = await ctx.newPage();
  await page.goto('https://klansagan.godvig.com/#dela-abc.def');
  await expect.poll(() => page.url()).toBe('https://saga.godvig.com/#dela-abc.def');
  await ctx.close();
});
