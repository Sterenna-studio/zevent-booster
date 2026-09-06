# Compteur de tirages partagé

Worker Cloudflare + base D1, monté sur `nitro.sterenna.fr/zevent-booster/api/*`
— même origine que le site, donc ni CORS ni requête préliminaire.

| | |
|---|---|
| Worker | `zevent-booster-stats` |
| Base D1 | `zevent-booster-stats` (région WEUR) |
| Route | `nitro.sterenna.fr/zevent-booster/api/*` |

## Routes

    POST /api/pulls   { cards: [id…], mode?: "backfill" }  →  204
    GET  /api/stats                                        →  { total, cards }

Un `POST` par booster ouvert (5 cartes maximum), ou un seul en mode `backfill`
pour reprendre une sauvegarde existante (2 000 tirages maximum).

## Ce qui est stocké

Un compteur par carte, et un budget horaire par IP **hachée et salée** pour
l'anti-abus. Pas d'IP en clair, pas d'identifiant de visiteur, pas de cookie.

Le sel vit dans le secret `IP_SALT` du Worker. Le régénérer invalide les
budgets en cours, sans autre conséquence.

## Déploiement

Il n'y a pas de workflow CI : le jeton d'organisation est limité au purge de
cache, et le Worker bouge trop rarement pour justifier un jeton de plus. On
déploie depuis un poste authentifié.

```bash
npx wrangler login          # une fois
cd worker
npx wrangler deploy
```

Appliquer le schéma sur une base neuve :

```bash
npx wrangler d1 execute zevent-booster-stats --remote --file=schema.sql
```

Repartir de zéro :

```bash
npx wrangler d1 execute zevent-booster-stats --remote \
  --command "DELETE FROM card_pulls; DELETE FROM ip_budget;"
```

## Limite assumée

L'endpoint est public, donc gonflable. Le budget horaire (2 500 tirages par IP)
borne les dégâts sans les empêcher. Ces chiffres sont **indicatifs**, et
l'interface doit le dire.
