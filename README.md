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

Le script de création du compte gestionnaire demande les identifiants par variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans `server/.env`. Un fournisseur peut créer son accès depuis l'accueil; son numéro international est demandé avec ses informations de compte.

## Fonctionnalités de base

- Connexion avec JWT et rôles `manager` / `supplier`.
- Création de compte depuis l'accueil avec prénom, nom, e-mail et mot de passe (12 caractères minimum). Un fournisseur renseigne son entreprise; un référant indique son poste et est rattaché à Lacoste.
- La page Fournisseurs permet au référant de visualiser, ajouter et modifier les fournisseurs de l'annuaire ainsi que les comptes fournisseurs existants (nom de l'entreprise, contact, e-mail et téléphone).
- Lors de la création d'une référence, un référant peut choisir un compte fournisseur existant ou un fournisseur de l'annuaire.
- Les références créées sont enregistrées dans la base et apparaissent dans un tableau dédié « Saved references », distinct du formulaire de création. Le gestionnaire peut ensuite les modifier ou les archiver; le tableau s'adapte aux petits écrans sans défilement horizontal.
- Les noms de fournisseurs ajoutés lors de la création d'une référence sont enregistrés dans l'annuaire et réutilisables.
- Le gestionnaire peut modifier les données directement dans les lignes du suivi. La suppression d'une référence l'archive dans l'historique sans effacer ses données.
- Les pages « Suivi » et « Historique » proposent des filtres par valeurs pour chaque colonne.
- Un fournisseur connecté consulte les références et renseigne la date de demande, la disponibilité, la date de disponibilité prévue si `NO`, les dates d'envoi et de réception, le statut de renvoi et sa date si `YES`.
- Les données sont persistées dans PostgreSQL.
- L'interface de l'application est en anglais.

## API

- `POST /api/auth/login` : connexion.
- `POST /api/auth/register` : création de compte fournisseur ou référant Lacoste.
- `GET /api/auth/me` : utilisateur courant (JWT requis).
- `GET /api/samples` : liste des samples (JWT requis).
- `GET /api/samples/history` : références archivées (gestionnaire uniquement).
- `POST /api/suppliers/directory` : ajouter ou mettre à jour un fournisseur dans l'annuaire (gestionnaire uniquement).
- `PATCH /api/suppliers/directory/:id` : modifier un fournisseur de l'annuaire (gestionnaire uniquement).
- `PATCH /api/users/suppliers/:id` : modifier les informations d'un compte fournisseur (gestionnaire uniquement).
- `POST /api/samples` : créer une référence (manager uniquement).
- `PATCH /api/manager/samples/:id` : modifier le suivi ou le fournisseur (manager uniquement).
- `DELETE /api/samples/:id` : archiver une référence (manager uniquement).
- `PATCH /api/samples/:id` : modifier les champs de suivi (supplier uniquement).
- `GET /api/health` : état de l'API.

Ne pas utiliser les identifiants de développement en production. Déployer avec TLS, un secret JWT dédié et une base PostgreSQL sauvegardée. L'inscription publique des référants crée un compte gestionnaire, autorisé à créer des références et des fournisseurs; ne l'activer que si cet accès ouvert est volontaire. Ce socle ne fournit pas encore de procédure de réinitialisation de mot de passe ni d'envoi d'invitations.

## Déploiement étudiant

Le workflow GitHub Actions construit et publie une image Docker dans GHCR à chaque push sur `main` ou `master`. Pour la rendre compatible avec l'espace attribué, configurer la variable `IHME_BASE_PATH` (par exemple `/mon-projet/`). Le serveur doit être préprovisionné par l'enseignant et autoriser l'image GHCR de ce dépôt. À l'exécution, il doit fournir `DATABASE_URL` et un `JWT_SECRET` d'au moins 32 caractères; ces secrets ne sont jamais intégrés à l'image.

Dans les paramètres Actions du dépôt, configurer la variable `IHME_DEPLOY_URL` (URL HTTPS terminée par `/__deploy/pNN`) et le secret `IHME_DEPLOY_TOKEN` remis par l'enseignant. Le déploiement est volontaire : lancer le workflow « Construire et publier l’image » manuellement et cocher « Déployer cette version après construction ». Ne jamais versionner de jeton ou de fichier d'accès.

Au démarrage, l'API applique `server/db/schema.sql`, dont les opérations sont idempotentes, et limite le pool PostgreSQL à quatre connexions.
