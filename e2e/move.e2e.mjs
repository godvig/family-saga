import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';

/* The move from each old address (klansagan.godvig.com, saga.godvig.com) to släktsagan.se, with all
   addresses served from this checkout: the old one first runs the app (to save an archive there), then the
   page from move/old-address/. The new address is punycode, as the browser reports it. */
const NEW = 'https://xn--slktsagan-w2a.se';
const OLD = ['https://klansagan.godvig.com', 'https://saga.godvig.com'];
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

for (const FROM of OLD) {
  test(`an archive saved under ${FROM} moves to the new address, photos and shared trees included`, async ({ browser }) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    let oldServes = '.';
    await ctx.route(`${FROM}/**`, (r) => serve(oldServes)(r));
    await ctx.route(`${NEW}/**`, serve('.'));
    const page = await ctx.newPage();

    // 1. Someone used the app on the old address: an archive, a photo and a shared tree.
    await page.goto(`${FROM}/`);
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
    await page.goto(`${FROM}/#dela-abc`); await page.reload();
    await expect(page.locator('#ask')).toBeVisible();
    await expect(page.locator('#what')).toContainText('1 personer');
    const popupP = page.waitForEvent('popup');
    await page.click('#go');
    const popup = await popupP;
    await expect(popup.locator('#msg')).toContainText('Klart', { timeout: 15000 });
    await expect(page.locator('#msg')).toContainText('Klart');
    await expect(popup.locator('#refused')).toBeHidden(); // nothing was here, so the move went ahead

    // 3. The app on the new address has it all, and the link still carries the hash.
    await expect(popup.locator('#acts a')).toHaveAttribute('href', './#dela-abc');
    await popup.goto(`${NEW}/`);
    await expect.poll(() => popup.evaluate(() => typeof app !== 'undefined' && !!app.P('p_ana'))).toBe(true);
    const r = await popup.evaluate(async () => ({ name: app.P('p_ana').given, photo: (await app.blobUrl(app.P('p_ana').media[0])).slice(0, 14), shares: Object.keys(JSON.parse(localStorage.getItem('klansagan-shares')).trees) }));
    expect(r).toEqual({ name: 'Anna', photo: 'data:image/gif', shares: ['tree-1'] });

    // 4. Next time the old address just sends you on.
    await page.goto(`${FROM}/#visa-x`); await page.reload();
    await expect.poll(() => page.url()).toBe(`${NEW}/#visa-x`);
    await ctx.close();
  });

  test(`someone with nothing saved under ${FROM} is sent straight on, path and link intact`, async ({ browser }) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(`${FROM}/**`, serve('move/old-address'));
    await ctx.route(`${NEW}/**`, serve('.'));
    const page = await ctx.newPage();
    await page.goto(`${FROM}/en/sida?x=1#dela-abc.def`);
    await expect.poll(() => page.url()).toBe(`${NEW}/en/sida?x=1#dela-abc.def`);
    await ctx.close();
  });
}

test('someone who moved klansagan → saga is sent to saga to move on, not to an empty new address', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  let sagaServes = '.';
  await ctx.route(`${OLD[0]}/**`, (r) => (new URL(r.request().url()).pathname === '/blank' ? r.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><title>x</title>' }) : serve('move/old-address')(r)));
  await ctx.route(`${OLD[1]}/**`, (r) => serve(sagaServes)(r));
  await ctx.route(`${NEW}/**`, serve('.'));
  const page = await ctx.newPage();
  // The earlier move left its mark on klansagan, and the archive on saga.
  await page.goto(`${OLD[0]}/blank`);
  await page.evaluate((to) => localStorage.setItem('klansagan-moved-to', to), OLD[1]);
  await page.goto(`${OLD[1]}/`);
  await expect.poll(() => page.evaluate(() => typeof app !== 'undefined')).toBe(true);
  await page.evaluate(async () => { await app.Store.put({ kind: 'person', id: 'p_bo', given: 'Bo', surname: 'Flytt', sex: 'M', birthDate: '1901' }); await app.Store.saveNow(); });
  sagaServes = 'move/old-address';
  await page.goto(`${OLD[0]}/#dela-abc`);
  await expect.poll(() => page.url()).toBe(`${OLD[1]}/#dela-abc`);
  await expect(page.locator('#ask')).toBeVisible();
  await ctx.close();
});

test('the new address takes a move only from an old address', async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.route('https://other.example/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><title>x</title>' }));
  await ctx.route(`${NEW}/**`, serve('.'));
  const page = await ctx.newPage();
  await page.goto('https://other.example/');
  await page.evaluate(() => { window.got = []; addEventListener('message', (e) => window.got.push(e.data && e.data.t)); });
  const popupP = page.waitForEvent('popup');
  await page.evaluate((to) => { window.w = window.open(to + '/flytt.html'); }, NEW);
  const popup = await popupP; await popup.waitForLoadState();
  await page.evaluate((to) => window.w.postMessage({ t: 'start', total: 1, persons: 1, hash: '' }, to), NEW);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.got)).toEqual([]);
  await expect(popup.locator('#msg')).toHaveText('Väntar på den gamla adressen.');
  await ctx.close();
});

/* An archive already on the new address. Here: Hanna, a photo, shared trees t1 (version 5) and t4.
   On the old address: Gustav, another photo, shared trees t1 (version 3) and t2. A move must not touch any of it. */
const GIF_A = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const GIF_B = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const tree = (version) => ({ v: 2, r: 'R' + version, e: 'E' + version, version });

async function seed(page, origin, { person, photo, shares }) {
  await page.goto(`${origin}/`);
  await expect.poll(() => page.evaluate(() => typeof app !== 'undefined')).toBe(true);
  await page.evaluate(async ({ person, photo, shares }) => {
    if (person) {
      await app.Store.put({ kind: 'person', id: person.id, given: person.given, surname: 'Krock', sex: 'K', birthDate: '1900' });
      if (photo) { const id = await app.storeBlob(photo); await app.Store.put({ ...app.P(person.id), media: [{ url: 'kl:' + id, contentType: 'image/gif', name: 'x.gif' }] }); }
    } else if (photo) await app.storeBlob(photo);
    if (shares) localStorage.setItem('klansagan-shares', JSON.stringify({ active: null, trees: shares }));
    await app.Store.saveNow();
  }, { person, photo, shares });
}

/** What the new address holds, read straight from its storage. */
const lookNew = (page) => page.evaluate(async () => {
  const db = await new Promise((ok) => { const r = indexedDB.open('klansagan', 2); r.onsuccess = () => ok(r.result); });
  const all = (store) => new Promise((ok) => { const out = {}; const c = db.transaction(store).objectStore(store).openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else ok(out); }; });
  const archive = await all('archive'), blobs = await all('blobs');
  const backups = Object.keys(archive).filter((k) => k.startsWith('klansagan-before-move-'));
  const names = (a) => Object.values((a && a.persons) || {}).map((x) => x.given).sort();
  const shares = JSON.parse(localStorage.getItem('klansagan-shares') || '{"trees":{}}').trees;
  return {
    people: names(archive['klansagan-v1']),
    blobs: Object.keys(blobs).length,
    shares: Object.fromEntries(Object.entries(shares).map(([id, t]) => [id, t.version])),
    backups: backups.map((k) => { const b = archive[k]; const main = (b.archive.find((x) => x[0] === 'klansagan-v1') || [])[1];
      return { key: k, from: b.from, people: names(main), shares: Object.keys(JSON.parse(b.local['klansagan-shares'] || '{"trees":{}}').trees).sort() }; }),
  };
});

async function moveIntoArchiveHere(browser, from, { old, here, screenshot }) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  let oldServes = '.';
  await ctx.route(`${from}/**`, (r) => serve(oldServes)(r));
  await ctx.route(`${NEW}/**`, serve('.'));
  const page = await ctx.newPage();
  await seed(page, NEW, here);
  const before = await lookNew(page);
  await seed(page, from, old);
  oldServes = 'move/old-address';
  await page.goto(`${from}/`); await page.reload();
  const popupP = page.waitForEvent('popup');
  await page.click('#go');
  const popup = await popupP;
  await expect(popup.locator('#refused')).toBeVisible();
  await expect(popup.locator('#refused')).toContainText('Läs in & spara');
  await expect(page.locator('#msg')).toContainText('ingenting har flyttats');
  if (screenshot && process.env.MOVE_SCREENSHOT) await popup.screenshot({ path: process.env.MOVE_SCREENSHOT, fullPage: true });
  const after = await lookNew(popup);
  await ctx.close();
  return { before, after };
}

const HERE = { person: { id: 'p_hanna', given: 'Hanna' }, photo: GIF_A, shares: { t1: tree(5), t4: tree(1) } };
const THERE = { person: { id: 'p_gustav', given: 'Gustav' }, photo: GIF_B, shares: { t1: tree(3), t2: tree(1) } };
const withoutBackups = (r) => ({ ...r, backups: undefined });

test.describe('a move to an address that already has an archive', () => {
  for (const FROM of OLD) {
    test(`from ${FROM}: moves nothing, explains the way through a backup file, and keeps a copy`, async ({ browser }) => {
      const { before, after } = await moveIntoArchiveHere(browser, FROM, { here: HERE, old: THERE, screenshot: FROM === OLD[1] });
      expect(before.people).toEqual(['Hanna']);
      expect(withoutBackups(after)).toEqual(withoutBackups(before)); // people, shared trees and photos untouched
      expect(after.backups).toHaveLength(1);
      expect(after.backups[0]).toMatchObject({ from: FROM, people: ['Hanna'], shares: ['t1', 't4'] });
      expect(after.backups[0].key).toContain(new URL(FROM).host);
    });
  }

  test('refuses when the new address only has shared trees, and when the old one only has shared trees', async ({ browser }) => {
    // Before, an old address without people was moved with no question, and its list of shared trees replaced the one here.
    const onlyTreesHere = await moveIntoArchiveHere(browser, OLD[0], { here: { shares: { t4: tree(2) } }, old: THERE });
    expect(onlyTreesHere.after.shares).toEqual({ t4: 2 });
    expect(onlyTreesHere.after.people).toEqual([]);
    const onlyTreesThere = await moveIntoArchiveHere(browser, OLD[1], { here: HERE, old: { shares: { t1: tree(7), t3: tree(1) } } });
    expect(onlyTreesThere.after.shares).toEqual({ t1: 5, t4: 1 });
    expect(onlyTreesThere.after.people).toEqual(['Hanna']);
    expect(onlyTreesThere.after.backups).toHaveLength(1);
  });

  test('counts an app that was only opened, with its settings saved, as empty', async ({ browser }) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    let oldServes = '.';
    await ctx.route(`${OLD[0]}/**`, (r) => serve(oldServes)(r));
    await ctx.route(`${NEW}/**`, serve('.'));
    const page = await ctx.newPage();
    // Open the app on the new address and look around without adding anything: it saves settings of its own.
    await page.goto(`${NEW}/`);
    await expect.poll(() => page.evaluate(() => typeof app !== 'undefined')).toBe(true);
    await page.goto(`${NEW}/#tidslinje`); await page.goto(`${NEW}/#import`); await page.waitForTimeout(500);
    // Every setting the app keeps, an empty list of shared trees, and an empty archive saved to IndexedDB.
    await page.evaluate(async () => {
      for (const k of ['sa-tema', 'sa-size', 'sa-enkelt', 'sa-focus', 'sa-names', 'sa-partners', 'sa-viewid']) localStorage.setItem(k, '1');
      localStorage.setItem('klansagan-backup-nudged', String(Date.now()));
      localStorage.setItem('klansagan-shares', JSON.stringify({ active: null, trees: {} }));
      await app.Store.saveNow();
    });
    expect((await lookNew(page)).people).toEqual([]);
    await seed(page, OLD[0], THERE);
    oldServes = 'move/old-address';
    await page.goto(`${OLD[0]}/`); await page.reload();
    const popupP = page.waitForEvent('popup');
    await page.click('#go');
    const popup = await popupP;
    await expect(popup.locator('#msg')).toContainText('Klart', { timeout: 15000 });
    await expect(popup.locator('#refused')).toBeHidden();
    const r = await lookNew(popup);
    expect(r.people).toEqual(['Gustav']);
    expect(r.shares).toEqual({ t1: 3, t2: 1 });
    await ctx.close();
  });

  test('moves an old address that only has shared trees into an empty one', async ({ browser }) => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    let oldServes = '.';
    await ctx.route(`${OLD[1]}/**`, (r) => serve(oldServes)(r));
    await ctx.route(`${NEW}/**`, serve('.'));
    const page = await ctx.newPage();
    await seed(page, OLD[1], { shares: { t1: tree(7), t3: tree(1) } });
    oldServes = 'move/old-address';
    await page.goto(`${OLD[1]}/`); await page.reload();
    const popupP = page.waitForEvent('popup');
    await page.click('#go');
    const popup = await popupP;
    await expect(popup.locator('#msg')).toContainText('Klart', { timeout: 15000 });
    await expect(popup.locator('#refused')).toBeHidden();
    const r = await lookNew(popup);
    expect(r.shares).toEqual({ t1: 7, t3: 1 });
    expect(r.backups).toEqual([]);
    await ctx.close();
  });
});
