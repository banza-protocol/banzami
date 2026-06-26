package service

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// pgConstraintCode returns the Postgres SQLSTATE code for a pg error, or "".
func pgConstraintCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}
