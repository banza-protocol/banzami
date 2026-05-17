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
```

### TestFlight — What to Test

```
Bem-vindo ao beta da Banzami!

O que testar:
1. Registo e login com @banza e PIN
2. Consultar saldo e histórico de transacções
3. Enviar dinheiro para outro @banza
4. Pagar via QR code
5. Pagar via link de pagamento

O que reportar:
- Erros ou crashes
- Botões que não respondem
- Valores ou saldos incorrectos no ecrã
- Problemas com o leitor de QR
- Problemas com pagamentos

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
Bem-vindo ao beta da Banzami Business!

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

Obrigado por fazeres parte do beta Banzami Business!
```

---

## Onde colocar

### App Store Review Notes

1. Abre https://appstoreconnect.apple.com/
2. Selecciona a app (`Banzami` ou `Banzami Business`)
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

As contas abaixo estão provisionadas no ambiente sandbox.
**Não eliminar** — são necessárias para futuras submissões.

### Consumer (Banzami)

| Campo    | Valor     |
|----------|-----------|
| Handle   | review    |
| PIN      | 123456    |
| Consumer ID | 64080866-4c92-4358-ad20-2233a8db8428 |

### Merchant (Banzami Business)

| Campo       | Valor                                                                     |
|-------------|---------------------------------------------------------------------------|
| Merchant ID | b7f088ce-ca5e-4810-8624-d503da4d83dc                                      |
| API Key     | bz_test_87a03087cf16455da674da1e44c1c0c8eca8bab761fb49a69966151198e741e2 |
| Ambiente    | SANDBOX                                                                   |

---

## Registo de submissões

| Data | Build | Apps | Estado |
|------|-------|------|--------|
|      |       |      |        |

Adicionar uma linha a cada submissão.
