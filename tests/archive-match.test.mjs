import { describe, it, expect } from 'vitest';
import core from '../src/core.js';

const { foldName, isPatronymic, patronymMatches, parseRegisterName, candidateScore, archiveQueriesFor, runArchiveQuery, ARCHIVE_SCORE } = core;

/* A made-up family. Olof Ekelöv (1855–1930) and Erika Strand (1860–1940) had Elin (1887) and Karl (1890);
 * Olof's father is Nils Ekelöv. Places are ids, as in the app. */
const places = { pl_sa: 'Sälgsjö', pl_tm: 'Tallmora' };
const placeName = (id) => places[id] || '';
const people = [
  { id: 'nils', given: 'Nils', surname: 'Ekelöv', sex: 'M', birthDate: '1820-04-04', deathDate: '1890-02-02' },
  { id: 'olof', given: 'Olof', surname: 'Ekelöv', sex: 'M', birthDate: '1855-03-01', deathDate: '1930-01-01', birthPlace: 'pl_tm', fatherId: 'nils', spouseIds: ['erika'],
    events: [{ type: 'Vigsel', date: '1884-02-28', withId: 'erika', placeId: 'pl_tm' }] },
  { id: 'erika', given: 'Erika', surname: 'Strand', sex: 'K', birthDate: '1860-06-06', deathDate: '1940-09-09', spouseIds: ['olof'],
    events: [{ type: 'Vigsel', date: '1884-02-28', withId: 'olof', placeId: 'pl_tm' }] },
  { id: 'elin', given: 'Elin', surname: 'Ekelöv', sex: 'K', birthDate: '1887-05-02', deathDate: '1960-08-01', birthPlace: 'pl_sa', fatherId: 'olof', motherId: 'erika' },
  { id: 'karl', given: 'Karl', surname: 'Ekelöv', sex: 'M', birthDate: '1890-09-09', deathDate: '1950-01-01', fatherId: 'olof', motherId: 'erika' },
  { id: 'maja', given: 'Maja', surname: 'Ekelöv', sex: 'K', birthDate: '1990-01-01', fatherId: 'karl' },
];
const persons = Object.fromEntries(people.map((p) => [p.id, p]));
const ctx = (role, extra = {}) => ({ persons, placeName, role, nowYear: 2026, ...extra });
const score = (id, cand, role) => candidateScore(persons[id], cand, ctx(role));
const codes = (r) => r.reasons.map((x) => x.code);

const birth = (child, date, father, mother, parish) => ({ source: 'riksarkivet', kind: 'birth', id: 'x', url: '', date, parish, child, father, mother });
const wedding = (groom, bride, date, parish) => ({ source: 'riksarkivet', kind: 'marriage', id: 'y', url: '', date, parish, groom, bride });

describe('register names', () => {
  it('reads "Surname, Given" with a patronymic before the family name', () => {
    expect(parseRegisterName('Olsson Lindmark, Olof')).toMatchObject({ given: ['Olof'], patronym: 'Olsson', family: 'Lindmark' });
    expect(parseRegisterName('Olofss Lindmark, Olof')).toMatchObject({ patronym: 'Olofss', family: 'Lindmark' });
    expect(parseRegisterName('Strand, Erika Maria')).toMatchObject({ given: ['Erika', 'Maria'], patronym: '', family: 'Strand' });
  });
  it('keeps a lone patronymic as the family name', () => {
    expect(parseRegisterName('Andersson, Anna')).toMatchObject({ given: ['Anna'], patronym: '', family: 'Andersson' });
  });
  it('reads a name without a comma as "Given Surname", and copes with nothing', () => {
    expect(parseRegisterName('Olof Ekelöv')).toMatchObject({ given: ['Olof'], family: 'Ekelöv' });
    expect(parseRegisterName('Olof')).toMatchObject({ given: ['Olof'], family: '' });
    expect(parseRegisterName('')).toMatchObject({ given: [], family: '' });
    expect(parseRegisterName(undefined).raw).toBe('');
  });
});

describe('name folding', () => {
  it('merges spellings of the same given name', () => {
    for (const set of [['Pehr', 'Per', 'Pär'], ['Carl', 'Karl'], ['Christina', 'Kristina'], ['Elisabeth', 'Elisabet'], ['Britta', 'Brita'], ['Gustaf', 'Gustav'], ['Eric', 'Erik', 'Erick'], ['Olof', 'Olov']])
      expect(new Set(set.map(foldName)).size, set.join('/')).toBe(1);
  });
  it('keeps different names apart', () => {
    expect(foldName('Per')).not.toBe(foldName('Pål'));
    expect(foldName('Anna')).not.toBe(foldName('Hanna'));
  });
  it('recognises patronymics and their abbreviations', () => {
    for (const s of ['Olofsson', 'Olsson', 'Olofss', 'Persdotter', 'Nilsdtr', 'Hansen']) expect(isPatronymic(s), s).toBe(true);
    for (const s of ['Ekelöv', 'Strand', 'Lindmark']) expect(isPatronymic(s), s).toBe(false);
  });
  it('matches a patronymic to the father\'s given name, whichever way it is written', () => {
    for (const [pat, father] of [['Olofsson', 'Olof'], ['Olsson', 'Olof'], ['Olofss', 'Olof'], ['Persson', 'Pehr'], ['Andersson', 'Anders'], ['Karlsson', 'Carl'], ['Gustafsson', 'Gustav'], ['Nilsdotter', 'Nils'], ['Jonsson', 'Jonas']])
      expect(patronymMatches(pat, father), `${pat} / ${father}`).toBe(true);
    for (const [pat, father] of [['Nilsson', 'Olof'], ['Jonsson', 'Johan'], ['Andersson', 'Per'], ['Ekelöv', 'Olof']])
      expect(patronymMatches(pat, father), `${pat} / ${father}`).toBe(false);
  });
});

describe('a person\'s own birth', () => {
  const right = birth('Elin', '1887-05-02', 'Olofsson Ekelöv, Olof', 'Strand, Erika', 'Sälgsjö');
  const grandmother = birth('Elin', '1858-03-10', 'Nilsson Hagelin, Nils', 'Ek, Kajsa', 'Tallmora');
  const sister = birth('Karin', '1889-01-01', 'Olofsson Ekelöv, Olof', 'Strand, Erika', 'Sälgsjö');
  const earlierSameName = birth('Elin', '1884-07-07', 'Olofsson Ekelöv, Olof', 'Strand, Erika', 'Sälgsjö');

  it('puts the right record on top and says why', () => {
    const r = score('elin', right, 'birth');
    expect(r.score).toBe(100); expect(r.level).toBe('strong');
    expect(r.reasons.map((x) => x.text)).toEqual(expect.arrayContaining(['samma födelsedatum', 'samma församling (Sälgsjö)', 'faderns namn stämmer (Olofsson Ekelöv, Olof)', 'moderns namn stämmer (Strand, Erika)']));
  });
  it('ranks the right record above every near miss', () => {
    const ranked = [right, earlierSameName, sister, grandmother].map((c) => ({ c, r: score('elin', c, 'birth') })).sort((a, b) => b.r.score - a.r.score);
    expect(ranked[0].c).toBe(right);
    expect(ranked[1].c).toBe(earlierSameName);
  });
  it('gives a namesake in the wrong generation a low score, with the generation named', () => {
    const r = score('elin', grandmother, 'birth');
    expect(r.score).toBeLessThan(ARCHIVE_SCORE.weak); expect(r.level).toBe('weak');
    expect(codes(r)).toEqual(expect.arrayContaining(['date-far', 'generation', 'parent-differs']));
  });
  it('does not accept a sibling with the right parents', () => {
    const r = score('elin', sister, 'birth');
    expect(r.score).toBeLessThan(ARCHIVE_SCORE.weak); expect(codes(r)).toContain('name-differs');
  });
  it('puts a right name and parents but another year in the middle', () => {
    const r = score('elin', earlierSameName, 'birth');
    expect(r.level).toBe('maybe'); expect(codes(r)).toContain('date-far');
  });
  it('accepts another spelling of the name, with a lower weight', () => {
    const per = { id: 'per', given: 'Per', surname: 'Ekelöv', sex: 'M', birthDate: '1801-01-01' };
    const a = candidateScore(per, birth('Pehr', '1801-01-01'), { persons: { per }, role: 'birth' });
    const b = candidateScore(per, birth('Per', '1801-01-01'), { persons: { per }, role: 'birth' });
    expect(a.reasons[0].text).toContain('annan stavning'); expect(a.score).toBeLessThan(b.score);
  });
  it('uses the surname as a patronymic when the tree has no father', () => {
    const anders = { id: 'a', given: 'Anders', surname: 'Olofsson', sex: 'M', birthDate: '1820' };
    const fits = candidateScore(anders, birth('Anders', '1820-03-03', 'Larsson, Olof'), { persons: { a: anders }, role: 'birth' });
    const clashes = candidateScore(anders, birth('Anders', '1820-03-03', 'Larsson, Nils'), { persons: { a: anders }, role: 'birth' });
    expect(codes(fits)).toContain('parent-patronym'); expect(codes(clashes)).toContain('parent-patronym-differs');
    expect(fits.score).toBeGreaterThan(clashes.score);
  });
  it('counts what the tree does not know as nothing, not as a mismatch', () => {
    const bare = { id: 'b', given: 'Elin' };
    const r = candidateScore(bare, right, { persons: { b: bare }, role: 'birth' });
    expect(r.reasons.map((x) => x.code)).toEqual(['name-given']); expect(r.score).toBe(30);
  });
  it('treats an approximate date as weaker evidence than a full one', () => {
    const approx = { ...persons.elin, birthDate: 'ca 1887' };
    const r = candidateScore(approx, right, { persons, placeName, role: 'birth' });
    expect(r.reasons.find((x) => x.code === 'date-year').points).toBe(20);
  });
});

describe('the person as a parent', () => {
  const child = birth('Elin', '1887-05-02', 'Nilsson Ekelöv, Olof', 'Strand, Erika', 'Sälgsjö');
  it('finds the child of the right couple', () => {
    const r = score('olof', child, 'child');
    expect(r.level).toBe('strong'); expect(codes(r)).toEqual(expect.arrayContaining(['name-given', 'surname', 'partner', 'age']));
  });
  it('lowers a namesake whose wife has another name', () => {
    const other = birth('Hilda', '1890-01-01', 'Nilsson Ekelöv, Olof', 'Berg, Anna', 'Vinnarp');
    expect(score('olof', other, 'child').score).toBeLessThan(score('olof', child, 'child').score);
    expect(codes(score('olof', other, 'child'))).toContain('partner-differs');
  });
  it('rejects a child born after the parent died', () => {
    const late = birth('Hilda', '1935-01-01', 'Nilsson Ekelöv, Olof', 'Strand, Erika', 'Sälgsjö');
    const r = score('olof', late, 'child'); expect(r.score).toBe(0); expect(codes(r)).toContain('after-death');
  });
  it('rejects a child born when the parent was a child, or the mother past childbearing', () => {
    expect(codes(score('olof', birth('X', '1866-01-01', 'Nilsson Ekelöv, Olof'), 'child'))).toContain('age');
    expect(score('olof', birth('X', '1866-01-01', 'Nilsson Ekelöv, Olof'), 'child').score).toBeLessThan(ARCHIVE_SCORE.weak);
    expect(score('erika', birth('X', '1915-01-01', 'Nilsson Ekelöv, Olof', 'Strand, Erika'), 'child').score).toBeLessThan(ARCHIVE_SCORE.weak);
  });
  it('looks on the mother\'s side for a woman', () => {
    const r = score('erika', child, 'child');
    expect(r.level).toBe('strong'); expect(r.reasons.find((x) => x.code === 'name-given').text).toContain('Strand, Erika');
  });
  it('tries both sides when the sex is unknown, and takes the better', () => {
    const unknown = { ...persons.olof, sex: '' };
    expect(candidateScore(unknown, child, ctx('child')).level).toBe('strong');
  });
});

describe('the person as bride or groom', () => {
  const real = wedding('Nilsson Ekelöv, Olof', 'Strand, Erika', '1884-02-28', 'Tallmora');
  const namesake = wedding('Larsson Berg, Olof', 'Holm, Anna', '1910-05-05', 'Vinnarp');
  it('finds the wedding for both spouses', () => {
    for (const id of ['olof', 'erika']) { const r = score(id, real, 'marriage'); expect(r.score, id).toBe(100); expect(r.reasons.map((x) => x.text)).toContain('samma vigseldatum'); }
  });
  it('gives a namesake with another bride and another year nothing', () => {
    const r = score('olof', namesake, 'marriage'); expect(r.score).toBe(0); expect(codes(r)).toEqual(expect.arrayContaining(['partner-differs', 'date-far']));
  });
  it('falls back on age when the tree has no wedding date', () => {
    const noWedding = { ...persons.olof, events: [] };
    const r = candidateScore(noWedding, real, ctx('marriage'));
    expect(codes(r)).toContain('age'); expect(r.level).toBe('strong');
  });
  it('rejects a wedding after the death', () => {
    const r = score('olof', wedding('Nilsson Ekelöv, Olof', 'Holm, Anna', '1935-01-01', 'Tallmora'), 'marriage');
    expect(codes(r)).toContain('after-death'); expect(r.score).toBeLessThan(ARCHIVE_SCORE.weak);
  });
  it('scores a record of the wrong kind for the role as nothing', () => {
    expect(score('olof', real, 'birth').score).toBe(0); expect(score('olof', birth('Elin', '1887'), 'marriage').score).toBe(0);
  });
});

describe('which searches to make', () => {
  const q = (id, extra) => archiveQueriesFor(persons[id], { persons, nowYear: 2026, ...extra });
  it('refuses a living person, even when called directly', () => {
    const r = q('maja'); expect(r.refused).toBe('living'); expect(r.queries).toEqual([]);
    const zack = { id: 'z', given: 'Zack', birthDate: '1990-01-01' };
    expect(archiveQueriesFor(zack, { persons: { z: zack }, nowYear: 2026 }).refused).toBe('living');
    const unknownAge = { id: 'u', given: 'Uno', surname: 'Ek' };
    expect(archiveQueriesFor(unknownAge, { persons: { u: unknownAge }, nowYear: 2026 }).refused).toBe('living');
    expect(archiveQueriesFor(null, { persons }).refused).toBe('unknown');
  });
  it('searches Olof\'s birth on his father\'s name, with a tight window', () => {
    const b = q('olof').queries.find((x) => x.role === 'birth');
    expect(b.request).toMatchObject({ source: 'riksarkivet', kind: 'birth', name: 'Nils Ekelöv', yearMin: 1854, yearMax: 1856 });
    expect(b.label).toContain('faderns namn');
  });
  it('searches the marriage on the wedding year, and the children over his fathering years', () => {
    const { queries } = q('olof');
    expect(queries.find((x) => x.role === 'marriage').request).toMatchObject({ kind: 'marriage', name: 'Olof Ekelöv', yearMin: 1883, yearMax: 1885 });
    expect(queries.find((x) => x.role === 'child').request).toMatchObject({ kind: 'birth', name: 'Olof Ekelöv Erika', yearMin: 1871, yearMax: 1915 });
  });
  it('searches a year alone or a full date one year either side, and a "ca" date three', () => {
    const at = (birthDate) => archiveQueriesFor({ ...persons.nils, birthDate }, { persons, nowYear: 2026 }).queries.find((x) => x.role === 'birth');
    expect(at('1820').request).toMatchObject({ yearMin: 1819, yearMax: 1821 });
    expect(at('ca 1820').request).toMatchObject({ yearMin: 1817, yearMax: 1823 });
    expect(at('1820-06-15').request).toMatchObject({ yearMin: 1819, yearMax: 1821 });
  });
  it('keeps the neighbouring year when a firm date is next to New Year', () => {
    const at = (birthDate) => archiveQueriesFor({ ...persons.nils, birthDate }, { persons, nowYear: 2026 }).queries.find((x) => x.role === 'birth');
    expect(at('1820-12-30').request).toMatchObject({ yearMin: 1819, yearMax: 1821 });
    expect(at('1820-01-02').request).toMatchObject({ yearMin: 1819, yearMax: 1821 });
  });
  it('searches at most three weddings, the earliest, and says which it left out', () => {
    const ev = ['1900-05-05', '1884-02-28', '1910-01-01', '1893-07-07', '1884-09-09', '1925-03-03'].map((date) => ({ type: 'Vigsel', date }));
    const many = { ...persons.olof, spouseIds: [], events: ev };
    const r = archiveQueriesFor(many, { persons: { ...persons, olof: many }, nowYear: 2026 });
    const m = r.queries.filter((x) => x.role === 'marriage');
    expect(m.map((x) => x.request.yearMin)).toEqual([1883, 1892, 1899]);
    const note = r.skipped.find((x) => x.role === 'marriage');
    expect(note.reason).toContain('1910'); expect(note.reason).toContain('1925'); expect(note.reason).toContain('3');
  });
  it('does not mention a skipped wedding when there are three or fewer', () => {
    expect(q('olof').skipped.filter((x) => x.role === 'marriage')).toEqual([]);
  });
  it('adds the partner\'s given name to the children search only for one known, dead partner', () => {
    const child = (r) => r.queries.find((x) => x.role === 'child').request.name;
    expect(child(q('olof'))).toBe('Olof Ekelöv Erika');
    expect(child(q('erika'))).toBe('Erika Strand Olof');
    // a second partner: the name would hide that partner's children
    const two = { ...persons, olof: { ...persons.olof, spouseIds: ['erika', 'anna'] }, anna: { id: 'anna', given: 'Anna', surname: 'Holm', sex: 'K', birthDate: '1865', deathDate: '1900' } };
    expect(child(archiveQueriesFor(two.olof, { persons: two, nowYear: 2026 }))).toBe('Olof Ekelöv');
    // a living partner is never sent
    const alive = { ...persons, erika: { ...persons.erika, deathDate: '', birthDate: '1990-01-01' } };
    expect(child(archiveQueriesFor(alive.olof, { persons: alive, nowYear: 2026 }))).toBe('Olof Ekelöv');
  });
  it('takes the partner from the children when no spouse link is recorded', () => {
    const bare = { ...persons, olof: { ...persons.olof, spouseIds: [] } };
    expect(archiveQueriesFor(bare.olof, { persons: bare, nowYear: 2026 }).queries.find((x) => x.role === 'child').request.name).toBe('Olof Ekelöv Erika');
  });
  it('limits a woman\'s children to her childbearing years and her lifetime', () => {
    const c = q('erika').queries.find((x) => x.role === 'child').request;
    expect(c).toMatchObject({ yearMin: 1876, yearMax: 1906 });
  });
  it('searches an undated marriage over the years it can have happened, narrowed by the first child', () => {
    const undated = { ...persons, olof: { ...persons.olof, events: [] } };
    const m = archiveQueriesFor(undated.olof, { persons: undated, nowYear: 2026 }).queries.find((x) => x.role === 'marriage');
    expect(m.request).toMatchObject({ yearMin: 1875, yearMax: 1888 }); expect(m.label).toContain('årtal okänt');
  });
  it('uses the birth surname for a married woman', () => {
    const stina = { id: 'stina', given: 'Stina', surname: 'Ekelöv', sex: 'K', birthDate: '1870', deathDate: '1950', formerNames: [{ type: 'birth', surname: 'Berg' }], events: [{ type: 'Vigsel', date: '1900-06-01' }] };
    const r = archiveQueriesFor(stina, { persons: { stina }, nowYear: 2026 });
    expect(r.queries.find((x) => x.role === 'marriage').request.name).toBe('Stina Berg');
  });
  it('sends a person\'s own name only as a last resort, and never a living parent\'s', () => {
    const lone = { id: 'l', given: 'Lisa', surname: 'Ek', sex: 'K', birthDate: '1870-01-01', deathDate: '1930' };
    expect(archiveQueriesFor(lone, { persons: { l: lone }, nowYear: 2026 }).queries.find((x) => x.role === 'birth').label).toContain('eget namn');
    const parent = { id: 'f', given: 'Fredrik', surname: 'Ek', sex: 'M', birthDate: '1960-01-01' };
    const kid = { id: 'k', given: 'Kim', surname: 'Ek', sex: 'M', birthDate: '1985-01-01', deathDate: '2005-01-01', fatherId: 'f' };
    const r = archiveQueriesFor(kid, { persons: { f: parent, k: kid }, nowYear: 2026 });
    expect(r.queries.find((x) => x.role === 'birth')).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('Fredrik');
    expect(r.skipped.find((x) => x.role === 'birth').reason).toContain('levande');
  });
  it('says what it could not search when the tree has no years', () => {
    const brita = { id: 'br', given: 'Brita', surname: 'Ek', deathDate: '1902-01-01' };
    const r = archiveQueriesFor(brita, { persons: { br: brita }, nowYear: 2026 });
    expect(r.queries).toEqual([]); expect(r.skipped.map((x) => x.role).sort()).toEqual(['birth', 'child', 'marriage']);
  });
  it('works out a birth window from the parents and children when the person has no date', () => {
    const p = { id: 'p', given: 'Lars', surname: 'Ek', sex: 'M', fatherId: 'f', deathDate: '1900-01-01' };
    const f = { id: 'f', given: 'Per', surname: 'Ek', sex: 'M', birthDate: '1800-01-01' };
    const c = { id: 'c', given: 'Nils', surname: 'Ek', birthDate: '1850-01-01', fatherId: 'p' };
    const r = archiveQueriesFor(p, { persons: { p, f, c }, nowYear: 2026 }).queries.find((x) => x.role === 'birth');
    expect(r.request).toMatchObject({ yearMin: 1816, yearMax: 1834, name: 'Per Ek' });
  });
  it('never asks for more than 60 years or for a year in the future', () => {
    for (const id of ['nils', 'olof', 'erika', 'elin', 'karl']) for (const x of q(id).queries) {
      expect(x.request.yearMax - x.request.yearMin).toBeLessThanOrEqual(60); expect(x.request.yearMax).toBeLessThanOrEqual(2026); expect(x.request.limit).toBe(50);
    }
  });
});

describe('a record whose search words belong to different people', () => {
  // Riksarkivet needs every word somewhere in the record, so "Olof Ekelöv" also finds a child of
  // some Olof Nilsson and some Britta Ekelöv. The score has to see that these are two people.
  const mixed = { source: 'riksarkivet', kind: 'birth', id: 'm', url: '', date: '1888-04-02', parish: 'Sälgsjö', child: 'Karl', father: 'Nilsson, Olof', mother: 'Ekelöv, Britta' };
  const real = { source: 'riksarkivet', kind: 'birth', id: 'r', url: '', date: '1887-05-02', parish: 'Sälgsjö', child: 'Elin', father: 'Ekelöv, Olof', mother: 'Strand, Erika' };
  it('scores low and is not a strong match', () => {
    const r = score('olof', mixed, 'child');
    expect(r.level).not.toBe('strong'); expect(r.score).toBeLessThan(ARCHIVE_SCORE.weak);
  });
  it('still gives the real child a strong match', () => {
    expect(score('olof', real, 'child').level).toBe('strong');
  });
  it('ranks the real record above the mixed one', () => {
    expect(score('olof', real, 'child').score).toBeGreaterThan(score('olof', mixed, 'child').score);
  });
});

describe('dropping the partner\'s name when it finds nothing', () => {
  const reply = (total, ids = []) => ({ source: 'riksarkivet', kind: 'birth', total, offset: 0, more: total > ids.length, candidates: ids.map((id) => ({ id })) });
  const childQuery = () => archiveQueriesFor(persons.olof, { persons, nowYear: 2026 }).queries.find((x) => x.role === 'child');
  it('offers a fallback without the partner\'s name, and none when no name was added', () => {
    const c = childQuery();
    expect(c.fallback).toMatchObject({ reason: 'partner_name_dropped', request: { ...c.request, name: 'Olof Ekelöv' } });
    const two = { ...persons, olof: { ...persons.olof, spouseIds: ['erika', 'anna'] }, anna: { id: 'anna', given: 'Anna', surname: 'Holm', sex: 'K', birthDate: '1865', deathDate: '1900' } };
    expect(archiveQueriesFor(two.olof, { persons: two, nowYear: 2026 }).queries.find((x) => x.role === 'child').fallback).toBeUndefined();
  });
  it('searches again without the name when the first search finds nothing, and says so', async () => {
    const asked = [];
    const search = async (req) => { asked.push(req.name); return req.name === 'Olof Ekelöv Erika' ? reply(0) : reply(2, ['AbCd1234', 'EfGh5678']); };
    const r = await runArchiveQuery(childQuery(), search);
    expect(asked).toEqual(['Olof Ekelöv Erika', 'Olof Ekelöv']);
    expect(r).toMatchObject({ fallback: 'partner_name_dropped', total: 2, request: { name: 'Olof Ekelöv' } });
  });
  it('keeps the first answer when it found anything, however little', async () => {
    const asked = [];
    const search = async (req) => { asked.push(req.name); return reply(1, ['AbCd1234']); };
    const r = await runArchiveQuery(childQuery(), search);
    expect(asked).toEqual(['Olof Ekelöv Erika']);
    expect(r).toMatchObject({ fallback: null, total: 1, request: { name: 'Olof Ekelöv Erika' } });
  });
  it('never searches twice for a query without a fallback', async () => {
    const birthQuery = archiveQueriesFor(persons.olof, { persons, nowYear: 2026 }).queries.find((x) => x.role === 'birth');
    let calls = 0;
    const r = await runArchiveQuery(birthQuery, async () => { calls++; return reply(0); });
    expect(calls).toBe(1); expect(r.fallback).toBeNull();
  });
});
