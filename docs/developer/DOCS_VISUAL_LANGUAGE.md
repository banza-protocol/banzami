# Developer Platform — visual language (DOCS-VISUAL-DX-002)

How the public Developer Documentation (`developers.banzami.com/docs`) and the
Console's API Explorer draw HTTP methods, statuses and code. One set of
components, so a page never styles these by hand.

## Components

| What | Component | Where |
|---|---|---|
| HTTP method badge | `ApiMethod` (`data-http-method`) | `apps/website/components/developers/api/ApiMethod.tsx` |
| HTTP status badge | `HttpStatus` (`data-http-status`) — code, reason phrase unless `compact`; accepts a class such as `"5xx"` | same |
| Endpoint path | `ApiPath` (`data-api-path`) — monospace, breaks only after `/` | same |
| Colours | `METHOD_SWATCH`, `STATUS_SWATCH`, `statusClass` | `components/developers/api/http.ts` |
| Code block | `CodeView` (`data-code-block`, `data-lang`, `data-raw-length`) | `components/developers/code/CodeView.tsx` |
| Equivalent examples | `CodeTabs` — one tab per real language | same |
| Highlighting | `highlight(source, lang)` — lossless source lexers | `components/developers/code/highlight.ts` |
| Docs wrapper | `CodeBlock label="curl · …"` → `CodeView` (language from the label's first word) | `apps/website/app/developers/docs/ui.tsx` |

## Rules

- **Methods and statuses use protocol colours, not the brand red.** GET blue,
  POST green, PUT indigo, PATCH amber, DELETE rose; 2xx green, 4xx terracotta,
  5xx red. The verb or code is always written out, so colour is never the only
  signal. Every foreground is WCAG AA on its background.
- **The environment badge ("Disponível em Sandbox") is a rounded sans label with
  a dot** (`Badge`, `data-environment-badge`). It is never drawn like a method.
- **Method, path and status come from the contract.** The reference's response
  status is read from `app/developers/docs/openapi-statuses.json`, generated from
  the OpenAPI mirror:

  ```bash
  node tools/docs/build-openapi-statuses.mjs
  ```

- **Highlighting runs during render**, identically on the server and the client,
  so the HTML arrives coloured and nothing loads afterwards. Supported: `curl`,
  `shell`, `json`, `ts`, `js`, `http`. `text` is not highlighted and is allowed
  only for the blocks listed in `PLAIN_ALLOWED` in the guard test.
- **Copy writes the source string**, never the rendered text. The button says
  "Copiado"/"Copied" for 1.8 s and a polite live region announces it.
- **Marks come for free:** an `Idempotency-Key:` header line in a request is a
  focus line; a `// ERRADO`/`// WRONG` … `// CERTO`/`// RIGHT` example is marked
  bad and good from those comments (`defaultMarks`).
- **Tabs** remember the reader's language in `lib/developer-prefs.ts` (the only
  module allowed to use web storage).
- **Tables** in the reference, error catalogue and event reference use
  `bz-reftable` and become compact cards under 640 px (see `globals.css`). Give
  each `td` a `data-label`.
- **Placeholders only** in examples (`bz_test_sk_XXXXXXXXXXXXXXXX`,
  `$BANZAMI_SECRET_KEY`); the guard fails a credential-shaped value.

## Guards

`apps/website/components/developers/code/visual-language.test.tsx`:

- every OpenAPI method has a swatch;
- `openapi-statuses.json` matches the OpenAPI, and every documented endpoint has
  a success status (`REFERENCE_HTTP_METHOD_OPENAPI_DRIFT=0`);
- every endpoint shows its verb, path, OpenAPI status and environment badge, in
  PT and EN;
- every code block on every docs page is highlighted, or allowlisted as plain
  text, and renders exactly its source; PT and EN carry the same number;
- copy writes the raw source and is labelled and announced; tabs are a keyboard
  tablist.

Visual evidence on the real site:

```bash
node tools/e2e/docs/visual-qa.mjs --label after --browsers chromium,webkit
```
