// Synthetic four-generation family with brothers and sisters at every level.
export function family() {
  const P = []; let n = 0;
  const mk = (given, surname, sex, y, fa, mo) => { const p = { id: 'x' + (++n), kind: 'person', given, surname, sex, birthDate: String(y), fatherId: fa && fa.id, motherId: mo && mo.id }; P.push(p); return p; };
  const sibs = (k, sur, y, fa, mo, tag) => Array.from({ length: k }, (_, i) => mk(tag + (i + 1), sur, i % 2 ? 'K' : 'M', y + 2 * i + 1, fa, mo));
  const kidsOf = (p, k, y, tag) => { const o = mk('Make' + tag, 'Ingift', p.sex === 'M' ? 'K' : 'M', y - 25); const [fa, mo] = p.sex === 'M' ? [p, o] : [o, p]; return sibs(k, p.surname, y, fa, mo, tag); };
  // generation 3 (eight great-grandparents) -> their children
  const g3 = ['FFF', 'FFM', 'FMF', 'FMM', 'MFF', 'MFM', 'MMF', 'MMM'].map((t, i) => mk(t, 'S' + (i >> 1), i % 2 ? 'K' : 'M', 1850 + i));
  const FF = mk('Farfar', 'S0', 'M', 1880, g3[0], g3[1]), FM = mk('Farmor', 'S1', 'K', 1882, g3[2], g3[3]);
  const MF = mk('Morfar', 'S2', 'M', 1884, g3[4], g3[5]), MM = mk('Mormor', 'S3', 'K', 1886, g3[6], g3[7]);
  const ffS = sibs(3, 'S0', 1870, g3[0], g3[1], 'FFsyskon'), fmS = sibs(3, 'S1', 1872, g3[2], g3[3], 'FMsyskon');
  const mfS = sibs(2, 'S2', 1874, g3[4], g3[5], 'MFsyskon'), mmS = sibs(3, 'S3', 1876, g3[6], g3[7], 'MMsyskon');
  const Fa = mk('Far', 'S0', 'M', 1910, FF, FM), Mo = mk('Mor', 'S2', 'K', 1912, MF, MM);
  const faS = sibs(3, 'S0', 1900, FF, FM, 'Farsyskon'), moS = sibs(2, 'S2', 1913, MF, MM, 'Morsyskon');
  const me = mk('Jag', 'S0', 'M', 1940, Fa, Mo); const meS = sibs(2, 'S0', 1941, Fa, Mo, 'Syskon');
  // descendants: cousins, and branches of the grandparents' brothers and sisters
  const cousinsF = kidsOf(faS[0], 2, 1930, 'KusinF'), cousinsM = kidsOf(moS[1], 2, 1936, 'KusinM');
  const ff1 = kidsOf(ffS[0], 3, 1900, 'FFgren'); kidsOf(ff1[0], 2, 1930, 'FFsyssling'); // wide and deep
  kidsOf(ffS[2], 1, 1905, 'FFliten');                                                   // shallow
  const fm1 = kidsOf(fmS[1], 2, 1902, 'FMgren'); kidsOf(fm1[0], 1, 1931, 'FMsyssling'); // on the inner side: not drawn
  kidsOf(mfS[0], 2, 1903, 'MFgren');                                                    // inner too
  const mm1 = kidsOf(mmS[1], 2, 1906, 'MMgren'); kidsOf(mm1[1], 2, 1933, 'MMsyssling');
  return { persons: P, me: me.id, ids: { FF, FM, MF, MM, Fa, Mo, ffS, fmS, mfS, mmS, faS, moS, meS, cousinsF, cousinsM, fm1 } };
}

/**
 * Synthetic family for partner order (all fictional). Mannen has three partners: Tidig, younger than
 * Sen but with the older children; Sen, with one child (a lone child); Barnlös, the oldest, without
 * children. Sen also has a child with Annan. Syster is Mannen's sister, so he also shows in a side branch.
 */
export function partnerFamily() {
  const P = [];
  const mk = (id, sex, y, extra = {}) => { const p = { id, kind: 'person', given: id, surname: 'Fiktiv', sex, birthDate: String(y), fatherId: extra.f || '', motherId: extra.m || '', spouseIds: extra.sp || [] }; P.push(p); return p; };
  mk('PFar', 'M', 1930, { sp: ['PMor'] }); mk('PMor', 'K', 1932, { sp: ['PFar'] });
  mk('Mannen', 'M', 1960, { f: 'PFar', m: 'PMor', sp: ['Sen', 'Barnlös', 'Tidig'] }); // not added in the order they stand
  mk('Syster', 'K', 1958, { f: 'PFar', m: 'PMor' });
  mk('Tidig', 'K', 1968, { sp: ['Mannen'] }); mk('Sen', 'K', 1958, { sp: ['Annan', 'Mannen'] }); mk('Barnlös', 'K', 1950, { sp: ['Mannen'] });
  mk('Annan', 'M', 1955, { sp: ['Sen'] });
  mk('TidigBarn1', 'M', 1990, { f: 'Mannen', m: 'Tidig' }); mk('TidigBarn2', 'K', 1993, { f: 'Mannen', m: 'Tidig' });
  mk('SenBarn', 'K', 2005, { f: 'Mannen', m: 'Sen' });
  mk('AnnanBarn', 'M', 1985, { f: 'Annan', m: 'Sen' });
  return P;
}

/**
 * Synthetic wide family (all fictional), shaped like a king with two wives: Stamfar has one child with
 * Första and ten with Andra, and some of the children have children of their own.
 */
export function wideFamily() {
  const P = [];
  const mk = (id, sex, y, extra = {}) => { const p = { id, kind: 'person', given: id, surname: 'Fiktiv', sex, birthDate: String(y), fatherId: extra.f || '', motherId: extra.m || '', spouseIds: extra.sp || [] }; P.push(p); return p; };
  mk('Stamfar', 'M', 1500, { sp: ['Första', 'Andra'] });
  mk('Första', 'K', 1510, { sp: ['Stamfar'] }); mk('Andra', 'K', 1515, { sp: ['Stamfar'] });
  mk('Förstbarn', 'M', 1533, { f: 'Stamfar', m: 'Första', sp: ['FörstbarnsMaka'] }); mk('FörstbarnsMaka', 'K', 1550, { sp: ['Förstbarn'] });
  mk('Barnbarn1', 'K', 1566, { f: 'Förstbarn', m: 'FörstbarnsMaka' }); mk('Barnbarn2', 'M', 1568, { f: 'Förstbarn', m: 'FörstbarnsMaka' });
  for (let i = 1; i <= 10; i++) mk('Andrabarn' + i, i % 2 ? 'M' : 'K', 1536 + i, { f: 'Stamfar', m: 'Andra' });
  // a son with two wives and a child with each, and a daughter with one child
  const s = P.find((p) => p.id === 'Andrabarn3'); s.spouseIds = ['Svärdotter1', 'Svärdotter2'];
  mk('Svärdotter1', 'K', 1545, { sp: ['Andrabarn3'] }); mk('Svärdotter2', 'K', 1560, { sp: ['Andrabarn3'] });
  mk('Sonson1', 'M', 1566, { f: 'Andrabarn3', m: 'Svärdotter1' }); mk('Sonson2', 'M', 1590, { f: 'Andrabarn3', m: 'Svärdotter2' });
  const d = P.find((p) => p.id === 'Andrabarn6'); d.spouseIds = ['Svärson'];
  mk('Svärson', 'M', 1540, { sp: ['Andrabarn6'] }); mk('Dotterdotter', 'K', 1570, { f: 'Svärson', m: 'Andrabarn6' });
  return P;
}
