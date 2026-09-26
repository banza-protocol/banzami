// Open an external URL — a link that leaves the app (e.g. the welcome screen's
// "Criar conta Business" opening the website candidatura form).
//
// Web: a same-document navigation (location.assign). A button's onPressed runs
// AFTER the tap's short press-animation await, and by then the browser no longer
// treats window.open as user-initiated and blocks it as a popup; a same-document
// navigation is not subject to popup blocking, so it is the reliable path.
// Native: there is no browser document to drive, so the stub opens the system
// browser through url_launcher.
//
// Conditional import keeps native builds free of dart:html (mirrors
// web_location.dart / receipt_share.dart).
export 'external_link_stub.dart' if (dart.library.html) 'external_link_web.dart';
