// Same-origin navigation for the Web dual-context switch (ADR-066). A context
// switch is a real navigation between the Consumer shell (`/`) and the Business
// shell (`/business`): both authorities live in the BFF session cookie, so the
// destination shell boots straight into its context with no re-authentication,
// and a fresh boot guarantees zero cross-context state leakage.
//
// Conditional import keeps native builds clean (the stub is a no-op there).
export 'web_location_stub.dart' if (dart.library.html) 'web_location_web.dart';
