// Calculs d'heures partagés entre l'historique et l'export Excel.
import { daysInMonth, joursOuvres } from './holidays.js';

export const pad = (n) => String(n).padStart(2, '0');
export const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, mi] = hhmm.split(':').map(Number);
  return h * 60 + mi;
};

// Durée en heures décimales d'une entrée (null si incomplète ou congé)
export function duree(e) {
  if (!e || e.conge) return null;
  const a = toMin(e.arrivee), d = toMin(e.depart);
  if (a == null || d == null || d <= a) return null;
  return (d - a) / 60;
}

export function etat(e) {
  if (!e) return 'vide';
  if (e.conge) return 'conge';
  if (e.arrivee && e.depart) return toMin(e.depart) > toMin(e.arrivee) ? 'complet' : 'incoherent';
  if (e.arrivee || e.depart) return 'incomplet';
  return 'vide';
}

// Résumé d'un mois : mêmes règles que l'onglet Décompte
export function resumeMois(entries, y, m) {
  const n = daysInMonth(y, m);
  let heures = 0, conges = 0, travailles = 0;
  const anomalies = [];
  for (let d = 1; d <= n; d++) {
    const k = dateKey(y, m, d);
    const e = entries[k];
    const st = etat(e);
    if (st === 'conge') conges++;
    if (st === 'complet') { heures += duree(e); travailles++; }
    if (st === 'incomplet' || st === 'incoherent') anomalies.push(k);
  }
  return { heures, conges, travailles, anomalies, ...joursOuvres(y, m) };
}

export function fmtH(h) {
  // 3.25 -> "3h15"
  const tot = Math.round(h * 60);
  return `${Math.floor(tot / 60)}h${pad(tot % 60)}`;
}
export const fmtDec = (x, dec = 2) =>
  x.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
