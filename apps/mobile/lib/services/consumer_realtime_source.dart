/// Platform factory for the Consumer wallet realtime transport
/// (CONSUMER-HOME-REALTIME-001). Native (iOS/Android) uses an authenticated SSE
/// connection with the consumer Bearer; Web uses a same-origin BFF EventSource
/// with the opaque session cookie (no Bearer in JS). Both expose the same
/// [ConsumerRealtimeSource] contract so the shared controller is identical
/// across all three clients.
library;

export 'consumer_realtime_source_io.dart'
    if (dart.library.html) 'consumer_realtime_source_web.dart';
