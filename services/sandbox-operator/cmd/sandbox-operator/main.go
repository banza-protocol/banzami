// Command sandbox-operator is a minimal, stateless BANZA L0 sandbox operator
// runtime for the Banzami reference operator.
//
// It exposes only the two read-only endpoints required to pass the BANZA L0
// (Protocol Sandbox) pre-certification checks:
//
//	GET /health
//	GET /.well-known/banza/operator.json
//
// It performs NO financial operations: no wallets, transfers, payment requests,
// settlement, federation, or money movement. It has no database, no keys, no
// certificate, and no registry coupling. `simulated=true` and
// `production_allowed=false` are hard-coded invariants — this binary cannot
// represent a production operator.
//
// L1+ capabilities are intentionally absent and declared false in the manifest.
package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"
)

const (
	defaultPort = "8085"

	operatorID      = "banzami-sandbox"
	operatorName    = "Banzami Sandbox Operator"
	operatorURL     = "https://sandbox-operator.banzami.com"
	protocolVersion = "1.0"
	environment     = "sandbox"
)

// healthResponse is the body of GET /health (BANZA L0: HEALTH-001, HEALTH-002).
type healthResponse struct {
	Status            string `json:"status"`
	Environment       string `json:"environment"`
	Simulated         bool   `json:"simulated"`
	ProductionAllowed bool   `json:"production_allowed"`
}

// capabilities declares the operator's feature support. At L0 every capability
// is false: this is a stateless L0 conformance operator with no wallet/QR/
// settlement/collections endpoints.
//
// supports_payment_intents (ADR-037) and supports_collections (ADR-036) are
// Level-2 capabilities of the Banzami *reference operator* (core-api + gateway),
// not of this L0 sandbox operator — hence false here. They are declared for
// BANZA-schema completeness; a production capabilities surface advertises them
// where the feature is actually served.
type capabilities struct {
	SupportsWallets         bool `json:"supports_wallets"`
	SupportsQR              bool `json:"supports_qr"`
	SupportsSettlement      bool `json:"supports_settlement"`
	SupportsPaymentIntents  bool `json:"supports_payment_intents"`
	SupportsCollections     bool `json:"supports_collections"`
}

// operatorManifest is the body of GET /.well-known/banza/operator.json
// (BANZA L0: MAN-001, MAN-002, MAN-003). certification_level is a *declared*
// level, not a certification — no certificate is issued or served.
type operatorManifest struct {
	OperatorID         string       `json:"operator_id"`
	OperatorName       string       `json:"operator_name"`
	OperatorURL        string       `json:"operator_url"`
	ProtocolVersion    string       `json:"protocol_version"`
	CertificationLevel int          `json:"certification_level"`
	Environment        string       `json:"environment"`
	Simulated          bool         `json:"simulated"`
	ProductionAllowed  bool         `json:"production_allowed"`
	Capabilities       capabilities `json:"capabilities"`
}

// writeJSON encodes v as indented JSON with a 200 status.
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, healthResponse{
		Status:            "ok",
		Environment:       environment,
		Simulated:         true,
		ProductionAllowed: false,
	})
}

func handleManifest(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, operatorManifest{
		OperatorID:         operatorID,
		OperatorName:       operatorName,
		OperatorURL:        operatorURL,
		ProtocolVersion:    protocolVersion,
		CertificationLevel: 0,
		Environment:        environment,
		Simulated:          true,
		ProductionAllowed:  false,
		Capabilities: capabilities{
			SupportsWallets:    false,
			SupportsQR:         false,
			SupportsSettlement: false,
		},
	})
}

func newMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /.well-known/banza/operator.json", handleManifest)
	// L1 conformance-shaped sandbox surface — additive, simulated, in-memory,
	// and OFF unless SANDBOX_L1_ENABLED is set. The public L0 sandbox behaviour
	// (health + manifest) is unchanged when disabled. See l1.go.
	if l1Enabled() {
		registerL1(mux, newL1Store())
	}
	return mux
}

func main() {
	port := os.Getenv("SANDBOX_OPERATOR_PORT")
	if port == "" {
		port = defaultPort
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           newMux(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("banzami sandbox operator (BANZA L0) starting",
		"port", port,
		"environment", environment,
		"simulated", true,
		"production_allowed", false)

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}
