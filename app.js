import { store, initStore } from './store.js';
import { heureDefaut } from './config.js';
import { daysInMonth, feries } from './holidays.js';
import { pad, dateKey, duree, etat, resumeMois, fmtH, fmtDec } from './calc.js';
import { buildMonthlyXlsx, lireModele } from './excel.js';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
  'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const JOURS_L = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const $ = (id) => document.getElementById(id);

// ---------- Molette ----------
class Wheel {
  constructor(el, onChange) {
    this.el = el; this.onChange = onChange; this.items = []; this.index = 0;
    this.el.tabIndex = 0;
    let t;
    this.el.addEventListener('scroll', () => {
      clearTimeout(t);
      this.highlight(this.indexFromScroll());
      t = setTimeout(() => this.settle(), 90);
    }, { passive: true });
    this.el.addEventListener('click', (e) => {
      const it = e.target.closest('.it');
      if (it) this.set(this.items[Number(it.dataset.i)].value, true);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const i = Math.max(0, Math.min(this.items.length - 1, this.index + (e.key === 'ArrowDown' ? 1 : -1)));
      this.set(this.items[i].value, true);
    });
  }
  get h() { return this.el.querySelector('.it')?.offsetHeight || 40; }
  indexFromScroll() { return Math.max(0, Math.min(this.items.length - 1, Math.round(this.el.scrollTop / this.h))); }
  setItems(items, value) {
    this.items = items;
    this.el.innerHTML = '<div class="pad"></div>' +
      items.map((it, i) => `<div class="it" data-i="${i}">${it.label}</div>`).join('') + '<div class="pad"></div>';
    this.set(value ?? items[Math.min(this.index, items.length - 1)].value, false, true);
  }
  highlight(i) {
    this.el.querySelectorAll('.it.sel').forEach((x) => x.classList.remove('sel'));
    this.el.querySelector(`.it[data-i="${i}"]`)?.classList.add('sel');
  }
  set(value, smooth = false, silent = false) {
    let i = this.items.findIndex((it) => it.value === value);
    if (i < 0) i = 0;
    this.index = i;
    this.highlight(i);
    this.el.scrollTo({ top: i * this.h, behavior: smooth ? 'smooth' : 'instant' });
    if (!silent) this.onChange?.(this.value);
  }
  settle() {
    const i = this.indexFromScroll();
    if (Math.abs(this.el.scrollTop - i * this.h) > 1) this.el.scrollTo({ top: i * this.h, behavior: 'smooth' });
    if (i !== this.index) { this.index = i; this.onChange?.(this.value); }
  }
  get value() { return this.items[this.index]?.value; }
}

// ---------- État ----------
const now = new Date();
const state = {
  depart: true, // interrupteur Arrivée / Départ : départ par défaut
  conge: false,
  histo: { y: now.getFullYear(), m: now.getMonth() + 1 },
};

const range = (a, b, step = 1) => { const r = []; for (let i = a; i <= b; i += step) r.push(i); return r; };
const wJour = new Wheel($('w-jour'), () => onDateChange());
const wMois = new Wheel($('w-mois'), () => { refreshDays(); onDateChange(); });
const wAn = new Wheel($('w-an'), () => { refreshDays(); onDateChange(); });
const wH = new Wheel($('w-h'));
const wMin = new Wheel($('w-min'));

const y0 = now.getFullYear();
wAn.setItems(range(y0 - 1, y0 + 1).map((v) => ({ value: v, label: v })), y0);
wMois.setItems(MOIS.map((l, i) => ({ value: i + 1, label: l })), now.getMonth() + 1);
refreshDays(now.getDate());
wH.setItems(range(0, 23).map((v) => ({ value: v, label: pad(v) })), 19);
wMin.setItems(range(0, 55, 5).map((v) => ({ value: v, label: pad(v) })), 30);

function refreshDays(keep) {
  const n = daysInMonth(wAn.value, wMois.value);
  const cur = keep ?? wJour.value ?? 1;
  wJour.setItems(range(1, n).map((v) => ({ value: v, label: pad(v) })), Math.min(cur, n));
}
const selKey = () => dateKey(wAn.value, wMois.value, wJour.value);

function setSwitch(el, on) { el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); }

function setTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  wH.set(h, false, true);
  wMin.set(Math.round(m / 5) * 5 % 60, false, true);
}
function defaultTimeForSelection() {
  const e = store.entries[selKey()];
  const champ = state.depart ? 'depart' : 'arrivee';
  setTime(e?.[champ] || heureDefaut[champ]);
}

function renderJourSemaine() {
  const d = new Date(wAn.value, wMois.value - 1, wJour.value);
  $('jour-sem').textContent = JOURS_L[d.getDay()];
}

function onDateChange() {
  renderJourSemaine();
  const e = store.entries[selKey()];
  state.conge = !!e?.conge;
  setSwitch($('sw-conge'), state.conge);
  $('note').value = e?.note || '';
  $('note-box').open = !!e?.note;
  defaultTimeForSelection();
  renderDeja();
  applyConge();
}

function renderDeja() {
  const k = selKey();
  const e = store.entries[k];
  const f = feries(wAn.value).get(k);
  const st = etat(e);
  let txt;
  if (st === 'vide') txt = 'Rien de saisi pour ce jour';
  else if (st === 'conge') txt = '<b>Congé</b> enregistré';
  else {
    const a = e.arrivee || '--:--', d = e.depart || '--:--';
    txt = `Saisi : <b>${a}</b> → <b>${d}</b>`;
    if (st === 'complet') txt += ` · ${fmtH(duree(e))}`;
    if (st === 'incoherent') txt += ' · <span style="color:var(--rouge)">départ avant arrivée</span>';
  }
  if (f) txt = `${f} · ${txt}`;
  $('deja').innerHTML = txt;
}

function applyConge() {
  $('ligne-heure').classList.toggle('inactif', state.conge);
  $('ligne-sens').classList.toggle('inactif', state.conge);
}

$('sw-sens').addEventListener('click', () => {
  state.depart = !state.depart;
  setSwitch($('sw-sens'), state.depart);
  defaultTimeForSelection();
});
$('sw-conge').addEventListener('click', () => {
  state.conge = !state.conge;
  setSwitch($('sw-conge'), state.conge);
  applyConge();
});

// ---------- Validation ----------
$('btn-valider').addEventListener('click', async () => {
  const k = selKey();
  const prev = store.entries[k] || {};
  const note = $('note').value.trim();
  const [y, m, d] = k.split('-');
  const jour = `${d}/${m}`;
  let patch, msg;
  if (state.conge) {
    patch = { conge: true, arrivee: null, depart: null, note };
    msg = `Congé enregistré pour le ${jour}`;
  } else {
    const champ = state.depart ? 'depart' : 'arrivee';
    const hhmm = `${pad(wH.value)}:${pad(wMin.value)}`;
    patch = { conge: false, [champ]: hhmm, note };
    const label = state.depart ? 'Départ' : 'Arrivée';
    msg = `${label} ${hhmm.replace(':', 'h')} enregistré${state.depart ? '' : 'e'} pour le ${jour}`;
    if (prev[champ] && prev[champ] !== hhmm) msg += ` (remplace ${prev[champ].replace(':', 'h')})`;
    const a = champ === 'arrivee' ? hhmm : prev.arrivee;
    const dp = champ === 'depart' ? hhmm : prev.depart;
    if (a && dp && dp <= a) msg += ' - attention : départ avant arrivée';
  }
  await store.save(k, patch);
  toast(msg);
});

// ---------- Historique ----------
function show(v) {
  for (const id of ['v-login', 'v-saisie', 'v-histo']) $(id).hidden = id !== v;
  if (v === 'v-histo') { renderHisto(); renderModele(); }
  if (v === 'v-saisie') { onDateChange(); requestAnimationFrame(() => [wJour, wMois, wAn, wH, wMin].forEach((w) => w.set(w.value, false, true))); }
}
$('btn-histo').addEventListener('click', () => {
  state.histo = { y: wAn.value, m: wMois.value };
  show('v-histo');
});
$('btn-retour').addEventListener('click', () => show('v-saisie'));
$('m-prec').addEventListener('click', () => moveMonth(-1));
$('m-suiv').addEventListener('click', () => moveMonth(1));
function moveMonth(d) {
  const i = state.histo.y * 12 + state.histo.m - 1 + d;
  state.histo = { y: Math.floor(i / 12), m: (i % 12) + 1 };
  renderHisto();
}

function renderHisto() {
  const { y, m } = state.histo;
  const E = store.entries;
  const r = resumeMois(E, y, m);
  const fer = feries(y);
  $('m-titre').textContent = `${MOIS[m - 1]} ${y}`;
  $('tuiles').innerHTML = [
    [fmtDec(r.heures), 'heures réalisées'],
    [r.ouvres, 'jours ouvrés'],
    [r.conges, r.conges > 1 ? 'jours de congé' : 'jour de congé'],
  ].map(([v, l]) => `<div class="tuile"><b>${v}</b><small>${l}</small></div>`).join('');
  $('anomalies').textContent = r.anomalies.length
    ? `⚠ ${r.anomalies.length} jour(s) à compléter : ${r.anomalies.map((k) => k.slice(8) + '/' + k.slice(5, 7)).join(', ')}`
    : '';

  const n = daysInMonth(y, m);
  let html = '', sem = '', semH = 0;
  const flush = () => {
    if (!sem) return;
    html += `<div class="sem">${sem}<div class="sem-tot">Semaine : ${fmtDec(semH)} h</div></div>`;
    sem = ''; semH = 0;
  };
  for (let d = 1; d <= n; d++) {
    const dt = new Date(y, m - 1, d);
    const wd = dt.getDay();
    if (wd === 1) flush();
    const k = dateKey(y, m, d);
    const e = E[k];
    const st = etat(e);
    const h = duree(e) || 0;
    semH += h;
    let mid, right = '';
    if (st === 'conge') mid = '<span class="badge">Congé</span>';
    else if (st === 'vide') mid = fer.has(k) ? `<span class="badge ferie">${fer.get(k)}</span>` : '<span class="vide">-</span>';
    else {
      mid = `${e.arrivee || '--:--'} → ${e.depart || '--:--'}`;
      right = st === 'complet' ? `<span class="dur">${fmtH(h)}</span>` : '<span class="badge warn">à compléter</span>';
    }
    if (e?.note) mid += `<span class="n">${esc(e.note)}</span>`;
    const cls = ['jour', wd === 0 || wd === 6 ? 'we' : '', fer.has(k) ? 'ferie' : ''].join(' ');
    const del = st === 'vide' && !e?.note ? '<span class="suppr-vide"></span>'
      : `<button class="suppr" data-del="${k}" type="button" aria-label="Effacer le ${JOURS_L[wd]} ${d}">${ICONE_SUPPR}</button>`;
    sem += `<div class="jour-l"><button class="${cls}" data-k="${k}" type="button"><span class="d">${JOURS[wd]} ${pad(d)}</span><span>${mid}</span>${right}</button>${del}</div>`;
  }
  flush();
  $('jours').innerHTML = html;
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICONE_SUPPR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

$('jours').addEventListener('click', async (ev) => {
  const del = ev.target.closest('.suppr');
  if (del) {
    const k = del.dataset.del;
    const [y, m, d] = k.split('-').map(Number);
    const jour = `${JOURS_L[new Date(y, m - 1, d).getDay()]} ${d} ${MOIS[m - 1].toLowerCase()}`;
    if (!confirm(`Effacer la saisie du ${jour} ?
Arrivée, départ, congé et note seront supprimés.`)) return;
    await store.remove(k);
    toast(`Saisie du ${jour} effacée`);
    return;
  }
  const b = ev.target.closest('.jour');
  if (!b) return;
  const [y, m, d] = b.dataset.k.split('-').map(Number);
  wAn.set(y, false, true); wMois.set(m, false, true); refreshDays(d);
  show('v-saisie');
});

// ---------- Export Excel ----------
$('btn-export').addEventListener('click', async () => {
  const { y, m } = state.histo;
  const r = resumeMois(store.entries, y, m);
  if (r.anomalies.length && !confirm(`${r.anomalies.length} jour(s) incomplet(s) ne seront pas comptés. Exporter quand même ?`)) return;
  if (!window.JSZip) { toast('Connexion nécessaire pour le premier export'); return; }
  $('btn-export').disabled = true;
  try {
    const modele = await store.getModele();
    if (!modele) {
      toast("Chargez d'abord le modèle Excel (lien « Modèle Excel » ci-dessous)");
      return;
    }
    if (y * 12 + m < modele.y * 12 + modele.m) {
      toast(`Le modèle date de ${MOIS[modele.m - 1].toLowerCase()} ${modele.y} : export possible à partir de ce mois`);
      return;
    }
    const { blob, filename } = await buildMonthlyXlsx(y, m, store.entries, modele);
    await partagerOuTelecharger(blob, filename);
  } catch (e) {
    console.error(e);
    toast("Erreur pendant l'export : " + e.message);
  } finally { $('btn-export').disabled = false; }
});

// Téléphone : feuille de partage (Enregistrer dans Fichiers, Mail, AirDrop...),
// plus fiable que le téléchargement dans une appli installée sur l'écran d'accueil.
// Ordinateur : téléchargement classique dans le dossier Téléchargements.
async function partagerOuTelecharger(blob, filename) {
  const tactile = matchMedia('(pointer: coarse)').matches;
  const file = new File([blob], filename, { type: blob.type });
  if (tactile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // partage annulé par l'utilisateur
      // NotAllowedError (geste expiré) ou autre : on bascule sur le téléchargement
    }
  }
  download(blob, filename);
  toast(`${filename} téléchargé`);
}

function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- Modèle Excel ----------
$('f-modele').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (!window.JSZip) { toast('Connexion nécessaire'); return; }
  try {
    const mo = await lireModele(f);
    const actuel = await store.getModele();
    const q = `Utiliser « ${mo.nom} » (mois de référence : ${MOIS[mo.m - 1].toLowerCase()} ${mo.y}) comme modèle d'export ?`
      + (actuel ? `
Il remplacera « ${actuel.nom} ».` : '');
    if (!confirm(q)) return;
    await store.setModele(mo);
    toast('Modèle enregistré');
    renderModele();
  } catch (e) { toast('Modèle refusé : ' + e.message); }
});
async function renderModele() {
  try {
    const mo = await store.getModele();
    $('lbl-modele').textContent = mo ? `Modèle : ${MOIS_C[mo.m - 1]} ${mo.y}` : 'Charger le modèle Excel';
  } catch { /* hors ligne */ }
}
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// ---------- Sauvegarde JSON ----------
$('btn-backup').addEventListener('click', () => {
  const data = {};
  for (const [k, v] of Object.entries(store.entries)) {
    const majLe = v.majLe?.toDate ? v.majLe.toDate().toISOString() : v.majLe;
    data[k] = { ...v, majLe };
  }
  const t = new Date();
  download(new Blob([JSON.stringify({ app: 'code-quantum', version: 1, entrees: data }, null, 1)], { type: 'application/json' }),
    `sauvegarde-code-quantum-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}.json`);
});
$('f-import').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    const data = json.entrees || {};
    const n = Object.keys(data).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).length;
    if (!n) throw new Error('aucune saisie trouvée');
    if (!confirm(`Restaurer ${n} jour(s) ? Les jours présents dans la sauvegarde remplaceront les saisies actuelles.`)) return;
    await store.replaceAll(data);
    toast(`${n} jour(s) restauré(s)`);
  } catch (e) { toast('Fichier invalide : ' + e.message); }
});

// ---------- Connexion / synchro ----------
const ERREURS_AUTH = {
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect',
  'auth/invalid-email': 'Adresse e-mail invalide',
  'auth/user-disabled': 'Ce compte est désactivé',
  'auth/too-many-requests': 'Trop de tentatives : réessayez dans quelques minutes',
  'auth/network-request-failed': 'Pas de connexion internet',
  'auth/missing-password': 'Saisissez le mot de passe',
};
const msgAuth = (e) => ERREURS_AUTH[e.code] || `Connexion impossible (${e.code || e.message})`;
function loginMsg(txt, ok = false) {
  $('login-err').textContent = txt;
  $('login-err').classList.toggle('ok', ok);
}

$('f-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('l-email').value, mdp = $('l-mdp').value;
  if (!email || !mdp) { loginMsg('Saisissez votre e-mail et votre mot de passe'); return; }
  loginMsg('');
  $('btn-login').disabled = true;
  try { await store.signIn(email, mdp); $('l-mdp').value = ''; }
  catch (e) { loginMsg(msgAuth(e)); }
  finally { $('btn-login').disabled = false; }
});
$('btn-oubli').addEventListener('click', async () => {
  const email = $('l-email').value.trim();
  if (!email) { loginMsg("Saisissez d'abord votre e-mail ci-dessus"); $('l-email').focus(); return; }
  try {
    await store.resetPassword(email);
    loginMsg(`Si ce compte existe, un e-mail de réinitialisation a été envoyé à ${email}`, true);
  } catch (e) { loginMsg(msgAuth(e)); }
});
$('btn-switch').addEventListener('click', async () => { loginMsg(''); await store.signOut(); });
$('btn-logout').addEventListener('click', async () => { await store.signOut(); });

function renderSync() {
  const s = $('sync');
  const map = {
    local: ['Ce téléphone uniquement', '#b0b0b0'],
    connecte: ['Synchronisé', '#12b76a'],
    'hors-ligne': ['Hors ligne (envoi plus tard)', '#f79009'],
    deconnecte: ['Non connecté', '#b0b0b0'],
    refuse: ['Compte non autorisé', '#d92d20'],
    init: ['Chargement…', '#b0b0b0'],
  };
  const key = store.mode === 'local' ? (store.erreur ? 'hors-ligne' : 'local') : store.status;
  const [txt, col] = map[key] || map.init;
  s.textContent = store.erreur || txt;
  s.style.setProperty('--sync', col);
  s.title = store.user?.email || '';
  $('btn-logout').hidden = store.mode !== 'firebase' || !store.user;
}

let lastView = null;
store.onChange(() => {
  renderSync();
  const needLogin = store.mode === 'firebase' && (store.status === 'deconnecte' || store.status === 'refuse');
  if (needLogin) {
    const refuse = store.status === 'refuse';
    $('f-login').hidden = refuse;
    $('btn-oubli').hidden = refuse;
    $('btn-switch').hidden = !refuse;
    $('login-txt').hidden = refuse;
    if (refuse) loginMsg(`Le compte ${store.user?.email || ''} n'est pas autorisé dans les règles Firestore.`);
    lastView = 'v-login'; show('v-login');
    return;
  }
  if (store.status === 'init') return;
  if (lastView === null || lastView === 'v-login') { lastView = 'v-saisie'; show('v-saisie'); return; }
  if (!$('v-histo').hidden) renderHisto();
  else renderDeja();
});

let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('vis');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('vis'), 3200);
}

initStore();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

// Accès pour les tests
window.__codeQuantum = { store, buildMonthlyXlsx };
