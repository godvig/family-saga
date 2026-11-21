import { test, expect, fakeServer, wire, importExample } from './fixtures.mjs';

/* "Dela med <namn>": a share link that opens the tree from one person. Synthetic example data only. */

const byName = (page, given) => page.evaluate((g) => Object.values(app.ALL.persons).find((x) => x.given === g).id, given);
const dialog = (page) => page.locator('.ov .modal');
/** Sender A shares the example tree; returns the ids of a living person (Johan) and a dead one (Harald). */
async function sender(A, share = true) {
  await importExample(A);
  await A.evaluate(async (share) => { app.Share.st.name = 'Adam'; app.Share.save(); if (share) await app.Share.create(); }, share);
  return { johan: await byName(A, 'Johan'), sara: await byName(A, 'Sara'), harald: await byName(A, 'Harald') };
}
async function openShareFromCard(A, pid) {
  await A.evaluate((id) => app.openCard(id), pid);
  await A.locator('#view .pc .acts').getByRole('button', { name: /^🔗 Dela med / }).click();
}
const linkIn = (text) => text.match(/https?:\/\/\S+/)[0];
/** Recipient B opens a link and the tree has loaded. */
async function open(B, url) {
  await B.goto('about:blank'); await B.goto(url);
  await expect.poll(() => B.evaluate(() => (typeof app !== 'undefined' && app.Store.loaded ? Object.keys(app.ALL.persons).length : 0)), { timeout: 15000 }).toBeGreaterThan(5);
}
async function two(browser) {
  const server = fakeServer(), ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const A = await ctxA.newPage(), B = await ctxB.newPage();
  await wire(A, server); await wire(B, server);
  return { A, B, done: async () => { await ctxA.close(); await ctxB.close(); } };
}

test('the button on the person card gives a link with the person, read link first', async ({ browser }) => {
  const { A, done } = await two(browser);
  const { johan } = await sender(A);
  await openShareFromCard(A, johan);
  await expect(dialog(A).locator('h3')).toHaveText('Dela med Johan');
  await expect(dialog(A).locator('input[name=spK][value=read]')).toBeChecked();
  const msg = await dialog(A).locator('#spMsg').inputValue();
  expect(msg).toMatch(/^Hej Johan! Här är vårt släktträd, sett från dig\.\n/);
  expect(linkIn(msg)).toMatch(new RegExp(`\\?p=${johan}#visa-[0-9a-f-]{36}\\.[\\w-]{43}$`));
  // Choosing the edit link swaps the link in the message and warns.
  await expect(dialog(A).locator('.sp-kind .sp-warn')).toBeHidden();
  await dialog(A).locator('input[name=spK][value=edit]').check();
  await expect(dialog(A).locator('.sp-kind .sp-warn')).toBeVisible();
  expect(linkIn(await dialog(A).locator('#spMsg').inputValue())).toMatch(new RegExp(`\\?p=${johan}#dela-[0-9a-f-]{36}\\.[\\w-]{43}\\.[\\w-]{43}$`));
  await done();
});

test('a tree that is not shared yet goes through sharing first, then the person dialog', async ({ browser }) => {
  const { A, done } = await two(browser);
  const { johan } = await sender(A, false);
  await openShareFromCard(A, johan);
  await expect(dialog(A).locator('h3')).toHaveText('Dela släktträdet');
  await expect(dialog(A).locator('.sh-intro')).toContainText('För att dela med Johan');
  await dialog(A).locator('#shCreate').click();
  await expect(dialog(A).locator('h3')).toHaveText('Dela med Johan', { timeout: 15000 });
  expect(linkIn(await dialog(A).locator('#spMsg').inputValue())).toContain(`?p=${johan}#visa-`);
  await done();
});

test('a living person gets the line about what a read link shows; a dead one does not', async ({ browser }) => {
  const { A, done } = await two(browser);
  const { johan, harald } = await sender(A);
  await openShareFromCard(A, johan);
  await expect(dialog(A).locator('.sp-living')).toHaveText('🔒 Johan räknas som levande. Med en läslänk ser hen namn och födelseår för levande släktingar, men inte datum, bilder eller anteckningar.');
  await dialog(A).locator('[data-x]').click();
  await openShareFromCard(A, harald);
  await expect(dialog(A).locator('h3')).toHaveText('Dela med Harald');
  await expect(dialog(A).locator('.sp-living')).toHaveCount(0);
  await done();
});

test('an opened link focuses the person and asks; Ja sets "jag", Nej does not and is not asked again', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  const { johan, sara } = await sender(A);
  const [lj, ls] = await A.evaluate(([j, s]) => [app.Share.readLink(undefined, j), app.Share.readLink(undefined, s)], [johan, sara]);

  // Nej: nothing is set, focus stays, and the same link doesn't ask again.
  await open(B, ls);
  await expect(B.locator('#meBar')).toBeVisible();
  await expect(B.locator('#meBar')).toContainText('Är du Sara Lindqvist?');
  expect(await B.evaluate(() => [app.ui.focus, location.hash, location.search])).toEqual([sara, '#trad', '']);
  await B.locator('#meBar').getByRole('button', { name: 'Nej' }).click();
  await expect(B.locator('#meBar')).toBeHidden();
  expect(await B.evaluate(() => [app.Share.meId(), app.homePerson() && app.homePerson().id, app.ui.focus])).toEqual([null, undefined, sara]);
  await open(B, ls);
  expect(await B.evaluate(() => app.ui.focus)).toBe(sara);
  await expect(B.locator('#meBar')).toBeHidden();

  // Ja: this browser's "jag" is set, and the start page is about them.
  await open(B, lj);
  await expect(B.locator('#meBar')).toContainText('Är du Johan Lindqvist?');
  expect(await B.evaluate(() => app.Share.meId())).toBeNull();   // never set by just opening
  await B.locator('#meBar').getByRole('button', { name: 'Ja, det är jag' }).click();
  await expect(B.locator('#meBar')).toBeHidden();
  expect(await B.evaluate(() => [app.Share.meId(), app.homePerson().id])).toEqual([johan, johan]);
  await B.evaluate(() => { location.hash = 'start'; });
  await expect(B.locator('#view h1')).toHaveText('Släkten kring Johan Lindqvist');
  // "Jag" is this browser's: nothing changed in the tree, nothing to publish.
  expect(await B.evaluate(() => Object.values(app.ALL.persons).some((p) => p.home))).toBe(false);
  await done();
});

test('someone who already picked "jag" is not asked and keeps it', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  const { johan, sara } = await sender(A);
  const [lj, ls] = await A.evaluate(([j, s]) => [app.Share.readLink(undefined, j), app.Share.readLink(undefined, s)], [johan, sara]);
  await open(B, lj);
  await B.locator('#meBar').getByRole('button', { name: 'Ja, det är jag' }).click();
  await open(B, ls);
  expect(await B.evaluate(() => [app.ui.focus, app.Share.meId()])).toEqual([sara, johan]);
  await expect(B.locator('#meBar')).toBeHidden();
  await done();
});

test('an unknown person id is ignored and the tree opens as usual', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  await sender(A);
  const url = await A.evaluate(() => app.Share.readLink(undefined, 'p_nobodyhere1'));
  await open(B, url);
  expect(await B.evaluate(() => [location.hash, app.Share.readOnly(), app.Share.meId()])).toEqual(['#start', true, null]);
  await expect(B.locator('#meBar')).toBeHidden();
  await done();
});

test('an old link without a person works as before', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  await sender(A);
  const [read, edit] = await A.evaluate(() => [app.Share.readLink(), app.Share.link()]);
  expect(read).toMatch(/\/#visa-[0-9a-f-]{36}\.[\w-]{43}$/);
  await open(B, read);
  expect(await B.evaluate(() => [location.hash, app.Share.readOnly()])).toEqual(['#start', true]);
  await expect(B.locator('#meBar')).toBeHidden();
  await open(B, edit);
  expect(await B.evaluate(() => [location.hash, app.Share.readOnly(), app.Store.canEdit])).toEqual(['#start', false, true]);
  await done();
});

test('a reader can only pass on the read link', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  const { johan, sara } = await sender(A);
  await open(B, await A.evaluate((j) => app.Share.readLink(undefined, j), johan));
  await B.evaluate((id) => app.openCard(id), sara);
  await B.locator('#view .pc .acts').getByRole('button', { name: '🔗 Dela med Sara' }).click();
  await expect(dialog(B).locator('h3')).toHaveText('Dela med Sara');
  await expect(dialog(B).locator('input[name=spK]')).toHaveCount(0);
  expect(linkIn(await dialog(B).locator('#spMsg').inputValue())).toContain(`?p=${sara}#visa-`);
  await done();
});

test('the sharer\'s "jag" counts only for the sharer; a recipient who says Nej has none', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  await importExample(A);
  const { harald, sara } = await A.evaluate(async () => {
    const id = (g) => Object.values(app.ALL.persons).find((x) => x.given === g).id;
    await app.setHome(id('Harald')); app.Share.st.name = 'Adam'; app.Share.save(); await app.Share.create();
    return { harald: id('Harald'), sara: id('Sara') };
  });
  // The sharer created the share, so the tree's own flag is theirs and still counts.
  expect(await A.evaluate(() => [app.Share.ownTree(), app.homePerson().id])).toEqual([true, harald]);
  const link = await A.evaluate((s) => app.Share.readLink(undefined, s), sara);
  await open(B, link);
  // The flag came along in the tree, but a recipient doesn't inherit it.
  expect(await B.evaluate((h) => [app.Share.ownTree(), app.ALL.persons[h].home, app.homePerson()], harald)).toEqual([false, true, undefined]);
  await expect(B.locator('#meBar')).toContainText('Är du Sara Lindqvist?');
  await B.locator('#meBar').getByRole('button', { name: 'Nej' }).click();
  expect(await B.evaluate(() => [app.homePerson(), app.Share.meId()])).toEqual([undefined, null]);
  await B.evaluate(() => { location.hash = 'start'; });
  await expect(B.locator('#view h1')).not.toContainText('Harald');
  await expect(B.locator('#view')).not.toContainText(/anor till Harald|ättlingar till Harald/);
  await expect(B.locator('#view .treecard .tag', { hasText: 'Din släkt' })).toHaveCount(0);
  // Picking "jag" by hand still works.
  await B.evaluate(() => { location.hash = 'trad'; });
  await expect(B.locator('#treeSvg')).toBeVisible();
  await B.evaluate((s) => app.select('person', s), sara);
  await B.locator('#panel').getByRole('button', { name: 'Det här är jag' }).click();
  expect(await B.evaluate(() => app.homePerson().id)).toBe(sara);
  await done();
});

test('opening the link moves the person to the middle without selecting them or changing the zoom', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  const { sara } = await sender(A);
  await open(B, await A.evaluate((s) => app.Share.readLink(undefined, s), sara));
  const where = () => B.evaluate((id) => {
    const svg = document.querySelector('#treeSvg'), c = document.querySelector(`#treeSvg g.card[data-k="${id}"]`);
    if (!c) return null; const s = svg.getBoundingClientRect(), r = c.getBoundingClientRect();
    return { dx: Math.abs((r.left + r.right) / 2 - (s.left + s.right) / 2) / s.width, dy: Math.abs((r.top + r.bottom) / 2 - (s.top + s.bottom) / 2) / s.height, k: window.d3.zoomTransform(svg).k };
  }, sara);
  await expect.poll(async () => { const w = await where(); return !!w && w.dx < 0.08 && w.dy < 0.12; }).toBe(true);
  expect(await B.evaluate(() => [app.ui.sel, document.querySelector('#panel').classList.contains('open')])).toEqual([null, false]);
  const k = (await where()).k;
  // The same tree drawn the ordinary way has the same zoom.
  await B.evaluate(() => { app.ui.treeKey = null; app.renderAll(true); });
  await expect.poll(async () => (await where()).k).toBeCloseTo(k, 5);
  await done();
});

test('the address loses ?p= at once, and the app opens offline through /?p=…', async ({ browser }) => {
  const { A, B, done } = await two(browser);
  const { sara } = await sender(A);
  const [plain, withP] = await A.evaluate((s) => [app.Share.readLink(), app.Share.readLink(undefined, s)], sara);
  await open(B, plain);
  // Register the service worker (the app only does this on https) and let it cache the app.
  await B.evaluate(() => navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready));
  await B.reload();
  await expect.poll(() => B.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => B.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).filter((r) => /src\/app\/\w+\.js\?v=/.test(r.url)).length; })).toBeGreaterThan(25);
  await B.context().setOffline(true);
  await open(B, withP);
  expect(await B.evaluate(() => [location.search, location.hash, app.ui.focus])).toEqual(['', '#trad', sara]);
  await expect(B.locator('#meBar')).toContainText('Är du Sara Lindqvist?');
  // A reload (or a bookmark) no longer carries the person.
  await B.reload();
  await expect.poll(() => B.evaluate(() => typeof app !== 'undefined' && app.Store.loaded)).toBe(true);
  expect(await B.evaluate(() => location.href)).not.toContain('p=');
  await expect(B.locator('#meBar')).toBeHidden();
  await B.context().setOffline(false);
  await done();
});
