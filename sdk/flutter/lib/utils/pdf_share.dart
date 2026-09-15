/// One entry point for handing the official Banzami PDF (Document Engine) to the
/// platform: the OS share sheet on iOS/Android, a browser download on Web.
///
/// The Web implementation uses `dart:html` and is only compiled into the Web
/// build via the conditional import — native builds never see it, and Web builds
/// never see `path_provider`/`share_plus` (which have no Web filesystem and were
/// the reason "Partilhar comprovativo" failed with "Não foi possível obter o
/// comprovativo." on app.banzami.com).
library;

export 'pdf_share_io.dart' if (dart.library.html) 'pdf_share_web.dart';
