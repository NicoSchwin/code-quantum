// Jours fériés français et jours ouvrés (lundi-vendredi hors fériés).
// Règle calée sur l'historique du fichier Excel : le lundi de Pentecôte est
// compté comme travaillé (journée de solidarité), ex. mai 2026 = 18 jours.

function easter(y) {
  // Algorithme de Meeus/Jones/Butcher (calendrier grégorien)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

export function feries(y, { pentecote = false } = {}) {
  const e = easter(y);
  const list = [
    [`${y}-01-01`, "Jour de l'an"],
    [iso(addDays(e, 1)), 'Lundi de Pâques'],
    [`${y}-05-01`, 'Fête du travail'],
    [`${y}-05-08`, 'Victoire 1945'],
    [iso(addDays(e, 39)), 'Ascension'],
    [`${y}-07-14`, 'Fête nationale'],
    [`${y}-08-15`, 'Assomption'],
    [`${y}-11-01`, 'Toussaint'],
    [`${y}-11-11`, 'Armistice'],
    [`${y}-12-25`, 'Noël'],
  ];
  if (pentecote) list.push([iso(addDays(e, 50)), 'Lundi de Pentecôte']);
  return new Map(list);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// m : 1-12. Renvoie { ouvres, feriesOuvres: [[date, nom], ...] }
export function joursOuvres(y, m) {
  const f = feries(y);
  let ouvres = 0;
  const feriesOuvres = [];
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    const wd = date.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const k = iso(date);
    if (f.has(k)) feriesOuvres.push([k, f.get(k)]);
    else ouvres++;
  }
  return { ouvres, feriesOuvres };
}
