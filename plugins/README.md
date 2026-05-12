# plugins

E-commerce platform integrations.

## Contents

- `woocommerce/` — WordPress / WooCommerce plugin.
- `shopify/` — Shopify app.

## Conventions

- Plugins delegate **all** payment logic to the public API and the TypeScript SDK. No financial calculations or balance handling inside plugin code.
- Each plugin maintains its own release pipeline aligned with the host platform's marketplace requirements (WordPress.org for WooCommerce, Shopify Partner Dashboard for Shopify).
- Plugins must implement webhook signature verification and idempotent event handling.
- Customer-facing strings must be localizable (Portuguese is the primary locale; English is required).
- Security and update policy is the same as for any production code path: signed releases, no secrets in source, dependency pinning.
