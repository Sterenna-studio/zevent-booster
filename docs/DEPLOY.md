# Déploiement — OVH / nitro

Même chaîne que `chronicles-tcg`, `bzh-universe` et `nitro-clicker` : push sur
`main` → GitHub Actions → `rsync` en SSH vers le serveur OVH.

| | |
|---|---|
| Workflow | [`.github/workflows/deploy-ovh.yml`](../.github/workflows/deploy-ovh.yml) |
| Déclencheurs | push sur `main`, ou `workflow_dispatch` manuel |
| Cible distante | `~/nitro/zevent-booster/` |
| URL publique | https://nitro.sterenna.fr/zevent-booster/ |
| Secrets | `OVH_SSH_KEY`, `OVH_HOST`, `OVH_USER` (au niveau de l'organisation) |

## Ce que fait le workflow

1. **Vérifie les entrées statiques** — `index.html`, `css/style.css`, `js/app.js`,
   `data/cards.json`, les 255 cartes du manifeste et la présence de chaque artwork
   sur le disque. Un artwork manquant fait échouer le déploiement avant l'envoi.
2. **Estampille les imports** (`tools/bump-cache.mjs`) avec `?v=<run_number>`, pour
   que les navigateurs rechargent les modules modifiés. Seule la copie envoyée est
   estampillée, rien n'est recommité.
3. **rsync `--delete`** vers `~/nitro/zevent-booster/`, en excluant `.git/`,
   `.github/`, `docs/`, `tools/`, `README.md`, `package.json` et
   `data/cards.raw.json`.

Le site n'a aucune étape de build : ce qui est dans le repo est ce qui est servi.

## À faire de ton côté

Je n'ai pas les droits `admin:org` sur **Sterenna-studio**, donc deux points me
sont inaccessibles :

### 1. Donner au repo l'accès aux secrets d'organisation

**C'est le blocage actuel**, confirmé par le premier run : `OVH_SSH_KEY` et
`OVH_HOST` arrivent vides dans le job, qui s'arrête à l'étape *Setup SSH key*
(`ssh-keyscan -H ""`). Les trois secrets sont définis **au niveau de
l'organisation** avec une politique « Selected repositories », et `zevent-booster`
n'y est pas encore.

> GitHub → organisation **Sterenna-studio** → Settings → Secrets and variables →
> Actions → pour chacun de `OVH_SSH_KEY`, `OVH_HOST`, `OVH_USER` :
> **Repository access** → ajouter `zevent-booster`.

Puis relancer :

```bash
gh run rerun --failed --repo Sterenna-studio/zevent-booster
```

Le run doit alors passer *Setup SSH key* et *Ensure remote target directory exists*
sans erreur.

> Ni moi ni le token `gh` local ne pouvons le faire : lister ou modifier les secrets
> d'organisation demande le scope `admin:org`, que le token n'a pas. Les créer au
> niveau du repo n'est pas une option non plus — il faudrait manipuler la clé SSH
> privée en clair, ce que je ne fais pas.

### 2. Servir le dossier (seulement si `~/nitro/` n'est pas déjà un catch-all)

Les projets existants sont servis sous `https://nitro.sterenna.fr/<dossier>/`. Si le
vhost pointe simplement sur `~/nitro` en racine, `zevent-booster/` apparaît tout seul
après le premier déploiement — rien à faire. Sinon, ajouter l'alias comme pour
`TCG/` et `clicker/`.

## Points d'attention propres à ce site

- **Poids** — `assets/cards/` fait ~20 Mo (255 webp). C'est le gros du transfert au
  premier rsync ; les suivants sont incrémentaux.
- **Player Twitch** — l'embed exige que le paramètre `parent` corresponde au domaine
  qui l'héberge. Le code le déduit de `location.hostname`, donc `nitro.sterenna.fr`
  fonctionne sans réglage. En revanche, si le site est un jour servi derrière un
  autre domaine ou dans une iframe, il faudra le vérifier.
- **HTTPS obligatoire** — le player Twitch refuse de se charger en HTTP simple.
- **Sous-dossier** — tous les chemins du site sont relatifs, servir sous
  `/zevent-booster/` ne pose pas de problème.

## Déployer à la main

```bash
gh workflow run deploy-ovh.yml --repo Sterenna-studio/zevent-booster
```
