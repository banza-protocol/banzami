# BANZADMIN — Runbook officiel

Version: 1.0
Statut: référence officielle du portail d'administration Banzami
Périmètre: `services/admin-api` (Go) + `apps/admin` (Next.js)

> Document de référence pour l'exploitation, la sécurité et le déploiement du
> portail d'administration interne (« BANZADMIN »). Il décrit le comportement
> réel du code en production ; il ne définit aucune règle de protocole BANZA.

---

## Introduction

**BANZADMIN** est le portail d'administration interne de l'opérateur Banzami. Il
permet aux opérateurs autorisés de :

- gérer le cycle de vie des candidatures et comptes commerçants (onboarding, KYC,
  KYB, AML, suspension),
- consulter consommateurs, paiements, payouts, liquidations, réconciliation,
- résoudre disputes et signalements de risque,
- gérer les opérateurs eux-mêmes (création, rôles, suspension, reset, sessions).

**Usage strictement interne.** Le portail n'est jamais exposé au public ; il est
servi sur `admin.banzami.com` derrière Cloudflare + nginx, et toute action est
attribuée à un opérateur authentifié et journalisée de façon immuable.

Banzami est l'opérateur de référence construit **sur** le protocole BANZA ; le
portail consomme les contrats du protocole, il ne les redéfinit pas.

---

## Architecture

```
  Opérateur (navigateur)
        │  HTTPS
        ▼
  Cloudflare ──► nginx (admin.banzami.com)
        │                    │  (pose X-Real-IP, TLS origine)
        │                    ▼
        │            apps/admin  (Next.js, standalone)
        │                    │  fetch Authorization: Bearer <admin JWT>
        ▼                    ▼
  ───────────────►  services/admin-api  (Go, chi, :8082)
                           │
                ┌──────────┼─────────────────────────┐
                ▼          ▼                          ▼
          PostgreSQL   Gateway /internal         (email SMTP)
        (admin_users,  (candidatures, KYB,        invitations /
         admin_audit_  provisioning marchand)     reset (dry-run
         log, ...)                                 par défaut)
                           │
                           ▼
                      Core (Rust) — ledger, wallets, settlement, payouts
```

- Le **frontend** ne détient aucune autorité : il masque/désactive selon le rôle,
  mais toute autorisation est ré-imposée côté API.
- L'**admin-api** est l'unique point d'autorisation (RBAC) et d'audit.
- Les actions financières/onboarding sont **proxifiées** au Gateway `/internal`
  et au Core ; l'admin-api ne déplace jamais d'argent lui-même.

---

## Authentification

| Élément | Valeur |
|---|---|
| Login | email + mot de passe (`POST /admin/v1/auth/login`) |
| Hachage mot de passe | **bcrypt** (coût par défaut) ; jamais journalisé/retourné |
| Jeton | **JWT HS256** signé par `ADMIN_JWT_SECRET` |
| Claims JWT | `sub`, `email`, `role`, `token_version`, `iat`, `exp`, `iss=banzami-admin` — **rien d'autre** |
| Durée du JWT | **12 heures** |
| Identité/rôle live | rechargés depuis la DB **à chaque requête** (le JWT ne porte ni le nom ni les permissions) |

### token_version (révocation de session)

Chaque ligne `admin_users` porte `token_version` (entier, défaut 1). Le JWT
embarque la valeur au moment de l'émission ; le middleware compare JWT vs DB à
chaque requête — **mismatch ⇒ 401 immédiat**. `token_version` est incrémenté sur :

- changement de mot de passe,
- complétion d'invitation / de reset,
- suspension **et** réactivation d'un opérateur,
- « terminer les sessions » (self ou opérateur).

Effet : un jeton volé/périmé cesse de fonctionner **sans attendre** l'expiration 12h.

### Changement de mot de passe

`POST /admin/v1/auth/change-password` (self). Vérifie le mot de passe courant
(400 `INVALID_CURRENT_PASSWORD` si faux, pour ne pas déclencher l'auto-logout
401 du client), refuse un mot de passe identique (409 `SAME_PASSWORD`), applique
la politique ≥ 12 caractères, puis **incrémente token_version** (déconnecte les
autres sessions).

### Révocation des sessions

- **Self** : `POST /admin/v1/auth/terminate-sessions` (menu compte) — révoque
  toutes ses propres sessions, y compris la courante.
- **Opérateur** : `POST /admin/v1/operators/{id}/terminate-sessions`
  (SUPER_ADMIN / SUPPORT) — révoque toutes les sessions de la cible.

### Lockout

5 échecs consécutifs ⇒ compte verrouillé **15 minutes** (`429 TOO_MANY_ATTEMPTS`).
Le verrou est levé par une connexion réussie, une réactivation, ou l'écoulement
du délai.

### Anti-énumération

Email inconnu, mauvais mot de passe, compte INVITED (sans mot de passe) et compte
SUSPENDED renvoient **tous** un `401 INVALID_CREDENTIALS` identique. Chaque rejet
consomme une comparaison bcrypt (hash factice pour les comptes inexistants) afin
d'égaliser le temps de réponse. **Seul** un verrouillage réel renvoie `429`.

---

## Rôles

| Rôle | Responsabilités | Permissions clés | Limitations |
|---|---|---|---|
| **SUPER_ADMIN** | Administration complète | **Toutes** les capabilities | Garde-fou : on ne peut ni suspendre ni rétrograder le **dernier** SUPER_ADMIN actif |
| **OPERATIONS** | Guichet onboarding | dashboards, voir marchands/consommateurs/paiements, **approuver/rejeter candidatures**, résoudre disputes | Pas d'admin opérateurs, pas de KYB/AML, pas de mouvement financier |
| **COMPLIANCE** | KYC/AML/KYB & standing marchand | accepter/rejeter KYB, flag AML, approuver/rejeter/suspendre marchand, résoudre risque, lire l'audit | Pas d'admin opérateurs, pas de settlement/payout |
| **SUPPORT** | Help desk / récupération d'accès | lire opérateurs/marchands/consommateurs/paiements, **reset password & renvoi d'invitation** opérateur | **Aucune** action financière, pas d'approbation marchand, pas de changement de rôle/suspension d'opérateur |
| **READ_ONLY** | Observation | toutes les **vues** + audit | **Aucune** mutation |

---

## RBAC

### Principe

Toute l'autorisation passe par **une** matrice centrale et **un** middleware ;
il n'existe **aucun** test `if role == ...` éparpillé dans les handlers.

- `auth.Can(role, capability)` — décision unique. `SUPER_ADMIN` ⇒ tout ;
  rôle inconnu ⇒ rien (**deny-by-default**).
- `middleware.RequireCapability(cap)` — monté sur **chaque** route mutante dans
  `services/admin-api/internal/server/server.go` ; lit le principal posé par
  `AdminJWT` et renvoie `403 FORBIDDEN` si la capability manque.

### Matrice (extrait)

| Groupe de capability | SUPER_ADMIN | OPERATIONS | COMPLIANCE | SUPPORT | READ_ONLY |
|---|:--:|:--:|:--:|:--:|:--:|
| Vues (dashboards, listes) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Operator read | ✓ | — | — | ✓ | ✓ |
| Operator manage (create/role/suspend/activate) | ✓ | — | — | — | — |
| Operator reset / resend / terminate | ✓ | — | — | ✓ | — |
| Application approve/reject | ✓ | ✓ | — | — | — |
| KYB accept/reject, AML flag, merchant suspend | ✓ | — | ✓ | — | — |
| Compliance approve/reject merchant | ✓ | — | ✓ | — | — |
| Settlements / payouts / wallet credit / recon run | ✓ | — | — | — | — |
| Dispute resolve | ✓ | ✓ | — | — | — |
| Risk resolve / freeze | ✓ | — | ✓ | — | — |
| Audit read | ✓ | — | ✓ | ✓ | ✓ |

### Pourquoi ce modèle

- **Une seule source de vérité** → impossible d'oublier un contrôle de rôle sur
  une nouvelle route (le contrôle est explicite et lisible comme une matrice).
- **Deny-by-default** → un rôle ou une capability manquante refuse, jamais l'inverse.
- **Testable** → la matrice est couverte par tests unitaires et a été vérifiée en
  production (chaque rôle : action interdite ⇒ 403, lecture autorisée ⇒ 200).

---

## Gestion des opérateurs

### Flux de création

```
SUPER_ADMIN crée l'opérateur (email, nom, rôle)
        │            → CREATE_OPERATOR (audit)
        ▼
   statut INVITED  (aucun mot de passe)
        │
        ▼
Email d'invitation = lien à usage unique (token sha256, TTL 72h)
   (si EMAIL_DRY_RUN : le lien est rendu au SUPER_ADMIN dans la réponse authentifiée)
        │
        ▼
L'opérateur définit son mot de passe (≥ 12 car.)  → ADMIN_INVITE_COMPLETE (audit)
        │            (token_version +1, activated_at posé)
        ▼
   statut ACTIVE
        │
        ▼
   Connexion email + mot de passe → LOGIN_SUCCESS (audit)
```

### Autres opérations

- **Suspendre** : `POST /operators/{id}/suspend` → statut SUSPENDED + token_version +1
  (sessions révoquées). Refusé sur le dernier SUPER_ADMIN actif.
- **Réactiver** : `POST /operators/{id}/activate` → ACTIVE (verrou + compteur remis à zéro).
- **Changer le rôle** : `POST /operators/{id}/role`. Refusé si rétrograderait le
  dernier SUPER_ADMIN actif.
- **Reset password** : `POST /operators/{id}/password-reset` (SUPER_ADMIN / SUPPORT)
  → lien à usage unique (TTL 24h).
- **Renvoyer l'invitation** : `POST /operators/{id}/resend-invite` (cible encore INVITED).
- **Terminer les sessions** : `POST /operators/{id}/terminate-sessions` (token_version +1).

Les jetons d'invitation/reset sont **à usage unique**, stockés **hachés (sha256)**,
et tout jeton non utilisé du même type est invalidé à l'émission d'un nouveau.

---

## Sécurité

| Contrôle | Mise en œuvre |
|---|---|
| Mots de passe | bcrypt ; **politique ≥ 12 caractères** (phrase de passe ; pas d'exigence majuscule/chiffre/symbole) |
| Jetons de session | JWT HS256, 12h, claims minimaux, `token_version` |
| Révocation | `token_version` ré-vérifié à chaque requête |
| Audit | `admin_audit_log` immuable (append-only) sur chaque mutation |
| Lockout | 5 échecs → 15 min |
| Rate limit | 20 req/min/IP sur login + reset validate/complete + change-password (`429` + `Retry-After`) |
| Anti-énumération | 401 uniforme + bcrypt à coût constant |
| `ADMIN_API_KEY` / `X-Admin-Key` | **rejetés (401)** — la clé héritée n'authentifie plus le portail |
| Jetons invite/reset | hachés sha256, usage unique, TTL bornés |
| Secrets | mots de passe, hash, JWT, jetons, clés API, URLs signées R2 : **jamais** journalisés ni stockés dans l'audit |
| En-têtes (frontend) | HSTS, X-Frame-Options DENY, CSP (`object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`) |

---

## Audit Log

Table **`admin_audit_log`** (migration `0061`), **append-only** : l'application
n'effectue ni UPDATE ni DELETE.

| Colonne | Contenu |
|---|---|
| `admin_user_id` | acteur (NULL pour login échoué / email inconnu) |
| `admin_email`, `full_name`, `role` | identité de l'acteur |
| `action` | ex. `LOGIN_SUCCESS`, `APPROVE_APPLICATION`, `WALLET_CREDIT`, `SET_OPERATOR_ROLE` |
| `entity_type`, `entity_id` | cible de l'action |
| `before_json`, `after_json` | instantané rédigé (avant/après), si pertinent |
| `status_code` | résultat HTTP (y compris **403 refusés** — escalades enregistrées) |
| `ip_address`, `user_agent`, `request_id` | contexte requête |
| `created_at` | horodatage |

- **Écriture centralisée** : middleware `Audit` (après `AdminJWT`, enveloppe
  `RequireCapability`) → une ligne par mutation, action dérivée de la route (les
  routes non mappées sont **quand même** auditées : rien n'échappe).
- **Login** (route publique) et **complétion reset/invite** (route publique)
  écrivent leur propre ligne (`LOGIN_SUCCESS`/`LOGIN_FAILED`,
  `ADMIN_INVITE_COMPLETE`/`ADMIN_PASSWORD_RESET_COMPLETE`).
- **L'échec d'écriture d'audit ne bloque jamais l'action** (il est journalisé
  `admin.audit_write_failed`).
- **Jamais enregistré** : mot de passe, hash bcrypt, JWT, jeton invite/reset,
  `token_hash`, clé API complète, URL signée R2.

---

## Déploiement

### Ordre officiel (impératif)

```
1. Migrations DB     (0060 PUIS 0061)
2. admin-api         (./deploy.sh admin-api)
3. admin-frontend    (./deploy.sh admin-frontend)
4. Smoke tests
```

> ⚠️ **`0060_admin_token_version.sql` DOIT toujours être appliquée AVANT le
> nouveau binaire.** Le binaire `SELECT`e la colonne `token_version` ; déployer
> avant la migration provoque une panne d'authentification totale. Les deux
> migrations sont additives + idempotentes (`IF NOT EXISTS`) ; l'ancien binaire
> continue de fonctionner après leur application, d'où un ordre de bascule sûr.

### Application des migrations (production)

Serveur : `root@217.160.9.248` — conteneur `banzami-postgres-1` (user/db `banzami`).

```bash
ssh root@217.160.9.248 'docker exec -i banzami-postgres-1 psql -U banzami -d banzami -v ON_ERROR_STOP=1 -1' \
  < db/migrations/0060_admin_token_version.sql
ssh root@217.160.9.248 'docker exec -i banzami-postgres-1 psql -U banzami -d banzami -v ON_ERROR_STOP=1 -1' \
  < db/migrations/0061_admin_audit_log.sql
```

Vérifier ensuite : `admin_users.token_version` (NOT NULL DEFAULT 1, backfill = 1
pour les comptes existants) et `admin_audit_log` (+ 5 index).

### Déploiement des services

```bash
./deploy.sh admin-api admin-frontend
```

Ne **jamais** redéployer dans cette opération : api-gateway, core-api, public-api,
website, nginx, R2, ledger, settlement, Doa.

---

## Smoke Tests

Checklist post-déploiement (cf. `services/admin-api` — endpoints internes via
l'IP conteneur, ou `admin.banzami.com` de bout en bout) :

- [ ] **login** SUPER_ADMIN → 200 ; `GET /auth/me` → rôle correct
- [ ] **RBAC** : READ_ONLY → approve merchant → **403** ; SUPPORT → settlement
      confirm → **403** ; COMPLIANCE → settlement → **403** ; OPERATIONS → manage
      operators → **403** ; SUPER_ADMIN → 200
- [ ] **audit** : chaque mutation crée une ligne (`admin_audit_log`) avec
      actor/entity/status ; scan secrets `before_json`/`after_json` = 0
- [ ] **terminate sessions** : ancien JWT → **401**
- [ ] **change password** : ancien JWT → **401**
- [ ] **invite** : créer opérateur → INVITED → lien → ACTIVE
- [ ] **reset** : lien à usage unique → mot de passe redéfini
- [ ] **lockout** : 5 échecs → **429**
- [ ] **rate limit** : 21 logins / même IP → **429** + `Retry-After`
- [ ] `X-Admin-Key` / `ADMIN_API_KEY` → **401**
- [ ] non-régression : admin/api/website/pay → 200

---

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| **401** après login OK | `token_version` JWT ≠ DB (password changé / sessions terminées / suspendu) ailleurs | Se reconnecter ; le client efface la session et redirige vers `/login` |
| **401** général soudain sur toutes les routes | `ADMIN_JWT_SECRET` absent/changé, ou JWT expiré (12h) | Vérifier l'env du conteneur ; reconnexion |
| **403** sur une action | Le rôle n'a pas la capability | Vérifier la matrice RBAC ; assigner le bon rôle (SUPER_ADMIN) |
| **429** au login/reset | Rate limit IP (20/min) ou lockout (5 échecs) | Attendre `Retry-After` / 15 min ; vérifier l'IP source (nginx pose `X-Real-IP`) |
| **503** sur auth | DB ou `ADMIN_JWT_SECRET` non configurés | Vérifier `DATABASE_URL` + `ADMIN_JWT_SECRET` du conteneur |
| Audit indisponible | `admin_audit_log` absente ou DB en erreur | L'action **réussit quand même** ; appliquer `0061` ; surveiller `admin.audit_write_failed` |
| Panne auth après déploiement | Binaire déployé **avant** la migration `0060` | Appliquer `0060` immédiatement ; le binaire se rétablit sans redéploiement |
| Opérateur ne peut pas se connecter | Statut INVITED (jamais activé) / SUSPENDED / verrouillé | Renvoyer invitation, réactiver, ou attendre la fin du verrou |
| Liens invite/reset non reçus par email | `EMAIL_DRY_RUN=true` | Le lien est rendu au SUPER_ADMIN dans la réponse authentifiée ; le livrer manuellement, ou configurer SMTP |

---

## Évolutions futures

Ces points sont des **améliorations**, **pas** des failles de sécurité ; le
système actuel n'a aucun P0/P1 bloquant.

- **CSP nonce-based** : retirer `'unsafe-inline'` de `script-src` via un nonce par
  requête (middleware Next) — actuellement conservé pour la compatibilité Next 14.
- **Idempotency-Key** : support natif (header + store clé→résultat) côté service
  propriétaire ; aujourd'hui couvert par modals de confirmation + boutons
  désactivés + préconditions d'état du Core/Gateway.
- **Rate-limit distribué (Redis)** : le limiteur actuel est en mémoire / par
  instance (suffisant pour l'instance unique ; dépend de `X-Real-IP` posé par le proxy).
- **Restriction réseau de `/metrics`** : actuellement non authentifié.
- **MFA** : facteur supplémentaire pour les opérateurs (quand le besoin l'exige).
