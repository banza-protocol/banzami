# KYB Document Storage (Cloudflare R2) — Setup Runbook

Version: 1.0
Owner: operator infra
Scope: enable real upload of the 3 KYB documents for Business applications.

---

## A. Objetivo

Ativar o **upload real** dos 3 documentos KYB obrigatórios da candidatura
Business (Registo Comercial, NIF da Empresa, Documento do Representante) através
de Cloudflare R2, usando URLs assinadas (signed-URL → PUT → confirm).

Documentos suportados (e **apenas** estes — nada de comprovativo bancário nem de
morada):

- `BUSINESS_REGISTRATION` — Registo Comercial
- `TAX_ID` — NIF da Empresa
- `REPRESENTATIVE_ID` — Documento do Representante
- `OTHER` — bucket genérico para casos excepcionais (admin)

---

## B. Estado atual (antes deste setup)

- Formulário live em `https://banzami.com/comerciantes/candidatura`.
- Dados estruturados da candidatura **persistidos** (migração 0062 aplicada).
- Documentos ficam **pendentes**: `POST …/documents/upload-url` →
  **`503 STORAGE_NOT_CONFIGURED`**. **Nunca** finge upload nem sucesso falso.
- A tabela `merchant_application_documents` (migração **0054**) **ainda não está
  aplicada** em produção, e não há credenciais R2.

> **Pré-requisito de BD (obrigatório):** aplicar `0054` **e** `0063` **antes** de
> ligar o R2 — o gateway insere em `merchant_application_documents` e essa tabela
> tem de existir. `0054` já exclui `BANK_PROOF`; `0063` reforça a constraint
> (no-op se a tabela ainda não existir). Sem isto, o upload-url passaria de 503
> para erro 500 ao tentar inserir.

---

## C. Buckets Cloudflare R2

Criar dois buckets **privados**:

- `banzami-kyb-sandbox`
- `banzami-kyb-live`

Para ambos:

- **Privados** — sem public access.
- Sem domínio público `r2.dev`.
- Sem acesso anónimo.

---

## D. Token R2

Criar um **API Token** R2 com permissão **Object Read & Write** limitado **apenas**
a estes dois buckets.

Guardar (em gestor de segredos / env do servidor — **nunca** no repositório):

- Account ID
- Access Key ID
- Secret Access Key
- Endpoint S3: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

---

## E. CORS por bucket

Aplicar a cada bucket (o PUT direto do browser para o R2 precisa de CORS; a
Consola de Developers também envia documentos, pela Configuração financeira de um
Projeto). Do lado do site, `apps/website/lib/csp.ts` já permite
`https://*.r2.cloudflarestorage.com` em `connect-src`:

```json
[
  {
    "AllowedOrigins": [
      "https://banzami.com",
      "https://www.banzami.com",
      "https://developers.banzami.com",
      "http://localhost:3005"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## F. Variáveis de ambiente (api-gateway)

Os nomes correspondem ao código (`services/api-gateway/internal/config/config.go`,
`internal/kybstorage`). Definir no env do `api-gateway` no servidor:

```bash
KYB_STORAGE_PROVIDER=r2
KYB_STORAGE_BUCKET=banzami-kyb-live
KYB_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
KYB_STORAGE_REGION=auto
KYB_STORAGE_ACCESS_KEY_ID=...
KYB_STORAGE_SECRET_ACCESS_KEY=...
KYB_SIGNED_URL_TTL_SECONDS=300
KYB_MAX_FILE_SIZE_BYTES=5242880
```

Para o ambiente **sandbox** (gateway sandbox), usar o bucket sandbox:

```bash
KYB_STORAGE_BUCKET=banzami-kyb-sandbox
```

Quando `KYB_STORAGE_*` está ausente, o gateway corre em modo
`STORAGE_NOT_CONFIGURED` (estado atual) — sem upload, sem fake.

### F.1 Sandbox implantado (stack `bzsandbox-…`)

No Sandbox a configuração não-secreta (`KYB_STORAGE_PROVIDER=r2`,
`KYB_STORAGE_BUCKET=banzami-kyb-sandbox`, `KYB_STORAGE_REGION=auto`) já é
aplicada pelo próprio deploy (`release_config_env` em
`infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh`). Faltam apenas três
ficheiros no diretório de segredos do stack — o mesmo que já contém `db_url` e
`jwt_secret`
(`/opt/banzami-blueprint/tmp/banzami-blueprint-sandbox/root-<stack>/evidence/`):

| Ficheiro | Conteúdo |
|---|---|
| `kyb_storage_endpoint` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `kyb_storage_access_key_id` | Access Key ID do token R2 (secção D) |
| `kyb_storage_secret_access_key` | Secret Access Key do token R2 |

Um valor por ficheiro, sem newline final, escrito por quem detém a conta
Cloudflare (nunca colado num chat, log ou commit). Depois:
`./deploy.sh api-gateway-staging`. O deploy monta-os **só** no Gateway e
exporta-os dentro do processo (nunca como `-e`); o arranque regista
`[Track 3] KYB document storage configured`.

---

## G. Deploy (depois do env)

1. Aplicar migrações `0054` e `0063` (ver pré-requisito em B).
2. Definir as env vars `KYB_STORAGE_*` no servidor.
3. **Redeploy apenas** `api-gateway`:

   ```bash
   ./deploy.sh api-gateway
   ```

O `website-frontend` e o `admin-frontend` **não precisam** de alteração nem
redeploy — o fluxo de upload já está implementado neles; só dependia do storage.

---

## H. Teste end-to-end (após ativar)

1. Submeter uma candidatura de teste (SANDBOX) com os 3 documentos.
2. `POST …/documents/upload-url` → **200** (devolve `upload_url` assinado + `document_id`).
3. `PUT` do ficheiro para o `upload_url` → **200** (R2).
4. `POST …/documents/{id}/confirm` → **200**.
5. BANZADMIN: a candidatura mostra os documentos com estado `UPLOADED`.
6. Admin **read-url** abre o documento (URL assinada de leitura, TTL curto).
7. Admin **accept/reject** do documento funciona.
8. Logs do `api-gateway` **sem** URLs assinadas e **sem** segredos.

---

## I. Segurança

- Buckets **privados**; nenhum acesso público / `r2.dev`.
- URLs assinadas com **TTL curto** (`KYB_SIGNED_URL_TTL_SECONDS=300`).
- `storage_key` é **não previsível** (UUID por documento); a BD guarda apenas
  `{storage_bucket, storage_key}`, nunca uma URL pública.
- **Nunca** logar URLs assinadas, tokens nem credenciais.
- Tipos aceites limitados a `BUSINESS_REGISTRATION`, `TAX_ID`,
  `REPRESENTATIVE_ID`, `OTHER`. **`BANK_PROOF` e `PROOF_OF_ADDRESS` são
  rejeitados** (`ErrInvalidDocumentType`).
- Limite de tamanho server-side (`KYB_MAX_FILE_SIZE_BYTES=5242880` = 5 MB) e
  validação de MIME/extensão (PDF/JPG/PNG).

---

## J. Rollback

1. Remover as env vars `KYB_STORAGE_*` do `api-gateway`.
2. `./deploy.sh api-gateway`.
3. `upload-url` volta a devolver `503 STORAGE_NOT_CONFIGURED` (degradação
   honesta; candidaturas continuam a ser criadas com dados estruturados, sem
   upload). Nenhum documento já carregado é destruído (ficam no bucket; a BD
   mantém os registos).
