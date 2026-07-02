import Flutter
import UIKit

/// On a scene-based iOS lifecycle, a COLD-start deep link is delivered here in
/// `connectionOptions` — a universal link in `.userActivities`, a custom-scheme
/// link in `.urlContexts` — NOT via `scene(_:continue:)` / `scene(_:openURLContexts:)`.
/// Flutter's scene delegate does not bridge these launch payloads to plugins that
/// use the classic UIApplicationDelegate API (e.g. app_links), so
/// `getInitialLink()` returns nil and a cold tap opens the app on home, while a
/// warm tap (which arrives via `scene(_:continue:)`) works.
///
/// Re-dispatch the launch payloads through the same path the warm links use, so
/// app_links captures the initial link on cold start too.
class SceneDelegate: FlutterSceneDelegate {
  override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)

    let activities = connectionOptions.userActivities
    let urlContexts = connectionOptions.urlContexts
    guard !activities.isEmpty || !urlContexts.isEmpty else { return }

    // Defer to the next runloop turn so the Flutter engine + plugins finished
    // attaching in super before we forward the launch link.
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      for activity in activities {
        self.scene(scene, continue: activity)
      }
      if !urlContexts.isEmpty {
        self.scene(scene, openURLContexts: urlContexts)
      }
    }
  }
}
