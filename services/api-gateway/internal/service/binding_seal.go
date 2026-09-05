package service

// Project binding seal (ADR-055).
//
// A Project's financial binding is mutable only while no payer-facing payment
// artifact has ever been issued against it. The first such artifact seals it,
// permanently — after that the payee behind an issued link or session can never
// be reinterpreted.
//
// Seal and artifact cannot share one transaction: the binding lives in the
// operator database and the artifact is created by Core over HTTP. So the seal
// happens FIRST, and the failure mode is deliberately over-sealing — a binding
// sealed for an artifact that then failed to create costs an operator
// correction window, while the reverse costs an artifact whose payee can still
// move underneath it.

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrBindingMoved means the ACTIVE binding is no longer the payee the caller
// resolved — it was corrected between introspection and artifact creation. The
// caller must refuse the artifact rather than issue it against a stale payee.
var ErrBindingMoved = errors.New("project binding changed during the request")

// BindingSealService seals a Project's ACTIVE binding.
type BindingSealService struct{ pool *pgxpool.Pool }

func NewBindingSealService(pool *pgxpool.Pool) *BindingSealService {
	return &BindingSealService{pool: pool}
}

// SealForArtifact marks the Project's ACTIVE binding as carrying a payment
// artifact, and confirms in the same statement that the binding still names the
// payee the caller is about to use.
//
// One UPDATE does both jobs. The row lock it takes is what makes a concurrent
// rebind safe: the rebind either commits first — in which case the payee no
// longer matches and this returns ErrBindingMoved — or it waits and then finds
// the row sealed and refuses. There is no interleaving that issues an artifact
// for one owner while the binding ends as another.
//
// Idempotent: sealing an already-sealed binding is a no-op that still matches,
// so two concurrent first artifacts both proceed against the same payee.
func (s *BindingSealService) SealForArtifact(ctx context.Context, projectID, merchantID, walletID string) error {
	if s == nil || s.pool == nil {
		// Fail closed. Without the operator database the seal cannot be proven,
		// and an unprovable seal must not let an artifact through.
		return errors.New("binding seal is unavailable")
	}
	var id string
	err := s.pool.QueryRow(ctx,
		`UPDATE developer.dev_project_sandbox_binding
		    SET artifact_created = true, updated_at = now()
		  WHERE project_id = $1
		    AND state = 'ACTIVE'
		    AND merchant_id = $2
		    AND wallet_id = $3
		RETURNING id::text`,
		projectID, merchantID, walletID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrBindingMoved
	}
	return err
}
