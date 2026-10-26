# Suivi des échantillons fournisseurs

Application de suivi avec un frontend React, une API Node.js/Express et une base PostgreSQL. Les gestionnaires créent les références; les fournisseurs renseignent les dates et statuts de leurs samples.

## Prérequis

- Node.js 20.19+ ou 22.12+
- Docker Desktop avec Docker Compose
- npm

## Démarrage local

1. Copier `server/.env.example` vers `server/.env` et modifier `JWT_SECRET` avec une valeur aléatoire longue.
2. Démarrer PostgreSQL: `docker compose up -d db`.
3. Installer les dépendances à la racine: `npm install`.
4. Créer le compte gestionnaire initial: `npm run seed:manager -w server`.
5. Lancer le frontend et l'API: `npm run dev`.
6. Ouvrir `http://localhost:5173`.

Le script de création du compte gestionnaire demande les identifiants par variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans `server/.env`. Une fois connecté, le gestionnaire crée les accès fournisseurs depuis l'interface. Le mot de passe temporaire est communiqué au fournisseur par un canal séparé.

## Fonctionnalités de base

- Connexion avec JWT et rôles `manager` / `supplier`.
- Un gestionnaire crée une référence unique.
- Un fournisseur connecté consulte les références et renseigne la date de demande, la disponibilité, la date de disponibilité prévue si `NO`, les dates d'envoi et de réception, le statut de renvoi et sa date si `YES`.
- Les données sont persistées dans PostgreSQL.

## API

- `POST /api/auth/login` : connexion.
- `GET /api/auth/me` : utilisateur courant (JWT requis).
- `GET /api/samples` : liste des samples (JWT requis).
- `POST /api/samples` : créer une référence (manager uniquement).
- `PATCH /api/samples/:id` : modifier les champs de suivi (supplier uniquement).
- `GET /api/health` : état de l'API.

Ne pas utiliser les identifiants de développement en production. Déployer avec TLS, un secret JWT dédié et une base PostgreSQL sauvegardée. Ce socle ne fournit pas encore de procédure de réinitialisation de mot de passe ni d'envoi d'invitations; à ajouter avant une ouverture à des utilisateurs externes.
