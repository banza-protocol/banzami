//! Withdrawn features have no route in core (A4-13).
//!
//! The public surfaces of these features were removed long ago — payment
//! requests (RA-057), paying a structured QR (RA-053), the merchant "verified"
//! flag (RA-122) — but core kept serving them to anyone holding the internal
//! key, and each took its authority from the request body: the payer of a
//! payment request, the payer handle of a QR payment, the wallet a reserve
//! drew on. No Go service called them. A route with no caller is authority
//! nobody reviews, so they are gone, and this test keeps them gone.
//!
//! The router is assembled inline in `main.rs`, so the check reads its source.

const MAIN: &str = include_str!("../main.rs");

const WITHDRAWN: &[&str] = &[
    "/internal/v1/payment-requests",
    "/internal/v1/qr/pay",
    "/internal/v1/merchants/:id/verified",
    "/internal/v1/consumer-deposits",
    "/internal/v1/payment-sessions/settle-by-interface",
    "/internal/v1/identity/resolve",
    "/internal/v1/consumer-wallets/:id/reserve",
    "/internal/v1/consumer-wallets/:id/release",
    "/internal/v1/consumer-wallets/:id/commit-reserved",
    "/internal/v1/merchant-profiles/by-merchant",
    "/internal/v1/merchant-profiles/:id/social-links",
];

/// Every path literal the router mounts, from `.route("<path>", …)` calls,
/// whether the literal sits on the same line or the next.
fn mounted() -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = MAIN;
    while let Some(i) = rest.find(".route(") {
        rest = &rest[i + ".route(".len()..];
        let Some(open) = rest.find('"') else { break };
        // Only whitespace may sit between `.route(` and the path literal.
        if !rest[..open].trim().is_empty() {
            continue;
        }
        let after = &rest[open + 1..];
        let Some(close) = after.find('"') else { break };
        out.push(after[..close].to_string());
    }
    out
}

#[test]
fn no_withdrawn_feature_is_mounted() {
    let mounted = mounted();
    assert!(
        mounted.len() > 100,
        "the route scan found only {} routes — it no longer reads main.rs correctly",
        mounted.len()
    );
    let revived: Vec<&String> = mounted
        .iter()
        .filter(|p| WITHDRAWN.iter().any(|w| p.as_str() == *w || p.starts_with(&format!("{w}/"))))
        .collect();
    assert!(revived.is_empty(), "withdrawn routes are mounted again: {revived:?}");
}

#[test]
fn the_scan_sees_routes_that_are_mounted() {
    // A scan that found nothing would pass the test above vacuously.
    let mounted = mounted();
    for live in [
        "/internal/v1/payment-links",
        "/internal/v1/qr/static",
        "/internal/v1/consumer-pay-links/:code/pay",
        "/internal/v1/splits/*rest",
    ] {
        assert!(mounted.iter().any(|p| p == live), "the scan missed {live}");
    }
}
