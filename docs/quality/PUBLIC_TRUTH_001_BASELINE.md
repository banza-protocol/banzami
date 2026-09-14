# PUBLIC-TRUTH-001 — baseline

Version: 1.0

The before-state of every public Banzami surface on 2026-09-14, recorded before
any PUBLIC-TRUTH-001 change. The after-state is
[PUBLIC_TRUTH_001_CONFORMANCE.md](PUBLIC_TRUTH_001_CONFORMANCE.md).

Order of authority used throughout: runtime → OpenAPI → published SDK →
events and errors → developer documentation → Console → marketing (high level only).

## Starting identities

| Item | Value |
|---|---|
| `START_BANZAMI_SHA` | `f3743317` |
| `START_DOA_SHA` | `2612573` |
| OpenAPI | `docs-2026-09-14`, sha256 `44f17a89fff1c643…` |
| `@banzami/sdk` on npm | `latest` = 0.13.0 (0.14.0 prepared, not published) |
| Deployed images | developer-api / admin-api / public-api `2c239bf2`, api-gateway-staging `1d08b3a8`, core-api-staging `d9dbd853`, admin-frontend `ba5d2e0e`, pay-frontend `693d8971`, website-frontend `fa177eee` |
| Financial Live | NOT READY / FAIL-CLOSED (no public capability with `live: true` in the assurance manifest; the gateway refuses `bz_live_` keys) |

## Public responses captured

Text of every banzami.com page was captured with a browser (Playwright, desktop
Chrome user agent) through Cloudflare. Findings, by surface:

### banzami.com (home)
- Hero buttons "DISPONÍVEL NA App Store / Google Play" linking to `/produto#contacto`. The app is in no store. **UNSUPPORTED**
- Stats strip "0 utilizadores · 0 comerciantes · 4 empresas · 0 transações/dia". Reads as a product in operation with nobody on it. **AMBIGUOUS**
- Marquee headed "COMERCIANTES & EMPRESAS" listing companies only (`merchantCount` 0). **AMBIGUOUS**
- Present-tense money claims ("recebe em segundos", "O dinheiro move-se entre carteiras Banzami") with no Sandbox/Live distinction. **STALE / AMBIGUOUS**
- "Um pagamento em menos de 10 segundos." **UNSUPPORTED**

### banzami.com/developers
- A second API reference: endpoint tables, code samples (`landing-samples.ts`), an event list. **DUPLICATED / TOO_TECHNICAL**
- "Candidate um Business" onboarding, "Um ambiente existe: o Sandbox", "Produção depende da ativação dos rails aprovados". **STALE**
- Python / PHP SDKs named. **UNSUPPORTED**

### FAQ
- "Descarregue a app Banzami" (no store listing). **UNSUPPORTED**
- "SDKs oficiais para JavaScript/TypeScript, iOS, Android e REST". **UNSUPPORTED**
- "Em breve" items (dividir pagamentos, pedidos de pagamento). **UNSUPPORTED** (roadmap promise)
- Live described as "o ambiente de produção". **AMBIGUOUS**
- "Os pagamentos são instantâneos e irreversíveis" (refunds exist). **STALE**

### Produto
- "TypeScript, Flutter, Python, PHP, Go + pay links". **UNSUPPORTED**
- "Operacional ao nível de conformidade L0", "L0 · DRY-RUN". **TOO_TECHNICAL / STALE**
- "Multicaixa Express integrado" and "Envie e receba dinheiro instantaneamente em Angola" on app mock screens (also `/ecras`, `/app-demo`). **UNSUPPORTED**
- "O ambiente de teste nunca toca nos dados nem nos fluxos de produção" (no production exists). **AMBIGUOUS**

### Comerciantes
- "Onboarding em minutos, sem burocracia". **UNSUPPORTED**
- "Vários clientes dividem a conta" (Collections are not available in the Sandbox). **UNSUPPORTED**
- "Confirmação criptográfica", "Dashboard em tempo real … análises". **UNSUPPORTED**

### Candidatura
- "Encriptação de ponta a ponta", "em menos de 5 minutos". **UNSUPPORTED**

### Suporte
- A conformance dossier: "operador candidato", "BLOQ. INTERNOS 0 / EXTERNOS 10", "PASS significa evidência", L0–L4 levels, PyPI/GHCR artefacts. **TOO_TECHNICAL / STALE**

### Sobre
- "A equipa fundadora será apresentada em breve"; waitlist CTA. **UNSUPPORTED**

### Shared components
- Navigation: `/developers#docs`, `#api`, `#sdks`, `#sandbox`, `#webhooks`, `#examples` anchors into the retired reference; `/sobre#sobre` (no such anchor); "Equipa fundadora", "Roadmap", "Carreiras", "Imprensa" entries with nothing behind them; "Algumas capacidades encontram-se em desenvolvimento ou teste interno". **STALE**
- Footer: "Baixar a app" → `/app-demo`; "Seguro por design. Privacidade por padrão."; "Banzami é como Angola paga."; "Comprovativo vivo". **UNSUPPORTED**
- Shared CTA: "Constrói connosco … Junta-te à waitlist". Mixed "tu"/"você" across the site. **AMBIGUOUS**
- Sandbox banner: "🟡 SANDBOX — Esta plataforma encontra-se em ambiente de testes." (no Live statement). **AMBIGUOUS**
- Dead code with public copy: `MegaMenu`, `MobileDrawer`, `ComingSoonBadge`, `DeveloperCTA`, `SdkEcosystemDiagram` ("Python · PHP") and seven other unrendered developer components.

### Plumbing
- Email links: the SSR HTML of every marketing page carried `/cdn-cgi/l/email-protection#…` in place of `mailto:` (Cloudflare Email Address Obfuscation; its decoder is blocked by the site CSP). Home, ecras, app-demo, candidatura and activar kept broken links after hydration. `PUBLIC_EMAIL_OBFUSCATION_BROKEN` > 0.
- `https://banzami.com/sitemap.xml` → 404 (the route served only developers.banzami.com).
- No `<link rel="canonical">` on any marketing page; no `/.well-known/security.txt`.
- banzami.com is Portuguese only; the documentation is PT/EN.

### Developer documentation (developers.banzami.com/docs)
- Pinned to `@banzami/sdk` 0.13.0, with "use HTTP for links until the next SDK release" notes on Payments, the SDK page, the changelog and two reference endpoints. Correct for 0.13.0; stale once 0.14.0 is on the registry.

### Console
- Environment labels said "Live" rather than "Financial Live", and "requer aprovação institucional" rather than the approvals wording used elsewhere. **AMBIGUOUS** (terminology)

### SDK README (`@banzami/sdk`)
- "Angola's QR-native instant payment network"; environment table "Live — Production — Real Kwanza movement (requires activation)"; "Publishable keys … are a planned client-safe key type". **STALE**
