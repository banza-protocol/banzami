import Flutter
import UIKit

/// Registers two channels on binaryMessenger:
///
/// - MethodChannel  `banzami/screen_security` — `setSecure(bool)` is a no-op on
///   iOS; FLAG_SECURE is Android-only. The method always succeeds.
///
/// - EventChannel `banzami/capture_state` — emits `Bool` whenever
///   `UIScreen.capturedDidChangeNotification` fires, plus once immediately on
///   listen with the current `UIScreen.main.isCaptured` value.
final class BanzamiScreenSecurityPlugin: NSObject, FlutterPlugin, FlutterStreamHandler {

  private var eventSink: FlutterEventSink?

  // MARK: - FlutterPlugin

  static func register(with registrar: FlutterPluginRegistrar) {
    let instance = BanzamiScreenSecurityPlugin()

    let methodChannel = FlutterMethodChannel(
      name: "banzami/screen_security",
      binaryMessenger: registrar.messenger()
    )
    methodChannel.setMethodCallHandler { call, result in
      if call.method == "setSecure" {
        result(nil)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }

    let eventChannel = FlutterEventChannel(
      name: "banzami/capture_state",
      binaryMessenger: registrar.messenger()
    )
    eventChannel.setStreamHandler(instance)

    // Retain the plugin so ARC doesn't free it while the channel is active.
    registrar.publish(instance)
  }

  // MARK: - FlutterStreamHandler

  func onListen(withArguments arguments: Any?,
                eventSink events: @escaping FlutterEventSink) -> FlutterError? {
    self.eventSink = events

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(captureStateChanged),
      name: UIScreen.capturedDidChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(screenshotTaken),
      name: UIApplication.userDidTakeScreenshotNotification,
      object: nil
    )

    // Emit current capture state immediately so the Dart side is up to date.
    events(UIScreen.main.isCaptured)
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    NotificationCenter.default.removeObserver(self)
    eventSink = nil
    return nil
  }

  // MARK: - Private

  @objc private func captureStateChanged() {
    eventSink?(UIScreen.main.isCaptured)
  }

  @objc private func screenshotTaken() {
    // Emit a string sentinel distinct from the Bool capture-state events so
    // the Dart layer can display a different warning for screenshots vs recording.
    eventSink?("screenshot")
  }
}
