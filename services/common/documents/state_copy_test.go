package documents

import (
	"strings"
	"testing"
)

// A7-33. The document said "Confirmado… debitado e creditado" whatever the
// status: CANCELLED, EXPIRED and anything unknown read "Confirmado", and a
// reversed payment kept the confirmed badge and footer. Only a confirmed
// operation may claim the money moved.
func TestReceiptView_ClaimsOnlyWhatItsStatusAllows(t *testing.T) {
	base := ReceiptData{OperationKind: OperationPayment, Perspective: PerspectiveConsumer, AmountMinor: 100000, Currency: "AOA"}
	for _, tc := range []struct {
		status, state, badge string
		confirmed            bool
	}{
		{"COMPLETED", "Confirmado", "Pagamento confirmado", true},
		{"CONFIRMED", "Confirmado", "Pagamento confirmado", true},
		{"REVERSED", "Revertido", "Operação revertida", false},
		{"CANCELLED", "Cancelado", "Não concluída", false},
		{"EXPIRED", "Expirado", "Não concluída", false},
		{"PENDING", "Pendente", "Não concluída", false},
		{"SOMETHING_NEW", "Por confirmar", "Não concluída", false},
	} {
		d := base
		d.Status = tc.status
		v := toView(d)
		if v.State != tc.state || v.HeroBadge != tc.badge || v.StateConfirmed != tc.confirmed {
			t.Errorf("%s: state %q badge %q confirmed %v; want %q %q %v",
				tc.status, v.State, v.HeroBadge, v.StateConfirmed, tc.state, tc.badge, tc.confirmed)
		}
		if !tc.confirmed && (strings.Contains(v.FooterLine, "debitado") || strings.Contains(v.HeroLine, "confirmad")) {
			t.Errorf("%s: a document that is not confirmed still claims the money moved: %q / %q", tc.status, v.HeroLine, v.FooterLine)
		}
	}
}
