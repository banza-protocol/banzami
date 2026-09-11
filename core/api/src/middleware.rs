use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use tracing::Instrument;
use uuid::Uuid;

/// Constant-time byte comparison. The length short-circuit is acceptable for a
/// fixed-length shared secret (mirrors the gateway's subtle.ConstantTimeCompare);
/// the per-byte loop does not early-return on the first mismatch.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Reusable internal service-to-service authentication for a Core `/internal`
/// route group. Requires the shared `X-Internal-Key` header to match the
/// configured service key (constant-time). It FAILS CLOSED and rejects BEFORE the
/// handler runs — no source, refund, merchant, ledger or database lookup happens
/// on an unauthenticated request. The error carries no credential, expected
/// value, header value, database detail or stack trace, and the header is never
/// logged (the request log records only method/path/status).
///
/// - key unset  → 503 UNAVAILABLE (the boundary is disabled; never fail open)
/// - missing/invalid header → 401 UNAUTHORIZED
/// - valid key → the request proceeds to the merchant-scoped handler
///
/// Wired via `from_fn` capturing the key, applied with `route_layer` to a route
/// group; reusable for other Core internal groups later.
pub async fn internal_service_auth(key: Option<String>, req: Request, next: Next) -> Response {
    let expected = match key.as_deref() {
        Some(k) if !k.is_empty() => k,
        _ => {
            // Neutral message — never reveal the header/credential mechanism.
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error":{"code":"UNAVAILABLE","message":"service unavailable"}})),
            )
                .into_response();
        }
    };
    let provided = req
        .headers()
        .get("X-Internal-Key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !constant_time_eq(provided.as_bytes(), expected.as_bytes()) {
        // Neutral message — do not reveal that a particular header/credential guards this route.
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error":{"code":"UNAUTHORIZED","message":"unauthorized"}})),
        )
            .into_response();
    }
    next.run(req).await
}

/// The gate on every Core `/internal` route that has no narrower credential of
/// its own: `CORE_INTERNAL_KEY`, exactly as [`internal_service_auth`] — except a
/// request from this container's own loopback.
///
/// Until 2026-09-11 only refunds (and payee validation) were authenticated, so
/// any container on the Sandbox network could post a transfer, credit a wallet
/// or complete a settlement by calling Core directly. The four Go services now
/// send the key on every Core call. Loopback stays open because only a process
/// inside this container's network namespace can originate from it — that is
/// `docker exec` on the host (the operator and the Sandbox harnesses), which
/// already holds every secret; another container never can.
pub async fn internal_service_auth_or_loopback(
    key: Option<String>,
    req: Request,
    next: Next,
) -> Response {
    let from_loopback = req
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|c| c.0.ip().is_loopback())
        .unwrap_or(false);
    if from_loopback {
        return next.run(req).await;
    }
    internal_service_auth(key, req, next).await
}

#[cfg(test)]
mod internal_auth_tests {
    use axum::{
        body::Body,
        http::{Request as HttpRequest, StatusCode},
        routing::get,
        Router,
    };
    use tower::util::ServiceExt;

    // A sentinel handler: if it runs, the request reached "the lookup". Tests
    // assert it NEVER runs for an unauthenticated request (rejected before it).
    async fn reached() -> &'static str {
        "REACHED_HANDLER"
    }

    fn app(key: Option<String>) -> Router {
        let auth = axum::middleware::from_fn(
            move |req: axum::extract::Request, next: axum::middleware::Next| {
                let key = key.clone();
                async move { super::internal_service_auth(key, req, next).await }
            },
        );
        Router::new().route("/x", get(reached)).route_layer(auth)
    }

    async fn body_str(resp: axum::response::Response) -> String {
        let b = axum::body::to_bytes(resp.into_body(), 65536).await.unwrap();
        String::from_utf8(b.to_vec()).unwrap()
    }

    fn req(header: Option<&str>) -> HttpRequest<Body> {
        let mut b = HttpRequest::builder().method("GET").uri("/x");
        if let Some(h) = header {
            b = b.header("X-Internal-Key", h);
        }
        b.body(Body::empty()).unwrap()
    }

    #[tokio::test]
    async fn key_unset_fails_closed_503_before_handler() {
        let resp = app(None).oneshot(req(Some("anything"))).await.unwrap();
        assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = body_str(resp).await;
        assert!(body.contains("UNAVAILABLE"));
        assert!(!body.contains("REACHED_HANDLER"), "handler must not run");
    }

    #[tokio::test]
    async fn missing_header_rejected_401_before_handler() {
        let resp = app(Some("secret".into())).oneshot(req(None)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
        assert!(!body_str(resp).await.contains("REACHED_HANDLER"));
    }

    #[tokio::test]
    async fn invalid_header_rejected_401_before_handler() {
        let resp = app(Some("secret".into()))
            .oneshot(req(Some("wrong")))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
        assert!(!body_str(resp).await.contains("REACHED_HANDLER"));
    }

    #[tokio::test]
    async fn valid_key_reaches_handler() {
        let resp = app(Some("secret".into()))
            .oneshot(req(Some("secret")))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        assert_eq!(body_str(resp).await, "REACHED_HANDLER");
    }

    // RT04C §3 — least-privilege: a route guarded by a DEDICATED credential (the
    // payee-validation key) rejects EVERY other credential, including the broad
    // generic internal key, a merchant JWT, a webhook secret and a consumer JWT.
    // None reach the handler; each is a distinct value from the expected key, so
    // the constant-time compare fails closed with a neutral 401.
    #[tokio::test]
    async fn dedicated_key_rejects_every_other_credential() {
        let payee_key = "payee-validation-secret";
        for other in [
            "core-internal-generic-secret", // the broad generic internal key
            "Bearer eyJhbGciOiJIUzI1NiJ9.merchant.jwt", // merchant JWT
            "whsec_webhook_signing_secret", // webhook secret
            "Bearer eyJhbGciOiJIUzI1NiJ9.consumer.jwt", // consumer JWT
            "bz_test_sk_developerkey",      // external developer key
        ] {
            let resp = app(Some(payee_key.into()))
                .oneshot(req(Some(other)))
                .await
                .unwrap();
            assert_eq!(
                resp.status(),
                StatusCode::UNAUTHORIZED,
                "credential {other:?} must be rejected"
            );
            assert!(
                !body_str(resp).await.contains("REACHED_HANDLER"),
                "handler must not run for {other:?}"
            );
        }
    }

    #[tokio::test]
    async fn error_bodies_leak_no_credential_or_detail() {
        for (key, hdr) in [
            (None, Some("x")),
            (Some("secret".to_string()), Some("wrong")),
            (Some("secret".to_string()), None),
        ] {
            let resp = app(key).oneshot(req(hdr)).await.unwrap();
            let body = body_str(resp).await.to_lowercase();
            for bad in [
                "secret",
                "core_internal_key",
                "x-internal-key",
                "expected",
                "select ",
                "postgres",
                "panic",
            ] {
                assert!(!body.contains(bad), "error leaked {bad:?}: {body}");
            }
        }
    }
}

/// Propagates or generates the X-Correlation-ID (the cross-service FLOW id) and
/// enters a tracing span carrying it, so every log emitted while handling the
/// request can be joined with the gateway/public-api/admin-api logs of the same
/// flow. Preserves an incoming id; only generates one when absent.
pub async fn correlation_id(mut req: Request, next: Next) -> Response {
    let cid = req
        .headers()
        .get("X-Correlation-ID")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_owned())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    req.extensions_mut().insert(CorrelationId(cid.clone()));

    let header_val = cid.parse().ok();
    let span = tracing::info_span!("request", correlation_id = %cid);
    let method = req.method().clone();
    let path = req.uri().path().to_owned();

    // Emit exactly one request event inside the correlation span (skipping infra
    // probes) so core logs carry correlation_id and join the Go services' logs.
    let mut response = async move {
        let resp = next.run(req).await;
        if path != "/health" && path != "/metrics" {
            tracing::info!(method = %method, path = %path, status = resp.status().as_u16(), "request");
        }
        resp
    }
    .instrument(span)
    .await;

    if let Some(val) = header_val {
        response.headers_mut().insert("X-Correlation-ID", val);
    }
    response
}

/// Request extension exposing the flow correlation id to handlers.
#[derive(Clone)]
#[allow(dead_code)]
pub struct CorrelationId(pub String);

/// Propagates or generates an X-Request-ID header for distributed tracing.
///
/// If the incoming request carries X-Request-ID, it is echoed back on the
/// response. If not, a fresh UUID v4 is generated. All inbound requests
/// receive the header in their response so callers can correlate logs.
pub async fn request_id(mut req: Request, next: Next) -> Response {
    let request_id = req
        .headers()
        .get("X-Request-ID")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_owned())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // Inject into request extensions so handlers can read it.
    req.extensions_mut().insert(RequestId(request_id.clone()));

    let mut response = next.run(req).await;

    // Echo back on the response.
    if let Ok(val) = request_id.parse() {
        response.headers_mut().insert("X-Request-ID", val);
    }

    response
}

/// Request extension providing the correlation ID to any handler.
#[derive(Clone)]
#[allow(dead_code)]
pub struct RequestId(pub String);

#[cfg(test)]
mod general_gate_tests {
    use axum::{
        body::Body,
        extract::ConnectInfo,
        http::{Request as HttpRequest, StatusCode},
        routing::post,
        Router,
    };
    use std::net::SocketAddr;
    use tower::util::ServiceExt;

    async fn reached() -> &'static str {
        "REACHED_HANDLER"
    }

    fn app() -> Router {
        let auth = axum::middleware::from_fn(
            move |req: axum::extract::Request, next: axum::middleware::Next| async move {
                super::internal_service_auth_or_loopback(Some("core-key".into()), req, next).await
            },
        );
        Router::new()
            .route("/internal/v1/transfers", post(reached))
            .route_layer(auth)
    }

    fn req(peer: &str, key: Option<&str>) -> HttpRequest<Body> {
        let mut b = HttpRequest::builder()
            .method("POST")
            .uri("/internal/v1/transfers");
        if let Some(k) = key {
            b = b.header("X-Internal-Key", k);
        }
        let mut r = b.body(Body::empty()).unwrap();
        r.extensions_mut()
            .insert(ConnectInfo(peer.parse::<SocketAddr>().unwrap()));
        r
    }

    #[tokio::test]
    async fn another_container_without_the_key_is_refused() {
        let resp = app().oneshot(req("172.20.0.9:40000", None)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn another_container_with_a_wrong_key_is_refused() {
        let resp = app()
            .oneshot(req("172.20.0.9:40000", Some("nope")))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn a_service_with_the_key_is_accepted() {
        let resp = app()
            .oneshot(req("172.20.0.9:40000", Some("core-key")))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn this_containers_loopback_is_accepted() {
        let resp = app().oneshot(req("127.0.0.1:50000", None)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn no_connection_info_is_not_loopback() {
        let mut r = req("127.0.0.1:50000", None);
        r.extensions_mut().remove::<ConnectInfo<SocketAddr>>();
        let resp = app().oneshot(r).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
}

// ---------------------------------------------------------------------------
// Operator attribution (A5-13)
// ---------------------------------------------------------------------------

tokio::task_local! {
    /// The BANZADMIN operator on whose behalf this request acts, when admin-api
    /// says so (`X-Banzami-Operator`). Attribution, not authority: the route
    /// group is already service-authenticated.
    static OPERATOR: Option<String>;
}

/// Carries `X-Banzami-Operator` (a UUID, nothing else) into the request's task,
/// where `risk::audit` reads it. Operator actions were recorded as the literal
/// "ADMIN" — freezes, compliance decisions, settlements, payouts — so the only
/// record of WHO acted was admin-api's own log, which a disconnect could lose
/// (A5-03, now fixed) and which core never saw.
pub async fn operator(req: Request, next: Next) -> Response {
    let op = req
        .headers()
        .get("X-Banzami-Operator")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s.trim()).ok())
        .map(|u| u.to_string());
    OPERATOR.scope(op, next.run(req)).await
}

/// The operator this request acts for, if admin-api named one.
pub fn current_operator() -> Option<String> {
    OPERATOR.try_with(|o| o.clone()).ok().flatten()
}

/// Runs `f` as a request acting for `op` — for tests of what is recorded.
#[cfg(test)]
pub async fn with_operator<F: std::future::Future>(op: Option<String>, f: F) -> F::Output {
    OPERATOR.scope(op, f).await
}
