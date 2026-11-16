// @ts-check
/**
 * Släktsagan core — pure, DOM-free logic shared by the app and the test suite.
 *
 * Everything here works on plain person objects of the shape used in the app:
 *   { id, given, surname, sex: 'M'|'K'|'', birthDate, deathDate, birthPlace,
 *     fatherId, motherId, spouseIds: string[], notDup?: string[] }
 * ('K' = kvinna/female, following the Swedish UI.)
 *
 * Loaded as a classic <script> in the browser (exposes `window.KinCore`) and
 * as a CommonJS module in Node (for Vitest).
 */
(function (root) {
  'use strict';

  /** @typedef {{id:string, given?:string, surname?:string, sex?:string, birthDate?:string, deathDate?:string, birthPlace?:string, fatherId?:string, motherId?:string, spouseIds?:string[], notDup?:string[]}} Person */
  /** @typedef {(id:string)=>Person|undefined|null} Getter */
  /** @typedef {{hide?:string[], hideUp?:string[], hideDown?:string[]}} View */

  /* ---------------------------------------------------------------- dates */

  /** First four-digit year in a free-text date ("ca 1820" → 1820). @param {unknown} s */
  const yearOf = (s) => { const m = String(s ?? '').match(/(\d{4})/); return m ? +m[1] : null; };

  /**
   * Sortable number for a genealogical date. Missing month/day sort mid-year.
   * @param {string|null|undefined} s
   * @returns {number|null}
   */
  function dateKey(s) {
    if (!s) return null;
    const m = String(s).match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
    if (!m) return null;
    return +m[1] + ((+(m[2] || 6)) - 1) / 12 + ((+(m[3] || 15)) - 1) / 372;
  }

  const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

  /** "1496-05-12" → "12 maj 1496". Anything else is returned as-is. @param {string|null|undefined} s */
  function fmtDate(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
    const m2 = String(s).match(/^(\d{4})-(\d{1,2})$/); if (m2) return `${MONTHS[+m2[2] - 1]} ${m2[1]}`;
    return String(s);
  }

  /** Date phrase for running text: "den 12 maj 1496", "år 1496", "ca 1820". @param {string|null|undefined} s */
  function whenText(s) {
    if (!s) return '';
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return 'den ' + fmtDate(s);
    if (/^\d{4}-\d{1,2}$/.test(s)) return 'i ' + fmtDate(s);
    if (/^\d{4}$/.test(s)) return 'år ' + s;
    return s;
  }

  /** Free-text date → GEDCOM 5.5.1 date ("ca 1780" → "ABT 1780"). @param {string|null|undefined} s */
  function gedDate(s) {
    if (!s) return '';
    s = String(s).trim();
    const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let pre = '';
    if (/^(ca|cirka|omkr|omkring|~)/i.test(s)) pre = 'ABT ';
    else if (/^(före|fore|innan)/i.test(s)) pre = 'BEF ';
    else if (/^(efter)/i.test(s)) pre = 'AFT ';
    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return pre + (+m[3]) + ' ' + M[+m[2] - 1] + ' ' + m[1];
    const m2 = s.match(/(\d{4})-(\d{1,2})/); if (m2) return pre + M[+m2[2] - 1] + ' ' + m2[1];
    const y = yearOf(s); return y ? pre + y : s;
  }

  /* ---------------------------------------------------------------- text */

  /** Swedish genitive: "Anna" → "Annas", "Lars" → "Lars", "Johan III" → "Johan III:s". @param {string} n */
  const genitive = (n) => /\s[IVXLC]+$|[0-9A-ZÅÄÖ]$/.test(n) ? n + ':s' : /[sxz]$/i.test(n) ? n : n + 's';

  /** URL-safe slug for view links ("Pappas sida" → "pappas-sida"). @param {string} t */
  const slugify = (t) => String(t || 'vy').toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'vy';

  /**
   * Parse text copied from Excel or a CSV file. Detects tab, semicolon or comma
   * from the first line and supports quoted fields with "" escapes.
   * @param {string} text
   * @returns {string[][]}
   */
  function parseDelimited(text) {
    text = text.replace(/^\ufeff/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const D = ['\t', ';', ','].map((d) => /** @type {[string, number]} */([d, first.split(d).length])).sort((a, b) => b[1] - a[1])[0][0];
    /** @type {string[][]} */ const rows = []; /** @type {string[]} */ let row = []; let cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === D) { row.push(cur.trim()); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
    return rows;
  }

  /* ---------------------------------------------------------------- duplicates */

  /** Normalise a name for fuzzy matching (Gustaf/Gustav, Wasa/Vasa, Larsdtr/Larsdotter). @param {string|undefined} s */
  function nrm(s) {
    return String(s || '').toLowerCase().normalize('NFC').replace(/[éè]/g, 'e').replace(/w/g, 'v').replace(/ph/g, 'f')
      .replace(/th/g, 't').replace(/ck/g, 'k').replace(/c(?=[aou])/g, 'k').replace(/q/g, 'k').replace(/z/g, 's')
      .replace(/dtr$/, 'dotter').replace(/(.)\1+/g, '$1').trim();
  }

  /** Levenshtein distance. @param {string} a @param {string} b */
  function lev(a, b) {
    if (a === b) return 0;
    if (!a || !b) return Math.max(a.length, b.length);
    const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]; d[0] = i;
      for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
    }
    return d[b.length];
  }

  /**
   * 0–100 likelihood that two records are the same person (≥ 60 is shown as a candidate).
   * @param {Person} a @param {Person} b
   */
  function dupScore(a, b) {
    if (a.sex && b.sex && a.sex !== b.sex) return 0;
    if (a.fatherId === b.id || a.motherId === b.id || b.fatherId === a.id || b.motherId === a.id) return 0;
    if ((a.notDup || []).includes(b.id) || (b.notDup || []).includes(a.id)) return 0;
    const ga = nrm((a.given || '').split(/\s+/)[0]), gb = nrm((b.given || '').split(/\s+/)[0]);
    if (!ga || !gb) return 0;
    let s = 0; const gd = lev(ga, gb);
    if (gd === 0) s += 30; else if (gd === 1 && ga.length > 3) s += 18; else return 0;
    const sa = nrm(a.surname), sb = nrm(b.surname);
    if (sa && sb) { const d = lev(sa, sb); if (d === 0) s += 25; else if (d <= 2) s += 15; else s -= 25; } else s += 5;
    const ya = yearOf(a.birthDate), yb = yearOf(b.birthDate);
    if (ya && yb) { const d = Math.abs(ya - yb); if (d === 0) s += 25; else if (d <= 2) s += 14; else if (d > 5) return 0; else s -= 10; } else s += 4;
    const da = yearOf(a.deathDate), db = yearOf(b.deathDate);
    if (da && db) { const d = Math.abs(da - db); if (d === 0) s += 10; else if (d > 3) s -= 30; }
    if (a.fatherId && a.fatherId === b.fatherId) s += 15;
    if (a.motherId && a.motherId === b.motherId) s += 15;
    if (a.birthPlace && a.birthPlace === b.birthPlace) s += 10;
    return Math.max(0, Math.min(100, s));
  }

  /* ---------------------------------------------------------------- views */

  /**
   * Ids hidden by a view.
   *  - hide:     the person only
   *  - hideUp:   the person's ancestors and the ancestors' other descendants
   *              (e.g. "mum's side"), the person and their own descendants stay
   *  - hideDown: the person's descendants
   * People whose only connections are hidden (an aunt's husband) are hidden too.
   * @param {Record<string, Person>} persons @param {View} v
   * @returns {Set<string>}
   */
  function computeHidden(persons, v) {
    /** @type {Set<string>} */ const H = new Set();
    const A = persons; /** @type {Record<string,string[]>} */ const ch = {}; /** @type {Record<string,Set<string>>} */ const spx = {};
    for (const p of Object.values(A)) {
      for (const k of /** @type {const} */(['fatherId', 'motherId'])) { const pid = p[k]; if (pid) (ch[pid] = ch[pid] || []).push(p.id); }
      for (const s of p.spouseIds || []) { (spx[p.id] = spx[p.id] || new Set()).add(s); (spx[s] = spx[s] || new Set()).add(p.id); }
    }
    /** @param {string} id */
    const anc = (id) => { const out = new Set(), st = [id]; while (st.length) { const x = A[/** @type {string} */(st.pop())]; if (!x) continue; for (const k of /** @type {const} */(['fatherId', 'motherId'])) { const y = x[k]; if (y && !out.has(y)) { out.add(y); st.push(y); } } } return out; };
    /** @param {string} id */
    const desc = (id) => { const out = new Set(), st = [id]; while (st.length) { for (const c of ch[/** @type {string} */(st.pop())] || []) if (!out.has(c)) { out.add(c); st.push(c); } } return out; };
    for (const id of v.hideUp || []) { const keep = desc(id); keep.add(id); for (const a of anc(id)) { H.add(a); for (const d of desc(a)) if (!keep.has(d)) H.add(d); } }
    for (const id of v.hideDown || []) for (const d of desc(id)) H.add(d);
    for (const id of v.hide || []) H.add(id);
    for (let pass = 0; pass < 2; pass++) for (const p of Object.values(A)) {
      if (H.has(p.id)) continue;
      const links = new Set([p.fatherId, p.motherId, ...(ch[p.id] || []), ...(spx[p.id] || [])].filter((x) => x && A[x]));
      for (const c of ch[p.id] || []) { const cc = A[c]; const o = cc && (cc.fatherId === p.id ? cc.motherId : cc.fatherId); if (o && A[o]) links.add(o); }
      if (links.size && [...links].every((x) => H.has(/** @type {string} */(x)))) H.add(p.id);
    }
    return H;
  }

  /* ---------------------------------------------------------------- relationships */

  /** Shortest ancestor paths from `id`: ancestorId → {d, path:[id … ancestorId]}. @param {string} id @param {Getter} get */
  function upMap(id, get) {
    /** @type {Map<string,{d:number,path:string[]}>} */ const m = new Map([[id, { d: 0, path: [id] }]]);
    const q = [id];
    while (q.length) {
      const x = /** @type {string} */(q.shift()); const p = get(x); if (!p) continue;
      for (const k of /** @type {const} */(['fatherId', 'motherId'])) {
        const y = p[k];
        if (y && get(y) && !m.has(y)) { const path = /** @type {{path:string[]}} */(m.get(x)).path.concat(y); m.set(y, { d: path.length - 1, path }); q.push(y); }
      }
    }
    return m;
  }

  /**
   * Closest blood relationship between a and b via a common ancestor.
   * a/b = generations from each person up to the common ancestor.
   * @param {string} a @param {string} b @param {Getter} get
   */
  function blood(a, b, get) {
    const A = upMap(a, get), B = upMap(b, get);
    /** @type {{id:string,a:number,b:number,pa:string[],pb:string[],t:number,commons?:string[],half?:boolean}|null} */ let best = null;
    for (const [id, ia] of A) {
      const ib = B.get(id);
      if (ib) { const t = ia.d + ib.d; if (!best || t < best.t || (t === best.t && Math.abs(ia.d - ib.d) < Math.abs(best.a - best.b))) best = { id, a: ia.d, b: ib.d, pa: ia.path, pb: ib.path, t }; }
    }
    if (!best) return null;
    const bb = best;
    bb.commons = [...A].filter(([id, ia]) => { const ib = B.get(id); return ib && ia.d === bb.a && ib.d === bb.b; }).map(([id]) => id);
    if (bb.a > 0 && bb.b > 0 && bb.commons.length === 1) {
      const ca = get(bb.pa[bb.a - 1]), cb = get(bb.pb[bb.b - 1]);
      const oa = ca && (ca.fatherId === bb.id ? ca.motherId : ca.fatherId), ob = cb && (cb.fatherId === bb.id ? cb.motherId : cb.fatherId);
      bb.half = !!(oa && ob && oa !== ob);
    }
    return bb;
  }

  /**
   * Swedish kinship term for "B is A's ___" given a result from blood().
   * @param {NonNullable<ReturnType<typeof blood>>} r @param {string} bId @param {Getter} get
   */
  function bloodTerm(r, bId, get) {
    /** @param {string} id @param {string} m @param {string} f @param {string|null} n */
    const sx = (id, m, f, n) => { const p = get(id); return p && p.sex === 'M' ? m : p && p.sex === 'K' ? f : n; };
    /** @param {string[]} ids @param {string} mw @param {string} fw */
    const chain = (ids, mw, fw) => {
      const w = ids.map((id) => sx(id, mw, fw, null)); if (w.some((x) => !x)) return null;
      const chunks = []; for (let i = 0; i < w.length; i += 2) chunks.push(w.slice(i, i + 2).join('')); return chunks.join('s ');
    };
    /** @param {string[]} path */
    const ancTerm = (path) => { const ids = path.slice(1); const c = chain(ids, 'far', 'mor'); if (c) return c; const k = ids.length; return k === 1 ? 'förälder' : k === 2 ? 'mor- eller farförälder' : `ana i ${k}:e led`; };
    /** @param {string[]} ids */
    const descTerm = (ids) => { const c = chain(ids, 'son', 'dotter'); if (c) return c; const k = ids.length; return k === 1 ? 'barn' : k === 2 ? 'barnbarn' : k === 3 ? 'barnbarnsbarn' : `ättling i ${k}:e led`; };
    /** @param {number} n */
    const cous = (n) => n === 2 ? 'kusin' : n === 3 ? 'tremänning' : n === 4 ? 'fyrmänning' : n === 5 ? 'femmänning' : n === 6 ? 'sexmänning' : `${n}-männing`;
    const { a, b, pa, pb } = r;
    if (a === 0 && b === 0) return 'samma person';
    if (a === 0) return descTerm(pb.slice(0, b).reverse());
    if (b === 0) return ancTerm(pa);
    const h = r.half ? 'halv' : '';
    if (a === 1 && b === 1) return h + sx(bId, 'bror', 'syster', 'syskon');
    if (a === 1) {
      const sib = sx(pb[b - 1], 'bror', 'syster', null), kid = sx(pb[b - 2], 'son', 'dotter', null);
      const base = sib && kid ? ({ bror: { son: 'brorson', dotter: 'brorsdotter' }, syster: { son: 'systerson', dotter: 'systerdotter' } })[sib][kid] : 'syskonbarn';
      const t = h + base;
      return b === 2 ? t : `${t}s ${descTerm(pb.slice(0, b - 2).reverse())}`;
    }
    if (b === 1) {
      const sib = sx(bId, 'bror', 'syster', 'syskon');
      if (a === 2) {
        const pw = sx(pa[1], 'far', 'mor', null);
        if (pw && sib !== 'syskon') return h + ({ far: { bror: 'farbror', syster: 'faster' }, mor: { bror: 'morbror', syster: 'moster' } })[pw][sib];
      }
      return `${ancTerm(pa.slice(0, a))}s ${h}${sib}`;
    }
    if (a === b) return h + cous(a);
    if (a > b) return `${ancTerm(pa.slice(0, a - b + 1))}s ${h}${cous(b)}`;
    return `${h}${cous(a)}s ${descTerm(pb.slice(0, b - a).reverse())}`;
  }

  /**
   * Split people into separate family trees: groups that are not connected
   * through any parent, child or partner link. Largest group first.
   * @param {Record<string, Person>} persons
   * @returns {string[][]}
   */
  function components(persons) {
    /** @type {Record<string, string>} */
    const parent = {};
    /** @param {string} x @returns {string} */
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    /** @param {string} a @param {string} b */
    const join = (a, b) => { if (!(b in parent)) return; const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    for (const id of Object.keys(persons)) parent[id] = id;
    for (const p of Object.values(persons)) {
      if (p.fatherId) join(p.id, p.fatherId);
      if (p.motherId) join(p.id, p.motherId);
      for (const s of p.spouseIds || []) join(p.id, s);
    }
    /** @type {Record<string, string[]>} */
    const groups = {};
    for (const id of Object.keys(persons)) (groups[find(id)] = groups[find(id)] || []).push(id);
    return Object.values(groups).sort((a, b) => b.length - a.length);
  }

  /* ---------- Sharing: hashing, three-way merge, end-to-end encryption ---------- */

  /**
   * Short, stable hash of a JSON-able value (cyrb53). Used to remember what a
   * document looked like at the last published version without storing it.
   * @param {unknown} v
   * @returns {string}
   */
  function docHash(v) {
    const str = JSON.stringify(v);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  /** The archive's collections. Comments are documents of their own so concurrent ones merge cleanly. */
  const COLS = ['persons', 'places', 'sources', 'views', 'comments', 'logs'];

  /**
   * Hashes of every document in an archive: { persons: { id: hash }, … }.
   * @param {Record<string, Record<string, unknown>>} data
   * @returns {Record<string, Record<string, string>>}
   */
  function hashArchive(data) {
    /** @type {Record<string, Record<string, string>>} */
    const out = {};
    for (const c of COLS) { out[c] = {}; for (const [id, d] of Object.entries((data && data[c]) || {})) out[c][id] = docHash(d); }
    return out;
  }

  /**
   * Three-way merge of two archives that both started from `base` (given as hashes).
   * A document changed on only one side keeps that change; changed on both sides,
   * the one with the later `updatedAt` wins and counts as a conflict. Deletions merge too.
   * @param {Record<string, Record<string, string>>} baseHashes
   * @param {Record<string, Record<string, any>>} mine
   * @param {Record<string, Record<string, any>>} theirs
   * @returns {{ data: Record<string, Record<string, any>>, conflicts: string[] }}
   */
  function merge3(baseHashes, mine, theirs) {
    /** @type {Record<string, Record<string, any>>} */
    const data = {};
    /** @type {string[]} */
    const conflicts = [];
    for (const c of COLS) {
      const B = (baseHashes && baseHashes[c]) || {}, M = (mine && mine[c]) || {}, T = (theirs && theirs[c]) || {};
      data[c] = {};
      for (const id of new Set([...Object.keys(B), ...Object.keys(M), ...Object.keys(T)])) {
        const b = B[id], m = M[id], t = T[id];
        const hm = m === undefined ? undefined : docHash(m), ht = t === undefined ? undefined : docHash(t);
        let pick;
        if (hm === b) pick = t;
        else if (ht === b || hm === ht) pick = m;
        else {
          conflicts.push(c + ':' + id);
          if (m === undefined) pick = t; else if (t === undefined) pick = m;
          else pick = String(m.updatedAt || '') >= String(t.updatedAt || '') ? m : t;
        }
        if (pick !== undefined) data[c][id] = pick;
      }
    }
    return { data, conflicts };
  }

  /** @param {Uint8Array} u @returns {string} */
  function b64u(u) {
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + 0x8000)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /** @param {string} s @returns {Uint8Array} */
  function unb64u(s) {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u;
  }

  /** @param {Uint8Array} data @param {'gzip'} fmt @param {boolean} inflate */
  async function zip(data, fmt, inflate) {
    const S = inflate ? DecompressionStream : CompressionStream;
    const stream = new Blob([/** @type {BlobPart} */ (data)]).stream().pipeThrough(new S(fmt));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** New random 256-bit key, base64url. @returns {string} */
  function newKey() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }

  /** @param {string} key */
  function aesKey(key) { return crypto.subtle.importKey('raw', /** @type {BufferSource} */ (unb64u(key)), 'AES-GCM', false, ['encrypt', 'decrypt']); }

  /**
   * Encrypt any JSON value with AES-256-GCM (gzip first when the browser can).
   * Format: "k1.<iv>.<ciphertext>", base64url. The key never leaves the browser.
   * @param {unknown} obj @param {string} key @returns {Promise<string>}
   */
  async function encryptJSON(obj, key) {
    let body = new TextEncoder().encode(JSON.stringify(obj)), flag = 0;
    if (typeof CompressionStream === 'function') { body = await zip(body, 'gzip', false); flag = 1; }
    const plain = new Uint8Array(body.length + 1); plain[0] = flag; plain.set(body, 1);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), /** @type {BufferSource} */ (plain)));
    return 'k1.' + b64u(iv) + '.' + b64u(ct);
  }

  /** @param {string} payload @param {string} key @returns {Promise<any>} */
  async function decryptJSON(payload, key) {
    const [ver, iv, ct] = String(payload).split('.');
    if (ver !== 'k1' || !iv || !ct) throw new Error('Okänt format');
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: /** @type {BufferSource} */ (unb64u(iv)) }, await aesKey(key), /** @type {BufferSource} */ (unb64u(ct))));
    let body = plain.subarray(1); if (plain[0] === 1) body = await zip(body, 'gzip', true);
    return JSON.parse(new TextDecoder().decode(body));
  }

  /**
   * Secret that proves to the server you may publish. Derived from the key, so
   * everyone with the link can publish, and the server only ever sees its hash.
   * @param {string} key @returns {Promise<string>}
   */
  async function writeSecret(key) {
    const k = await crypto.subtle.importKey('raw', /** @type {BufferSource} */ (unb64u(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('klansagan-write'))));
  }

  /** Hex SHA-256, the form the server stores a write secret in. @param {string} s */
  async function sha256hex(s) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Short public tag for a key. Photos are stored under "<tag>_<id>", so a photo encrypted
   * with one key never collides with the same photo encrypted with another.
   * @param {string} key
   */
  async function keyTag(key) { return (await sha256hex('tag:' + key)).slice(0, 8); }

  /* ------------------------------------------------ Read-only links and living people */

  /**
   * Is this person probably alive? Used to decide what readers of a read-only link may see.
   * Errs on the side of "alive": no death date, no death place, not marked deceased, and
   * either born less than 105 years ago or with no birth year to go on. Without a birth year
   * we estimate one from parents (+20) and children (−15); someone whose child was born
   * 120 years ago is not alive.
   * @param {any} p @param {Record<string,any>} persons @param {number} nowYear
   */
  /** Children by parent id, built once for a whole archive. @param {Record<string,any>} persons */
  function kidsIndex(persons) {
    /** @type {Map<string, any[]>} */ const m = new Map();
    for (const c of Object.values(persons || {})) for (const k of [c.fatherId, c.motherId]) if (k) { const a = m.get(k) || []; if (!a.includes(c)) a.push(c); m.set(k, a); }
    return m;
  }

  /**
   * Is this person probably alive, and what is that based on? Errs on the side of "alive":
   * no death date, no death place, not marked deceased, and either born less than 105 years
   * ago or with no birth year to go on. Without a birth year one is estimated from parents
   * (+20), partners (±0) and children (−15).
   * @param {any} p @param {Record<string,any>} persons @param {number} nowYear @param {Map<string,any[]>} [kids]
   * @returns {{living:boolean, year:number|null, estimated:boolean}}
   */
  function livingInfo(p, persons, nowYear, kids) {
    if (!p || p.deceased || p.deathDate || p.deathPlace || (p.events || []).some((/** @type {any} */ e) => e.type === 'Död' || e.type === 'Begravning'))
      return { living: false, year: p ? yearOf(p.birthDate) : null, estimated: false };
    const own = yearOf(p.birthDate);
    if (own) return { living: nowYear - own < 105, year: own, estimated: false };
    const ests = /** @type {number[]} */ ([]);
    for (const k of ['fatherId', 'motherId']) { const q = persons[p[k]]; const y = q && yearOf(q.birthDate); if (y) ests.push(y + 20); }
    for (const id of p.spouseIds || []) { const q = persons[id]; const y = q && yearOf(q.birthDate); if (y) ests.push(y); }
    for (const c of (kids || kidsIndex(persons)).get(p.id) || []) { const y = yearOf(c.birthDate); if (y) ests.push(y - 15); }
    const by = ests.length ? Math.min(...ests) : null;
    return { living: !by || nowYear - by < 105, year: by, estimated: !!by };
  }
  /** @param {any} p @param {Record<string,any>} persons @param {number} nowYear @param {Map<string,any[]>} [kids] */
  function isLiving(p, persons, nowYear, kids) { return livingInfo(p, persons, nowYear, kids).living; }

  /**
   * Someone counted as living who almost certainly isn't: no birth year of their own, and a
   * child, grandchild or later descendant born more than 80 years ago.
   * @param {any} p @param {Record<string,any>} persons @param {number} nowYear @param {Map<string,any[]>} [kids]
   */
  function likelyDeceased(p, persons, nowYear, kids) {
    const k = kids || kidsIndex(persons);
    if (yearOf(p.birthDate) || !livingInfo(p, persons, nowYear, k).living) return false;
    const seen = new Set([p.id]); let gen = [p.id];
    for (let d = 0; d < 6 && gen.length; d++) {
      const next = [];
      for (const id of gen) for (const c of k.get(id) || []) { if (seen.has(c.id)) continue; seen.add(c.id); const y = yearOf(c.birthDate); if (y && nowYear - y > 80) return true; next.push(c.id); }
      gen = next;
    }
    return false;
  }

  /** The few fields a reader may see about a living person: name, birth year, family links. */
  function redactLiving(/** @type {any} */ p) {
    const y = yearOf(p.birthDate);
    /** @type {any} */ const r = { kind: 'person', id: p.id, given: p.given || '', surname: p.surname || '', sex: p.sex || '',
      birthDate: y ? String(y) : '', fatherId: p.fatherId || '', motherId: p.motherId || '', spouseIds: (p.spouseIds || []).slice(), living: true };
    if (p.callName) r.callName = p.callName;
    if (p.home) r.home = true;
    if (p.createdAt) r.createdAt = p.createdAt;
    return r;
  }

  /**
   * Split an archive into what readers may see and what only editors may see.
   * pub: everyone; living people reduced to name and birth year, no comments, and only
   * places and sources that someone not living refers to. priv: the full documents for
   * living people, the places and sources only they refer to, and all comments.
   * @param {any} data @param {number} nowYear
   */
  function splitForReaders(data, nowYear) {
    const persons = data.persons || {};
    /** @type {any} */ const pub = { persons: {}, places: {}, sources: {}, views: { ...(data.views || {}) } };
    /** @type {any} */ const priv = { persons: {}, places: {}, sources: {}, comments: { ...(data.comments || {}) }, logs: { ...(data.logs || {}) } };
    const usedPl = new Set(), usedSrc = new Set();
    const kids = kidsIndex(persons);
    for (const p of Object.values(persons)) {
      if (isLiving(p, persons, nowYear, kids)) { priv.persons[p.id] = p; pub.persons[p.id] = redactLiving(p); continue; }
      pub.persons[p.id] = p;
      for (const id of [p.birthPlace, p.deathPlace, ...(p.events || []).map((/** @type {any} */ e) => e.placeId)]) if (id) usedPl.add(id);
      for (const c of p.citations || []) if (c.sourceId) usedSrc.add(c.sourceId);
    }
    for (const [col, used] of /** @type {[string, Set<string>][]} */ ([['places', usedPl], ['sources', usedSrc]]))
      for (const [id, o] of Object.entries(data[col] || {})) (used.has(id) ? pub : priv)[col][id] = o;
    return { pub, priv };
  }

  /* ------------------------------------------------ What's new since your last visit */

  /** Swedish names for person fields, for "Karl: födelsedatum, bilder". */
  const FIELD_SV = /** @type {Record<string,string>} */ ({ given: 'namn', surname: 'namn', callName: 'namn', birthDate: 'födelse', birthPlace: 'födelse',
    deathDate: 'död', deathPlace: 'död', deceased: 'död', occupation: 'yrke', notes: 'anteckningar', story: 'berättelse', media: 'bilder och ljud',
    events: 'händelser', citations: 'källor', fatherId: 'föräldrar', motherId: 'föräldrar', spouseIds: 'partner', sex: 'kön', home: '' });
  const IGNORE = new Set(['updatedAt', 'updatedBy', 'createdAt', 'kind', 'id']);

  /**
   * What someone else changed between the version you last had (as hashes) and the one
   * you just fetched. Only people and comments are reported; places and sources follow people.
   * @param {Record<string, Record<string,string>>} baseHashes  hashArchive of the version you had
   * @param {any} before  your copy before fetching (for the names of removed people and old field values)
   * @param {any} after   the fetched version
   * @param {string} me   your name, so your own comments aren't news
   */
  function diffNews(baseHashes, before, after, me) {
    const bp = (baseHashes && baseHashes.persons) || {}, ap = (after && after.persons) || {}, old = (before && before.persons) || {};
    /** @type {{added:string[], changed:Record<string,string[]>, removed:string[], comments:string[]}} */
    const d = { added: [], changed: {}, removed: [], comments: [] };
    for (const [id, p] of Object.entries(ap)) {
      if (!(id in bp)) { d.added.push(id); continue; }
      if (bp[id] === docHash(p)) continue;
      const o = old[id] || {}, f = new Set();
      for (const k of new Set([...Object.keys(o), ...Object.keys(p)])) {
        if (IGNORE.has(k) || JSON.stringify(o[k] ?? null) === JSON.stringify(p[k] ?? null)) continue;
        const l = k in FIELD_SV ? FIELD_SV[k] : 'övrigt'; if (l) f.add(l);
      }
      d.changed[id] = [...f];
    }
    for (const id of Object.keys(bp)) if (!(id in ap)) { const o = old[id]; d.removed.push(o ? [o.given, o.surname].filter(Boolean).join(' ') || 'Namnlös' : 'Någon'); }
    const bc = (baseHashes && baseHashes.comments) || {};
    for (const [id, c] of Object.entries((after && after.comments) || {})) if (!(id in bc) && c.by !== me) d.comments.push(id);
    return d;
  }

  /**
   * Add one fetch's changes to what's waiting to be seen. Someone added and then changed
   * stays "added"; someone added and then removed disappears from the list.
   * @param {any} news  {since, by[], added{}, changed{}, removed[], comments[]} or null
   * @param {ReturnType<typeof diffNews>} d @param {string[]} by @param {string} at
   */
  function addNews(news, d, by, at) {
    const n = news ? JSON.parse(JSON.stringify(news)) : { since: at, by: [], added: {}, changed: {}, removed: [], comments: [] };
    const empty = !d.added.length && !Object.keys(d.changed).length && !d.removed.length && !d.comments.length;
    if (empty) return news || null;
    for (const b of by) if (b && !n.by.includes(b)) n.by.push(b);
    for (const id of d.added) { n.added[id] = 1; delete n.changed[id]; }
    for (const [id, f] of Object.entries(d.changed)) { if (n.added[id]) continue; n.changed[id] = [...new Set([...(n.changed[id] || []), ...f])]; }
    for (const name of d.removed) n.removed.push(name);
    n.removed = n.removed.slice(-50);
    for (const id of d.comments) if (!n.comments.includes(id)) n.comments.push(id);
    n.at = at;
    return n;
  }

  /** Drop people from the news who no longer exist. @param {any} news @param {any} data */
  function pruneNews(news, data) {
    if (!news) return null;
    const ps = (data && data.persons) || {}, cs = (data && data.comments) || {};
    for (const k of ['added', 'changed']) for (const id of Object.keys(news[k])) if (!ps[id]) delete news[k][id];
    news.comments = news.comments.filter((/** @type {string} */ id) => cs[id]);
    return news;
  }

  /** Put the editors' part back on top of the readers' part. @param {any} pub @param {any} priv */
  function joinPrivate(pub, priv) {
    /** @type {any} */ const out = {};
    for (const c of COLS) out[c] = { ...((pub && pub[c]) || {}), ...((priv && priv[c]) || {}) };
    return out;
  }

  /* --------------------------------------------------------------- On this day */

  /**
   * Birthdays, death days and wedding days falling today or within the next `days` days.
   * Only exact dates count ("1850-03-14", not "ca 1850" or "1850-03"). Someone with no death
   * date born less than 105 years ago is treated as living ("fyller 34"). 29 February is
   * remembered on the 28th in other years. Weddings are listed once per couple.
   * @param {Record<string,any>} persons @param {Date} today @param {{days?:number}} [opts]
   * @returns {{kind:'birth'|'death'|'wedding', personId:string, withId?:string, year:number, years:number, inDays:number, living:boolean}[]}
   */
  function onThisDay(persons, today, { days = 13 } = {}) {
    const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const exact = (/** @type {any} */ d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '').trim()); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
    const leap = (/** @type {number} */ y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    /** days from today to the next occurrence of month/day, and the year it falls in */
    const next = (/** @type {{m:number,d:number}} */ x) => {
      for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
        const d = x.m === 2 && x.d === 29 && !leap(y) ? 28 : x.d;
        const n = Math.round((Date.UTC(y, x.m - 1, d) - t0) / 864e5);
        if (n >= 0) return { n, y };
      }
      return { n: 999, y: today.getFullYear() };
    };
    const out = /** @type {any[]} */ ([]); const seen = new Set();
    for (const p of Object.values(persons)) {
      const b = exact(p.birthDate), dd = exact(p.deathDate);
      const living = !p.deathDate && !p.deceased && !!b && today.getFullYear() - b.y < 105;
      const add = (/** @type {any} */ x, /** @type {string} */ kind, /** @type {any} */ extra = {}) => { if (!x) return; const { n, y } = next(x); if (n <= days && y > x.y) out.push({ kind, personId: p.id, year: x.y, years: y - x.y, inDays: n, living, ...extra }); };
      add(b, 'birth'); add(dd, 'death');
      for (const e of p.events || []) if (e.type === 'Vigsel') {
        const key = [p.id, e.withId || ''].sort().join('|') + '|' + e.date; if (seen.has(key)) continue; seen.add(key);
        const w = e.withId && persons[e.withId]; const both = !p.deathDate && (!w || !w.deathDate);
        add(exact(e.date), 'wedding', { withId: e.withId, living: both && !!exact(e.date) && today.getFullYear() - exact(e.date).y < 80 });
      }
    }
    return out.sort((a, b) => a.inDays - b.inDays || (b.living ? 1 : 0) - (a.living ? 1 : 0) || a.year - b.year);
  }

  /* ------------------------------------------------- Swedish source citations */

  /** County letters used in Swedish church-record references, e.g. "Röke (L)". */
  const COUNTY = { AB: 'Stockholms län', A: 'Stockholms stad', B: 'Stockholms län', C: 'Uppsala län', D: 'Södermanlands län', E: 'Östergötlands län', F: 'Jönköpings län', G: 'Kronobergs län', H: 'Kalmar län', I: 'Gotlands län', K: 'Blekinge län', L: 'Kristianstads län', M: 'Malmöhus län', N: 'Hallands län', O: 'Göteborgs och Bohus län', P: 'Älvsborgs län', R: 'Skaraborgs län', S: 'Värmlands län', T: 'Örebro län', U: 'Västmanlands län', W: 'Kopparbergs län', X: 'Gävleborgs län', Y: 'Västernorrlands län', Z: 'Jämtlands län', AC: 'Västerbottens län', BD: 'Norrbottens län' };
  /** Church-archive series → source type: AI husförhör, AII församlingsbok, B flytt, C födde, E vigda, F döda. @param {string} vol */
  function seriesType(vol) {
    const v = String(vol || '').toUpperCase().replace(/[\s:./]/g, '');
    if (/^AII/.test(v)) return 'Församlingsbok';
    if (/^AI/.test(v)) return 'Husförhörslängd';
    if (/^A\d/.test(v)) return 'Husförhörslängd';
    if (/^B/.test(v)) return 'Flyttlängd';
    if (/^C/.test(v)) return 'Födelse- och dopbok';
    if (/^E/.test(v)) return 'Lysnings- och vigselbok';
    if (/^F/.test(v)) return 'Död- och begravningsbok';
    return 'Övrigt';
  }
  /** "A II/3", "AII:3", "C:3" → "AII:3" / "C:3" (same volume written by Riksarkivet and ArkivDigital). @param {string} v */
  const volKey = (v) => String(v || '').toUpperCase().replace(/\s+/g, '').replace(/[/.]/g, ':');

  /**
   * Read a citation copied from ArkivDigital or Riksarkivet (SVAR), or a link to an image there.
   *  - ArkivDigital: "Röke (L) AII:3 (1918-1933) Bild 70 / sid 3 (AID: v350192.b70.s3, NAD: SE/LLA/13324)"
   *  - Riksarkivet:  "Röke kyrkoarkiv, Församlingsböcker, SE/LLA/13324/A II/3 (1918-1933), bildid: 00127782_00010"
   * Returns the volume as a source (title, type, NAD reference) and the place in it as a citation
   * (image, page, AID / image id, link), or null when the text is neither.
   * @param {string} text
   */
  function parseSwedishCitation(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim(); if (!t) return null;
    const bild = t.match(/(?:bildid|bild-id|image id)[:\s]*([A-Z0-9]{8}_\d{5})\b/i) || t.match(/riksarkivet\.se\/bildvisning\/(?:Kalla\/)?([A-Z0-9]{8}_\d{5})/i) || t.match(/\b([A-Z]\d{7}_\d{5}|\d{8}_\d{5})\b/);
    const aid = t.match(/\bAID[:\s]*(v\d+[a-z]?\.b\d+(?:\.s\d+)?)/i) || t.match(/\b(v\d+[a-z]?\.b\d+\.s\d+)\b/i);
    const nadM = t.match(/\bNAD[:\s]*(SE\/[A-Za-zÅÄÖåäö]+\/[\w.-]+)/i);
    const years = (t.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/) || t.match(/\((\d{4})\)/));
    const yr = years ? (years[2] ? `${years[1]}–${years[2]}` : years[1]) : '';
    /** @type {any} */ let r = null;
    // ArkivDigital: "<Parish> (<county>) <volume> (<years>) Bild <n> / sid <n>"
    const ad = t.match(/^(.+?)\s*\(([A-ZÅÄÖ]{1,2})\)\s+([A-ZÅÄÖ]{1,4}\s?[IVX]*\s?[a-z]?[:/]?\s?\d+[a-zA-Z]?(?:[:/]\d+)?)\s*(?:\((\d{4}(?:\s*[-–]\s*\d{4})?)\))?/);
    if (ad && !/kyrkoarkiv/i.test(ad[1])) {
      const vol = ad[3].replace(/\s+/g, ''), cty = ad[2].toUpperCase();
      r = { from: 'ad', parish: ad[1].trim(), county: COUNTY[cty] || '', countyCode: cty, volume: vol, years: yr, nad: nadM ? nadM[1] : '', type: seriesType(vol) };
      r.title = `${r.parish} (${cty}) ${vol}${yr ? ` (${yr})` : ''}`;
    }
    // Riksarkivet: "<Archive>, <series>, SE/<arkiv>/<nr>/<volume> (<years>), bildid: …"
    const ra = t.match(/^(.+?),\s*([^,]+?),\s*(SE\/[A-Za-zÅÄÖåäö]+\/[\w.-]+)\/([^,(]+?)\s*(?:\(([^)]*)\))?\s*(?:,|$)/);
    if (!r && ra) {
      const vol = ra[4].trim(), arch = ra[1].trim();
      const parish = arch.replace(/\s+(kyrkoarkiv|församlings? kyrkoarkiv|domkyrkoförsamlings kyrkoarkiv)$/i, '').replace(/s$/, (m) => /kyrkoarkiv/i.test(arch) && !/(ss|us)$/.test(arch.replace(/\s.*$/, '')) ? '' : m);
      const st = /födelse|dop/i.test(ra[2]) ? 'Födelse- och dopbok' : /husförhör/i.test(ra[2]) ? 'Husförhörslängd' : /församlingsb/i.test(ra[2]) ? 'Församlingsbok' : /vigsel|lysning/i.test(ra[2]) ? 'Lysnings- och vigselbok' : /död|begrav/i.test(ra[2]) ? 'Död- och begravningsbok' : /flytt/i.test(ra[2]) ? 'Flyttlängd' : /bouppteck/i.test(ra[2]) ? 'Bouppteckning' : /mönsterrull/i.test(ra[2]) ? 'Generalmönsterrulla' : seriesType(vol);
      r = { from: 'ra', archive: arch, parish, series: ra[2].trim(), nad: ra[3], volume: vol, years: yr || (ra[5] || ''), type: st };
      r.title = `${arch}, ${r.series}, ${ra[3]}/${vol}${r.years ? ` (${r.years})` : ''}`;
    }
    if (!r && (bild || aid)) r = { from: bild ? 'ra' : 'ad', title: '', type: 'Övrigt' };
    if (!r) return null;
    const img = t.match(/\b(?:bild|image)\s*(\d+)/i) || (aid && aid[1].match(/\.b(\d+)/));
    const page = t.match(/\b(?:sid(?:a|an)?|s\.|page|pag\.?)\s*(\d+[a-z]?)/i) || (aid && aid[1].match(/\.s(\d+)/));
    r.image = img ? img[1] : ''; r.page = page ? page[1] : '';
    if (aid) r.aid = aid[1]; if (bild) r.bildid = bild[1].toUpperCase();
    if (r.bildid) r.url = 'https://sok.riksarkivet.se/bildvisning/' + r.bildid;
    r.detail = [r.image && 'Bild ' + r.image, r.page && 'sid ' + r.page].filter(Boolean).join(' / ');
    if (r.aid) r.detail += (r.detail ? ' ' : '') + `(AID: ${r.aid})`;
    if (r.bildid) r.detail += (r.detail ? ', ' : '') + `bildid: ${r.bildid}`;
    r.key = r.nad && r.volume ? r.nad.split('/').slice(0, 3).join('/') + '|' + volKey(r.volume) : '';
    return r;
  }

  /* --------------------------------------------------------------- GEDCOM import */

  const ANSEL_COMB = { 0xE1: '̀', 0xE2: '́', 0xE3: '̂', 0xE4: '̃', 0xE5: '̄', 0xE6: '̆', 0xE7: '̇', 0xE8: '̈', 0xE9: '̌', 0xEA: '̊', 0xEB: '͡', 0xED: '̕', 0xEE: '̋', 0xF0: '̧', 0xF1: '̨', 0xF2: '̣', 0xF3: '̤', 0xF4: '̥', 0xF5: '̳', 0xF6: '̲', 0xF7: '̦', 0xF8: '̜', 0xF9: '̮', 0xFE: '̓' };
  const ANSEL_CHR = { 0xA1: 'Ł', 0xA2: 'Ø', 0xA3: 'Đ', 0xA4: 'Þ', 0xA5: 'Æ', 0xA6: 'Œ', 0xA7: 'ʹ', 0xA8: '·', 0xA9: '♭', 0xAA: '®', 0xAB: '±', 0xAC: 'Ơ', 0xAD: 'Ư', 0xAE: 'ʼ', 0xB0: 'ʻ', 0xB1: 'ł', 0xB2: 'ø', 0xB3: 'đ', 0xB4: 'þ', 0xB5: 'æ', 0xB6: 'œ', 0xB7: 'ʺ', 0xB8: 'ı', 0xB9: '£', 0xBA: 'ð', 0xBC: 'ơ', 0xBD: 'ư', 0xC0: '°', 0xC1: 'ℓ', 0xC2: '℗', 0xC3: '©', 0xC4: '♯', 0xC5: '¿', 0xC6: '¡', 0xC7: 'ß', 0xC8: '€', 0xCF: 'ß' };
  /* IBM PC code page 437/850, the characters Swedish files actually use. */
  const CP850 = { 0x80: 'Ç', 0x81: 'ü', 0x82: 'é', 0x83: 'â', 0x84: 'ä', 0x85: 'à', 0x86: 'å', 0x87: 'ç', 0x88: 'ê', 0x89: 'ë', 0x8A: 'è', 0x8B: 'ï', 0x8C: 'î', 0x8D: 'ì', 0x8E: 'Ä', 0x8F: 'Å', 0x90: 'É', 0x91: 'æ', 0x92: 'Æ', 0x93: 'ô', 0x94: 'ö', 0x95: 'ò', 0x96: 'û', 0x97: 'ù', 0x98: 'ÿ', 0x99: 'Ö', 0x9A: 'Ü', 0x9B: 'ø', 0x9C: '£', 0x9D: 'Ø', 0xA0: 'á', 0xA1: 'í', 0xA2: 'ó', 0xA3: 'ú', 0xA4: 'ñ', 0xA5: 'Ñ', 0xE1: 'ß' };

  /**
   * Turn the bytes of a .ged file into text. Honours a byte-order mark, then the file's own
   * "1 CHAR" line: UTF-8/UNICODE, ANSI (Windows-1252), ANSEL (old Disgen and FamilySearch
   * files, where accents come before the letter) and IBM PC (code page 850).
   * @param {Uint8Array} b @returns {{text:string, charset:string}}
   */
  function decodeGedcom(b) {
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(b.subarray(3)), charset: 'UTF-8' };
    if (b[0] === 0xFF && b[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), charset: 'UTF-16' };
    if (b[0] === 0xFE && b[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), charset: 'UTF-16' };
    if (b[0] === 0x30 && b[1] === 0x00) return { text: new TextDecoder('utf-16le').decode(b), charset: 'UTF-16' };
    let head = ''; for (let i = 0; i < Math.min(b.length, 4000); i++) head += String.fromCharCode(b[i] < 128 ? b[i] : 63);
    const m = head.match(/\n\s*1\s+CHAR\s+([^\r\n]+)/i); const cs = (m ? m[1] : 'UTF-8').trim().toUpperCase();
    if (/ANSEL/.test(cs)) {
      let out = '', comb = '';
      for (const c of b) {
        if (ANSEL_COMB[c]) { comb += ANSEL_COMB[c]; continue; }
        const ch = c < 128 ? String.fromCharCode(c) : (ANSEL_CHR[c] || '�');
        out += ch + comb; comb = '';
      }
      return { text: out.normalize('NFC'), charset: 'ANSEL' };
    }
    if (/IBM|PC|850|437|DOS/.test(cs)) { let out = ''; for (const c of b) out += c < 128 ? String.fromCharCode(c) : (CP850[c] || '�'); return { text: out, charset: 'IBM PC' }; }
    if (/ANSI|WINDOWS|1252|LATIN|8859/.test(cs) && !/UTF/.test(cs)) return { text: new TextDecoder('windows-1252').decode(b), charset: 'ANSI' };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), charset: 'UTF-8' }; }
    catch (e) { return { text: new TextDecoder('windows-1252').decode(b), charset: 'ANSI (gissad)' }; }
  }

  const GMON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  /**
   * GEDCOM date → the app's dates ("1850-01-12", "1850-01", "ca 1850", "före 1850", "mellan 1850 och 1860").
   * @param {string} s @returns {string}
   */
  function fromGedDate(s) {
    s = String(s || '').replace(/@#D[A-Z ]+@\s*/gi, '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const one = (/** @type {string} */ x) => {
      x = x.trim().replace(/^\((.*)\)$/, '$1');
      const m = x.match(/^(?:(\d{1,2}) )?(?:([A-Z]{3}) )?(\d{3,4})(?:\/\d{1,2})?( B\.?C\.?)?$/i);
      if (!m) return x;
      const y = m[3].padStart(4, '0'), mo = m[2] && GMON[m[2].toUpperCase()];
      if (m[2] && !mo) return x;
      return mo ? (m[1] ? `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}` : `${y}-${String(mo).padStart(2, '0')}`) : y;
    };
    let m;
    if ((m = s.match(/^(?:BET|FROM)\s+(.+?)\s+(?:AND|TO)\s+(.+)$/i))) return `mellan ${one(m[1])} och ${one(m[2])}`;
    if ((m = s.match(/^(?:ABT|CAL|EST|ABOUT|CA\.?)\s+(.+)$/i))) return 'ca ' + one(m[1]);
    if ((m = s.match(/^(?:BEF|TO)\s+(.+)$/i))) return 'före ' + one(m[1]);
    if ((m = s.match(/^(?:AFT|FROM)\s+(.+)$/i))) return 'efter ' + one(m[1]);
    if ((m = s.match(/^INT\s+(.+?)(?:\s*\((.*)\))?$/i))) return one(m[1]);
    return one(s);
  }

  const GED_EVENTS = { BAPM: 'Dop', CHR: 'Dop', CONF: 'Konfirmation', BURI: 'Begravning', CREM: 'Begravning', EMIG: 'Utvandring', IMMI: 'Invandring', RESI: 'Bosatt', PROB: 'Bouppteckning', _MILT: 'Militärtjänst', MILI: 'Militärtjänst', _MILI: 'Militärtjänst' };
  const OTHER_EVENTS = { CENS: 'Folkräkning', EDUC: 'Utbildning', GRAD: 'Examen', RETI: 'Pension', ADOP: 'Adoption', NATU: 'Medborgarskap', ORDN: 'Prästvigning', WILL: 'Testamente', TITL: 'Titel', RELI: 'Religion', NATI: 'Nationalitet', DSCR: 'Beskrivning', PROP: 'Egendom' };
  const SWE_TYPES = ['Dop', 'Konfirmation', 'Vigsel', 'Kröning', 'Skilsmässa', 'Flytt', 'Bosatt', 'Yrke', 'Militärtjänst', 'Utvandring', 'Invandring', 'Begravning', 'Bouppteckning', 'Fotografi'];
  /** Guess a Swedish source type from a title. @param {string} t */
  function sourceType(t) {
    const s = String(t || '').toLowerCase();
    const R = /** @type {[RegExp,string][]} */ ([[/husförhör|\bhfl\b|\(ai[: ]/, 'Husförhörslängd'], [/födde|födelse|dop|\(c[: ]/, 'Födelse- och dopbok'], [/vigsel|lysning|\(e[: ]/, 'Lysnings- och vigselbok'], [/död|begrav|\(f[: ]/, 'Död- och begravningsbok'], [/flytt|\(b[: ]/, 'Flyttlängd'], [/bouppteck/, 'Bouppteckning'], [/folkräkning|census/, 'Folkräkning'], [/mantal/, 'Mantalslängd'], [/generalmönster|rulla/, 'Generalmönsterrulla'], [/emigrant/, 'Emigrantregister'], [/passager/, 'Passagerarlista'], [/dom(stol|bok)|ting/, 'Domstolsprotokoll'], [/http|www\./, 'Webbplats'], [/församling|kyrkbok/, 'Församlingsbok']]);
    for (const [re, ty] of R) if (re.test(s)) return ty;
    return 'Övrigt';
  }

  /**
   * Parse a GEDCOM 5.5 / 5.5.1 / 7 file into the app's documents. Pure: ids come from `uid`.
   * People get names, sex, birth/death, occupation, events, notes and source citations;
   * families become parent links, partners and marriage/divorce events. Unknown tags are counted.
   * @param {string} text @param {{uid?:(p:string)=>string, now?:string}} [opts]
   */
  function parseGedcom(text, { uid, now } = {}) {
    let seq = 0; const id = uid || ((/** @type {string} */ p) => p + '_g' + (++seq).toString(36));
    const at = now || new Date().toISOString();
    /** @typedef {{lvl:number, xref:string, tag:string, val:string, kids:any[]}} GNode */
    /** @type {GNode[]} */ const roots = []; /** @type {GNode[]} */ const stack = [];
    for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
      const line = raw.replace(/^\s+/, ''); if (!line) continue;
      const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/); if (!m) continue;
      const n = { lvl: +m[1], xref: m[2] || '', tag: m[3].toUpperCase(), val: m[4] || '', kids: [] };
      if (n.tag === 'CONC' || n.tag === 'CONT') { const p = stack[n.lvl - 1]; if (p) p.val += (n.tag === 'CONT' ? '\n' : '') + n.val; continue; }
      stack.length = n.lvl; const parent = stack[n.lvl - 1];
      if (n.lvl === 0 || !parent) roots.push(n); else parent.kids.push(n);
      stack[n.lvl] = n;
    }
    const kid = (/** @type {GNode} */ n, /** @type {string} */ t) => n.kids.find(k => k.tag === t);
    const kidv = (/** @type {GNode} */ n, /** @type {string} */ t) => { const k = kid(n, t); return k ? k.val.trim() : ''; };
    const byX = {}; for (const r of roots) if (r.xref) byX[r.xref] = r;
    const stats = { persons: 0, families: 0, sources: 0, places: 0, citations: 0, media: 0, skipped: /** @type {Record<string,number>} */ ({}) };
    const warnings = /** @type {string[]} */ ([]);
    const skip = (/** @type {string} */ t) => { stats.skipped[t] = (stats.skipped[t] || 0) + 1; };
    const noteText = (/** @type {GNode} */ n) => { const v = n.val.trim(); if (/^@[^@]+@$/.test(v)) { const r = byX[v]; return r ? r.val.trim() : ''; } return v; };

    /* places, deduplicated by their full name */
    const places = /** @type {Record<string,any>} */ ({}), placeByName = /** @type {Record<string,string>} */ ({});
    const coord = (/** @type {string} */ v) => { const m = String(v || '').trim().match(/^([NSEW])?\s*(-?[\d.,]+)/i); if (!m) return NaN; const x = parseFloat(m[2].replace(',', '.')); return /[SW]/i.test(m[1] || '') ? -x : x; };
    const place = (/** @type {GNode|undefined} */ n) => {
      if (!n) return ''; const name = n.val.trim().replace(/\s*,\s*/g, ', ').replace(/(, )+$/, ''); if (!name) return '';
      let pid = placeByName[name];
      if (!pid) { pid = id('pl'); placeByName[name] = pid; places[pid] = { kind: 'place', id: pid, name, createdAt: at }; stats.places++; }
      const map = kid(n, 'MAP'); if (map && places[pid].lat == null) { const la = coord(kidv(map, 'LATI')), lo = coord(kidv(map, 'LONG')); if (isFinite(la) && isFinite(lo)) { places[pid].lat = la; places[pid].lon = lo; } }
      return pid;
    };

    /* sources */
    const sources = /** @type {Record<string,any>} */ ({}), srcByX = /** @type {Record<string,string>} */ ({}), srcByTitle = /** @type {Record<string,string>} */ ({});
    for (const r of roots) if (r.tag === 'SOUR' && r.xref) {
      const title = kidv(r, 'TITL') || kidv(r, 'ABBR') || r.val.trim() || 'Källa utan titel';
      const s = /** @type {any} */ ({ kind: 'source', id: id('s'), title, type: sourceType(title), createdAt: at });
      const auth = kidv(r, 'AUTH'), publ = kidv(r, 'PUBL'), repo = kid(r, 'REPO'), www = kidv(r, 'WWW');
      if (publ || auth) s.ref = [auth, publ].filter(Boolean).join(', ');
      if (repo) { const rr = byX[repo.val.trim()]; s.archive = (rr && kidv(rr, 'NAME')) || (repo.val.startsWith('@') ? '' : repo.val.trim()); if (!s.archive) delete s.archive; }
      if (www) s.url = www;
      const notes = r.kids.filter(k => k.tag === 'NOTE' || k.tag === 'TEXT').map(noteText).filter(Boolean); if (notes.length) s.notes = notes.join('\n\n');
      sources[s.id] = s; srcByX[r.xref] = s.id; srcByTitle[title] = s.id; stats.sources++;
    }
    /** Citations under a node → [{sourceId, detail, about}] */
    const cites = (/** @type {GNode} */ n, /** @type {string} */ about) => n.kids.filter(k => k.tag === 'SOUR').map(k => {
      let sid = srcByX[k.val.trim()];
      if (!sid) { const t = k.val.trim(); if (!t || t.startsWith('@')) return null; sid = srcByTitle[t]; if (!sid) { sid = id('s'); sources[sid] = { kind: 'source', id: sid, title: t, type: sourceType(t), createdAt: at }; srcByTitle[t] = sid; stats.sources++; } }
      stats.citations++; const c = /** @type {any} */ ({ sourceId: sid, about }); const pg = kidv(k, 'PAGE'); if (pg) c.detail = pg;
      const aid = pg.match(/\b(v\d+[a-z]?\.b\d+(?:\.s\d+)?)\b/i), bid = pg.match(/\b([A-Z]\d{7}_\d{5}|\d{8}_\d{5})\b/);
      if (aid) c.aid = aid[1]; if (bid) { c.bildid = bid[1]; c.url = 'https://sok.riksarkivet.se/bildvisning/' + bid[1]; }
      return c;
    }).filter(Boolean);

    /* people */
    const persons = /** @type {Record<string,any>} */ ({}), perByX = /** @type {Record<string,string>} */ ({});
    for (const r of roots) if (r.tag === 'INDI' && r.xref) {
      const p = /** @type {any} */ ({ kind: 'person', id: id('p'), createdAt: at, events: [], citations: [] });
      const nm = kid(r, 'NAME');
      if (nm) {
        const v = nm.val.trim(); const sm = v.match(/\/([^/]*)\//);
        let given = (sm ? v.replace(sm[0], ' ') : v).replace(/\s+/g, ' ').trim(); let sur = sm ? sm[1].trim() : '';
        if (!given) given = kidv(nm, 'GIVN'); if (!sur) sur = kidv(nm, 'SURN');
        const star = given.split(' ').find(w => /\*$/.test(w)); // Swedish convention: "Anna* Maria" marks the call name
        if (star) { p.callName = star.replace(/\*$/, ''); given = given.replace(/\*/g, ''); }
        const call = kidv(nm, '_CALL') || kidv(nm, '_RUFNAME'); if (call && !p.callName) p.callName = call;
        if (given) p.given = given; if (sur) p.surname = sur;
        const nick = kidv(nm, 'NICK'); if (nick) p.nick = nick;
      }
      const sx = kidv(r, 'SEX').toUpperCase(); if (sx === 'M') p.sex = 'M'; else if (sx === 'F') p.sex = 'K';
      const notes = []; let birthDone = false, deathDone = false;
      for (const k of r.kids) {
        const t = k.tag;
        if (t === 'BIRT' && !birthDone) { birthDone = true; const d = fromGedDate(kidv(k, 'DATE')); if (d) p.birthDate = d; const pl = place(kid(k, 'PLAC')); if (pl) p.birthPlace = pl; p.citations.push(...cites(k, 'Födelse')); const nt = kid(k, 'NOTE'); if (nt) notes.push('Födelse: ' + noteText(nt)); }
        else if (t === 'DEAT' && !deathDone) { deathDone = true; const d = fromGedDate(kidv(k, 'DATE')); if (d) p.deathDate = d; const pl = place(kid(k, 'PLAC')); if (pl) p.deathPlace = pl; const ca = kidv(k, 'CAUS'); if (ca) notes.push('Dödsorsak: ' + ca); p.citations.push(...cites(k, 'Död')); const nt = kid(k, 'NOTE'); if (nt) notes.push('Död: ' + noteText(nt)); }
        else if (t === 'OCCU') { const v = k.val.trim(); if (v && !p.occupation) p.occupation = v; const d = fromGedDate(kidv(k, 'DATE')); if (v && (d || p.occupation !== v)) p.events.push({ id: id('e'), type: 'Yrke', desc: v, date: d, placeId: place(kid(k, 'PLAC')) }); p.citations.push(...cites(k, 'Yrke')); }
        else if (t === 'NAME') {
          p.citations.push(...cites(k, 'Namn'));
          if (k !== nm) { // a second NAME is a former name: birth (maiden), married or also-known-as
            const v = k.val.trim(), sm = v.match(/\/([^/]*)\//);
            const g = (sm ? v.replace(sm[0], ' ') : v).replace(/[*\s]+/g, (x) => x.includes(' ') ? ' ' : '').trim() || kidv(k, 'GIVN'), su = (sm ? sm[1].trim() : '') || kidv(k, 'SURN');
            const ty = kidv(k, 'TYPE').toLowerCase(), type = /birth|maiden/.test(ty) ? 'birth' : /married/.test(ty) ? 'married' : 'aka';
            const fn = { given: g === p.given ? '' : g, surname: su === p.surname ? '' : su, type };
            if (fn.given || fn.surname) (p.formerNames = p.formerNames || []).push(fn);
          }
        }
        else if (GED_EVENTS[t] || OTHER_EVENTS[t] || t === 'EVEN' || t === 'FACT') {
          let type = GED_EVENTS[t] || 'Övrigt', desc = k.val.trim(); const ty = kidv(k, 'TYPE');
          if (t === 'EVEN' || t === 'FACT') { const sw = SWE_TYPES.find(x => x.toLowerCase() === ty.toLowerCase()); if (sw) type = sw; else desc = [ty, desc].filter(Boolean).join(': '); }
          else if (OTHER_EVENTS[t]) desc = [OTHER_EVENTS[t], desc].filter(Boolean).join(': ');
          else if (t === 'CREM') desc = desc || 'Kremering';
          if (desc === 'Y') desc = '';
          const e = /** @type {any} */ ({ id: id('e'), type, date: fromGedDate(kidv(k, 'DATE')), placeId: place(kid(k, 'PLAC')) });
          const nt = kid(k, 'NOTE'); const nts = nt ? noteText(nt) : ''; const d2 = [desc, nts].filter(Boolean).join(' – '); if (d2) e.desc = d2;
          p.events.push(e); p.citations.push(...cites(k, 'event:' + e.id));
        }
        else if (t === 'NOTE') { const v = noteText(k); if (v) notes.push(v); }
        else if (t === 'SOUR') p.citations.push(...cites({ ...r, kids: [k] }, ''));
        else if (t === 'OBJE') stats.media++;
        else if (!['SEX', 'FAMC', 'FAMS', 'CHAN', 'RIN', 'REFN', '_UID', 'UID', 'RFN', 'AFN', 'SUBM', 'ANCI', 'DESI', 'RESN', 'ALIA', 'ASSO', 'CREA', '_UPD', 'EXID'].includes(t)) skip(t);
      }
      for (const e of p.events) { if (!e.date) delete e.date; if (!e.placeId) delete e.placeId; }
      if (!p.events.length) delete p.events; if (!p.citations.length) delete p.citations;
      if (notes.length) p.notes = notes.join('\n\n');
      persons[p.id] = p; perByX[r.xref] = p.id; stats.persons++;
    }

    /* families */
    for (const r of roots) if (r.tag === 'FAM') {
      stats.families++;
      const h = persons[perByX[kidv(r, 'HUSB')]], w = persons[perByX[kidv(r, 'WIFE')]];
      if (h && w) { h.spouseIds = [...new Set([...(h.spouseIds || []), w.id])]; w.spouseIds = [...new Set([...(w.spouseIds || []), h.id])]; }
      for (const c of r.kids.filter(k => k.tag === 'CHIL')) {
        const ch = persons[perByX[c.val.trim()]]; if (!ch) continue;
        if (h && !ch.fatherId) ch.fatherId = h.id; if (w && !ch.motherId) ch.motherId = w.id;
      }
      for (const [tag, type] of [['MARR', 'Vigsel'], ['DIV', 'Skilsmässa'], ['ENGA', 'Övrigt']]) for (const ev of r.kids.filter(k => k.tag === tag)) {
        const date = fromGedDate(kidv(ev, 'DATE')), pl = place(kid(ev, 'PLAC'));
        for (const [a, b] of [[h, w], [w, h]]) { if (!a) continue;
          const e = /** @type {any} */ ({ id: id('e'), type }); if (b) e.withId = b.id; if (date) e.date = date; if (pl) e.placeId = pl; if (tag === 'ENGA') e.desc = 'Förlovning';
          (a.events = a.events || []).push(e); const cs = cites(ev, 'event:' + e.id); if (cs.length) (a.citations = a.citations || []).push(...cs); }
      }
      if (!h && !w && r.kids.some(k => k.tag === 'CHIL')) warnings.push('En familj saknar föräldrar; barnen lästes in utan koppling.');
    }
    if (stats.media) warnings.push(`${stats.media} bildlänkar hoppades över – själva bilderna följer inte med i en GEDCOM-fil.`);
    const sk = Object.entries(stats.skipped).sort((a, b) => b[1] - a[1]);
    if (sk.length) warnings.push('Okända uppgifter som inte lästes in: ' + sk.slice(0, 6).map(([t, n]) => `${t} (${n})`).join(', ') + (sk.length > 6 ? ' …' : '') + '.');
    const head = roots.find(r => r.tag === 'HEAD'); const srcApp = head ? (kidv(kid(head, 'SOUR') || /** @type {any} */ ({ kids: [] }), 'NAME') || kidv(head, 'SOUR')) : '';
    return { persons, places, sources, stats, warnings, from: srcApp };
  }

  /**
   * @typedef {{kind:string,id:string,before:any,after:any}} DocChange
   * @typedef {{label:(string|null),changes:DocChange[]}} HistGroup
   */
  /**
   * Undo/redo history of document changes. Changes recorded close together form one
   * user action (a group); undo returns what to write back, newest change first.
   * Several changes to the same document within a group keep the first "before".
   * @param {{limit?:number}} [opts]
   */
  function createHistory({ limit = 60 } = {}) {
    /** @type {HistGroup[]} */ const undo = [];
    /** @type {HistGroup[]} */ const redo = [];
    /** @type {HistGroup|null} */ let open = null;
    return {
      /** @param {DocChange} ch @param {string} [label] */
      record(ch, label) {
        if (!open) { open = { label: label || null, changes: [] }; undo.push(open); if (undo.length > limit) undo.shift(); redo.length = 0; }
        const ex = open.changes.find(c => c.kind === ch.kind && c.id === ch.id);
        if (ex) ex.after = ch.after; else open.changes.push({ ...ch });
        if (label && !open.label) open.label = label;
      },
      /** Name the action being recorded (or the next one). @param {string} l */
      label(l) { if (open) open.label = l; },
      close() { if (open && !open.changes.length) undo.pop(); open = null; },
      isOpen: () => !!open,
      canUndo: () => undo.length > 0,
      canRedo: () => redo.length > 0,
      peekUndo: () => undo[undo.length - 1] || null,
      peekRedo: () => redo[redo.length - 1] || null,
      /** @returns {{group:HistGroup, apply:{kind:string,id:string,doc:any}[]}|null} */
      undo() {
        this.close(); const g = undo.pop(); if (!g) return null; redo.push(g);
        return { group: g, apply: g.changes.slice().reverse().map(c => ({ kind: c.kind, id: c.id, doc: c.before })) };
      },
      /** @returns {{group:HistGroup, apply:{kind:string,id:string,doc:any}[]}|null} */
      redo() {
        this.close(); const g = redo.pop(); if (!g) return null; undo.push(g);
        return { group: g, apply: g.changes.map(c => ({ kind: c.kind, id: c.id, doc: c.after })) };
      },
      clear() { undo.length = 0; redo.length = 0; open = null; },
      size: () => ({ undo: undo.length, redo: redo.length }),
    };
  }

  /* ------------------------------------------------------------ Archive search: matching */

  /** From this score a hit is shown as a likely match; below `weak` it is folded away. */
  const ARCHIVE_SCORE = { strong: 70, weak: 40 };

  /** Spellings that fold to one given name once the general rules in foldName have run. */
  const NAME_SPELLINGS = /** @type {Record<string,string>} */ ({ pehr: 'per', par: 'per', olov: 'olof', olaf: 'olof', gustaf: 'gustav', niels: 'nils' });

  /**
   * Fold a name for comparison: lower case, no diacritics, old and new spellings merged
   * (Pehr/Per/Pär, Carl/Karl, Christina/Kristina, Elisabeth/Elisabet, Britta/Brita).
   * @param {string|undefined|null} s
   */
  function foldName(s) {
    const t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s-]/g, '')
      .replace(/w/g, 'v').replace(/ph/g, 'f').replace(/th/g, 't').replace(/ck/g, 'k').replace(/ch/g, 'k')
      .replace(/c(?=[aou]|$)/g, 'k').replace(/q/g, 'k').replace(/z/g, 's').replace(/(.)\1+/g, '$1').trim();
    return NAME_SPELLINGS[t] || t;
  }

  const PATRONYM_END = /(sson|ssen|son|sen|dotter|dtr|dr|ss)$/;
  /** Does this look like a patronymic (Olofsson, Persdotter, or the register's abbreviation Olofss)? @param {string} s */
  const isPatronymic = (s) => PATRONYM_END.test(String(s || '').trim().toLowerCase().split(/\s+/).pop() || '');

  /**
   * The father's given name a patronymic stands for, in the spellings it may have: Olsson → ol,
   * Olofsson → olof, Andersson → ander/anders. Used with prefix matching, so Olsson fits Olof.
   * @param {string} patronym @returns {string[]}
   */
  function patronymStems(patronym) {
    const w = String(patronym || '').trim().toLowerCase().split(/\s+/).pop() || '';
    const m = w.match(PATRONYM_END); if (!m) return [];
    const stem = w.slice(0, w.length - m[0].length);
    return [...new Set([stem, stem.replace(/s$/, ''), stem + (m[0] === 'sson' || m[0] === 'ssen' ? 's' : '')])].filter((x) => x.length >= 2).map(foldName);
  }

  /** Is this patronymic (Olofsson, Olsson, Olofss) formed from this father's given name? @param {string} patronym @param {string|undefined} fatherGiven */
  function patronymMatches(patronym, fatherGiven) {
    const fg = foldName(String(fatherGiven || '').split(/[\s-]+/)[0]);
    return !!fg && patronymStems(patronym).some((st) => st === fg || fg.startsWith(st) || (fg.length >= 3 && st.startsWith(fg)));
  }

  /**
   * Read a name as the registers write it: "Olsson Lindmark, Olof" (surname part, then given names).
   * Without a comma it is read as "Given Surname". A leading patronymic before the family name is split off.
   * @param {string|undefined|null} s
   * @returns {{raw:string, given:string[], patronym:string, family:string}}
   */
  function parseRegisterName(s) {
    const raw = String(s || '').replace(/\s+/g, ' ').trim();
    let last = '', first = '';
    const i = raw.indexOf(',');
    if (i >= 0) { last = raw.slice(0, i).trim(); first = raw.slice(i + 1).trim(); }
    else { const t = raw.split(' '); if (t.length > 1) { last = t.pop() || ''; first = t.join(' '); } else first = raw; }
    const lt = last.split(' ').filter(Boolean);
    const patronym = lt.length >= 2 && isPatronymic(lt[0]) ? lt[0] : '';
    return { raw, given: first.split(/[\s-]+/).filter(Boolean), patronym, family: patronym ? lt.slice(1).join(' ') : last };
  }

  /** Given names to compare: the given names, then the call name. @param {any} p */
  const givenTokens = (p) => {
    const g = String(p.given || '').replace(/\*/g, '').split(/[\s-]+/).filter(Boolean), c = String(p.callName || '').trim();
    if (c && !g.some((x) => foldName(x) === foldName(c))) g.push(c);
    return g;
  };
  /** Surnames a person is known by, birth name first. @param {any} p @returns {string[]} */
  const surnamesOf = (p) => [...new Set([...(p.formerNames || []).filter((/** @type {any} */ n) => n.type === 'birth' && n.surname).map((/** @type {any} */ n) => n.surname), p.surname].filter(Boolean))];

  /** @param {string[]} have @param {string[]} got @returns {'same'|'variant'|'other'|'none'} first names: same spelling, another spelling, some other given name, or no match */
  function givenMatch(have, got) {
    const close = (/** @type {string} */ x, /** @type {string} */ y) => {
      const fx = foldName(x), fy = foldName(y);
      if (fx === fy) return x.toLowerCase() === y.toLowerCase() ? 'same' : 'variant';
      return fx.length >= 5 && lev(fx, fy) <= 1 ? 'variant' : '';
    };
    if (!have.length || !got.length) return 'none';
    const first = close(have[0], got[0]); if (first) return /** @type {'same'|'variant'} */ (first);
    for (const x of have) for (const y of got) if (close(x, y)) return 'other';
    return 'none';
  }

  /** @param {string} a @param {string} b */
  function sameSurname(a, b) {
    const x = foldName(String(a).trim().split(/\s+/).pop()), y = foldName(String(b).trim().split(/\s+/).pop());
    if (!x || !y) return false;
    if (x === y || (x.length >= 5 && lev(x, y) <= 1)) return true;
    const sx = patronymStems(a), sy = patronymStems(b);
    return sx.length > 0 && sy.length > 0 && sx.some((s) => sy.includes(s));
  }

  /** Does a register parish name fit a place name from the tree ("Gudmundrå sn", "Gudmundrå, Ångermanland")? @param {string} place @param {string} parish */
  function parishMatch(place, parish) {
    const strip = (/** @type {string} */ s) => foldName(s.replace(/\b(församling|socken|sn|fs|kyrkoarkiv)\b/gi, ' '));
    const pa = strip(parish); if (!pa) return false;
    return String(place).split(',').some((part) => { const x = strip(part); return !!x && (x === pa || (x.length >= 4 && pa.length >= 4 && (x.startsWith(pa) || pa.startsWith(x)))); });
  }

  /**
   * How a tree date and a register date compare. Exact date, same year, a couple of years off,
   * or far off. `years` is the gap in years. Null when either side has no year.
   * @param {string|undefined} have @param {string|undefined} got @param {{date:string, year:string}} noun
   * @returns {{code:string, text:string, points:number, years:number}|null}
   */
  function dateEvidence(have, got, noun) {
    const hy = yearOf(have), gy = yearOf(got); if (!hy || !gy) return null;
    const h = String(have).trim(), g = String(got).trim(), full = (/** @type {string} */ d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    const approx = /^(ca|cirka|omkr|före|efter|mellan)/i.test(h), d = Math.abs(hy - gy);
    if (!approx && full(h) && full(g) && h === g) return { code: 'date-exact', text: `samma ${noun.date}`, points: 35, years: 0 };
    if (d === 0) return approx || !full(h) ? { code: 'date-year', text: `samma ${noun.year}`, points: 20, years: 0 } : { code: 'date-year', text: `samma ${noun.year}, men inte samma dag`, points: 8, years: 0 };
    if (d <= 2) return { code: 'date-near', text: `${noun.year} skiljer ${d} år (${gy} i arkivet, ${hy} i trädet)`, points: 6, years: d };
    if (approx && d <= 5) return { code: 'date-near', text: `${noun.year} är ungefär detsamma (${gy} i arkivet, ${hy} i trädet)`, points: 0, years: d };
    return { code: 'date-far', text: `${noun.year} stämmer inte (${gy} i arkivet, ${hy} i trädet)`, points: -35, years: d };
  }

  /**
   * Score how well one register hit fits a person, and say why. `ctx.role` tells what the hit was
   * searched for: 'birth' (the person's own birth record), 'child' (the person is a parent in a
   * birth record) or 'marriage' (the person is the bride or groom). Starts at 0: evidence for adds,
   * evidence against subtracts, and what the tree does not know counts for nothing either way.
   * @param {any} person @param {any} cand a candidate as the archive-search function returns it
   * @param {{persons:Record<string,any>, role?:'birth'|'child'|'marriage', placeName?:(id:string)=>string}} ctx
   * @returns {{score:number, level:'strong'|'maybe'|'weak', reasons:{code:string, text:string, points:number}[]}}
   */
  function candidateScore(person, cand, ctx) {
    const persons = ctx.persons || {}, placeName = ctx.placeName || ((/** @type {string} */ id) => String(id || ''));
    const role = ctx.role || (cand.kind === 'marriage' ? 'marriage' : 'birth');
    const kids = kidsIndex(persons);
    /** @typedef {{code:string, text:string, points:number}} Reason */
    const none = { score: 0, level: /** @type {'weak'} */ ('weak'), reasons: /** @type {Reason[]} */ ([]) };
    if ((role === 'marriage') !== (cand.kind === 'marriage')) return none;

    /** Evidence from a name: the given names and the family name. @returns {Reason[]} */
    const nameReasons = (/** @type {string} */ rec, /** @type {string} */ who) => {
      const pn = parseRegisterName(rec), out = /** @type {Reason[]} */ ([]);
      const m = givenMatch(givenTokens(person), pn.given);
      if (m === 'same') out.push({ code: 'name-given', text: `förnamnet stämmer (${rec})`, points: 26 });
      else if (m === 'variant') out.push({ code: 'name-given', text: `förnamnet stämmer, med annan stavning (${rec})`, points: 22 });
      else if (m === 'other') out.push({ code: 'name-given', text: `ett av förnamnen stämmer (${rec})`, points: 14 });
      else out.push({ code: 'name-differs', text: `förnamnet stämmer inte (${rec})`, points: -40 });
      const mine = surnamesOf(person), theirs = [pn.family, pn.patronym].filter(Boolean);
      if (mine.length && theirs.length) {
        if (mine.some((a) => theirs.some((b) => sameSurname(a, b)))) out.push({ code: 'surname', text: 'efternamnet stämmer', points: 14 });
        else if (patronymStems(pn.patronym).length && person.fatherId && persons[person.fatherId] && patronymMatches(pn.patronym, persons[person.fatherId].given)) out.push({ code: 'surname', text: `${who} patronymikon passar faderns namn`, points: 10 });
        else out.push({ code: 'surname-differs', text: `efternamnet stämmer inte (${pn.family || pn.patronym})`, points: -12 });
      }
      return out;
    };

    /** Evidence from the other person on the record: a parent of the child, or the other spouse. @returns {Reason[]} */
    const partnerReasons = (/** @type {string} */ rec, /** @type {number} */ penalty) => {
      if (!rec) return [];
      const ids = new Set(person.spouseIds || []);
      for (const c of kids.get(person.id) || []) { const o = c.fatherId === person.id ? c.motherId : c.fatherId; if (o) ids.add(o); }
      const partners = [...ids].map((id) => persons[id]).filter(Boolean);
      if (!partners.length) return [];
      const pn = parseRegisterName(rec);
      const best = partners.map((p) => givenMatch(givenTokens(p), pn.given)).sort((a, b) => ['same', 'variant', 'other', 'none'].indexOf(a) - ['same', 'variant', 'other', 'none'].indexOf(b))[0];
      if (best === 'same' || best === 'variant') return [{ code: 'partner', text: `partnerns namn stämmer (${rec})`, points: 24 }];
      return [{ code: 'partner-differs', text: `ingen partner i trädet heter så (${rec})`, points: penalty }];
    };

    /** Places the person is known from. @returns {string[]} */
    const placesOf = () => [person.birthPlace, person.deathPlace, ...(person.events || []).map((/** @type {any} */ e) => e.placeId)].filter(Boolean).map((/** @type {string} */ id) => placeName(id)).filter(Boolean);

    const by = yearOf(person.birthDate), dy = yearOf(person.deathDate), cy = yearOf(cand.date);
    /** @type {Reason[]} */ let reasons = [];

    if (role === 'birth') {
      const noun = { date: 'födelsedatum', year: 'födelseår' };
      if (cand.child) {
        const m = givenMatch(givenTokens(person), parseRegisterName(cand.child).given);
        if (m === 'same') reasons.push({ code: 'name-given', text: `förnamnet stämmer (${cand.child})`, points: 30 });
        else if (m === 'variant') reasons.push({ code: 'name-given', text: `förnamnet stämmer, med annan stavning (${cand.child})`, points: 26 });
        else if (m === 'other') reasons.push({ code: 'name-given', text: `ett av förnamnen stämmer (${cand.child})`, points: 18 });
        else reasons.push({ code: 'name-differs', text: `förnamnet stämmer inte (${cand.child})`, points: -40 });
      }
      const d = dateEvidence(person.birthDate, cand.date, noun);
      if (d) {
        reasons.push(d);
        if (d.code === 'date-far' && d.years >= 15) reasons.push({ code: 'generation', text: 'troligen en annan generation', points: -15 });
      }
      for (const [key, rec, who] of /** @type {[string,string,string][]} */ ([['fatherId', cand.father, 'faderns'], ['motherId', cand.mother, 'moderns']])) {
        if (!rec) continue;
        const pn = parseRegisterName(rec), tp = persons[person[key]];
        if (tp) {
          const m = givenMatch(givenTokens(tp), pn.given);
          if (m === 'same' || m === 'variant') reasons.push({ code: 'parent-given', text: `${who} namn stämmer (${rec})`, points: 14 });
          else if (m === 'other') reasons.push({ code: 'parent-given', text: `${who} namn stämmer delvis (${rec})`, points: 7 });
          else reasons.push({ code: 'parent-differs', text: `${who} namn stämmer inte (${rec})`, points: -14 });
          if (surnamesOf(tp).some((a) => [pn.family, pn.patronym].filter(Boolean).some((b) => sameSurname(a, b)))) reasons.push({ code: 'parent-surname', text: `${who} efternamn stämmer`, points: 4 });
        } else if (key === 'fatherId' && person.surname && isPatronymic(person.surname)) {
          if (patronymMatches(person.surname, pn.given[0])) reasons.push({ code: 'parent-patronym', text: `efternamnet ${person.surname} passar faderns förnamn (${rec})`, points: 6 });
          else reasons.push({ code: 'parent-patronym-differs', text: `efternamnet ${person.surname} passar inte faderns förnamn (${rec})`, points: -8 });
        }
      }
      const home = person.birthPlace ? placeName(person.birthPlace) : '';
      if (home && cand.parish) reasons.push(parishMatch(home, cand.parish) ? { code: 'parish', text: `samma församling (${cand.parish})`, points: 14 } : { code: 'parish-differs', text: `annan församling (${cand.parish}, trädet har ${home})`, points: -6 });
    } else {
      // The person is one of two named on the record: try each side that fits their sex and keep the better.
      const sides = role === 'child' ? (person.sex === 'M' ? ['father'] : person.sex === 'K' ? ['mother'] : ['father', 'mother']) : (person.sex === 'M' ? ['groom'] : person.sex === 'K' ? ['bride'] : ['groom', 'bride']);
      const other = { father: 'mother', mother: 'father', groom: 'bride', bride: 'groom' };
      let best = /** @type {Reason[]|null} */ (null), bestSum = -Infinity;
      for (const side of sides) {
        const mine = cand[side]; if (!mine) continue;
        const rs = [...nameReasons(mine, role === 'child' ? (side === 'father' ? 'faderns' : 'moderns') : 'personens'), ...partnerReasons(cand[/** @type {'father'} */ (other[/** @type {'father'} */ (side)])], role === 'child' ? -8 : -15)];
        const sum = rs.reduce((a, r) => a + r.points, 0);
        if (sum > bestSum) { best = rs; bestSum = sum; }
      }
      reasons = best || [];
      const parentSide = person.sex === 'M' ? 'father' : person.sex === 'K' ? 'mother' : '';

      if (role === 'child') {
        if (by && cy) {
          const age = cy - by, lo = 15, hi = parentSide === 'mother' ? 46 : parentSide === 'father' ? 65 : 55;
          if (age < 14) reasons.push({ code: 'age', text: `personen var bara ${age} år vid barnets födelse`, points: -45 });
          else if (age > hi + 4) reasons.push({ code: 'age', text: `personen skulle ha varit ${age} år vid barnets födelse`, points: -40 });
          else if (age >= lo && age <= hi) reasons.push({ code: 'age', text: `rimlig ålder vid barnets födelse (${age} år)`, points: 8 });
        }
        if (dy && cy && cy > dy + (parentSide === 'mother' ? 0 : 1)) reasons.push({ code: 'after-death', text: `barnet föddes ${cy}, efter personens död ${dy}`, points: -50 });
      } else {
        const wed = (person.events || []).filter((/** @type {any} */ e) => e.type === 'Vigsel' && e.date);
        const ds = wed.map((/** @type {any} */ e) => dateEvidence(e.date, cand.date, { date: 'vigseldatum', year: 'vigselår' })).filter(Boolean).sort((a, b) => /** @type {any} */ (b).points - /** @type {any} */ (a).points);
        if (ds.length) reasons.push(/** @type {Reason} */ (ds[0]));
        else if (by && cy) {
          const age = cy - by;
          if (age < 14) reasons.push({ code: 'age', text: `personen var bara ${age} år vid vigseln`, points: -45 });
          else if (age >= 16 && age <= 70) reasons.push({ code: 'age', text: `rimlig ålder vid vigseln (${age} år)`, points: 4 });
        }
        if (dy && cy && cy > dy) reasons.push({ code: 'after-death', text: `vigseln ${cy} är efter personens död ${dy}`, points: -50 });
      }
      if (cand.parish) {
        const hit = placesOf().find((n) => parishMatch(n, cand.parish));
        if (hit) reasons.push({ code: 'parish', text: `församlingen finns bland personens platser (${hit})`, points: 12 });
      }
    }
    const score = Math.max(0, Math.min(100, Math.round(reasons.reduce((a, r) => a + r.points, 0))));
    return { score, level: score >= ARCHIVE_SCORE.strong ? 'strong' : score >= ARCHIVE_SCORE.weak ? 'maybe' : 'weak', reasons };
  }

  /**
   * Which register searches are worth making for a person: their own birth, their marriages and
   * the children they had. Each comes with the request to send to the archive-search function
   * (a year window worked out from what the tree knows) and the `role` to pass back to candidateScore.
   * Nothing is asked for a person counted as living, nor with a living parent's name: `refused: 'living'`.
   * Searches the tree has too little to base a year window on are listed in `skipped` with the reason.
   * @param {any} person @param {{persons:Record<string,any>, nowYear?:number}} ctx
   * @returns {{queries:{role:'birth'|'marriage'|'child', label:string, request:{source:string, kind:'birth'|'marriage', name:string, yearMin:number, yearMax:number, limit:number}, fallback?:{reason:string, label:string, request:any}}[], skipped:{role:string, label:string, reason:string}[], refused?:'living'|'unknown'}}
   */
  function archiveQueriesFor(person, ctx) {
    const MAX_MARRIAGE_QUERIES = 3;
    const persons = ctx.persons || {}, nowYear = ctx.nowYear || new Date().getFullYear();
    /** @type {any[]} */ const queries = [], skipped = [];
    if (!person || !person.id) return { queries, skipped, refused: 'unknown' };
    const kids = kidsIndex(persons);
    if (isLiving(person, persons, nowYear, kids)) return { queries, skipped, refused: 'living' };

    const searchName = (/** @type {any} */ p) => [givenTokens(p)[0], surnamesOf(p)[0]].filter(Boolean).join(' ');
    const usable = (/** @type {any} */ p) => !!p && searchName(p).replace(/[^\p{L}]/gu, '').length >= 2 && !isLiving(p, persons, nowYear, kids);
    const window = (/** @type {number} */ a, /** @type {number} */ b) => { const lo = Math.max(1500, Math.round(a)), hi = Math.min(nowYear, Math.round(b)); return lo <= hi && hi - lo <= 60 ? { yearMin: lo, yearMax: hi } : null; };
    const add = (/** @type {'birth'|'marriage'|'child'} */ role, /** @type {string} */ label, /** @type {string} */ name, /** @type {any} */ w) =>
      queries.push({ role, label, request: { source: 'riksarkivet', kind: role === 'marriage' ? 'marriage' : 'birth', name, ...w, limit: 50 } });
    const skip = (/** @type {string} */ role, /** @type {string} */ label, /** @type {string} */ reason) => skipped.push({ role, label, reason });

    /** Years either side of a recorded date to search: 3 for "ca"/"före"/etc., else 1, even for a full date, since the
     *  tree's year can be one off and an exact year would lose the record without a word. One year either side also
     *  covers a date next to New Year, where the record may be written in the other year. */
    const radius = (/** @type {any} */ d) => (/^(ca|cirka|omkr|före|efter|mellan)/i.test(String(d || '').trim()) ? 3 : 1);
    const by = yearOf(person.birthDate), dy = yearOf(person.deathDate);
    const parents = ['fatherId', 'motherId'].map((k) => persons[person[k]]).filter(Boolean);
    const parentYears = parents.map((p) => yearOf(p.birthDate)).filter((y) => !!y);
    const kidYears = (kids.get(person.id) || []).map((c) => yearOf(c.birthDate)).filter((y) => !!y);

    /** Years the person can have been born in: their own date, else bounded by parents and children. */
    let born = /** @type {[number,number]|null} */ (null);
    if (by) { const r = radius(person.birthDate); born = [by - r, by + r]; }
    else {
      let lo = -Infinity, hi = Infinity;
      if (parentYears.length) { lo = Math.max(lo, Math.max(...parentYears) + 16); hi = Math.min(hi, Math.min(...parentYears) + 55); }
      if (kidYears.length) { lo = Math.max(lo, Math.max(...kidYears) - 55); hi = Math.min(hi, Math.min(...kidYears) - 16); }
      if (dy) hi = Math.min(hi, dy);
      if (isFinite(lo) && isFinite(hi) && lo <= hi) born = [lo, hi];
    }
    const mid = born ? (born[0] + born[1]) / 2 : null;
    const noYears = 'trädet har inga årtal att utgå från';

    // Own birth. The register has the child's given names only, so search on a parent's name when there is one.
    {
      const label = 'Födelse', w = born && window(born[0], born[1]);
      const parent = parents.find((p) => p.id === person.fatherId && usable(p)) || parents.find((p) => usable(p));
      const livingParent = parents.some((p) => isLiving(p, persons, nowYear, kids));
      if (!w) skip('birth', label, noYears);
      else if (parent) add('birth', parent.id === person.fatherId ? 'Födelse (sökt på faderns namn)' : 'Födelse (sökt på moderns namn)', searchName(parent), w);
      else if (livingParent) skip('birth', label, 'föräldern räknas som levande, så namnet skickas inte');
      else if (usable(person)) add('birth', 'Födelse (sökt på personens eget namn)', searchName(person), w);
      else skip('birth', label, 'namn saknas');
    }

    // Marriages, by the person's own name (the birth surname for someone with a former name).
    {
      const label = 'Vigsel', name = searchName(person);
      const dated = (person.events || []).filter((/** @type {any} */ e) => e.type === 'Vigsel' && yearOf(e.date));
      if (!usable(person)) skip('marriage', label, 'namn saknas');
      else if (dated.length) {
        // One search per distinct wedding year, the earliest three at most (each search is a call to Riksarkivet).
        const seen = new Set(), weddings = [];
        for (const e of [...dated].sort((a, b) => /** @type {number} */ (dateKey(a.date)) - /** @type {number} */ (dateKey(b.date)))) {
          const y = /** @type {number} */ (yearOf(e.date));
          if (seen.has(y)) continue; seen.add(y); weddings.push({ y, r: radius(e.date) });
        }
        for (const { y, r } of weddings.slice(0, MAX_MARRIAGE_QUERIES)) { const w = window(y - r, y + r); if (w) add('marriage', `Vigsel ${y}`, name, w); }
        if (weddings.length > MAX_MARRIAGE_QUERIES)
          skip('marriage', 'Vigsel', `${weddings.length} vigselår i trädet, söker de ${MAX_MARRIAGE_QUERIES} första; hoppade över ${weddings.slice(MAX_MARRIAGE_QUERIES).map((x) => x.y).join(', ')}`);
      } else {
        const first = kidYears.length ? Math.min(...kidYears) : null, fromBirth = mid ? [mid + 16, Math.min(mid + 55, dy || Infinity)] : null;
        let range = fromBirth;
        if (first) range = fromBirth && fromBirth[0] <= first + 1 ? [Math.max(fromBirth[0], first - 12), Math.min(fromBirth[1], first + 1)] : [first - 12, first + 1];
        const w = range && window(range[0], range[1]);
        if (dy && by && dy - by < 16) skip('marriage', label, 'dog före 16 års ålder');
        else if (w) add('marriage', `Vigsel (årtal okänt, söker ${w.yearMin}–${w.yearMax})`, name, w);
        else skip('marriage', label, noYears);
      }
    }

    // Children: the person is searched as a parent. Mothers bear children to about 46, fathers to about 60.
    {
      const label = 'Barn', name = searchName(person);
      const span = person.sex === 'K' ? 46 : 60;
      const w = mid && window(mid + 16, Math.min(mid + span, (dy || Infinity) + (person.sex === 'K' ? 0 : 1)));
      if (!usable(person)) skip('child', label, 'namn saknas');
      else if (!w) skip('child', label, mid ? 'personen dog före barnafödande ålder' : noYears);
      else {
        // The other parent's given name narrows the search a lot (all words must be in the record, in any role), but only
        // when there is exactly one known partner: with several, the name would hide the children of the others.
        const partnerIds = new Set([...(person.spouseIds || []), ...(kids.get(person.id) || []).map((c) => (c.fatherId === person.id ? c.motherId : c.fatherId))].filter(Boolean));
        const partner = partnerIds.size === 1 ? persons[[...partnerIds][0]] : null;
        const pg = partner && usable(partner) ? givenTokens(partner)[0] : '';
        if (!pg) add('child', 'Barn (sökt på personens namn som förälder)', name, w);
        else {
          add('child', 'Barn (sökt på personens och partnerns namn)', `${name} ${pg}`, w);
          // If the partner's name finds nothing (misspelt, or recorded otherwise), runArchiveQuery searches again without it.
          queries[queries.length - 1].fallback = { reason: 'partner_name_dropped', label: 'Barn (sökt på personens namn som förälder)', request: { ...queries[queries.length - 1].request, name } };
        }
      }
    }
    return { queries, skipped };
  }

  /**
   * Runs one query from archiveQueriesFor with `search` (request → the function's answer). When the query has a
   * fallback and the first search finds nothing at all (total 0), it searches once more with the fallback request and
   * marks the answer with `fallback` (e.g. 'partner_name_dropped'), so the app can say why. Never otherwise.
   * `request` in the result is the one that produced the answer, to ask for further pages with.
   * @param {{request:any, fallback?:{reason:string, label:string, request:any}}} query
   * @param {(request:any)=>Promise<{total:number, offset:number, more:boolean, candidates:any[]}>} search
   */
  async function runArchiveQuery(query, search) {
    const first = await search(query.request);
    if (!query.fallback || !first || first.total !== 0) return { ...first, request: query.request, fallback: null };
    const second = await search(query.fallback.request);
    return { ...second, request: query.fallback.request, fallback: query.fallback.reason };
  }

  const api = { ARCHIVE_SCORE, foldName, isPatronymic, patronymMatches, parseRegisterName, candidateScore, archiveQueriesFor, runArchiveQuery, onThisDay, COLS, parseSwedishCitation, seriesType, COUNTY, parseGedcom, decodeGedcom, fromGedDate, sourceType, createHistory, yearOf, dateKey, MONTHS, fmtDate, whenText, gedDate, genitive, slugify, parseDelimited, nrm, lev, dupScore, computeHidden, upMap, blood, bloodTerm, components, docHash, hashArchive, merge3, b64u, unb64u, newKey, encryptJSON, decryptJSON, writeSecret, sha256hex, keyTag, kidsIndex, isLiving, livingInfo, likelyDeceased, redactLiving, splitForReaders, joinPrivate, diffNews, addNews, pruneNews };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // @ts-ignore — browser global
  root.KinCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
