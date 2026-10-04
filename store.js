// Stockage des saisies : Firebase Firestore (partagé) si configuré, sinon
// localStorage (ce navigateur seulement). Une entrée par jour, clé AAAA-MM-JJ :
// { arrivee: 'HH:MM'|null, depart: 'HH:MM'|null, conge: bool, note: string,
//   majPar: email, majLe: date }
import { firebaseConfig } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const LS_KEY = 'codequantum.entries.v1';
const LS_MODELE = 'codequantum.modele.v1';

const listeners = new Set();
let entries = {};
let impl = null;

export const store = {
  mode: 'local',
  user: null,
  status: 'init', // init | connecte | hors-ligne | deconnecte | refuse
  get entries() { return entries; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  async save(key, patch) { return impl.save(key, patch); },
  async replaceAll(data) { return impl.replaceAll(data); },
  async getModele() { return impl.getModele(); },
  async setModele(m) { return impl.setModele(m); },
  async signIn() { return impl.signIn?.(); },
  async signOut() { return impl.signOut?.(); },
};
const emit = () => listeners.forEach((fn) => fn(store));

// ---------- mode local ----------
function localImpl() {
  try { entries = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { entries = {}; }
  const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(entries)); } catch { /* quota/privé */ } };
  store.status = 'connecte';
  return {
    async save(key, patch) {
      entries = { ...entries, [key]: { ...(entries[key] || {}), ...patch, majLe: new Date().toISOString() } };
      persist(); emit();
    },
    async replaceAll(data) { entries = { ...entries, ...data }; persist(); emit(); },
    async getModele() { try { return JSON.parse(localStorage.getItem(LS_MODELE)); } catch { return null; } },
    async setModele(m) { localStorage.setItem(LS_MODELE, JSON.stringify(m)); },
  };
}

// ---------- mode Firebase ----------
async function firebaseImpl() {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const col = fs.collection(db, 'entrees');
  let unsub = null;

  auth.onAuthStateChanged(a, (u) => {
    store.user = u ? { email: u.email, nom: u.displayName } : null;
    if (unsub) { unsub(); unsub = null; }
    if (!u) { entries = {}; store.status = 'deconnecte'; emit(); return; }
    unsub = fs.onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      entries = next;
      store.status = snap.metadata.fromCache ? 'hors-ligne' : 'connecte';
      emit();
    }, (err) => {
      store.status = err.code === 'permission-denied' ? 'refuse' : 'hors-ligne';
      emit();
    });
  });

  // Retour d'une connexion par redirection (Safari iOS)
  auth.getRedirectResult(a).catch(() => {});

  return {
    async signIn() {
      const p = new auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { await auth.signInWithPopup(a, p); }
      catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment',
          'auth/cancelled-popup-request'].includes(e.code)) await auth.signInWithRedirect(a, p);
        else throw e;
      }
    },
    async signOut() { await auth.signOut(a); },
    async save(key, patch) {
      // Écriture locale immédiate (cache hors-ligne), synchronisée dès que possible
      fs.setDoc(fs.doc(col, key), { ...patch, majPar: store.user?.email || '', majLe: fs.serverTimestamp() },
        { merge: true }).catch((e) => console.error(e));
    },
    // Modèle Excel : stocké dans la base (protégée par les règles), jamais publié
    async getModele() {
      const d = await fs.getDoc(fs.doc(db, 'parametres', 'modele'));
      return d.exists() ? d.data() : null;
    },
    async setModele(m) { await fs.setDoc(fs.doc(db, 'parametres', 'modele'), m); },
    async replaceAll(data) {
      const batch = fs.writeBatch(db);
      for (const [k, v] of Object.entries(data)) {
        const { majLe, ...rest } = v;
        batch.set(fs.doc(col, k), rest, { merge: true });
      }
      await batch.commit();
    },
  };
}

export async function initStore() {
  const configured = Object.keys(firebaseConfig).length > 0;
  if (configured) {
    store.mode = 'firebase';
    try { impl = await firebaseImpl(); }
    catch (e) {
      console.error(e);
      store.mode = 'local'; impl = localImpl();
      store.erreur = "Firebase injoignable : saisies enregistrées sur ce téléphone uniquement";
    }
  } else impl = localImpl();
  emit();
}
