# ZEVENT BOOSTERS

Site d'ouverture de boosters adossé à la collection **ZEVENT x LITTLEBIGWHALE** :
on regarde le ZEvent dans le player embarqué, et **toutes les 10 minutes de
visionnage** on gagne un booster de 5 Kards à ouvrir.

> Fan project non officiel. Les 255 visuels de Kards proviennent de
> [MemoryKard](https://www.memorykard.com/galerie/zevent-x-littlebigwhale) et sont
> utilisés **avec l'autorisation de l'auteur**. L'habillage du site (typo, mise en
> page, animations, icônes) est réécrit, aucun asset d'interface n'est repris.

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
zb.addMinutes(30);   // avance le compteur de visionnage de 30 min
zb.reset();          // remet la progression à zéro
zb.state;            // état brut
```

## Comment le temps est compté

Le compteur n'avance que si les trois conditions sont réunies :

1. le player Twitch rapporte qu'il joue (événements `PLAY` / `PAUSE` / `ENDED`) ;
2. l'onglet est au premier plan (Page Visibility) ;
3. l'utilisateur n'est pas marqué AFK.

Le delta est mesuré sur l'horloge réelle et **plafonné à 2 s par tick**, pour qu'un
onglet mis en veille par le navigateur ne crédite pas un gros bloc d'un coup. Toutes
les 25 minutes comptées sans la moindre interaction, une confirmation « toujours
là ? » met le compteur en pause jusqu'au prochain clic.

L'API Twitch n'expose pas les heures de visionnage d'un viewer : ce comptage
côté site est le seul moyen honnête d'y arriver.

## Composition d'un booster

5 Kards : 3 classiques, 1 rare, et un slot chance (12 % d'épique, sinon rare).
Une épique est **garantie tous les 15 boosters** sans épique. À rareté égale, une
carte encore absente de la collection est privilégiée 6 fois sur 10 — la complétion
avance sans que les doublons disparaissent.

Tout se règle dans [`js/config.js`](js/config.js) : durée par booster, chaîne suivie,
composition, seuils AFK.

## Progression

Tout est en `localStorage` (clé `zevent-booster.v1`) : temps regardé, boosters en
attente, cartes possédées et leurs doublons. Pas de compte, pas de serveur, pas de
données qui sortent du navigateur.

## Structure

```
index.html            une seule page, trois vues (Stream / Ouverture / Collection)
css/style.css         feuille unique
js/config.js          tous les réglages
js/state.js           sauvegarde locale + bus d'événements
js/twitch.js          player embarqué + compteur de visionnage
js/packs.js           tirage d'un booster
js/opening.js         scène d'ouverture et de révélation
js/collection.js      grille, filtres, fiche détaillée
js/app.js             navigation et tableau de bord
data/cards.json       manifeste des 255 Kards
data/cards.raw.json   extraction brute (source du manifeste, non déployée)
assets/cards/         les 255 artworks en webp
tools/                récupération des artworks, cache-busting de déploiement
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
