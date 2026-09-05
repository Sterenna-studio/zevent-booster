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

## Le repo doit rester public

**Sterenna-studio est sur le plan GitHub Free**, et sur ce plan les secrets
d'organisation ne sont utilisables que par les repos **publics**. Dans un repo
privé, `OVH_SSH_KEY` et `OVH_HOST` arrivent vides et le job s'arrête à *Setup SSH
key* sur un `ssh-keyscan -H ""` — sans message explicite, ce qui ressemble à un
workflow cassé.

Le piège : l'API `GET /repos/{owner}/{repo}/actions/organization-secrets` liste
quand même les trois secrets comme visibles depuis un repo privé. Cette liste
reflète la politique d'accès, pas la restriction de plan. Ne pas s'y fier.

Si le repo doit un jour repasser en privé, il faudra créer les trois secrets **au
niveau du repo** (Settings → Secrets and variables → Actions), ce qui suppose de
recoller la clé SSH privée à la main.

## Servir le dossier

Les projets existants sont servis sous `https://nitro.sterenna.fr/<dossier>/`, et
`zevent-booster/` est apparu tout seul après le premier rsync : le vhost pointe
bien sur `~/nitro` en racine, il n'y a pas d'alias à ajouter.

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
