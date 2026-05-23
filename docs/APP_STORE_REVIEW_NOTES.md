# App Store Connect — Review Notes

Source of truth for the **App Review Information → Notes** field and the
**TestFlight → What to Test** field for each submission.
Update here first so future submissions stay consistent.

---

## Banza (Consumer app)

Usa autenticação por **@banza handle + PIN**.

### App Store Review Notes

```
The app uses handle + PIN authentication.
A dedicated sandbox account has been provisioned for App Review.

Review account:
  Handle:  review
  PIN:     123456

Instructions:
1. Open the app
2. Tap "Entrar" (Log in)
3. Enter the handle:  review
4. Enter the PIN:     123456

The review account has full access to:
* Wallet balance and transaction history
* Sending money by @banza handle
* QR code payment flow
* Payment link payment flow
* Profile and account settings

Important:
* Please allow Camera permissions (required for QR code scanning)
* Please allow Push Notifications (required for payment confirmations)
* The app operates in sandbox mode — no real money is moved

Security behaviour:
* The app automatically locks when sent to the background (e.g. switching apps,
  pressing the Home button, or opening the app switcher)
* When returning to the app you will be prompted for the PIN — this is intentional
  security behaviour, not a bug
* Use PIN 123456 to unlock after any background/foreground transition
```

### TestFlight — What to Test

```
Bem-vindo ao beta do Banza!

O que testar:
1. Registo e login com @banza e PIN
2. Consultar saldo e histórico de transacções
3. Enviar dinheiro para outro @banza
4. Pagar via QR code
5. Pagar via link de pagamento
6. Segurança — sai da app (prima Home ou muda de app) e volta:
   deve aparecer um ecrã de bloqueio com pedido de PIN
7. Protecção no selector de apps — abre o selector de apps (duplo clique Home
   ou desliza de baixo): a app deve mostrar um ecrã de privacidade sem conteúdo
8. Cartão de saldo — o saldo principal deve aparecer em destaque no topo do ecrã
   com gradiente escuro premium

O que reportar:
- Erros ou crashes
- Botões que não respondem
- Valores ou saldos incorrectos no ecrã
- Problemas com o leitor de QR
- Problemas com pagamentos
- Aplicação que não bloqueia ao sair para segundo plano

Para reportar problemas: agita o iPhone
durante a app → aparece o menu de feedback
do TestFlight → descreve o problema.

Obrigado por fazeres parte do beta Banza!
```

---

## Banza Business (Merchant app)

Usa autenticação por **Merchant ID + API Key** (diferente da app consumer).

### App Store Review Notes

```
The app uses Merchant ID + API Key authentication.
A dedicated sandbox merchant account has been provisioned for App Review.

Review credentials:
  Merchant ID:  b7f088ce-ca5e-4810-8624-d503da4d83dc
  API Key:      bz_test_87a03087cf16455da674da1e44c1c0c8eca8bab761fb49a69966151198e741e2

Instructions:
1. Open the app
2. Tap "Configurar" (Set up)
3. Enter the Merchant ID above
4. Enter the API Key above
5. Tap "Continuar"

The review account has full access to:
* Merchant wallet balance and transaction history
* Generating QR codes to receive payments
* Creating payment links
* Viewing incoming payments in real time
* Profile and business settings

Important:
* Please allow Camera permissions (required for QR code scanning)
* Please allow Push Notifications (required for payment alerts)
* The app operates in sandbox mode — no real money is moved
```

### TestFlight — What to Test

```
Bem-vindo ao beta do Banza Business!

O que testar:
1. Configurar a conta com Merchant ID e API Key
2. Gerar QR code para receber pagamento
3. Receber um pagamento em tempo real
4. Criar e partilhar um link de pagamento
5. Consultar histórico de transacções
6. Criar cobranças manuais

O que reportar:
- Erros ou crashes
- Botões que não respondem
- Valores ou saldos incorrectos no ecrã
- Pagamentos que não aparecem em tempo real
- Problemas com QR code ou links de pagamento

Para reportar problemas: agita o iPhone
durante a app → aparece o menu de feedback
do TestFlight → descreve o problema.

Obrigado por fazeres parte do beta Banza Business!
```

---

## Próximas submissões

### TestFlight (builds seguintes)

Builds submetidos ao mesmo grupo externo **não precisam de nova Beta App Review** da Apple. Basta:

1. Incrementar o build number (`version: 1.0.0+2`, etc.)
2. Submeter para App Store Connect → TestFlight → grupo externo existente
3. Adicionar linha ao Registo de submissões

Não é necessário actualizar as notas de revisão nem criar novas contas.

### App Store (lançamento público)

Quando for submeter para a App Store pública, a Apple faz uma revisão completa. Nessa altura:

1. Criar contas de revisão sandbox frescas
2. Preencher App Store Review Notes e Demo Account em App Store Connect
3. Seguir o processo normal de submissão

---

## Onde colocar

### App Store Review Notes

1. Abre https://appstoreconnect.apple.com/
2. Selecciona a app (`Banza` ou `Banza Business`)
3. **App Information** → **App Review Information**
4. Cola o bloco correspondente no campo **Notes**
5. Para o **Demo Account**:
   - Consumer: Username = `review`, Password = `123456`
   - Business: Username = Merchant ID, Password = API Key
6. Grava → submete o build para revisão

### TestFlight — What to Test

1. Abre https://appstoreconnect.apple.com/
2. Selecciona a app → **TestFlight**
3. Selecciona o build
4. Em **What to Test**: cola o bloco correspondente
5. Grava

---

## Contas de revisão sandbox

> **Estado:** Apps aprovadas em 2026-05-18 (TestFlight External).
> Conta `review` recriada em 2026-05-24 para próxima submissão (Banza consumer).
> Banza Business ainda não submetido — conta merchant pendente.
> Builds TestFlight seguintes não precisam de nova revisão Apple após aprovação inicial.

### Consumer (Banza)

| Campo       | Valor                                    | Estado  |
|-------------|------------------------------------------|---------|
| Handle      | review                                   | ACTIVE  |
| PIN         | 123456                                   | —       |
| Consumer ID | 8d94dd9c-73d6-4743-94f5-4235249dbb79     | ACTIVE  |
| Criada em   | 2026-05-24                               | —       |

Para desactivar: `POST /v1/consumers/8d94dd9c-73d6-4743-94f5-4235249dbb79/suspend` (via API gateway sandbox com chave de admin).

### Merchant (Banza Business)

| Campo       | Valor                                                                      | Estado                |
|-------------|----------------------------------------------------------------------------|-----------------------|
| Merchant ID | b7f088ce-ca5e-4810-8624-d503da4d83dc                                       | Desactivar no sandbox |
| API Key     | bz_test_87a03087cf16455da674da1e44c1c0c8eca8bab761fb49a69966151198e741e2  | Revogar no dashboard  |
| Ambiente    | SANDBOX                                                                    | —                     |

Para desactivar: revogar a API Key acima em dashboard.banzami.org → Definições → API Keys.

---

## App Store Connect — Registo de apps criadas

| App | Bundle ID | SKU | Team ID | Estado |
|-----|-----------|-----|---------|--------|
| Banza | `com.banza.consumer` | `banza-consumer` | W22UFWBATJ | Prepare for Submission |
| Banza Business | `com.banza.merchant` | `banza-merchant` | W22UFWBATJ | Prepare for Submission |

---

## Registo de submissões

| Data | Build | App | Ambiente | Estado |
|------|-------|-----|----------|--------|
| 2026-05-18 | 1.0.0 (1) | Banza + Banza Business (Banzami legacy) | — | ✅ Aprovado (TestFlight External) — app antiga |
| 2026-05-24 | 1.0.0 (1) | Banza | Sandbox | 🔄 IPA pronto — pendente upload Transporter |

Adicionar uma linha a cada submissão.
