# App Store Connect — Review Notes

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
  Handle:  <issued for the submission — see the note below this block>
  PIN:     <issued for the submission — see the note below this block>

Instructions:
1. Open the app
2. Tap "Entrar" (Log in)
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
* The app operates in sandbox mode — no real money is moved

Security behaviour:
* The app automatically locks when sent to the background (e.g. switching apps,
  pressing the Home button, or opening the app switcher)
* When returning to the app you will be prompted for the PIN — this is intentional
  security behaviour, not a bug
* The app asks for the review PIN again after any background/foreground transition
```

### TestFlight — What to Test

```
Bem-vindo ao beta do Banzami!

O Banzami é a forma como Angola paga — carteira Kwanza, QR nativo, transferências
P2P e identidade financeira @banza, construído sobre o protocolo BANZA.

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

Obrigado por fazeres parte do beta Banzami!
```

---

## Banzami Business (Merchant app)

Usa autenticação por **Merchant ID + API Key** (diferente da app consumer).

### App Store Review Notes

```
The app uses Merchant ID + API Key authentication.
A dedicated sandbox merchant account has been provisioned for App Review.

Review credentials:
  Merchant ID:  b7f088ce-ca5e-4810-8624-d503da4d83dc
  API Key:      <issued for the submission — see the note below this block>

Instructions:
1. Open the app
2. Tap "Configurar" (Set up)
3. Enter the Merchant ID above
4. Enter the API Key above
5. Tap "Continuar"

The review account has full access to:
* Business dashboard — balance, KPIs (today/month volume & payments, average
  ticket, success rate), a 7-day volume chart and a settlement/payout summary
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
Bem-vindo ao beta do Banzami Business!

O Banzami Business é a camada comerciante da rede de pagamentos instantâneos de
Angola — QR nativo, liquidação instantânea, sem terminal de cartão, sem espera,
construído sobre o protocolo BANZA.

O que testar:
1. Configurar a conta com Merchant ID e API Key
2. Painel de negócio — saldo, KPIs (volume e nº de pagamentos de hoje e do mês,
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
5. Para o **Demo Account**:
   - Consumer: the review handle and PIN issued for the submission
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
> Conta `review` recriada em 2026-05-24 para próxima submissão (Banzami consumer).
> Banzami Business ainda não submetido — conta merchant pendente.
> Builds TestFlight seguintes não precisam de nova revisão Apple após aprovação inicial.

### Consumer (Banzami)

| Campo       | Valor                                    | Estado  |
|-------------|------------------------------------------|---------|
| Handle      | review                                   | ACTIVE  |
| PIN         | *(não publicado — emitido para a submissão)* | — |
| Consumer ID | 8d94dd9c-73d6-4743-94f5-4235249dbb79     | ACTIVE  |
| Criada em   | 2026-05-24                               | —       |

Para desactivar: `POST /admin/v1/consumers/8d94dd9c-73d6-4743-94f5-4235249dbb79/suspend`
na admin-api (consola de operador), autenticado como operador com a capacidade
`consumer.suspend`. A rota equivalente na superfície de merchant do API gateway
foi removida por não ter autorização (auditoria de segurança, SEC-003).

### Merchant (Banzami Business)

| Campo       | Valor                                                                      | Estado                |
|-------------|----------------------------------------------------------------------------|-----------------------|
| Merchant ID | b7f088ce-ca5e-4810-8624-d503da4d83dc                                       | Desactivar no sandbox |
| API Key     | *(não publicada — ver abaixo)*                                              | Revogada              |
| Ambiente    | SANDBOX                                                                    | —                     |

A chave desta conta de revisão foi **revogada** e deliberadamente não está aqui.

Este documento continha a chave em texto claro, num repositório que é público, e
dizia para a revogar em `dashboard.banzami.com` — um host que não existe
(NXDOMAIN). Ambas as coisas eram falsas de maneiras diferentes: a chave já não
autenticava (401 no rail Sandbox), e o sítio indicado para a revogar nunca
esteve lá.

As chaves de API do Sandbox são emitidas e revogadas na Consola de programadores,
em **https://developers.banzami.com/api-keys**. Uma chave é mostrada uma única
vez, no momento em que é criada; a partir daí só existe o seu prefixo. Se a
revisão precisar de uma credencial nova, ela é emitida aí e entregue pelo canal
privado do pedido — nunca num ficheiro versionado.

---

## App Store Connect — Registo de apps criadas

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

### Banzami (Consumer) — App Store Description

```
O Banzami é a tua carteira de pagamentos instantâneos em Kwanza.

Com o Banzami podes:
• Pagar em qualquer comerciante com QR — sem cash, sem espera
• Receber e enviar dinheiro para qualquer @banza em segundos
• Consultar o teu saldo e histórico em tempo real
• Pagar links de pagamento partilhados no WhatsApp

O Banzami é a forma como Angola paga: QR-native, wallet-native, construído para o
Kwanza sobre o protocolo BANZA.

Sem cartão. Sem IBAN. Sem confirmação manual.
Apenas @banza — e o dinheiro move-se.
```

### Banzami Business (Merchant) — App Store Description

```
O Banzami Business é o ponto de venda da nova economia angolana.

Com o Banzami Business podes:
• Receber pagamentos instantâneos via QR — imprime e aceita de imediato
• Criar e partilhar links de pagamento por WhatsApp ou SMS
• Ver cada pagamento em tempo real, sem esperar por confirmação
• Gerir o teu saldo e histórico de transacções num só lugar

Sem terminal de cartão. Sem taxas de POS. Sem espera.
Apenas QR + liquidação instantânea em Kwanza.

O Banzami Business é o operador de referência da rede de pagamentos de Angola,
construído sobre o protocolo BANZA.
```

---

## Registo de submissões

| Data | Build | App | Ambiente | Estado |
|------|-------|-----|----------|--------|
| 2026-05-18 | 1.0.0 (1) | Banzami + Banzami Business (Banza legacy) | — | ✅ Aprovado (TestFlight External) — app antiga |
| 2026-05-24 | 1.0.0 (1) | Banzami | Sandbox | 🔄 IPA pronto — pendente upload Transporter |
| 2026-06-25 | 1.0.0 (2) | Banzami | Sandbox | 🔄 Build iOS em preparação (bundle `com.banzami.consumer`, SDK source-of-truth) |

Adicionar uma linha a cada submissão.
