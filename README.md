# Code Quantum

Petite application web (PWA) pour noter chaque jour l'arrivée et le départ de l'employée à domicile,
consulter l'historique et produire l'Excel mensuel au format habituel.
Coût : 0 € (GitHub Pages + Firebase offre gratuite « Spark », sans carte bancaire).

## Ce que fait l'application

- **Saisie** (écran conforme à la maquette) : date du jour par défaut, molettes pour
  la date et l'heure, interrupteur Arrivée / Départ (défaut Départ, 19h30),
  interrupteur Congé, note facultative (reprise en colonne G de l'Excel)
- Toute nouvelle saisie **écrase** la précédente pour ce jour et ce champ. Le message
  de confirmation indique l'ancienne valeur remplacée
- Saisie possible sur n'importe quelle date passée (oubli, correction)
- **Historique** par mois : total d'heures, jours ouvrés, congés, détail par jour
  et sous-total par semaine, jours incomplets signalés. Toucher un jour ouvre sa saisie
  ; l'icône corbeille efface la saisie d'un jour (après confirmation)
- **Export Excel** du mois à partir de votre propre fichier modèle :
  - onglet « Décompte » : une ligne par jour du mois (28 à 31), formules d'origine
    (`D=C-B`, `E=D*24`, somme par semaine, total, « à payer »)
  - onglet « calcul heures » : C3 = 80, C4 = jours ouvrés du mois (lundi-vendredi
    hors fériés), C5 = `NB.SI` des « Congé » de l'onglet Décompte, C9 = total du mois.
    Les mois écoulés depuis le modèle sont insérés en colonne G (historique décalé
    vers la droite, formules ajustées comme le ferait Excel)
- Fonctionne hors connexion : les saisies partent dès que le réseau revient
- Sauvegarde / restauration JSON en un clic (filet de sécurité)

Le calcul de paie (cotisations, congés payés, Pajemploi) reste hors de l'application.

### Règles de calcul à connaître

- **Jours ouvrés** : lundi-vendredi moins les jours fériés. Le **lundi de Pentecôte
  est compté travaillé**, comme dans votre historique (mai 2026 = 18, mai 2023 = 20)
- **Somme par semaine** (colonne F) : lundi au dimanche, bornée au mois, placée sur
  le jour du milieu de la semaine. Le total du mois est identique à la somme des jours
- Un jour avec seulement l'arrivée ou seulement le départ n'est pas compté ;
  l'export prévient avant de générer le fichier
- Les minutes avancent de 5 en 5. Les journées passant minuit ne sont pas gérées

## Installation (une seule fois, environ 20 minutes)

### 1. Firebase (base de données partagée, gratuite)

1. Aller sur <https://console.firebase.google.com> avec votre compte Google,
   **Créer un projet** (nom : `code-quantum`), désactiver Google Analytics
2. Menu **Build > Authentication** > Commencer > onglet *Sign-in method* >
   **Adresse e-mail/Mot de passe** > Activer (pas le « lien par e-mail ») > Enregistrer.
   Puis onglet *Users* > **Ajouter un utilisateur** pour chacun des deux comptes
   (e-mail + mot de passe). La connexion Google n'est pas utilisée : sur iPhone,
   elle échoue (redirection bloquée entre domaines)
3. Menu **Build > Firestore Database** > Créer une base de données >
   emplacement `europe-west9 (Paris)` > **mode production**
4. Onglet **Règles** de Firestore : coller le contenu du fichier `firestore.rules`,
   remplacer `ADRESSE1@gmail.com` et `ADRESSE2@gmail.com` par les deux adresses
   des comptes créés à l'étape 2 (en minuscules), puis **Publier**. Seuls ces deux comptes pourront lire ou écrire
5. Roue dentée > **Paramètres du projet** > *Vos applications* > icône **`</>`** (Web),
   nom `code-quantum`, ne pas cocher Hosting. Copier le bloc `firebaseConfig`
   affiché et le coller dans `config.js` (remplacer les lignes en commentaire)

### 2. GitHub Pages (hébergement gratuit)

1. Créer un compte sur <https://github.com> si besoin
2. **New repository** : nom `code-quantum`, visibilité **Public** (obligatoire pour
   Pages gratuit ; aucune donnée personnelle n'est dans le code, voir plus bas)
3. Envoyer les fichiers de ce dossier : soit *uploading an existing file* (glisser
   tout le dossier sauf `modele/`), soit en ligne de commande :

   ```bash
   git remote add origin https://github.com/VOTRE-COMPTE/code-quantum.git
   ```

   ```bash
   git push -u origin main
   ```

4. Dans le dépôt : **Settings > Pages** > *Deploy from a branch* > `main` / `(root)`
   > Save. L'adresse apparaît après 1 minute : `https://VOTRE-COMPTE.github.io/code-quantum/`
5. Retour dans Firebase : **Authentication > Settings > Authorized domains** >
   ajouter `VOTRE-COMPTE.github.io`

### 3. Sur chaque téléphone

1. Ouvrir l'adresse GitHub Pages, se connecter avec son e-mail et son mot de passe
2. Ajouter à l'écran d'accueil (Safari : Partager > *Sur l'écran d'accueil* ;
   Chrome : menu > *Ajouter à l'écran d'accueil*)
3. Une seule fois, sur un des deux téléphones ou sur l'ordinateur :
   **Consulter Historique > Charger le modèle Excel** et choisir
   `modele/260929 Suivi heures sept-26.xlsx` (version anonymisée : titre et libellés
   neutres, anciennes liaisons externes remplacées par leurs valeurs). Le modèle
   est stocké dans la base protégée, partagé entre vous deux

## Utilisation mensuelle

1. Fin de mois : **Consulter Historique**, vérifier qu'aucun jour n'est « à compléter »
2. **Exporter l'Excel du mois** : le fichier `AAMMJJ Suivi heures mmm-aa.xlsx`
   est créé sur l'appareil. Sur téléphone, la feuille de partage s'ouvre
   (Enregistrer dans Fichiers, Mail, AirDrop) ; sur ordinateur, il arrive dans
   le dossier Téléchargements
3. Si vous modifiez le fichier à la main (nouveau tarif horaire en J28, commentaire,
   rattrapage), rechargez-le comme **nouveau modèle** : les exports suivants
   repartiront de cette version

## Confidentialité

- Le code publié sur GitHub ne contient **aucune donnée** : ni heures, ni salaires,
  ni adresses e-mail. La configuration Firebase visible dans `config.js` est publique
  par conception ; la protection vient des règles Firestore (2 comptes autorisés)
- Le modèle Excel (historique des salaires) est stocké uniquement dans Firestore
- Le dossier `modele/` est exclu de Git (`.gitignore`)

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | Écrans saisie / historique |
| `store.js` | Stockage : Firestore si configuré, sinon ce navigateur seulement |
| `excel.js` | Génération de l'Excel à partir du modèle (manipulation XML) |
| `holidays.js`, `calc.js` | Jours fériés, jours ouvrés, durées |
| `config.js` | Configuration Firebase et heures par défaut des molettes |
| `firestore.rules` | Règles de sécurité à coller dans la console Firebase |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installation sur téléphone, hors-ligne |
| `scripts/dev_server.py` | Serveur local de test (`python scripts/dev_server.py`) |

Sans configuration Firebase, l'application tourne en mode « Ce téléphone uniquement »
(données dans le navigateur), pratique pour tester.
