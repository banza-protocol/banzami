use axum::{extract::Request, middleware::Next, response::Response};
use tracing::Instrument;
use uuid::Uuid;

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

    let span = tracing::info_span!("request", correlation_id = %cid);
    let header_val = cid.parse().ok();
    let mut response = next.run(req).instrument(span).await;
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
