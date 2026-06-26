# BANZADMIN — CHANGELOG Security Hardening Phase 1

Version: 1.0
Date de livraison: 2026-06-26
Périmètre: `services/admin-api`, `apps/admin`, `db/migrations`, `docs/`
Référence: [BANZADMIN_RUNBOOK.md](BANZADMIN_RUNBOOK.md) ·
[../security/BANZADMIN_SECURITY_HARDENING_PHASE1.md](../security/BANZADMIN_SECURITY_HARDENING_PHASE1.md)

> Statut : **déployé et validé en production** le 2026-06-26 (migrations `0060`/`0061`
> appliquées, admin-api + admin-frontend redéployés, smoke tests OK, aucune régression).

---

## Commits

| SHA | Date | Description |
|---|---|---|
| `d17d949` | 2026-06-26 | RBAC matrix, immutable audit log, session revocation, anti-enumeration (backend) |
| `d67fccc` | 2026-06-26 | session termination UI, critical-action confirmations, CSP + password policy (frontend + docs) |
| `5cd2c81` | 2026-06-26 | close audit gaps — reset/invite completion + financial action payloads |

HEAD final : `5cd2c81` (`main`).

---

## Livraisons

### Authentification opérateur (email / mot de passe)
- Login par opérateur (`POST /admin/v1/auth/login`), mots de passe **bcrypt**,
  jamais journalisés ni retournés.
- Remplacement définitif de la clé partagée : `ADMIN_API_KEY` / `X-Admin-Key`
  **n'authentifient plus** le portail (401).

### JWT (jeton de session)
- **JWT HS256** signé par `ADMIN_JWT_SECRET`, durée **12h**.
- **Claims minimisés** à `sub`, `email`, `role`, `token_version`, `iat`, `exp`,
  `iss` — plus de nom complet ni de liste de permissions ; identité et statut
  rechargés depuis la DB à chaque requête.

### Gestion des opérateurs
- CRUD opérateurs (créer, renommer, changer de rôle, suspendre, réactiver) avec
  garde-fou « dernier SUPER_ADMIN actif ».

### Flux d'invitation
- Création ⇒ statut **INVITED** sans mot de passe ; lien d'invitation à **usage
  unique** (sha256, TTL 72h) ; définition du mot de passe ⇒ **ACTIVE**.

### Réinitialisation de mot de passe
- Lien de reset à usage unique (TTL 24h) émis par SUPER_ADMIN / SUPPORT ;
  validation + complétion publiques.

### RBAC centralisé
- Matrice de capabilities unique (`auth.Can`) + middleware **unique**
  `RequireCapability` sur **chaque** route mutante ; **deny-by-default** ; aucun
  `if role == ...` éparpillé.
- Rôles : `SUPER_ADMIN`, `OPERATIONS`, `COMPLIANCE`, `SUPPORT`, `READ_ONLY`.

### Audit log immuable
- Table `admin_audit_log` **append-only** (migration `0061`) ; écriture
  centralisée par middleware sur chaque mutation (y compris les **403 refusés**) ;
  login et complétion reset/invite auditent leur propre ligne ; payloads
  before/after rédigés sur les actions sensibles/financières ; **aucun secret**
  enregistré ; l'échec d'audit ne bloque jamais l'action.

### token_version (révocation de session)
- Colonne `token_version` (migration `0060`) embarquée dans le JWT et ré-vérifiée
  à chaque requête ; incrémentée sur change-password, complétion reset/invite,
  suspend/activate, et « terminer les sessions » (self + opérateur).

### Anti-énumération
- Login uniforme : 401 générique identique pour email inconnu / mauvais mot de
  passe / INVITED / SUSPENDED, avec comparaison bcrypt à coût constant ; seul un
  verrouillage réel renvoie 429.

### Lockout
- 5 échecs consécutifs ⇒ verrou 15 minutes (429), levé par connexion réussie /
  réactivation / délai.

### Rate limit
- 20 req/min/IP sur `login`, `password-reset/validate`, `password-reset/complete`,
  `change-password` ; `429` + `Retry-After` ; aucun impact sur les endpoints
  opérateur normaux.

### Révocation de session (UI)
- « Terminer mes sessions » (menu compte) et « Terminer les sessions » par
  opérateur (table opérateurs), avec modals de confirmation.

### Frontend
- Modals de confirmation sur les actions critiques (approuver/rejeter candidature,
  confirmer paiement, accepter/rejeter KYB, résoudre dispute, suspendre/terminer),
  politique mot de passe ≥ 12 caractères dans l'UI, en-têtes CSP durcis
  (`object-src 'none'`, `frame-src 'none'`).

---

## Migrations livrées

| Fichier | Effet | Nature |
|---|---|---|
| `0060_admin_token_version.sql` | `admin_users.token_version INTEGER NOT NULL DEFAULT 1` | additive, idempotente, backfill = 1 |
| `0061_admin_audit_log.sql` | table `admin_audit_log` + 5 index | additive, idempotente, append-only |

**Ordre de déploiement** : `0060` → `0061` **avant** le binaire admin-api.

---

## Validation production (2026-06-26)

RBAC (403 par rôle), token_version (401 sur jeton périmé), suspension (403
immédiat), anti-énumération (401 uniforme), rate limit (20→429 + Retry-After),
audit (mutations + refus + login, scan secrets = 0), logs sans secret,
non-régression (admin/api/website/pay = 200). Aucune donnée de test laissée en
production.

---

## Hors périmètre (évolutions futures, non bloquantes)

CSP nonce-based · `Idempotency-Key` natif · rate-limit distribué (Redis) ·
restriction réseau de `/metrics` · MFA. Voir le Runbook, section « Évolutions
futures ».
