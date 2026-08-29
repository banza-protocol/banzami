// Split Sessions — SUPERSEDED by Collections (BANZA ADR-036).
//
// Split Sessions is retired. Migration `0042_split_sessions` is intentionally
// left unapplied (recorded but never materialised — the tables are absent by
// design), so the previous handlers reached missing tables and returned an
// internal 500 that leaked the database error. This module replaces them with a
// single, deliberate response:
//
//   410 Gone  ·  code SPLIT_SESSIONS_SUPERSEDED
//   "Split Sessions foi substituído por Collections."
//
// The handler touches NO repository, service, SQL query or database table, so it
// can never produce a missing-table 500. It is registered in main.rs with `any`
// (all HTTP methods) on `/internal/v1/splits` and a wildcard `/internal/v1/splits/*rest`
// so every former path (list/create, detail, pay, and any nested/method variant)
// resolves here instead of falling through to a generic internal error.
//
// Collections is the replacement product direction. This response references it
// by name only — it does not invent a replacement URL or contract.

use crate::error::ApiError;

/// Every legacy `/internal/v1/splits*` request → 410 SPLIT_SESSIONS_SUPERSEDED.
/// State-free and database-free by construction.
pub async fn superseded() -> ApiError {
    ApiError::gone(
        "SPLIT_SESSIONS_SUPERSEDED",
        "Split Sessions foi substituído por Collections.",
    )
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        routing::any,
        Router,
    };
    use tower::util::ServiceExt; // oneshot

    // Mirror the exact registration used in main.rs so the test exercises the
    // real routing (all methods + nested wildcard), not just the bare handler.
    fn app() -> Router {
        Router::new()
            .route("/internal/v1/splits", any(super::superseded))
            .route("/internal/v1/splits/*rest", any(super::superseded))
    }

    async fn body_string(resp: axum::response::Response) -> String {
        let bytes = axum::body::to_bytes(resp.into_body(), 64 * 1024)
            .await
            .unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    // The full matrix of former Split Sessions surfaces: list/create, detail,
    // pay, malformed identifiers, unsupported methods, and nested legacy paths.
    fn cases() -> Vec<(&'static str, &'static str)> {
        vec![
            ("POST", "/internal/v1/splits"),                      // create
            ("GET", "/internal/v1/splits"), // unsupported method on create path
            ("GET", "/internal/v1/splits/abc123"), // detail
            ("POST", "/internal/v1/splits/abc123/pay"), // pay
            ("GET", "/internal/v1/splits/%20%20"), // malformed id
            ("GET", "/internal/v1/splits/not-a-uuid"), // malformed id
            ("PUT", "/internal/v1/splits/abc123"), // unsupported method on detail
            ("DELETE", "/internal/v1/splits/abc123"), // unsupported method on detail
            ("PATCH", "/internal/v1/splits/abc123"), // unsupported method
            ("POST", "/internal/v1/splits/abc123/anything/deep"), // nested legacy path
            ("HEAD", "/internal/v1/splits/abc123"), // HEAD
        ]
    }

    #[tokio::test]
    async fn every_split_route_returns_410_superseded_without_db_or_leak() {
        for (method, path) in cases() {
            let resp = app()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(path)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();

            // (1) 410 Gone — never 500, never a fall-through internal error.
            assert_eq!(
                resp.status(),
                StatusCode::GONE,
                "{method} {path} must be 410 Gone"
            );

            let body = body_string(resp).await;

            // (2) machine-readable code + the exact Portuguese message.
            assert!(
                body.contains("SPLIT_SESSIONS_SUPERSEDED"),
                "{method} {path} body missing code: {body}"
            );
            assert!(
                body.contains("Split Sessions foi substituído por Collections."),
                "{method} {path} body missing message: {body}"
            );

            // (3) no leak of SQL / table names / migration ids / stack traces /
            //     internal implementation detail. The lowercase table names would
            //     only appear via a SQL error — the intended code is uppercase
            //     (SPLIT_SESSIONS_SUPERSEDED), so check the RAW body for them.
            for raw_leak in ["split_sessions", "split_participants", "0042"] {
                assert!(
                    !body.contains(raw_leak),
                    "{method} {path} response leaked '{raw_leak}': {body}"
                );
            }
            let lower = body.to_lowercase();
            for forbidden in [
                "migration",
                "relation",
                "does not exist",
                "sqlx",
                "postgres",
                "panic",
                "select ",
                "insert ",
                "internal_error",
                "transfer",
            ] {
                assert!(
                    !lower.contains(forbidden),
                    "{method} {path} response leaked '{forbidden}': {body}"
                );
            }
        }
    }

    #[tokio::test]
    async fn response_envelope_is_the_standard_error_shape() {
        let resp = app()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/internal/v1/splits")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::GONE);
        let v: serde_json::Value = serde_json::from_str(&body_string(resp).await).unwrap();
        assert_eq!(v["error"]["code"], "SPLIT_SESSIONS_SUPERSEDED");
        assert_eq!(
            v["error"]["message"],
            "Split Sessions foi substituído por Collections."
        );
    }
}
