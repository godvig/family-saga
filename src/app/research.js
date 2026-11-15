/* Släktsagan · research.js — The research log: where you looked for someone, what you were after,
   and what you found – including the searches that came up empty, so nobody looks in the same
   book twice. Planned searches ("Att leta") double as a to-do list on the start page.

   Entries are their own documents ({kind:'log'}) like comments, so two people logging at the
   same time merge without losing anything. In a shared tree they are only for editors. */
import { P, shortName } from './domain.js?v=57';
import { myName } from './panel.js?v=57';
import { renderAll, select, setFocus } from './router.js?v=57';
import { Share } from './share.js?v=57';
import { ALL, S, ui } from './state.js?v=57';
import { Hist, Store } from './store.js?v=57';
import { clone, esc, fmtDate, toast, uid, localDay } from './util.js?v=57';

const RESULT = {
  todo: { icon: '🔎', label: 'Att leta', hint: 'planerat' },
  found: { icon: '✅', label: 'Hittade' },
  partial: { icon: '🟡', label: 'Delvis' },
  notfound: { icon: '✖️', label: 'Hittade inte' },
};
const today = () => localDay();

/** A person's log: planned searches first, then the newest. */
function logsFor(pid) {
  return Object.values(ALL.logs || {}).filter((l) => l.personId === pid)
    .sort((a, b) => ((b.result === 'todo') - (a.result === 'todo')) || (b.date || '').localeCompare(a.date || '') || (b.at || '').localeCompare(a.at || ''));
}
/** Every planned search for someone who still exists, oldest first. */
const openSearches = () => Object.values(ALL.logs || {}).filter((l) => l.result === 'todo' && P(l.personId)).sort((a, b) => (a.at || '').localeCompare(b.at || ''));

function entryHTML(l, ed) {
  const r = RESULT[l.result] || RESULT.found, src = l.sourceId && S.sources[l.sourceId];
  const where = [src ? src.title : '', l.where].filter(Boolean).join(' · ');
  return `<div class="lg r-${esc(l.result || 'found')}" data-lg="${esc(l.id)}">
    <span class="lg-i" title="${esc(r.label)}">${r.icon}</span>
    <div class="lg-b">
      <div class="lg-h"><b>${esc(l.goal || r.label)}</b><span class="muted small">${l.result === 'todo' ? 'att leta' : esc(fmtDate(l.date) || '')}${l.by ? ' · ' + esc(l.by) : ''}</span></div>
      ${where ? `<div class="small lg-w">📚 ${src ? `<a href="#" data-lgsrc="${esc(src.id)}">${esc(src.title)}</a>${l.where ? ' · ' + esc(l.where) : ''}` : esc(where)}</div>` : ''}
      ${l.text ? `<div class="lg-t">${esc(l.text).replace(/\n/g, '<br>')}</div>` : ''}
      ${l.url && /^https?:\/\//.test(l.url) ? `<a class="small" href="${esc(l.url)}" target="_blank" rel="noopener">Öppna länken ↗</a>` : ''}
      ${ed ? `<div class="cm-acts">${l.result === 'todo' ? `<button class="linkbtn" data-lgdone="${esc(l.id)}">Klart – vad hittade du?</button>` : ''}<button class="linkbtn" data-lgedit="${esc(l.id)}">Ändra</button><button class="linkbtn muted" data-lgdel="${esc(l.id)}">Ta bort</button></div>` : ''}
    </div></div>`;
}

/** The "Forskningslogg" section of the person panel. */
function logSection(p) {
  if (Share.readOnly()) return '';
  const ed = Store.canEdit, all = logsFor(p.id);
  if (!ed && !all.length) return '';
  const todo = all.filter((l) => l.result === 'todo').length, empty = all.filter((l) => l.result === 'notfound').length;
  return `<div class="sec research"><h4>Forskningslogg${todo ? ` <span class="cm-count">${todo} att leta</span>` : ''}${ed ? '<span style="display:flex;gap:6px"><button class="btn sm" data-lgnew="todo" title="Skriv upp något att leta efter senare">+ Att leta</button><button class="btn sm" data-lgnew="found">+ Sökning</button></span>' : ''}</h4>
    <div id="logform"></div>
    ${all.length ? all.map((l) => entryHTML(l, ed)).join('') : `<div class="muted small">Skriv upp var du har letat efter ${esc(shortName(p))} – även det du <i>inte</i> hittade. Då slipper du (och släkten) leta i samma bok två gånger.</div>`}
    ${empty ? `<div class="small muted" style="margin-top:6px">${empty} ${empty === 1 ? 'sökning' : 'sökningar'} utan resultat är sparade, så ingen behöver göra om dem.</div>` : ''}
  </div>`;
}

/** Add or change an entry, inline in the panel. */
function logForm(p, entry, preset) {
  const f = document.querySelector('#logform'); if (!f) return;
  const l = entry ? clone(entry) : { result: preset || 'found', date: today() };
  if (entry && preset) l.result = preset;
  const srcs = Object.values(S.sources).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'sv'));
  const cited = (P(p.id).citations || []).map((c) => c.sourceId);
  f.innerHTML = `<div class="mini lg-form">
    <div class="lg-res" role="radiogroup" aria-label="Resultat">${Object.entries(RESULT).map(([k, r]) => `<label class="chip-r"><input type="radio" name="lgR" value="${k}" ${l.result === k ? 'checked' : ''}><span>${r.icon} ${r.label}</span></label>`).join('')}</div>
    <label class="f"><span>Vad letade du efter?</span><input class="t" id="lgG" value="${esc(l.goal || '')}" placeholder="t.ex. Födelse, Flytt från Röke, Föräldrarna"></label>
    <div class="row2"><label class="f"><span>Källa</span><select class="t" id="lgS"><option value="">– ingen särskild –</option>${srcs.map((s) => `<option value="${esc(s.id)}" ${l.sourceId === s.id ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select></label>
      <label class="f"><span>Var, närmare</span><input class="t" id="lgW" value="${esc(l.where || '')}" placeholder="sid 45, bild 50 · Google · frågade moster"></label></div>
    <div class="row2"><label class="f lg-date"><span>Datum</span><input class="t" type="date" id="lgD" value="${esc(l.date || today())}"></label>
      <label class="f"><span>Länk <small class="muted">(valfri)</small></span><input class="t" id="lgU" value="${esc(l.url || '')}" placeholder="https://"></label></div>
    <label class="f"><span>Anteckning</span><textarea class="t" id="lgT" rows="2" placeholder="Vad stod det? Vad ska prövas härnäst?">${esc(l.text || '')}</textarea></label>
    <label class="chk small" id="lgCiteRow" hidden><input type="checkbox" id="lgCite" checked> Lägg också till källan som källhänvisning för ${esc(shortName(p))}</label>
    <div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn sm" id="lgC">Avbryt</button><button class="btn sm primary" id="lgOk">Spara</button></div></div>`;
  const q = (s) => f.querySelector(s);
  const res = () => (f.querySelector('input[name=lgR]:checked') || {}).value || 'found';
  const sync = () => {
    const r = res(), sid = q('#lgS').value;
    q('#lgCiteRow').hidden = !(sid && (r === 'found' || r === 'partial') && !cited.includes(sid));
    q('.lg-date').style.visibility = r === 'todo' ? 'hidden' : '';
  };
  f.querySelectorAll('input[name=lgR]').forEach((i) => (i.onchange = sync)); q('#lgS').onchange = sync; sync();
  q('#lgG').focus();
  q('#lgC').onclick = () => (f.innerHTML = '');
  q('#lgOk').onclick = async () => {
    const r = res(), goal = q('#lgG').value.trim(), where = q('#lgW').value.trim(), text = q('#lgT').value.trim();
    if (!goal && !where && !text && !q('#lgS').value) { q('#lgG').focus(); return; }
    const doc = { ...l, kind: 'log', id: l.id || uid('lg'), personId: p.id, result: r, goal, where, text,
      sourceId: q('#lgS').value || undefined, url: q('#lgU').value.trim() || undefined, date: r === 'todo' ? undefined : (q('#lgD').value || today()),
      by: l.by || myName() || undefined, at: l.at || new Date().toISOString() };
    for (const k of Object.keys(doc)) if (doc[k] === undefined || doc[k] === '') delete doc[k];
    clearTimeout(Hist._t); Hist.h.close();
    Hist.label(r === 'todo' ? 'Att leta: ' + (goal || shortName(p)) : 'Forskningslogg: ' + (goal || shortName(p)));
    await Store.put(doc);
    if (!q('#lgCiteRow').hidden && q('#lgCite').checked) {
      const pp = clone(P(p.id)); pp.citations = (pp.citations || []).concat([{ id: uid('c'), sourceId: doc.sourceId, about: '', detail: where }]);
      await Store.put(pp);
    }
    toast(r === 'todo' ? 'Uppskrivet – det syns under "Att leta" på startsidan.' : r === 'notfound' ? 'Sparat. Nu vet alla att just där finns inget.' : 'Sparat i forskningsloggen.', 4000);
  };
}

function bindLogs(pn, p) {
  pn.querySelectorAll('[data-lgnew]').forEach((b) => (b.onclick = () => logForm(p, null, b.dataset.lgnew)));
  pn.querySelectorAll('[data-lgedit]').forEach((b) => (b.onclick = () => logForm(p, ALL.logs[b.dataset.lgedit])));
  pn.querySelectorAll('[data-lgdone]').forEach((b) => (b.onclick = () => logForm(p, ALL.logs[b.dataset.lgdone], 'found')));
  pn.querySelectorAll('[data-lgdel]').forEach((b) => (b.onclick = () => { Hist.label('Borttagen loggpost'); Store.del('log', b.dataset.lgdel); toast('Borttagen. Ångra med Ctrl+Z.'); }));
  pn.querySelectorAll('[data-lgsrc]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); select('source', a.dataset.lgsrc); }));
}

/** "Att leta efter" on the start page: planned searches across the archive. */
function openSearchesHTML() {
  if (Share.readOnly()) return '';
  const list = openSearches(); if (!list.length) return '';
  return `<h2 class="sec-t">Att leta efter <span class="muted" style="font-weight:400">· ${list.length}</span></h2>
    <div class="qlist">${list.slice(0, 5).map((l) => { const p = P(l.personId); const src = l.sourceId && S.sources[l.sourceId];
      return `<a class="qrow" href="#" data-lgp="${esc(l.personId)}"><span class="lg-i">🔎</span><span class="qbody"><b>${esc(shortName(p))}: ${esc(l.goal || 'leta vidare')}</b>${src || l.where ? `<span>${esc([src && src.title, l.where].filter(Boolean).join(' · '))}</span>` : ''}</span></a>`; }).join('')}
      ${list.length > 5 ? `<div class="small muted" style="padding:6px 4px">och ${list.length - 5} till</div>` : ''}</div>`;
}
function bindOpenSearches(v) {
  v.querySelectorAll('[data-lgp]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); const id = a.dataset.lgp; setFocus(id); ui.sel = { type: 'person', id }; location.hash = 'trad';
    setTimeout(() => { const el = document.querySelector('#panel .research'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 350); renderAll(); }));
}

export { RESULT, logsFor, openSearches, logSection, logForm, bindLogs, openSearchesHTML, bindOpenSearches };
