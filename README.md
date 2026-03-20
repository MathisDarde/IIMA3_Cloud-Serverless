# Rendu Cloud & Serverless

**Emilie XU, Mila PAOUNOV, Mathis DARDÉ**

---

## Présentation

Plateforme collaborative serverless déployée sur AWS, permettant à des utilisateurs de gérer des équipes, projets, tâches et fichiers. Un portail d'administration donne accès aux statistiques globales, à la gestion des utilisateurs et aux sauvegardes automatiques de la base de données.

---

## Architecture

```
                        ┌─────────────────────────────────────┐
                        │              AWS Cloud               │
                        │                                      │
  Utilisateur  ──────▶  │  CloudFront ──▶ S3 (frontend)       │
  Administrateur        │                                      │
                        │  API Gateway ──▶ Lambda (Hono.js)   │
                        │                      │               │
                        │                  PostgreSQL (RDS)   │
                        │                  Cognito (auth)     │
                        │                  S3 (assets)        │
                        │                  SES (emails)       │
                        │                                      │
                        │  EventBridge ──▶ Lambda (backup)    │
                        └─────────────────────────────────────┘
```

| Service AWS | Rôle |
|---|---|
| Lambda | Exécution de l'API (Hono.js) et des crons |
| API Gateway | Point d'entrée HTTP de l'API |
| RDS (PostgreSQL) | Base de données relationnelle |
| Cognito | Authentification et gestion des utilisateurs |
| S3 | Hébergement frontend, assets, sauvegardes |
| CloudFront | CDN pour les deux frontends |
| SES | Envoi des emails d'invitation |
| EventBridge | Déclenchement des sauvegardes horaires |

---

## Structure du projet

```
├── .github/
│   ├── scripts/          # Scripts de déploiement Python
│   └── workflows/        # Pipelines CI/CD GitHub Actions
├── code/
│   ├── api/lambda_hono/  # Backend API (Hono.js + TypeScript)
│   ├── crons/            # Lambda de backup horaire
│   ├── database/
│   │   └── migrations/   # 7 fichiers SQL (001 → 007)
│   ├── domain/           # Services AWS partagés (Cognito, RDS, SES)
│   ├── emails/           # Templates HTML d'emails
│   ├── www-user/         # Frontend utilisateur (React + Tailwind)
│   └── www-admin/        # Frontend administrateur (React + Tailwind)
└── environments/
    ├── stg/              # Config staging
    └── prd/              # Config production
```

---

## Stack technique

**Backend** — Node.js 20 · TypeScript · Hono.js · pg · AWS SDK v3 · tsup

**Frontend** — React 19 · Vite 8 · Tailwind CSS 4 · TypeScript

**Infrastructure** — AWS Lambda · API Gateway · RDS · Cognito · S3 · CloudFront · SES · EventBridge

**CI/CD** — GitHub Actions · Python 3 · boto3

---

## Environnements

| | Staging | Production |
|---|---|---|
| Frontend user | https://d2dybcm06zklm9.cloudfront.net | https://d29dbyj0ogxwr5.cloudfront.net |
| Frontend admin | https://d3tetpefjvmpqh.cloudfront.net | — |
| API | https://ae9mtxvnx5.execute-api.eu-west-3.amazonaws.com | https://9lfftz8ngk.execute-api.eu-west-3.amazonaws.com |

---

## API — Routes

### Auth (`/auth`)
| Méthode | Route | Description |
|---|---|---|
| POST | `/auth/register` | Inscription (email, password, prénom, nom) |
| POST | `/auth/login` | Connexion → access_token |
| POST | `/auth/confirm-email` | Confirmation email avec code |
| POST | `/auth/resend-confirmation-code` | Renvoyer le code |
| GET | `/auth/profile` | Profil de l'utilisateur connecté |
| PATCH | `/auth/profile` | Modifier prénom / nom |

### Utilisateurs (`/users`)
| Méthode | Route | Description |
|---|---|---|
| GET | `/users` | Liste tous les utilisateurs (admin) |
| GET | `/users/:id` | Détail d'un utilisateur |
| POST | `/users` | Créer un utilisateur (admin) |

### Équipes (`/teams`)
| Méthode | Route | Description |
|---|---|---|
| GET | `/teams` | Équipes de l'utilisateur connecté |
| POST | `/teams` | Créer une équipe |
| GET | `/teams/:id/members` | Membres d'une équipe |
| POST | `/teams/:id/members` | Ajouter un membre |
| DELETE | `/teams/:id/members/:userId` | Retirer un membre |

### Invitations (`/invitations`)
| Méthode | Route | Description |
|---|---|---|
| POST | `/invitations` | Inviter un utilisateur (envoie un email SES) |
| GET | `/invitations` | Invitations en attente |
| POST | `/invitations/:id/accept` | Accepter |
| POST | `/invitations/:id/reject` | Refuser |

### Projets (`/projects`)
| Méthode | Route | Description |
|---|---|---|
| GET | `/projects` | Projets de l'utilisateur |
| POST | `/projects` | Créer un projet |
| PATCH | `/projects/:id` | Modifier (nom, description, statut) |
| DELETE | `/projects/:id` | Supprimer |

### Tâches (`/projects/:id/tasks`, `/tasks`)
| Méthode | Route | Description |
|---|---|---|
| GET | `/projects/:id/tasks` | Tâches d'un projet |
| POST | `/projects/:id/tasks` | Créer une tâche |
| PATCH | `/tasks/:id` | Modifier une tâche |
| DELETE | `/tasks/:id` | Supprimer une tâche |

### Assets (`/assets`)
| Méthode | Route | Description |
|---|---|---|
| GET | `/assets/upload-url` | URL présignée S3 pour upload |
| GET | `/assets/:id/download-url` | URL présignée S3 pour téléchargement |
| DELETE | `/assets/:id` | Supprimer un asset |

### Admin (`/stats`, `/backups`)
| Méthode | Route | Description |
|---|---|---|
| GET | `/stats` | Statistiques globales (users, teams, projets, tâches) |
| GET | `/backups` | Liste des sauvegardes |

---

## Base de données

7 migrations SQL exécutées séquentiellement :

| Fichier | Table(s) créée(s) |
|---|---|
| 001 | `users` |
| 002 | `teams`, `team_members` |
| 003 | `team_invitations` |
| 004 | `projects` |
| 005 | `tasks` |
| 006 | `assets` |
| 007 | `backups` |

---

## Déploiement

### Prérequis

- Python 3 avec `boto3`, `psycopg2`, `python-dotenv`
- Node.js 20
- Fichier `.env` à la racine avec les credentials AWS et DB

### Commandes

```bash
# Migrations base de données
python3 .github/scripts/migrations.py stg
python3 .github/scripts/migrations.py prd

# Backend API
python3 .github/scripts/deploy_api.py stg
python3 .github/scripts/deploy_api.py prd

# Frontend utilisateur
python3 .github/scripts/deploy_front.py www-user stg
python3 .github/scripts/deploy_front.py www-user prd

# Frontend admin
python3 .github/scripts/deploy_front.py www-admin stg
python3 .github/scripts/deploy_front.py www-admin prd

# Cron de backup
python3 .github/scripts/deploy_crons.py stg
python3 .github/scripts/deploy_crons.py prd
```

### CI/CD automatique

| Branche | Déploiement déclenché |
|---|---|
| `staging` | Déploiement complet sur STG (API + frontends + crons) |
| `main` | Déploiement complet sur PRD |

---

## Cron — Backup horaire

Un Lambda déclenché toutes les heures via EventBridge :

1. Se connecte à PostgreSQL
2. Génère un dump SQL complet (schéma + données)
3. Compresse le fichier en `.sql.gz`
4. Upload sur S3 avec horodatage
5. Enregistre les métadonnées dans la table `backups`

---

## Variables d'environnement

Copier `.env.example` → `.env` et renseigner :

```env
DB_HOST=
DB_PORT=5432
DB_USER=
DB_PASSWORD=
DB_NAME=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=eu-west-3
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=
S3_BUCKET_ASSETS=
SES_FROM_EMAIL=
```
