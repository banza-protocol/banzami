package service

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DeletedProjects answers whether a Payment Session belongs to a Developer
// Project that has been deleted (SANDBOX-DELETE-001), so a status token issued
// before the deletion stops being a window into it.
//
// A session belongs to the Project that created it (sandbox_link_projects, 0145)
// or, for one created before attribution existed, to the Project that owns its
// synthetic Business (sandbox_businesses).
type DeletedProjects struct{ pool *pgxpool.Pool }

func NewDeletedProjects(pool *pgxpool.Pool) *DeletedProjects {
	if pool == nil {
		return nil
	}
	return &DeletedProjects{pool: pool}
}

func (d *DeletedProjects) SessionOfDeletedProject(ctx context.Context, sessionID string) (bool, error) {
	var deleted bool
	err := d.pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM payment_sessions s
		     LEFT JOIN sandbox_link_projects lp ON lp.payment_link_id = s.payment_link_id
		     LEFT JOIN sandbox_businesses sb ON sb.merchant_id = s.merchant_id
		     JOIN developer.dev_projects p ON p.id = COALESCE(lp.project_id, sb.project_id)
		    WHERE s.id::text = $1 AND p.status IN ('DELETING', 'DELETED'))`, sessionID).Scan(&deleted)
	return deleted, err
}
