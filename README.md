# ZEVENT BOOSTERS

Site d'ouverture de boosters adossé à la collection **ZEVENT x LITTLEBIGWHALE** :
on regarde le ZEvent dans le player embarqué, et **un booster de 5 Kards tombe
toutes les 15 minutes**. **10 boosters sont offerts à la première visite**, pour
pouvoir jouer tout de suite.

Le ZEvent, ce sont ~340 chaînes en parallèle : le sélecteur liste celles qui sont
en direct et laisse choisir qui on regarde.

> Fan project non officiel. Les 255 visuels de Kards proviennent de
> [MemoryKard](https://www.memorykard.com/galerie/zevent-x-littlebigwhale) et sont
> utilisés **avec l'autorisation de l'auteur**. L'habillage du site (typo, mise en
> page, animations, icônes) est réécrit. Le logo ZEVENT 26 (`assets/zevent-logo-2026.webp`)
> est la propriété de l'événement ; il habille le paquet et le dos des cartes.

**En ligne :** https://nitro.sterenna.fr/zevent-booster/

## Lancer en local

```bash
npm run dev
```

Puis <http://localhost:8080>. Le protocole `file://` ne marche pas : les modules ES
et le player Twitch exigent du HTTP.

### Console de test (localhost uniquement)

Le ZEvent n'est en direct que quelques jours par an. En local, la console expose :

```js
zb.addBoosters(5);   // crédite 5 boosters
zb.player.play();    // lance la lecture sans viser le bouton
zb.advance(30);      // fait comme si 30 min avaient passé
zb.reset();          // remet la progression à zéro
zb.state;            // état brut
```

## Choisir sa chaîne

Le plateau vient de `https://zevent.fr/api/`, mais **cette API ne renvoie aucun
en-tête CORS** : un appel depuis la page est bloqué. Il est donc servi en statique
(`data/streamers.json`), écrit par [`tools/fetch-streamers.mjs`](tools/fetch-streamers.mjs).

Le sélecteur **ne liste que les chaînes en direct**, les plus regardées d'abord.
Comme ce statut ne peut pas être lu depuis le navigateur, le fichier est une photo
datée : le workflow [`refresh-roster.yml`](.github/workflows/refresh-roster.yml) en
pousse une fraîche **toutes les dix minutes** sur le serveur, sans repasser par un
déploiement complet. La modale affiche l'âge de cette photo — elle peut avoir
jusqu'à une dizaine de minutes de retard.

Hors événement plus personne ne diffuse : le sélecteur bascule alors sur le plateau
complet en le disant, plutôt que d'afficher une liste vide.

## Comment les boosters arrivent

Un cooldown en temps réel, et rien d'autre : **un booster toutes les 15 minutes**.
Il court même site fermé — l'écart accumulé est crédité au retour, calculé à partir
d'horodatages, si bien qu'un onglet mis en veille ne fausse rien.

Le stock est **plafonné à 12 boosters** (trois heures d'absence). Sans plafond,
revenir après trois jours donnerait de quoi compléter la collection d'un coup. Stock
plein, le cooldown est gelé et repart à la première ouverture — comme une jauge
d'énergie. Mettre `maxStock: Infinity` dans [`js/config.js`](js/config.js) pour
retirer la limite.

Une sauvegarde antérieure au-dessus du plafond **garde ses boosters** : on cesse
simplement d'en ajouter tant qu'elle n'est pas redescendue. Le dénominateur
disparaît alors de l'affichage, « 29/12 » ayant tout l'air d'un bug.

Le player Twitch ne conditionne rien : il est là pour regarder, et l'indicateur
« en direct / en pause » de la vue Stream est purement informatif. C'est un choix
assumé — obliger à garder un stream ouvert pour progresser aurait été plus fidèle
au thème, mais plus contraignant qu'utile.

## Composition d'un booster

5 Kards : 3 classiques, 1 rare, et un slot chance (12 % d'épique, sinon rare).
S'y ajoute une chance de surclassement — chaque slot classique a 8 % de monter en
rare, le slot rare 5 % de monter en épique — ce qui rend possible un booster à deux
épiques (≈ 0,6 % des paquets). Une épique est **garantie tous les 15 boosters** sans
épique. À rareté égale, une carte encore absente de la collection est privilégiée
6 fois sur 10 — la complétion avance sans que les doublons disparaissent.

Mesuré sur 20 000 tirages du code réel : 2,76 classiques, 2,07 rares et 0,17 épique
par booster ; 16,3 % des paquets contiennent au moins une épique. Une collection
complète demande **≈ 173 boosters**, soit ~43 h au rythme du cooldown.

Tout se règle dans [`js/config.js`](js/config.js) : intervalle, boosters offerts,
plafond de stock, chaîne par défaut, composition, taux de surclassement.

## Regarder une Kard en grand

Clic droit sur une carte — dans la grille, dans le bandeau d'un booster ouvert, ou
sur celle qu'on vient de retourner — l'affiche plein écran, assez grande pour lire
sa description et sa synergie. Sur une carte encore face cachée le clic droit ne
fait rien : pas question de déflorer la révélation.

Le clic droit n'existant pas au doigt, la carte de la fiche détaillée ouvre le même
zoom au clic gauche.

Les artworks font 620 px de large et le zoom plafonne à 1000 px de haut : on reste
au ras du 1:1 plutôt que d'afficher un agrandissement flou. Pour viser plus grand,
`node tools/fetch-artworks.mjs --width 900 --force` — mais les assets passent alors
de 20 à 49 Mo.

## Les 25 épiques

Ce sont les collaborations d'artistes, numérotées #1 à #25, et elles ont droit à
deux traitements à part.

**À l'obtention** : flash, secousse, rayons tournants, deux ondes de choc, une
gerbe de 28 éclats projetée de derrière la carte, un balayage lumineux sur son
artwork, et un son plus grave et plus long. Les animations de transform sont
décalées de 0,3 s pour ne pas couper le retournement encore en cours.

**Dans leur fiche** : le nom de l'artiste, sa bio et ses liens (site, Instagram,
Twitch, TikTok, YouTube, X, Bluesky). Ces crédits viennent du payload de la
galerie MemoryKard, extraits par
[`tools/fetch-artists.mjs`](tools/fetch-artists.mjs) qui les écrit dans
`data/cards.raw.json` ; `fetch-artworks.mjs` les reprend dans le manifeste.

```bash
npm run artists    # rafraîchit les crédits
npm run artworks   # réécrit data/cards.json
```

## Compléter l’album

Quand la 255ᵉ Kard tombe, l’album se remplit en cascade sous les yeux du joueur et
une seule case reste vide : celle qu’il vient d’obtenir. Un bouton l’invite à la
poser lui-même, elle arrive avec une gerbe d’éclats, puis vient le panneau final
et son bouton de don.

La bascule vers l’album n’a lieu qu’**à la fin du booster en cours**, pas à
l’instant du tirage : les cartes ne sont créditées qu’au moment où on les
retourne, et couper la révélation ferait perdre celles qui restent dans le paquet.

 rejoue la cérémonie en local.

## Progression

Tout est en `localStorage` (clé `zevent-booster.v1`) : horodatage du cooldown,
boosters en attente, cartes possédées et leurs doublons, chaîne choisie. Pas de
compte, pas de serveur, pas de données qui sortent du navigateur.

## Structure

```
index.html            une seule page, trois vues (Stream / Ouverture / Collection)
css/style.css         feuille unique
js/config.js          tous les réglages
js/state.js           sauvegarde locale + bus d'événements
js/twitch.js          player embarqué (affichage seul)
js/cooldown.js        boucle du cooldown des boosters
js/streamers.js       plateau du ZEvent et sélecteur de chaîne
js/packs.js           tirage d'un booster
js/opening.js         scène d'ouverture et de révélation
js/collection.js      grille, filtres, fiche détaillée
js/lightbox.js        zoom plein écran sur une carte
js/tilt.js            inclinaison 3D partagée par la fiche et le zoom
js/app.js             navigation et tableau de bord
data/cards.json       manifeste des 255 Kards
data/streamers.json   plateau du ZEvent (~340 chaînes)
data/cards.raw.json   extraction brute (source du manifeste, non déployée)
assets/cards/         les 255 artworks en webp
tools/                récupération des artworks, des artistes et du plateau
```

## Régénérer les artworks

```bash
npm run artworks              # ignore les fichiers déjà présents
node tools/fetch-artworks.mjs --width 900 --force
```

Le script relit `data/cards.raw.json`, télécharge via le redimensionneur du CDN et
réécrit `data/cards.json`. Attention : les 25 cartes épiques sont servies depuis
`s3.memorykard.maximebaudoin.fr`, les 230 autres depuis `s3.memorykard.com` —
normaliser les hôtes casse les épiques.

## Déploiement

Push sur `main` → GitHub Actions → rsync vers `~/nitro/zevent-booster/` sur le
serveur OVH. Voir [docs/DEPLOY.md](docs/DEPLOY.md).
