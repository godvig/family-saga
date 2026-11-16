/* Source adapter for Riksarkivet's search API (beta): https://data.riksarkivet.se/api/records
   An adapter turns the app's own small query into the source's request (buildRequest) and the
   source's answer into the common candidate shape (parse). Everything about one source lives here,
   so a new source is a new file with the same two functions and nothing else changes.

   Candidate shape (the same for every source):
     { source, kind: 'birth'|'marriage', id, url, date, parish,
       child?, father?, mother?   (birth)
       groom?, bride?             (marriage)
       raw }                      (the source's own metadata, strings only) */

const BASE = 'https://data.riksarkivet.se/api/records';
const HOST = 'data.riksarkivet.se';
const RECORD_TYPE = { birth: 'BirthRecord', marriage: 'MarriageRecord' };
const USER_AGENT = 'Slaktsagan archive-search (+https://github.com/godvig/slaktsagan)';

/** A string no longer than max, or '' for anything else. */
const str = (v, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Only plain https links to Riksarkivet itself are passed on to the app. */
function safeUrl(v) {
  try { const u = new URL(String(v)); return u.protocol === 'https:' && u.hostname === HOST ? u.href : ''; } catch { return ''; }
}

export const riksarkivet = {
  id: 'riksarkivet',
  kinds: ['birth', 'marriage'],

  /** @param {{kind:string, name:string, place?:string, yearMin:number, yearMax:number, limit:number, offset:number}} q */
  buildRequest(q) {
    const e = encodeURIComponent;
    const params = [
      ['name', q.name],
      ...(q.place ? [['place', q.place]] : []),
      ['year_min', q.yearMin], ['year_max', q.yearMax],
      ['limit', q.limit], ['offset', q.offset],
      ['facet', `ObjectType:Register;Type:${RECORD_TYPE[q.kind]}`],
    ];
    return {
      url: `${BASE}?${params.map(([k, v]) => `${k}=${e(String(v))}`).join('&')}`,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    };
  },

  /** @param {any} json the parsed response @param {{kind:string}} q */
  parse(json, q) {
    if (!json || typeof json !== 'object' || !Array.isArray(json.items)) throw new Error('unexpected response shape');
    const want = RECORD_TYPE[q.kind];
    const candidates = [];
    for (const it of json.items) {
      if (!it || it.type !== want || !it.metadata || typeof it.metadata !== 'object') continue;
      const id = str(it.id, 64);
      if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
      const m = it.metadata;
      const raw = {};
      for (const [k, v] of Object.entries(m).slice(0, 20)) if (typeof v === 'string') raw[str(k, 40)] = str(v);
      const c = { source: 'riksarkivet', kind: q.kind, id, url: safeUrl(it._links && it._links.self), date: str(m.date), parish: str(m.parish), raw };
      if (q.kind === 'birth') Object.assign(c, { child: str(m.childsName), father: str(m.fathersName), mother: str(m.mothersName) });
      else Object.assign(c, { groom: str(m.groomsName), bride: str(m.bridesName) });
      candidates.push(c);
    }
    const total = Number.isInteger(json.totalHits) && json.totalHits >= 0 ? json.totalHits : candidates.length;
    return { total, candidates };
  },
};
