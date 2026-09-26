import 'package:url_launcher/url_launcher.dart';

/// Native: open [url] in the system browser. Returns false when no handler can
/// take the URL (the caller surfaces that; it never fakes success).
Future<bool> openExternalUrl(String url) =>
    launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
