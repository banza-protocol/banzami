# banzami-go

Official Go SDK for the Banzami payment platform.

> **Status: Scaffold** — Core webhook verification and payment links are production-ready. Additional resource clients (transfers, QR codes, consumer wallets) are pending implementation.

## Installation

```bash
go get github.com/banzami/banzami-go
```

## Quick start

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/banzami/banzami-go/banzami"
)

func main() {
    client := banzami.NewClient(banzami.ClientOptions{
        APIKey:        "bz_live_...",
        WebhookSecret: "whsec_...",
    })

    // Create a payment link
    link, err := client.PaymentLinks.Create(context.Background(), banzami.CreatePaymentLinkInput{
        MerchantID:  "mer_01jqx...",
        WalletID:    "wlt_01jqx...",
        AmountMinor: func(v int64) *int64 { return &v }(150000),
        Currency:    "AOA",
        Description: "Donation campaign DOA-ABC12345",
    })
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Payment link: https://pay.banzami.org/%s\n", link.Slug)
}
```

## Webhook verification

```go
// HTTP handler (net/http)
func webhookHandler(w http.ResponseWriter, r *http.Request) {
    rawBody, _ := io.ReadAll(r.Body)

    event, err := client.Webhooks.ConstructEvent(rawBody, r.Header.Get(banzami.SignatureHeader))
    if err != nil {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    switch event.Type {
    case banzami.EventPaymentLinkPaid:
        // handle payment confirmation
    case banzami.EventTransactionCompleted:
        // handle transaction
    }

    w.WriteHeader(http.StatusOK)
}
```

## Environment detection

```go
client := banzami.NewClient(banzami.ClientOptions{APIKey: "bz_test_..."})
fmt.Println(client.IsSandbox()) // true
```

The client automatically routes to the sandbox gateway (`https://sandbox-api.banzami.org`) when a `bz_test_` key is provided. No additional configuration is needed.

## Running tests

```bash
cd sdk/go
go test ./banzami/...
```

## Webhook signature spec

The canonical signature format is documented in [docs/standards/webhook-signature-spec.md](../../docs/standards/webhook-signature-spec.md). This SDK implements the spec identically to the api-gateway signer.
