// Configuration de l'application.
// Tant que firebaseConfig est vide, l'application fonctionne en mode LOCAL
// (données dans ce navigateur seulement). Avec la configuration du projet
// Firebase (voir README.md, étape 1), les saisies sont partagées entre les
// deux téléphones. Ces valeurs sont publiques par conception : la sécurité
// repose sur les règles Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyDUmiXvTOt4vteoK71r4DL79rB637nGMZ4",
  authDomain: "code-quantum-b829c.firebaseapp.com",
  projectId: "code-quantum-b829c",
  storageBucket: "code-quantum-b829c.firebasestorage.app",
  messagingSenderId: "750087705987",
  appId: "1:750087705987:web:caa82fe5b436d88f7412b6",
};

// Les deux comptes Google autorisés sont déclarés dans les règles Firestore
// (console Firebase), pas ici : ce fichier est public.

// Valeurs par défaut des molettes
export const heureDefaut = { depart: '19:30', arrivee: '16:15' };
