// When the web app is embedded in another page (e.g. the banzami.com hero phone),
// hide the standalone SANDBOX corner ribbon — the host page shows its own. The
// ribbon still shows when app.banzami.com is opened directly.
(function () {
  try {
    if (window.self !== window.top) {
      var r = document.getElementById('bz-sandbox-ribbon');
      if (r) r.remove();
    }
  } catch (_) {
    // Cross-origin access to window.top identity never throws; ignore just in case.
  }
})();
