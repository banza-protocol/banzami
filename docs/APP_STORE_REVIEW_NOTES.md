# App Store Connect - Review Notes

Source of truth for the **App Review Information → Notes** field and the
**TestFlight → What to Test** field for each submission.
Update here first so future submissions stay consistent.

---

## Banzami (Consumer app)

Usa autenticação por **@banza handle + PIN**.

### App Store Review Notes

```
The app uses handle + PIN authentication.
A dedicated sandbox account has been provisioned for App Review.

Review account:
  Handle:  review
  PIN:     (see the Demo Account field)

Instructions:
1. Open the app
2. Tap "Já tenho conta" (Log in)
3. Enter the review handle
4. Enter the review PIN

The review account has full access to:
* Wallet balance and transaction history
* Sending money by @banza handle
* QR code payment flow
* Payment link payment flow
* Profile and account settings

Important:
* Please allow Camera permissions (required for QR code scanning)
* Please allow Push Notifications (required for payment confirmations)
* The app operates in sandbox mode - no real money is moved

Security behaviour:
* The app automatically locks when sent to the background (e.g. switching apps,
  pressing the Home button, or opening the app switcher)
* When returning to the app you will be prompted for the PIN - this is intentional
  security behaviour, not a bug
* The app asks for the review PIN again after any background/foreground transition
```

### TestFlight - What to Test

```
Bem-vindo ao beta da Banzami!

A Banzami é a forma como Angola paga - carteira Kwanza, QR nativo, transferências
P2P e identidade financeira @banza, construído sobre o protocolo BANZA.

O que testar:
1. Registo e login com @banza e PIN
2. Consultar saldo e histórico de transacções
3. Enviar dinheiro para outro @banza
4. Pagar via QR code
5. Pagar via link de pagamento
6. Segurança - sai da app (prima Home ou muda de app) e volta:
   deve aparecer um ecrã de bloqueio com pedido de PIN
7. Protecção no selector de apps - abre o selector de apps (duplo clique Home
   ou desliza de baixo): a app deve mostrar um ecrã de privacidade sem conteúdo
8. Cartão de saldo - o saldo principal deve aparecer em destaque no topo do ecrã
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

Obrigado por fazeres parte do beta Banzami!
```

---

## Banzami Business (Merchant app)

Usa autenticação por **@banza handle + PIN** (igual à app consumer; PIN de 6 dígitos).

### App Store Review Notes

```
The app uses handle + PIN authentication.
A dedicated sandbox business account has been provisioned for App Review.

Review account:
  Handle:  review_merchant
  PIN:     (see the Demo Account field)

Instructions:
1. Open the app
2. Tap "Conectar conta existente" (Connect existing account)
3. Enter the review handle
4. Enter the review PIN

The review account has full access to:
* Business dashboard - balance, KPIs (today/month volume & payments, average
  ticket, success rate), a 7-day volume chart and a settlement/payout summary
* Merchant wallet balance and transaction history
* Generating QR codes to receive payments
* Creating payment links
* Viewing incoming payments in real time
* Profile and business settings

Important:
* Please allow Camera permissions (required for QR code scanning)
* Please allow Push Notifications (required for payment alerts)
* The app operates in sandbox mode - no real money is moved
```

### TestFlight - What to Test

```
Bem-vindo ao beta da Banzami Business!

A Banzami Business é a camada comerciante da rede de pagamentos instantâneos de
Angola - QR nativo, liquidação instantânea, sem terminal de cartão, sem espera,
construído sobre o protocolo BANZA.

O que testar:
1. Entrar com @banza (handle) e PIN
2. Painel de negócio - saldo, KPIs (volume e nº de pagamentos de hoje e do mês,
   ticket médio, taxa de sucesso), gráfico de volume dos últimos 7 dias e cartão
   de liquidações/payouts (estado de verificação KYB)
3. Gerar QR code para receber pagamento
4. Receber um pagamento em tempo real
5. Criar e partilhar um link de pagamento
6. Consultar histórico de transacções
7. Criar cobranças manuais

O que reportar:
- Erros ou crashes
- Botões que não respondem
- Valores ou saldos incorrectos no ecrã
- KPIs ou gráfico do painel com valores incorrectos
- Pagamentos que não aparecem em tempo real
- Problemas com QR code ou links de pagamento

Para reportar problemas: agita o iPhone
durante a app → aparece o menu de feedback
do TestFlight → descreve o problema.

Obrigado por fazeres parte do beta Banzami Business!
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
2. Selecciona a app (`Banzami` ou `Banzami Business`)
3. **App Information** → **App Review Information**
4. Cola o bloco correspondente no campo **Notes**
5. Para o **Demo Account** (ambos usam @banza handle + PIN):
   - Consumer: Username = `review`, Password = *(PIN de demo - não publicado no repo)*
   - Business: Username = `review_merchant`, Password = *(PIN de demo - não publicado no repo)*
6. Grava → submete o build para revisão

### TestFlight - What to Test

1. Abre https://appstoreconnect.apple.com/
2. Selecciona a app → **TestFlight**
3. Selecciona o build
4. Em **What to Test**: cola o bloco correspondente
5. Grava

---

## Contas de revisão sandbox

> **Estado (2026-10-06):** após o clean reset do Sandbox, ambas as contas de
> revisão são recriadas pelos fluxos normais do produto e entram por **@banza + PIN**
> (6 dígitos), igual nas duas apps. O PIN de demonstração **não é publicado neste
> repositório** - vive só no campo Demo Account privado do App Store Connect / Play
> Console. São contas de teste (**dinheiro fictício**); os IDs (consumer/merchant)
> são atribuídos no momento da criação.

### Consumer (Banzami)

| Campo    | Valor                       | Estado |
|----------|-----------------------------|--------|
| Handle   | review                      | -      |
| PIN      | *(demo - campo Demo Account)* | -    |
| Email    | verificado na criação       | -      |
| Ambiente | SANDBOX                     | -      |

Criação: signup normal (nome → @banza `review` → email → código OTP → email
verificado → define o PIN de demo). Para desactivar: `POST /admin/v1/consumers/{id}/suspend`
na admin-api (operador com a capacidade `consumer.suspend`).

### Merchant (Banzami Business)

| Campo    | Valor           | Estado |
|----------|-----------------|--------|
| Handle   | review_merchant | -      |
| PIN      | *(demo - campo Demo Account)* | - |
| Ambiente | SANDBOX         | -      |

Criação: fluxo Business normal (candidatura pública → aprovação em BANZADMIN →
ativação com o PIN de demo). A app Business entra por **@banza + PIN**, igual à
Consumer; o antigo modelo *Merchant ID + API Key* deixou de ser o login da app
(a API Key continua a existir apenas para integrações/SDK, não para a app).

> **Repositório público:** o PIN de demonstração destas contas **não** é publicado
> neste ficheiro - vive só no campo **Demo Account** privado do App Store Connect /
> Play Console. **Nunca** colocar aqui PINs, chaves ou credenciais - nem as de demo.
> São contas Sandbox (dinheiro fictício); suspende/roda-as após a revisão.

---

## App Store Connect - Registo de apps criadas

| App | Bundle ID | SKU | Team ID | Estado |
|-----|-----------|-----|---------|--------|
| Banzami | `com.banzami.consumer` | `banza-consumer` | W22UFWBATJ | Prepare for Submission |
| Banzami Business | `com.banzami.merchant` | `banza-merchant` | W22UFWBATJ | Prepare for Submission |

> **Bundle ID** = `com.banzami.consumer` / `com.banzami.merchant` (corresponde ao build
> e à AASA `W22UFWBATJ.com.banzami.consumer`). O **SKU** é um identificador permanente
> do App Store Connect e não muda. Se o registo da app no App Store Connect ainda usar
> o bundle antigo `com.banza.*`, é preciso um registo de app com o bundle `com.banzami.*`
> (o Bundle ID não se altera numa app já criada).

---

## App Store Descriptions (Copy)

Use these for the App Store listing pages. Mirrors new infrastructure positioning.

### Banzami (Consumer) - App Store Description

```
A Banzami é a tua carteira de pagamentos instantâneos em Kwanza.

Com a Banzami podes:
• Pagar em qualquer comerciante com QR - sem cash, sem espera
• Receber e enviar dinheiro para qualquer @banza em segundos
• Consultar o teu saldo e histórico em tempo real
• Pagar links de pagamento partilhados no WhatsApp

A Banzami é a forma como Angola paga: QR-native, wallet-native, construído para o
Kwanza sobre o protocolo BANZA.

Sem cartão. Sem IBAN. Sem confirmação manual.
Apenas @banza - e o dinheiro move-se.
```

### Banzami Business (Merchant) - App Store Description

```
A Banzami Business é o ponto de venda da nova economia angolana.

Com a Banzami Business podes:
• Receber pagamentos instantâneos via QR - imprime e aceita de imediato
• Criar e partilhar links de pagamento por WhatsApp ou SMS
• Ver cada pagamento em tempo real, sem esperar por confirmação
• Gerir o teu saldo e histórico de transacções num só lugar

Sem terminal de cartão. Sem taxas de POS. Sem espera.
Apenas QR + liquidação instantânea em Kwanza.

A Banzami Business é o operador de referência da rede de pagamentos de Angola,
construído sobre o protocolo BANZA.
```

---

## Registo de submissões

| Data | Build | App | Ambiente | Estado |
|------|-------|-----|----------|--------|
| 2026-05-18 | 1.0.0 (1) | Banzami + Banzami Business (Banza legacy) | - | ✅ Aprovado (TestFlight External) - app antiga |
| 2026-05-24 | 1.0.0 (1) | Banzami | Sandbox | 🔄 IPA pronto - pendente upload Transporter |
| 2026-06-25 | 1.0.0 (2) | Banzami | Sandbox | 🔄 Build iOS em preparação (bundle `com.banzami.consumer`, SDK source-of-truth) |

Adicionar uma linha a cada submissão.
