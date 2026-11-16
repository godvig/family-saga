import { describe, it, expect, vi } from 'vitest';
import { createHandler, validateQuery, ALLOWED_ORIGINS } from '../supabase/functions/archive-search/logic.mjs';
import { riksarkivet } from '../supabase/functions/archive-search/adapters/riksarkivet.mjs';

/* Nothing here touches the network: fetch is always a stand-in, and every name is made up. */
const URL_BASE = 'https://data.riksarkivet.se/api/records';
const SELF = (id) => `https://data.riksarkivet.se/register/${id}`;
const NOW = Date.UTC(2026, 10, 16);

const birthReply = {
  totalHits: 448, hits: 2, offset: 0,
  facets: [],
  items: [
    { type: 'BirthRecord', objectType: 'Register', id: 'AbCd1234', caption: 'Elin',
      metadata: { date: '1887-05-02', childsName: 'Elin', fathersName: 'Olofsson Ekelöv, Olof', mothersName: 'Strand, Erika', parish: 'Sälgsjö' }, _links: { self: SELF('AbCd1234') } },
    { type: 'BirthRecord', objectType: 'Register', id: 'EfGh5678', caption: 'Karl',
      metadata: { date: '1890-09-09', childsName: 'Karl', fathersName: 'Olofsson Ekelöv, Olof', mothersName: 'Strand, Erika', parish: 'Sälgsjö' }, _links: { self: SELF('EfGh5678') } },
  ],
  _links: { self: URL_BASE },
};
const marriageReply = {
  totalHits: 1, hits: 1, offset: 0,
  items: [{ type: 'MarriageRecord', objectType: 'Register', id: 'IjKl9012', caption: 'x', metadata: { groomsName: 'Nilsson Ekelöv, Olof', bridesName: 'Strand, Erika', parish: 'Tallmora', date: '1884-02-28' }, _links: { self: SELF('IjKl9012') } }],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const good = { source: 'riksarkivet', kind: 'birth', name: 'Olof Ekelöv', yearMin: 1880, yearMax: 1890 };
const call = (handler, body, { origin, method = 'POST', raw } = {}) => handler(new Request('https://fn.example/functions/v1/archive-search', {
  method, headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' }, body: method === 'POST' ? (raw ?? JSON.stringify(body)) : undefined }));
const setup = (reply = () => json(birthReply), extra = {}) => {
  const fetch = vi.fn(async (...a) => reply(...a)), log = vi.fn();
  return { fetch, log, handle: createHandler({ fetch, log, now: () => NOW, ...extra }) };
};

describe('a valid query', () => {
  it('returns candidates in the common shape', async () => {
    const { handle, fetch } = setup();
    const res = await call(handle, good, { origin: 'https://xn--slktsagan-w2a.se' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ source: 'riksarkivet', kind: 'birth', total: 448, offset: 0 });
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0]).toEqual({ source: 'riksarkivet', kind: 'birth', id: 'AbCd1234', url: SELF('AbCd1234'), date: '1887-05-02', parish: 'Sälgsjö',
      child: 'Elin', father: 'Olofsson Ekelöv, Olof', mother: 'Strand, Erika', raw: expect.objectContaining({ childsName: 'Elin' }) });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('reads marriages as groom and bride', async () => {
    const { handle } = setup(() => json(marriageReply));
    const body = await (await call(handle, { ...good, kind: 'marriage' })).json();
    expect(body.candidates[0]).toMatchObject({ kind: 'marriage', groom: 'Nilsson Ekelöv, Olof', bride: 'Strand, Erika', date: '1884-02-28', parish: 'Tallmora' });
    expect(body.candidates[0].child).toBeUndefined();
  });
  it('builds the upstream address itself, from the allowed parameters only', async () => {
    const { handle, fetch } = setup();
    await call(handle, { ...good, place: 'Skåne län', limit: 5, offset: 10 });
    const [url, init] = fetch.mock.calls[0], u = new URL(url);
    expect(u.origin + u.pathname).toBe(URL_BASE);
    expect([...u.searchParams.keys()].sort()).toEqual(['facet', 'limit', 'name', 'offset', 'place', 'year_max', 'year_min']);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ name: 'Olof Ekelöv', place: 'Skåne län', year_min: '1880', year_max: '1890', limit: '5', offset: '10', facet: 'ObjectType:Register;Type:BirthRecord' });
    expect(init.redirect).toBe('error');
  });
  it('asks for marriage records with the marriage facet', async () => {
    const { handle, fetch } = setup(() => json(marriageReply));
    await call(handle, { ...good, kind: 'marriage' });
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('facet')).toBe('ObjectType:Register;Type:MarriageRecord');
  });
  it('defaults to 20 hits from the start', () => {
    expect(validateQuery(good, undefined, 2026).query).toMatchObject({ limit: 20, offset: 0 });
  });
  it('answers the same question from memory for a while, and a different one from the archive', async () => {
    let t = NOW;
    const { handle, fetch } = setup(undefined, { now: () => t });
    await call(handle, good); await call(handle, { ...good, name: '  olof   ekelöv ' });
    expect(fetch).toHaveBeenCalledTimes(1);
    await call(handle, { ...good, offset: 50 }); expect(fetch).toHaveBeenCalledTimes(2);
    t += 11 * 60_000; await call(handle, good); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('says whether more hits exist beyond the page it returned', async () => {
    const { handle } = setup(); // the stand-in reply has totalHits 448 and two hits
    expect((await (await call(handle, good)).json()).more).toBe(true);
    expect((await (await call(handle, { ...good, offset: 100 })).json()).more).toBe(true);
    const one = setup(() => json(marriageReply)); // totalHits 1, one hit
    expect((await (await call(one.handle, { ...good, kind: 'marriage' })).json()).more).toBe(false);
  });
  it('says there is no more when the page reaches the total', async () => {
    const exact = setup(() => json({ totalHits: 2, hits: 2, offset: 0, items: birthReply.items.slice(0, 2) }));
    expect((await (await call(exact.handle, good)).json()).more).toBe(false);
  });
  it('lets a query reach at most 200 records, counting offset and limit together', () => {
    const ok = (extra) => validateQuery({ ...good, ...extra }, undefined, 2026).ok;
    expect(ok({ limit: 50, offset: 150 })).toBe(true);
    expect(ok({ limit: 50, offset: 151 })).toBe(false);
    expect(ok({ limit: 20, offset: 180 })).toBe(true);
    expect(ok({ limit: 1, offset: 200 })).toBe(false);
    expect(ok({ offset: 1000 })).toBe(false);
    expect(validateQuery({ ...good, limit: 50, offset: 200 }, undefined, 2026).field).toBe('offset');
  });
  it('lets the browser keep an answer briefly, but never an error', async () => {
    const { handle } = setup();
    expect((await call(handle, good)).headers.get('cache-control')).toBe('private, max-age=600');
    expect((await call(handle, { ...good, kind: 'nope' })).headers.get('cache-control')).toBe('no-store');
  });
});

describe('queries that are refused', () => {
  const bad = [
    ['an unknown field', { ...good, extra: 1 }, 'extra'],
    ['a free URL', { ...good, url: 'https://evil.example/' }, 'url'],
    ['a free parameter string', { ...good, params: 'facet=x' }, 'params'],
    ['a URL as the source', { ...good, source: 'https://evil.example' }, 'source'],
    ['a source from the prototype chain', { ...good, source: 'constructor' }, 'source'],
    ['a source that does not exist', { ...good, source: 'arkivdigital' }, 'source'],
    ['no kind', { ...good, kind: undefined }, 'kind'],
    ['a kind the source lacks', { ...good, kind: 'death' }, 'kind'],
    ['a name with digits', { ...good, name: 'Olof 123' }, 'name'],
    ['a name that smuggles in parameters', { ...good, name: 'Olof&facet=x' }, 'name'],
    ['a name with a semicolon', { ...good, name: 'Olof;Place:Sverige' }, 'name'],
    ['a one-letter name', { ...good, name: 'O' }, 'name'],
    ['a name that is too long', { ...good, name: 'O'.repeat(81) }, 'name'],
    ['a name that is not text', { ...good, name: 42 }, 'name'],
    ['a year before 1500', { ...good, yearMin: 1499 }, 'yearMin'],
    ['a year in the future', { ...good, yearMax: 2027 }, 'yearMax'],
    ['years the wrong way round', { ...good, yearMin: 1890, yearMax: 1880 }, 'yearMax'],
    ['a span over 100 years', { ...good, yearMin: 1700, yearMax: 1801 }, 'yearMax'],
    ['a fractional year', { ...good, yearMin: 1880.5 }, 'yearMin'],
    ['a year as text', { ...good, yearMin: '1880' }, 'yearMin'],
    ['a limit over 50', { ...good, limit: 51 }, 'limit'],
    ['a limit of 0', { ...good, limit: 0 }, 'limit'],
    ['a negative offset', { ...good, offset: -1 }, 'offset'],
    ['a place with a path trick', { ...good, place: 'Sverige/../x?y=1' }, 'place'],
  ];
  it.each(bad)('%s', async (_, body, field) => {
    const { handle, fetch } = setup();
    const res = await call(handle, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_query', field });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('a body that is not JSON, not an object, or too large', async () => {
    const { handle, fetch } = setup();
    expect((await call(handle, null, { raw: 'not json' })).status).toBe(400);
    expect((await call(handle, null, { raw: '[1,2]' })).status).toBe(400);
    expect((await call(handle, null, { raw: 'null' })).status).toBe(400);
    expect((await call(handle, { ...good, name: 'O'.repeat(3000) })).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never repeats what was sent in its answer', async () => {
    const { handle } = setup();
    const text = await (await call(handle, { ...good, name: 'Secret Namn 1' })).text();
    expect(text).not.toContain('Secret');
  });
});

describe('when the archive fails', () => {
  it('turns an error status into upstream_error', async () => {
    const { handle } = setup(() => json({}, 500));
    const res = await call(handle, good);
    expect(res.status).toBe(502); expect(await res.json()).toMatchObject({ error: 'upstream_error', upstream: 500 });
  });
  it('turns a network failure, bad JSON and an unexpected shape into upstream_error', async () => {
    for (const reply of [() => { throw new TypeError('network'); }, () => new Response('<html>', { status: 200 }), () => json({ nope: true }), () => json(null)]) {
      const res = await call(setup(reply).handle, good);
      expect(res.status).toBe(502); expect((await res.json()).error).toBe('upstream_error');
    }
  });
  it('gives up after the timeout', async () => {
    const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const { handle } = setup(hang, { timeoutMs: 20 });
    const res = await call(handle, good);
    expect(res.status).toBe(504); expect((await res.json()).error).toBe('timeout');
  });
  it('does not remember a failure', async () => {
    let fail = true;
    const { handle, fetch } = setup(() => (fail ? json({}, 503) : json(birthReply)));
    expect((await call(handle, good)).status).toBe(502); fail = false;
    expect((await call(handle, good)).status).toBe(200); expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('CORS', () => {
  it.each(['https://xn--slktsagan-w2a.se', 'http://localhost:8000', 'http://localhost'])('answers %s', async (origin) => {
    const res = await call(setup().handle, good, { origin });
    expect(res.headers.get('access-control-allow-origin')).toBe(origin); expect(res.headers.get('vary')).toBe('Origin');
  });
  it('answers the preflight request', async () => {
    const { handle, fetch } = setup();
    const res = await call(handle, null, { method: 'OPTIONS', origin: 'http://localhost:5173' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('apikey');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['https://evil.example', 'https://klansagan.godvig.com', 'https://saga.godvig.com', 'http://xn--slktsagan-w2a.se', 'https://släktsagan.se', 'https://xn--slktsagan-w2a.se.evil.example', 'https://klansagan.godvig.com.evil.example', 'http://localhost.evil.example', 'http://localhost:80a', 'null'])('refuses %s', async (origin) => {
    const { handle, fetch } = setup();
    for (const method of ['POST', 'OPTIONS']) {
      const res = await call(handle, good, { origin, method });
      expect(res.status).toBe(403); expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('lets a caller without an Origin header through (curl), but sends no CORS headers', async () => {
    const res = await call(setup().handle, good);
    expect(res.status).toBe(200); expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('only allows POST', async () => {
    const res = await call(setup().handle, null, { method: 'GET' });
    expect(res.status).toBe(405); expect(res.headers.get('allow')).toContain('POST');
  });
  it('lists no origin but the app\'s', () => {
    expect(ALLOWED_ORIGINS.every((o) => o.startsWith('https://'))).toBe(true);
  });
});

describe('logging', () => {
  it('logs source, kind and status, and nothing else', async () => {
    const { handle, log } = setup(() => json(birthReply));
    await call(handle, good);
    await call(handle, good);                                  // from memory
    await call(handle, { ...good, kind: 'marriage', name: 'Hemlig Person' }, {});
    await call(handle, { ...good, name: 'Hemlig Person 9' });  // invalid
    await call(handle, { ...good, source: 'Hemlig Person', extra: 1 });
    expect(log.mock.calls.length).toBeGreaterThanOrEqual(5);
    for (const [entry] of log.mock.calls) expect(Object.keys(entry).sort()).toEqual(['kind', 'source', 'status']);
    const all = JSON.stringify(log.mock.calls);
    expect(all).not.toMatch(/Ekelöv|Olof|Hemlig/);
    expect(log.mock.calls.at(-1)[0]).toEqual({ source: null, kind: 'birth', status: 400 });
  });
});

describe('the Riksarkivet adapter', () => {
  it('passes on links only when they point at Riksarkivet over https', () => {
    const item = (id, self) => ({ type: 'BirthRecord', id, metadata: { childsName: 'Elin' }, _links: { self } });
    const { candidates } = riksarkivet.parse({ items: [item('a1', 'https://evil.example/x'), item('a2', 'http://data.riksarkivet.se/register/a2'), item('a3', 'javascript:alert(1)'), item('a4', SELF('a4')), { type: 'BirthRecord', id: 'a5', metadata: {} }] }, { kind: 'birth' });
    expect(candidates.map((c) => c.url)).toEqual(['', '', '', SELF('a4'), '']);
  });
  it('skips records of another kind, with an odd id or without metadata', () => {
    const { candidates } = riksarkivet.parse({ items: [
      { type: 'MarriageRecord', id: 'm1', metadata: {} }, { type: 'BirthRecord', id: 'bad id!', metadata: {} }, { type: 'BirthRecord', id: 'ok1' }, null, 'x',
      { type: 'BirthRecord', id: 'ok2', metadata: { childsName: 'Elin' } }] }, { kind: 'birth' });
    expect(candidates.map((c) => c.id)).toEqual(['ok2']);
  });
  it('trims and shortens text, and keeps only string metadata in raw', () => {
    const { candidates } = riksarkivet.parse({ items: [{ type: 'BirthRecord', id: 'a', metadata: { childsName: '  Elin   Maria ', parish: 'x'.repeat(500), n: 5, o: { a: 1 } } }] }, { kind: 'birth' });
    expect(candidates[0].child).toBe('Elin Maria'); expect(candidates[0].parish).toHaveLength(200); expect(Object.keys(candidates[0].raw)).toEqual(['childsName', 'parish']);
  });
  it('takes the total from the reply, or counts what it got', () => {
    expect(riksarkivet.parse({ totalHits: 12, items: [] }, { kind: 'birth' }).total).toBe(12);
    expect(riksarkivet.parse({ totalHits: 'many', items: [{ type: 'BirthRecord', id: 'a', metadata: {} }] }, { kind: 'birth' }).total).toBe(1);
  });
  it('encodes awkward characters in the name', () => {
    const { url } = riksarkivet.buildRequest({ kind: 'birth', name: "Åsa O'Neil, Östen", yearMin: 1800, yearMax: 1850, limit: 20, offset: 0 });
    expect(new URL(url).searchParams.get('name')).toBe("Åsa O'Neil, Östen"); expect(new URL(url).searchParams.has('place')).toBe(false);
  });
});
