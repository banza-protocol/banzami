//! ADR-065 architecture guard: the Business Receive Point is an OPERATOR concept
//! (the Go gateway owns its tables and its mint idempotency). Core stays generic —
//! it sees only a Payment Session with an opaque reference. This test fails the
//! moment Core learns the receive point exists, e.g. `if purpose ==
//! "business_receive_point"` or a branch on the BUSINESS_RECEIVE_POINT reference
//! type. Core may store that reference (it is opaque data), never branch on it.

use std::fs;
use std::path::Path;

fn scan(dir: &Path, forbidden: &[&str], hits: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if path.is_dir() {
            if name == "target" || name == ".git" {
                continue;
            }
            scan(&path, forbidden, hits);
        } else if name.ends_with(".rs") {
            // The guard names the forbidden tokens; skip itself.
            if name == "receive_point_isolation_tests.rs" {
                continue;
            }
            let Ok(src) = fs::read_to_string(&path) else {
                continue;
            };
            for line in src.lines() {
                for tok in forbidden {
                    if line.contains(tok) {
                        hits.push(format!("{}: {}", path.display(), line.trim()));
                    }
                }
            }
        }
    }
}

#[test]
fn core_has_no_receive_point_special_case() {
    // The manifest dir is core/api; its parent is the whole Rust core (api + crates).
    let core_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("core root")
        .to_path_buf();

    // The receive-point purpose special-case and its reference-type literal. Core
    // must contain NEITHER — the reference reaches it as opaque text it never reads.
    let forbidden = ["business_receive_point", "BUSINESS_RECEIVE_POINT"];
    let mut hits = Vec::new();
    scan(&core_root, &forbidden, &mut hits);

    assert!(
        hits.is_empty(),
        "Core learned about the Business Receive Point — it must stay generic \
         (ADR-065). Offending lines:\n{}",
        hits.join("\n")
    );
}
