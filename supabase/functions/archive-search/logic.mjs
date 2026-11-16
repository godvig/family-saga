/* archive-search: the request handling, free of Deno and the network so Vitest can run it.
   index.ts only wires createHandler() to Deno.serve() with the real fetch.

   Why this function exists: Riksarkivet's API answers without Access-Control-Allow-Origin, so a
   browser may not read the reply. This function asks on the app's behalf. It is deliberately not a
   proxy: the app sends a small query of its own, this code validates every field and builds the
   upstream address itself, and nothing the caller sends is ever forwarded as it is.

   It never sees the family tree, and it never logs a searched name. */
import { riksarkivet } from './adapters/riksarkivet.mjs';

export const ADAPTERS = { riksarkivet };

/** Where the app is served from, as the browser sends it in Origin: an internationalised domain arrives in punycode
    (släktsagan.se → xn--slktsagan-w2a.se). localhost is for development. */
export const ALLOWED_ORIGINS = ['https://xn--slktsagan-w2a.se'];
const LOCAL_ORIGIN = /^http:\/\/localhost(:\d{1,5})?$/;

const FIELDS = new Set(['source', 'kind', 'name', 'yearMin', 'yearMax', 'place', 'limit', 'offset']);
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’,-]*$/u;
const PLACE_RE = /^\p{L}[\p{L}\p{M} .'’,/-]*$/u;
const MAX_BODY = 2048;
const MIN_YEAR = 1500;
const MAX_SPAN = 100;
const MAX_RECORDS = 200; // most records one query may reach: offset + limit
const CACHE_ENTRIES = 200;

const originAllowed = (o) => ALLOWED_ORIGINS.includes(o) || LOCAL_ORIGIN.test(o);

/** @returns {{ok:true, query:object} | {ok:false, field:string}} */
export function validateQuery(body, adapters = ADAPTERS, nowYear = new Date().getFullYear()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' };
  for (const k of Object.keys(body)) if (!FIELDS.has(k)) return { ok: false, field: k };
  const bad = (field) => ({ ok: false, field });

  if (typeof body.source !== 'string' || !Object.hasOwn(adapters, body.source)) return bad('source');
  if (typeof body.kind !== 'string' || !adapters[body.source].kinds.includes(body.kind)) return bad('kind');

  const clean = (v) => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : '');
  const name = clean(body.name);
  if (name.length < 2 || name.length > 80 || !NAME_RE.test(name) || (name.match(/\p{L}/gu) || []).length < 2) return bad('name');

  const int = (v, lo, hi, dflt) => {
    if (v === undefined && dflt !== undefined) return dflt;
    return Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  };
  const yearMin = int(body.yearMin, MIN_YEAR, nowYear), yearMax = int(body.yearMax, MIN_YEAR, nowYear);
  if (yearMin === null) return bad('yearMin');
  if (yearMax === null || yearMax < yearMin || yearMax - yearMin > MAX_SPAN) return bad('yearMax');
  const limit = int(body.limit, 1, 50, 20); if (limit === null) return bad('limit');
  const offset = int(body.offset, 0, MAX_RECORDS - 1, 0); if (offset === null || offset + limit > MAX_RECORDS) return bad('offset');

  const query = { source: body.source, kind: body.kind, name, yearMin, yearMax, limit, offset };
  if (body.place !== undefined) {
    const place = clean(body.place);
    if (place.length < 2 || place.length > 60 || !PLACE_RE.test(place)) return bad('place');
    query.place = place;
  }
  return { ok: true, query };
}

const defaultLog = (entry) => console.log(JSON.stringify(entry));

/**
 * @param {{fetch?:typeof fetch, adapters?:object, timeoutMs?:number, ttlMs?:number, cache?:Map<string,any>,
 *   now?:()=>number, log?:(e:{source:string|null, kind:string|null, status:number})=>void}} [deps]
 * @returns {(request:Request)=>Promise<Response>}
 */
export function createHandler({ fetch: doFetch = globalThis.fetch, adapters = ADAPTERS, timeoutMs = 8000, ttlMs = 600_000,
  cache = new Map(), now = Date.now, log = defaultLog } = {}) {

  return async function handle(request) {
    const origin = request.headers.get('origin');
    const cors = origin && originAllowed(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
      : {};
    let source = null, kind = null;
    const reply = (status, body, extra = {}) => {
      log({ source, kind, status });
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors, ...extra };
      return new Response(body === null ? null : JSON.stringify(body), { status, headers });
    };
    const fail = (status, error, message, extra) => reply(status, { error, message, ...extra });

    if (origin && !originAllowed(origin)) return fail(403, 'origin_not_allowed', 'This origin may not use the function.');
    if (request.method === 'OPTIONS') return reply(204, null);
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed', message: 'Use POST.' }, { Allow: 'POST, OPTIONS' });

    const text = await request.text();
    if (text.length > MAX_BODY) return fail(413, 'invalid_query', 'The query is too large.', { field: 'body' });
    let body;
    try { body = JSON.parse(text); } catch { return fail(400, 'invalid_query', 'The body is not JSON.', { field: 'body' }); }

    // Only values that passed an allow-list are ever logged, never a name.
    if (body && typeof body === 'object' && typeof body.source === 'string' && Object.hasOwn(adapters, body.source)) source = body.source;
    if (body && typeof body === 'object' && (body.kind === 'birth' || body.kind === 'marriage')) kind = body.kind;

    const v = validateQuery(body, adapters, new Date(now()).getFullYear());
    if (!v.ok) return fail(400, 'invalid_query', 'The query was not accepted.', { field: v.field });
    const q = v.query, adapter = adapters[q.source];

    const key = JSON.stringify([q.source, q.kind, q.name.toLowerCase(), q.yearMin, q.yearMax, q.place || '', q.limit, q.offset]);
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return reply(200, hit.body, { 'Cache-Control': `private, max-age=${Math.floor(ttlMs / 1000)}` });

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let result;
    try {
      const req = adapter.buildRequest(q);
      const res = await doFetch(req.url, { headers: req.headers, signal: ctl.signal, redirect: 'error' });
      if (!res.ok) return fail(502, 'upstream_error', 'The archive answered with an error.', { upstream: res.status });
      result = adapter.parse(JSON.parse(await res.text()), q);
    } catch {
      if (ctl.signal.aborted) return fail(504, 'timeout', 'The archive did not answer in time.');
      return fail(502, 'upstream_error', 'The archive could not be read.');
    } finally { clearTimeout(timer); }

    const more = result.total > q.offset + result.candidates.length;
    const out = { source: q.source, kind: q.kind, total: result.total, offset: q.offset, more, candidates: result.candidates };
    if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now(), body: out });
    return reply(200, out, { 'Cache-Control': `private, max-age=${Math.floor(ttlMs / 1000)}` });
  };
}
