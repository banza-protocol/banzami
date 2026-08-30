module github.com/banzami/banzami/services/developer-api

go 1.25.0

require (
	github.com/banzami/banzami/services/common/obs v0.0.0
	github.com/go-chi/chi/v5 v5.3.0
	github.com/jackc/pgx/v5 v5.9.2
	github.com/redis/go-redis/v9 v9.21.0
)

require (
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/sys v0.46.0 // indirect
)

require (
	github.com/banzami/banzami/services/common/email v0.0.0
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.21.0 // indirect
	golang.org/x/text v0.39.0 // indirect
)

replace github.com/banzami/banzami/services/common/obs => ../common/obs

replace github.com/banzami/banzami/services/common/email => ../common/email
