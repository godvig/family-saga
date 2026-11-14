import { test, expect, example, importExample } from './fixtures.mjs';

test('the research log keeps searches, empty ones too, and planned ones show on the start page', async ({ page }) => {
  await importExample(page);
  const pid = await page.evaluate(async () => {
    const p = Object.values(app.ALL.persons).sort((a, b) => a.id.localeCompare(b.id))[0];
    await app.Store.put({ kind: 'source', id: 's_test', title: 'Röke (L) AI:12 1850–1855', type: 'Husförhörslängd' });
    location.hash = 'trad'; app.setFocus(p.id); app.select('person', p.id); return p.id;
  });
  const sec = page.locator('#panel .research');
  await expect(sec).toContainText('Skriv upp var du har letat');

  // A search that came up empty.
  await sec.locator('[data-lgnew="found"]').click();
  await page.locator('.lg-res label:has(input[value="notfound"])').click();
  await page.fill('#lgG', 'Födelse');
  await page.selectOption('#lgS', 's_test');
  await page.fill('#lgW', 'sid 45');
  await expect(page.locator('#lgCiteRow')).toBeHidden();
  await page.click('#lgOk');
  await expect(sec.locator('.lg.r-notfound')).toContainText('Födelse');
  await expect(sec).toContainText('1 sökning utan resultat');

  // Something to look for later…
  await sec.locator('[data-lgnew="todo"]').click();
  await page.fill('#lgG', 'Flytt till Gävle');
  await page.click('#lgOk');
  await expect(sec.locator('.cm-count')).toHaveText('1 att leta');
  await page.evaluate(() => { location.hash = 'start'; });
  await expect(page.locator('.qrow', { hasText: 'Flytt till Gävle' })).toBeVisible();

  // …that is done later, found, and becomes a citation.
  await page.locator('.qrow', { hasText: 'Flytt till Gävle' }).click();
  await page.locator('#panel [data-lgdone]').click();
  await page.selectOption('#lgS', 's_test');
  await expect(page.locator('#lgCiteRow')).toBeVisible();
  await page.click('#lgOk');
  const state = await page.evaluate((pid) => ({ logs: Object.values(app.ALL.logs).filter((l) => l.personId === pid).map((l) => l.result).sort(), cites: app.P(pid).citations.map((c) => c.sourceId) }), pid);
  expect(state.logs).toEqual(['found', 'notfound']);
  expect(state.cites).toContain('s_test');

  // Merging a duplicate keeps the log.
  const other = await page.evaluate(async (pid) => { await app.Store.put({ kind: 'person', id: 'p_dupe', given: 'Dubblett' }); await app.Store.put({ kind: 'log', id: 'lg_d', personId: 'p_dupe', result: 'todo', goal: 'Dubbelkoll' });
    await app.mergePersons(pid, 'p_dupe'); return app.ALL.logs.lg_d.personId; }, pid);
  expect(other).toBe(pid);
});

test('the example has no research log and readers never see one', async ({ page }) => {
  await example(page);
  expect(await page.evaluate(() => Object.keys(app.ALL.logs).length)).toBe(0);
  const pub = await page.evaluate(() => KinCore.splitForReaders({ persons: {}, logs: { a: { id: 'a', kind: 'log', personId: 'x' } } }, 2026));
  expect(pub.pub.logs).toBeUndefined(); expect(Object.keys(pub.priv.logs)).toEqual(['a']);
});
