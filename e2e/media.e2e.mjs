import { test, expect, importExample, jpeg } from './fixtures.mjs';

test('an image dropped on a tree card becomes the profile photo', async ({ page }) => {
  await importExample(page);
  await page.evaluate(() => { location.hash = 'trad'; });
  const pid = await page.evaluate(() => [...document.querySelectorAll('#treeSvg g.card[data-k]')].map((e) => e.dataset.k).find((k) => !k.startsWith('g:')));
  const url = await jpeg(page);
  await page.evaluate(([pid, url]) => {
    const bin = atob(url.split(',')[1]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u], 'farmor.jpg', { type: 'image/jpeg' }));
    const el = document.querySelector(`#treeSvg g.card[data-k="${pid}"] rect.bg`);
    for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [pid, url]);
  await expect.poll(() => page.evaluate((pid) => !!app.avatarUrl(app.P(pid)), pid), { timeout: 15000 }).toBe(true);
  expect(await page.evaluate((pid) => !!app.P(pid).media[0].thumb, pid)).toBe(true);
});

test('a voice memory can be recorded, saved and played', async ({ page, context }) => {
  await context.grantPermissions(['microphone']);
  await importExample(page);
  const pid = await page.evaluate(() => Object.keys(app.ALL.persons)[0]);
  await page.evaluate((pid) => { location.hash = 'trad'; app.select('person', pid); }, pid);
  await page.click('[data-act=record]');
  await page.click('#recBtn');
  await page.waitForTimeout(2200);
  await page.click('#recBtn');
  await page.fill('#recT', 'Farmor berättar');
  await page.click('.ov [data-ok]');
  await expect.poll(() => page.evaluate((pid) => (app.P(pid).media || []).filter(app.isAudio).map((m) => [m.caption, m.duration > 0]), pid)).toEqual([['Farmor berättar', true]]);
  await page.click('.vm [data-play]');
  await expect.poll(() => page.evaluate(() => { const a = document.querySelector('.vm audio'); return !!a && a.currentTime > 0; })).toBe(true);
});

test('the photo viewer steps through a person\'s photos with arrows, keys and swipes', async ({ page }) => {
  await importExample(page);
  const url = await jpeg(page);
  const pid = await page.evaluate(async (url) => {
    const p = Object.values(app.ALL.persons)[0];
    await app.Store.put({ ...p, media: ['Konfirmation 1902', 'Bröllopet', ''].map((c, i) => ({ url, contentType: 'image/jpeg', name: `bild${i}.jpg`, caption: c })) });
    return p.id;
  }, url);
  await page.evaluate((pid) => app.openCard(pid), pid);
  await expect(page.locator('.gallery.feat figure')).toHaveCount(3);
  await expect(page.locator('.gallery figcaption').first()).toHaveText('Konfirmation 1902');
  await page.locator('.gallery figure').nth(1).click();
  const lb = page.locator('.lightbox');
  await expect(lb.locator('.lb-count')).toHaveText('2 / 3');
  await expect(lb.locator('#lbCap')).toHaveValue('Bröllopet');
  await lb.locator('.lb-nav.next').click();
  await expect(lb.locator('.lb-count')).toHaveText('3 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(lb.locator('.lb-count')).toHaveText('1 / 3');
  await page.keyboard.press('ArrowLeft');
  await expect(lb.locator('.lb-count')).toHaveText('3 / 3');
  await lb.locator('.lb-th').first().click();
  await expect(lb.locator('.lb-count')).toHaveText('1 / 3');
  // Swipe left = next.
  await page.evaluate(() => { const el = document.querySelector('.lightbox .lb-stage'); const t = (x) => [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })];
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: t(300), changedTouches: t(300) }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: t(150) })); });
  await expect(lb.locator('.lb-count')).toHaveText('2 / 3');
  // Saving a caption keeps you on the same photo.
  await lb.locator('#lbCap').fill('Bröllopet 1925');
  await lb.locator('#lbSave').click();
  await expect(lb.locator('.lb-count')).toHaveText('2 / 3');
  expect(await page.evaluate((pid) => app.P(pid).media[1].caption, pid)).toBe('Bröllopet 1925');
  await page.keyboard.press('Escape');
  await expect(lb).toHaveCount(0);
});

test('photos are kept large and thumbnails sharp', async ({ page }) => {
  await importExample(page);
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const x = c.getContext('2d');
    for (let i = 0; i < 4000; i += 4) { x.fillStyle = i % 8 ? '#222' : '#eee'; x.fillRect(i, 0, 4, 3000); }
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
    const url = await app.shrinkImage(new File([blob], 'stor.jpg', { type: 'image/jpeg' }));
    const size = (u) => new Promise((ok) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.src = u; });
    return { full: await size(url), thumb: await size(await app.makeThumb(url)), len: url.length };
  });
  expect(r.full[0]).toBeGreaterThanOrEqual(1600); expect(r.full[0]).toBeLessThanOrEqual(2400);
  expect(r.thumb).toEqual([480, 360]);
  expect(r.len).toBeLessThan(2.6e6);
});

test('a photo can be swapped for a better copy, keeping its caption and voice memory', async ({ page }) => {
  await importExample(page);
  const url = await jpeg(page);
  const pid = await page.evaluate(async (url) => { const p = Object.values(app.ALL.persons)[0];
    await app.Store.put({ ...p, media: [{ url, contentType: 'image/jpeg', name: 'gammal.jpg', caption: 'Bröllopet' }, { url: 'data:audio/webm;base64,AAAA', contentType: 'audio/webm', name: 'röst', forImg: url }] });
    location.hash = 'trad'; app.select('person', p.id); return p.id; }, url);
  await page.locator('#panel [data-media="0"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.click('#lbSwap');
  const b64 = (await jpeg(page)).split(',')[1];
  await (await chooser).setFiles({ name: 'skarp.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  await expect(page.locator('.toast')).toContainText('utbytt');
  const m = await page.evaluate((pid) => app.P(pid).media, pid);
  expect(m[0].name).toBe('skarp.jpg'); expect(m[0].caption).toBe('Bröllopet'); expect(m[0].url).toMatch(/^kl:/); expect(m[1].forImg).toBe(m[0].url);
});

test('HEIC photos from phones are converted and kept', async ({ page }) => {
  await importExample(page);
  const pid = await page.evaluate(() => { const p = Object.values(app.ALL.persons)[0]; location.hash = 'trad'; app.select('person', p.id); return p.id; });
  await page.setInputFiles('#upl', 'e2e/files/syntetisk.heic');
  await expect.poll(() => page.evaluate((pid) => (app.P(pid).media || []).length, pid), { timeout: 20000 }).toBe(1);
  const m = await page.evaluate(async (pid) => { const m = app.P(pid).media[0]; const u = await app.blobUrl(m);
    const s = await new Promise((ok) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.onerror = () => ok(null); im.src = u; }); return { type: m.contentType, size: s }; }, pid);
  expect(m).toEqual({ type: 'image/jpeg', size: [1200, 900] });
});

test('older photos get a sharper thumbnail on this device without changing the data', async ({ page }) => {
  await importExample(page);
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1100; c.height = 800; c.getContext('2d').fillRect(0, 0, 500, 500);
    const full = c.toDataURL('image/jpeg', 0.8); const small = await app.makeThumb(full, 240);
    const id = await app.storeBlob(full), tid = await app.storeBlob(small);
    const p = Object.values(app.ALL.persons)[0]; await app.Store.put({ ...p, media: [{ url: 'kl:' + id, thumb: 'kl:' + tid, contentType: 'image/jpeg', name: 'gammal.jpg' }] });
    const before = JSON.stringify(app.P(p.id).media);
    await app.sharpenOldThumbs();
    const u = app.thumbUrl(app.P(p.id).media[0]);
    const w = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im.naturalWidth); im.src = u; });
    return { w, same: JSON.stringify(app.P(p.id).media) === before };
  });
  expect(r).toEqual({ w: 480, same: true });
});

test('a very large photo is scaled down without unpacking it on the page', async ({ page }) => {
  await importExample(page);
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 9000; c.height = 6000; const x = c.getContext('2d'); x.fillStyle = '#964'; x.fillRect(0, 0, 9000, 6000); x.fillStyle = '#eee'; x.fillRect(0, 0, 4500, 3000);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9)); c.width = c.height = 1;
    let big = 0; const orig = document.createElement.bind(document);
    document.createElement = (t) => { const el = orig(t); if (t === 'canvas') setTimeout(() => { big = Math.max(big, el.width * el.height); }, 0); return el; };
    const url = await app.shrinkImage(new File([blob], 'jatte.jpg', { type: 'image/jpeg' }));
    await new Promise((ok) => setTimeout(ok, 50)); document.createElement = orig;
    const size = await new Promise((ok) => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.src = url; });
    return { size, big };
  });
  expect(r.size).toEqual([2400, 1600]);
  expect(r.big).toBeLessThanOrEqual(2400 * 1600); // never a 54-megapixel canvas
});
