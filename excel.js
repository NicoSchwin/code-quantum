// Export mensuel : part du modèle Excel d'origine (chargé par l'utilisateur) et le modifie
// au niveau XML pour conserver styles, formules, commentaires et liaisons.
//  - Décompte : une ligne par jour du mois, formules d'origine (D=C-B, E=D*24,
//    F=somme hebdo, total, « à payer »)
//  - calcul heures : C1 fin de mois, C3=80, C4 jours ouvrés, C5 = nb de congés
//    (formule sur Décompte), C9 = total Décompte ; les mois écoulés depuis le
//    modèle sont insérés en colonne G (historique décalé à droite, comme Excel)
// Le modèle (fichier Excel d'un mois complet) est chargé par l'utilisateur et
// conservé dans la base protégée : il n'est jamais publié avec le code.
import { daysInMonth, joursOuvres } from './holidays.js';
import { dateKey, toMin, duree, etat, resumeMois } from './calc.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août',
  'sept', 'oct', 'nov', 'déc'];
const SHEET_CALC = "'calcul heures'!";
const COL_G = 7;

// ---------- utilitaires de références ----------
export function colNum(s) {
  let n = 0;
  for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}
export function colName(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const parseRef = (ref) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return { c: colNum(m[1]), r: Number(m[2]) };
};
const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

const REF_RE = /(?<![A-Za-z0-9_.$À-ɏ])((?:'(?:[^']|'')+'|\[\d+\][^!'"]*|[A-Za-z_À-ɏ][\w.À-ɏ]*)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(!])/g;

// Applique fn(prefix, absC, c, absR, r) -> [c, r] à chaque référence hors chaînes
export function mapRefs(formula, fn) {
  return formula.split(/("(?:[^"]|"")*")/).map((part, i) => i % 2 ? part :
    part.replace(REF_RE, (all, prefix, ac, col, ar, row) => {
      const [c, r] = fn(prefix || '', ac === '$', colNum(col), ar === '$', Number(row));
      return `${prefix || ''}${ac}${colName(c)}${ar}${r}`;
    })).join('');
}
// Recopie relative (formules partagées)
export const translate = (f, dc, dr) =>
  mapRefs(f, (p, ac, c, ar, r) => [ac ? c : c + dc, ar ? r : r + dr]);
// Insertion de k colonnes en G sur « calcul heures »
export const shiftForInsert = (f, k, sameSheetPrefixes) =>
  mapRefs(f, (p, ac, c, ar, r) => [sameSheetPrefixes.includes(p) && c >= COL_G ? c + k : c, r]);

// ---------- utilitaires DOM ----------
const els = (node, tag) => [...node.getElementsByTagNameNS(NS, tag)];
const el = (doc, tag, attrs = {}, text) => {
  const e = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
function serialize(doc) {
  const s = new XMLSerializer().serializeToString(doc);
  return s.startsWith('<?xml') ? s : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + s;
}
const num = (x) => String(x); // pleine précision, comme Excel

// c : {s, v, f, t, str}
function cell(doc, ref, c) {
  const e = el(doc, 'c', { r: ref, s: c.s });
  if (c.str != null) {
    e.setAttribute('t', 'inlineStr');
    const is = el(doc, 'is'); is.appendChild(el(doc, 't', {}, c.str)); e.appendChild(is);
    return e;
  }
  if (c.t) e.setAttribute('t', c.t);
  if (c.f != null) e.appendChild(el(doc, 'f', {}, c.f));
  if (c.v != null) e.appendChild(el(doc, 'v', {}, typeof c.v === 'number' ? num(c.v) : c.v));
  return e;
}

function expandShared(doc) {
  const cells = els(doc, 'c');
  const masters = {};
  for (const c of cells) {
    const f = els(c, 'f')[0];
    if (f && f.getAttribute('t') === 'shared' && f.textContent)
      masters[f.getAttribute('si')] = { ...parseRef(c.getAttribute('r')), text: f.textContent };
  }
  for (const c of cells) {
    const f = els(c, 'f')[0];
    if (!f || f.getAttribute('t') !== 'shared') continue;
    const m = masters[f.getAttribute('si')];
    const p = parseRef(c.getAttribute('r'));
    f.textContent = translate(m.text, p.c - m.c, p.r - m.r);
    ['t', 'ref', 'si'].forEach((a) => f.removeAttribute(a));
  }
}

function getCell(doc, ref) {
  return els(doc, 'c').find((c) => c.getAttribute('r') === ref);
}
function cachedNumber(doc, ref) {
  const c = getCell(doc, ref);
  const v = c && els(c, 'v')[0];
  return v ? Number(v.textContent) : null;
}
function setCell(doc, ref, { f, v }) {
  const c = getCell(doc, ref);
  els(c, 'f').forEach((x) => x.remove());
  els(c, 'v').forEach((x) => x.remove());
  c.removeAttribute('t');
  if (f != null) c.appendChild(el(doc, 'f', {}, f));
  if (v != null) c.appendChild(el(doc, 'v', {}, num(v)));
}

// ---------- onglet Décompte ----------
function buildDecompte(doc, y, m, entries, c12) {
  const n = daysInMonth(y, m);
  const sheetData = els(doc, 'sheetData')[0];
  const rows = els(sheetData, 'row');
  const filler = rows.filter((r) => Number(r.getAttribute('r')) >= 37);
  rows.filter((r) => Number(r.getAttribute('r')) >= 4).forEach((r) => r.remove());

  const merges = ['B2:F2'];
  const newRow = (r) => { const e = el(doc, 'row', { r }); sheetData.appendChild(e); return e; };

  // Groupes hebdomadaires (lundi-dimanche, bornés au mois) pour la colonne F
  const groups = [];
  for (let d = 1; d <= n; d++) {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (d === 1 || wd === 1) groups.push([]);
    groups[groups.length - 1].push(d);
  }
  const anchors = new Map(); // jour -> [début, fin] (lignes)
  let total = 0;
  for (const g of groups) {
    const ouvr = g.filter((d) => { const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return wd !== 0 && wd !== 6; });
    const anchor = ouvr.length ? ouvr[Math.floor(ouvr.length / 2)] : g[0];
    const h = g.reduce((s, d) => s + (duree(entries[dateKey(y, m, d)]) || 0), 0);
    anchors.set(anchor, { from: g[0] + 3, to: g[g.length - 1] + 3, h });
    total += h;
  }

  for (let d = 1; d <= n; d++) {
    const r = d + 3;
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const we = wd === 0 || wd === 6;
    const e = entries[dateKey(y, m, d)];
    const st = etat(e);
    const row = newRow(r);
    row.appendChild(cell(doc, `A${r}`, { s: we ? 33 : 16, v: serial(y, m, d) }));
    if (st === 'conge') {
      row.appendChild(cell(doc, `B${r}`, { s: 67, t: 's', v: '44' })); // « Congé »
      row.appendChild(cell(doc, `C${r}`, { s: 68 }));
      row.appendChild(cell(doc, `D${r}`, { s: 56 }));
      merges.push(`B${r}:C${r}`);
    } else {
      const a = toMin(e?.arrivee), dp = toMin(e?.depart);
      row.appendChild(cell(doc, `B${r}`, { s: we && a == null ? 33 : 59, v: a == null ? null : a / 1440 }));
      row.appendChild(cell(doc, `C${r}`, { s: we && dp == null ? 19 : 60, v: dp == null ? null : dp / 1440 }));
      if (st === 'complet') row.appendChild(cell(doc, `D${r}`, { s: 56, f: `C${r}-B${r}`, v: (dp - a) / 1440 }));
      else row.appendChild(cell(doc, `D${r}`, { s: we ? 19 : 56 }));
    }
    row.appendChild(cell(doc, `E${r}`, { s: 48, f: `D${r}*24`, v: duree(e) || 0 }));
    const an = anchors.get(d);
    row.appendChild(cell(doc, `F${r}`, an ? { s: 48, f: `SUM(E${an.from}:E${an.to})`, v: an.h } : { s: 48 }));
    if (e?.note) row.appendChild(cell(doc, `G${r}`, { s: 53, str: e.note }));
  }

  const rBlank = n + 4, rTot = n + 5, rPay = n + 6;
  let row = newRow(rBlank);
  [['A', 3], ['B', 19], ['C', 25], ['D', 26]].forEach(([c, s]) => row.appendChild(cell(doc, `${c}${rBlank}`, { s })));
  row.appendChild(cell(doc, `E${rBlank}`, { s: 48, f: `D${rBlank}*24`, v: 0 }));
  row.appendChild(cell(doc, `F${rBlank}`, { s: 48 }));

  row = newRow(rTot);
  row.appendChild(cell(doc, `A${rTot}`, { s: 3 }));
  row.appendChild(cell(doc, `B${rTot}`, { s: 19 }));
  row.appendChild(cell(doc, `C${rTot}`, { s: 25, str: `Total ${MOIS[m - 1]}` }));
  row.appendChild(cell(doc, `D${rTot}`, { s: 26 }));
  row.appendChild(cell(doc, `E${rTot}`, { s: 49 }));
  row.appendChild(cell(doc, `F${rTot}`, { s: 49, f: `SUM(F2:F${rBlank})`, v: total }));
  row.appendChild(cell(doc, `G${rTot}`, { s: 62 }));

  row = newRow(rPay);
  [['A', 3], ['B', 19], ['C', 25]].forEach(([c, s]) => row.appendChild(cell(doc, `${c}${rPay}`, { s })));
  row.appendChild(cell(doc, `D${rPay}`, { s: 26, t: 's', v: '18' })); // « à payer »
  row.appendChild(cell(doc, `E${rPay}`, { s: 26 }));
  row.appendChild(cell(doc, `F${rPay}`, { s: 24, f: `${SHEET_CALC}C12`, v: c12 }));
  row.appendChild(cell(doc, `G${rPay}`, { s: 63 }));

  // Lignes de mise en forme vides du modèle, décalées
  const off = n - 30;
  for (const fr of filler) {
    const nr = Number(fr.getAttribute('r')) + off;
    fr.setAttribute('r', nr);
    fr.removeAttribute('spans');
    els(fr, 'c').forEach((c) => { const p = parseRef(c.getAttribute('r')); c.setAttribute('r', colName(p.c) + nr); });
    sheetData.appendChild(fr);
  }
  els(doc, 'row').forEach((r) => r.removeAttribute('spans'));

  const mc = els(doc, 'mergeCells')[0];
  while (mc.firstChild) mc.removeChild(mc.firstChild);
  merges.forEach((ref) => mc.appendChild(el(doc, 'mergeCell', { ref })));
  mc.setAttribute('count', merges.length);
  els(doc, 'dimension')[0].setAttribute('ref', `A1:H${110 + off}`);
  return { total, n, rTot, rPay };
}

// ---------- onglet calcul heures ----------
function monthValues({ ouvres, conges, heures, tarif }) {
  const c6 = ouvres ? conges / ouvres : 0;
  const c7 = (1 - c6) * 80;
  const c10 = heures - c7;
  return { 3: 80, 4: ouvres, 5: conges, 6: c6, 7: c7, 9: heures, 10: c10, 11: tarif, 12: tarif * c10 };
}

function buildCalcul(doc, y, m, decompte, cur, history) {
  expandShared(doc);
  const k = history.length;
  // Styles de la colonne G du modèle, réutilisés pour les colonnes insérées
  const gStyle = {};
  for (const r of [1, 3, 4, 5, 6, 7, 9, 10, 11, 12]) gStyle[r] = getCell(doc, `G${r}`)?.getAttribute('s');

  if (k > 0) {
    for (const c of els(doc, 'c')) {
      const p = parseRef(c.getAttribute('r'));
      if (p.c >= COL_G) c.setAttribute('r', colName(p.c + k) + p.r);
    }
    for (const f of els(doc, 'f')) f.textContent = shiftForInsert(f.textContent, k, ['', SHEET_CALC]);
    for (const col of els(doc, 'col')) {
      const min = Number(col.getAttribute('min')), max = Number(col.getAttribute('max'));
      if (min >= COL_G) { col.setAttribute('min', min + k); col.setAttribute('max', max + k); }
      else if (max >= COL_G) col.setAttribute('max', max + k);
    }
    // Colonnes insérées : mois précédent en G, puis les plus anciens
    history.forEach((h, i) => {
      const col = colName(COL_G + i);
      const vals = { 1: serial(h.y, h.m, daysInMonth(h.y, h.m)), ...monthValues(h) };
      for (const r of [1, 3, 4, 5, 6, 7, 9, 10, 11, 12]) {
        let row = els(doc, 'row').find((x) => Number(x.getAttribute('r')) === r);
        const c = cell(doc, `${col}${r}`, { s: gStyle[r], v: vals[r] });
        const next = els(row, 'c').find((x) => parseRef(x.getAttribute('r')).c > COL_G + i);
        next ? row.insertBefore(c, next) : row.appendChild(c);
      }
    });
  }
  els(doc, 'row').forEach((r) => r.removeAttribute('spans'));
  const dim = els(doc, 'dimension')[0];
  const [a, b] = dim.getAttribute('ref').split(':');
  const pb = parseRef(b);
  dim.setAttribute('ref', `${a}:${colName(pb.c + k)}${pb.r}`);

  // Colonne C : mois exporté
  const v = monthValues(cur);
  setCell(doc, 'C1', { v: serial(y, m, decompte.n) });
  setCell(doc, 'C4', { v: v[4] });
  setCell(doc, 'C5', { f: `COUNTIF(Décompte!B4:B${decompte.n + 3},"Congé")`, v: v[5] });
  setCell(doc, 'C9', { f: `Décompte!F${decompte.rTot}`, v: v[9] });
  for (const r of [6, 7, 10, 11, 12]) {
    const c = getCell(doc, `C${r}`);
    els(c, 'v').forEach((x) => x.remove());
    c.appendChild(el(doc, 'v', {}, num(v[r])));
  }
  return k;
}

function shiftComments(files, k) {
  if (!k) return;
  files.comments = files.comments.replace(/ref="([A-Z]+)(\d+)"/g, (all, c, r) => {
    const n = colNum(c);
    return `ref="${n >= COL_G ? colName(n + k) : c}${r}"`;
  });
  files.vml = files.vml
    .replace(/<x:Column>(\d+)<\/x:Column>/g, (a, c) => `<x:Column>${Number(c) >= COL_G - 1 ? Number(c) + k : c}</x:Column>`)
    .replace(/<x:Anchor>([^<]*)<\/x:Anchor>/g, (a, t) => {
      const p = t.split(',').map((s) => Number(s.trim()));
      if (p[0] >= COL_G - 1) { p[0] += k; p[4] += k; }
      return `<x:Anchor>\n    ${p.join(', ')}</x:Anchor>`;
    });
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Lit et valide un fichier modèle ; renvoie { b64, nom, y, m } (mois de C1)
export async function lireModele(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zip = await window.JSZip.loadAsync(bytes);
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  if (!wb || !wb.includes('name="Décompte"') || !wb.includes('name="calcul heures"'))
    throw new Error('onglets « Décompte » et « calcul heures » introuvables');
  if (!/sheet1\.xml/.test(await zip.file('xl/_rels/workbook.xml.rels').async('string')))
    throw new Error('structure inattendue');
  const s2 = new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet2.xml').async('string'), 'application/xml');
  const c1 = cachedNumber(s2, 'C1');
  if (!c1) throw new Error('date du mois absente en C1 de « calcul heures »');
  const d = new Date(Date.UTC(1899, 11, 30) + c1 * 86400000);
  return { b64: bytesToB64(bytes), nom: file.name, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

// entries : { 'YYYY-MM-DD': {arrivee, depart, conge, note} }
// modele : { b64, y, m } (voir lireModele)
export async function buildMonthlyXlsx(y, m, entries, modele) {
  const TEMPLATE_MOIS = { y: modele.y, m: modele.m };
  const zip = await window.JSZip.loadAsync(b64ToBytes(modele.b64));
  const parse = async (p) => new DOMParser().parseFromString(await zip.file(p).async('string'), 'application/xml');
  const s1 = await parse('xl/worksheets/sheet1.xml');
  const s2 = await parse('xl/worksheets/sheet2.xml');

  // Valeurs du mois de référence contenu dans le modèle (colonne C)
  const tarif = cachedNumber(s2, 'C11');
  const base = { ...TEMPLATE_MOIS, ouvres: cachedNumber(s2, 'C4'), conges: cachedNumber(s2, 'C5'),
    heures: cachedNumber(s2, 'C9'), tarif };

  const res = resumeMois(entries, y, m);
  const cur = { ouvres: res.ouvres, conges: res.conges, heures: res.heures, tarif };

  // Mois écoulés entre le modèle et le mois exporté (le plus récent en premier)
  const history = [];
  const idx = (yy, mm) => yy * 12 + mm - 1;
  for (let i = idx(y, m) - 1; i >= idx(base.y, base.m); i--) {
    const yy = Math.floor(i / 12), mm = (i % 12) + 1;
    if (yy === base.y && mm === base.m) history.push(base);
    else {
      const r = resumeMois(entries, yy, mm);
      history.push({ y: yy, m: mm, ouvres: r.ouvres, conges: r.conges, heures: r.heures, tarif });
    }
  }

  const c12 = monthValues(cur)[12];
  const dec = buildDecompte(s1, y, m, entries, c12);
  const k = buildCalcul(s2, y, m, dec, cur, history);

  zip.file('xl/worksheets/sheet1.xml', serialize(s1));
  zip.file('xl/worksheets/sheet2.xml', serialize(s2));

  const files = { comments: await zip.file('xl/comments1.xml').async('string'),
    vml: await zip.file('xl/drawings/vmlDrawing1.vml').async('string') };
  shiftComments(files, k);
  zip.file('xl/comments1.xml', files.comments);
  zip.file('xl/drawings/vmlDrawing1.vml', files.vml);

  // Classeur : zone d'impression, recalcul complet à l'ouverture, plus de calcChain
  let wb = await zip.file('xl/workbook.xml').async('string');
  wb = wb.replace(/Décompte!\$A\$1:\$F\$\d+/, `Décompte!$A$1:$F$${dec.rPay}`)
    .replace(/<calcPr([^/]*)\/>/, (a, attrs) => `<calcPr${attrs.replace(/\s*fullCalcOnLoad="\d"/, '')} fullCalcOnLoad="1"/>`);
  zip.file('xl/workbook.xml', wb);
  zip.remove('xl/calcChain.xml');
  let rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, ''));
  let ct = await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml', ct.replace(/<Override [^>]*calcChain[^>]*\/>/, ''));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const yy = String(y).slice(2);
  const filename = `${yy}${String(m).padStart(2, '0')}${dec.n} Suivi heures ${MOIS_COURT[m - 1]}-${yy}.xlsx`;
  return { blob, filename, resume: res, inseres: k };
}
