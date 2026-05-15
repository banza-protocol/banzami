# FCM Push Notifications — Flutter iOS (Multi-Flavor)

Guia completo de implementação de push notifications com Firebase Cloud Messaging num projeto Flutter com múltiplos flavors iOS (ex: `consumer` e `merchant`). Baseado na implementação real do Banzami.

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Configurar o Firebase](#2-configurar-o-firebase)
3. [Adicionar dependências Flutter](#3-adicionar-dependências-flutter)
4. [Configurar o Apple Developer Portal](#4-configurar-o-apple-developer-portal)
5. [Gerar e carregar a chave APNs](#5-gerar-e-carregar-a-chave-apns)
6. [Estrutura de xcconfig por flavor](#6-estrutura-de-xcconfig-por-flavor)
7. [Configurar o AppDelegate](#7-configurar-o-appdelegate)
8. [Script de cópia do GoogleService-Info.plist](#8-script-de-cópia-do-googleservice-infoplist)
9. [PushNotificationService — serviço Dart](#9-pushnotificationservice--serviço-dart)
10. [Integrar no ecrã principal](#10-integrar-no-ecrã-principal)
11. [Testar end-to-end](#11-testar-end-to-end)
12. [Backend — enviar FCM do servidor Go](#12-backend--enviar-fcm-do-servidor-go)
13. [Erros comuns e soluções](#13-erros-comuns-e-soluções)

---

## 1. Pré-requisitos

- Flutter com flavors configurados (ex: `consumer`, `merchant`)
- Conta Apple Developer com acesso a Certificates, Identifiers & Profiles
- Projeto Firebase criado (um por flavor, ou um projeto com múltiplas apps)
- Xcode com o dispositivo físico iOS conectado (APNs **não funciona em simulador**)

---

## 2. Configurar o Firebase

### 2.1 Criar apps no Firebase Console

Para cada flavor, criar uma app iOS separada no Firebase Console:

- **Bundle ID do consumer:** `com.banzami.consumer`
- **Bundle ID do merchant:** `com.banzami.merchant`

Fazer o download do `GoogleService-Info.plist` de cada uma e guardar em:

```
ios/
  config/
    consumer/
      GoogleService-Info.plist
    merchant/
      GoogleService-Info.plist
```

> **Nota:** Estes ficheiros são seguros para commitar no repositório — não contêm segredos críticos, apenas identificadores públicos do Firebase.

### 2.2 Verificar o BUNDLE_ID no plist

Confirmar que o `BUNDLE_ID` dentro de cada plist corresponde ao bundle identifier do flavor:

```xml
<key>BUNDLE_ID</key>
<string>com.banzami.consumer</string>
```

---

## 3. Adicionar dependências Flutter

No `pubspec.yaml`:

```yaml
dependencies:
  firebase_core: ^3.x.x
  firebase_messaging: ^15.x.x
  flutter_local_notifications: ^18.x.x
```

Correr `flutter pub get` e depois `cd ios && pod install`.

---

## 4. Configurar o Apple Developer Portal

Este passo é crítico e frequentemente esquecido.

### 4.1 Registar os App IDs

Em [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles → Identifiers:

1. Clicar em **+** → selecionar **App IDs** → tipo **App**
2. Preencher o Bundle ID exato (ex: `com.banzami.consumer`)
3. Na lista de capabilities, **activar Push Notifications**
4. Guardar

Repetir para cada flavor.

> **Erro comum:** Se o App ID não existir no portal, o Xcode não consegue criar um provisioning profile com a entitlement `aps-environment`, e o APNs token nunca chega — mesmo que tudo o resto esteja correto.

### 4.2 Entitlements por configuração (debug vs release)

O valor `aps-environment` **tem de corresponder ao tipo de certificado** usado na build:

| Build | Certificado | `aps-environment` correto |
|---|---|---|
| Debug / `flutter run` | Development | `development` |
| Release / TestFlight / App Store | Distribution | `production` |

**Usar um único `Runner.entitlements` com `production` em builds debug faz `getAPNSToken()` retornar `null`** — o iOS recusa a ligação ao APNs de produção com certificados de desenvolvimento.

A solução é criar dois ficheiros de entitlements separados:

**`ios/Runner/Runner-Debug.entitlements`** (debug builds):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>development</string>
</dict>
</plist>
```

**`ios/Runner/Runner.entitlements`** (release builds):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>aps-environment</key>
    <string>production</string>
</dict>
</plist>
```

Cada xcconfig debug aponta para o ficheiro correto via `CODE_SIGN_ENTITLEMENTS` (ver secção 6.4).

---

## 5. Gerar e carregar a chave APNs

### 5.1 Gerar a chave

Em [developer.apple.com](https://developer.apple.com) → Keys → +:

- Nome: qualquer (ex: `Banzami APNs Key`)
- Activar **Apple Push Notifications service (APNs)**
- Fazer download do ficheiro `.p8` — **só pode ser descarregado uma vez**
- Guardar o **Key ID** e o **Team ID**

> A chave APNs **nunca vai para o repositório**. Guardar em local seguro (ex: `~/Downloads`).

### 5.2 Carregar no Firebase

No Firebase Console → Project Settings → Cloud Messaging → Apple app configuration:

Para cada app iOS:
- Selecionar **APNs Authentication Key**
- Fazer upload do ficheiro `.p8`
- Preencher o Key ID e o Team ID

Uma única chave APNs serve para **todas as apps** do mesmo Team ID.

---

## 6. Estrutura de xcconfig por flavor

O problema mais comum em projetos multi-flavor é o `PRODUCT_BUNDLE_IDENTIFIER` errado em build time. O Xcode resolve os xcconfig por hierarquia — os ficheiros raiz têm prioridade sobre o `Flutter/Consumer.xcconfig`.

### 6.1 Estrutura de ficheiros

```
ios/
  Flutter/
    Consumer.xcconfig      ← definições partilhadas do flavor
    Merchant.xcconfig
    Debug.xcconfig         ← gerado pelo Flutter
    Release.xcconfig       ← gerado pelo Flutter
  Consumer.debug.xcconfig  ← usado pelo Xcode para Debug-consumer
  Consumer.release.xcconfig
  Consumer.profile.xcconfig
  Merchant.debug.xcconfig
  Merchant.release.xcconfig
  Merchant.profile.xcconfig
```

### 6.2 Conteúdo dos ficheiros raiz

**`ios/Consumer.debug.xcconfig`:**

```xcconfig
#include "Flutter/Debug.xcconfig"
#include "Pods/Target Support Files/Pods-Runner/Pods-Runner.debug-consumer.xcconfig"
PRODUCT_BUNDLE_IDENTIFIER = com.banzami.consumer
FLUTTER_TARGET = lib/main_consumer.dart
APP_FLAVOR = consumer
APP_DISPLAY_NAME = Banzami
```

**`ios/Consumer.release.xcconfig`:**

```xcconfig
#include "Flutter/Release.xcconfig"
#include "Pods/Target Support Files/Pods-Runner/Pods-Runner.release-consumer.xcconfig"
PRODUCT_BUNDLE_IDENTIFIER = com.banzami.consumer
FLUTTER_TARGET = lib/main_consumer.dart
APP_FLAVOR = consumer
APP_DISPLAY_NAME = Banzami
```

**`ios/Consumer.profile.xcconfig`:**

```xcconfig
#include "Flutter/Release.xcconfig"
#include "Pods/Target Support Files/Pods-Runner/Pods-Runner.profile-consumer.xcconfig"
PRODUCT_BUNDLE_IDENTIFIER = com.banzami.consumer
FLUTTER_TARGET = lib/main_consumer.dart
APP_FLAVOR = consumer
APP_DISPLAY_NAME = Banzami
```

Repetir o padrão para `Merchant.*xcconfig` com `com.banzami.merchant`.

### 6.3 Verificar que o Xcode usa estes ficheiros

Em Xcode → projeto Runner → Info → Configurations, cada configuração (Debug-consumer, Release-consumer, etc.) deve apontar para o xcconfig correspondente. Verificar no `project.pbxproj` se as referências existem.

> **Erro comum:** Os ficheiros xcconfig estavam a ser criados em `ios/Flutter/` em vez de `ios/`. O `PBXGroup` no `project.pbxproj` que referencia estes ficheiros não tem `path` property — o que significa que o Xcode os procura na raiz de `ios/`, não numa subdirectoria.

### 6.4 Apontar o entitlements correto via xcconfig

Para que cada configuração de build use o ficheiro de entitlements correto (ver secção 4.2), adicionar `CODE_SIGN_ENTITLEMENTS` aos xcconfig de debug de cada flavor:

**`ios/Consumer.debug.xcconfig`** e **`ios/Merchant.debug.xcconfig`:**
```xcconfig
CODE_SIGN_ENTITLEMENTS = Runner/Runner-Debug.entitlements
```

Os xcconfig de release **não precisam** desta linha — o Xcode usa `Runner/Runner.entitlements` por defeito (definido no `project.pbxproj`).

> Esta abordagem evita modificar o `project.pbxproj` directamente e mantém a separação debug/release limpa no controlo de versão.

---

## 7. Configurar o AppDelegate

O padrão `FlutterImplicitEngineDelegate` (usado em projetos Flutter modernos) interfere com o method swizzling automático do Firebase Messaging. É necessário registar o APNs explicitamente.

**`ios/Runner/AppDelegate.swift`:**

```swift
import Flutter
import FirebaseCore
import FirebaseMessaging
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    FirebaseApp.configure()
    // Registar explicitamente para APNs — necessário quando se usa FlutterImplicitEngineDelegate
    // porque o method swizzling do Firebase não captura este callback automaticamente.
    application.registerForRemoteNotifications()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }

  // Encaminhar o APNs token para o Firebase (o swizzling pode não o capturar).
  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    print("APNs registration failed: \(error)")
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }
}
```

**Porquê este AppDelegate resolve o problema:**

O Firebase Messaging usa method swizzling para interceptar o `didRegisterForRemoteNotificationsWithDeviceToken` automaticamente. No entanto, o `FlutterImplicitEngineDelegate` altera a cadeia de delegates de forma que o swizzling pode não ser acionado. Ao chamar `registerForRemoteNotifications()` explicitamente no `didFinishLaunching` e ao encaminhar o token manualmente via `Messaging.messaging().apnsToken`, garantimos que o Firebase recebe sempre o APNs token.

---

## 8. Script de cópia do GoogleService-Info.plist

O Xcode só embute um `GoogleService-Info.plist` na app. Para multi-flavor, é necessário um Run Script phase que copia o plist correto para o bundle após o build.

**`ios/switch_firebase_config.sh`:**

```bash
#!/bin/bash
# Copia o GoogleService-Info.plist correto para o bundle compilado.
# Este Run Script deve correr APÓS "Copy Bundle Resources".

set -e

if [[ "${PRODUCT_BUNDLE_IDENTIFIER}" == "com.banzami.merchant" ]]; then
  SOURCE="${SRCROOT}/config/merchant/GoogleService-Info.plist"
else
  SOURCE="${SRCROOT}/config/consumer/GoogleService-Info.plist"
fi

if [ ! -f "$SOURCE" ]; then
  echo "error: GoogleService-Info.plist not found at $SOURCE"
  exit 1
fi

DEST="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/GoogleService-Info.plist"
cp -v "$SOURCE" "$DEST"
```

Adicionar em Xcode → Target Runner → Build Phases → **+** → New Run Script Phase, com o conteúdo:

```bash
"${SRCROOT}/switch_firebase_config.sh"
```

Garantir que este phase está **depois** de "Copy Bundle Resources".

---

## 9. PushNotificationService — serviço Dart

Um serviço singleton que centraliza toda a lógica FCM.

**`lib/services/push_notification_service.dart`:**

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

// Handler de background/terminated — Firebase mostra a notificação automaticamente
// quando a mensagem tem notification payload.
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage _) async {
  await Firebase.initializeApp();
}

class PushNotificationService {
  PushNotificationService._();

  static final _messaging   = FirebaseMessaging.instance;
  static final _localPlugin = FlutterLocalNotificationsPlugin();
  static bool  _initialized = false;

  // Chamar uma vez no startup, depois de Firebase.initializeApp().
  static Future<void> initialize() async {
    if (_initialized) return;

    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwin  = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localPlugin.initialize(
      const InitializationSettings(android: android, iOS: darwin, macOS: darwin),
    );

    // Mensagens em foreground: mostrar notificação local para o utilizador ver
    // mesmo com a app aberta.
    FirebaseMessaging.onMessage.listen((msg) {
      debugPrint('FCM onMessage: ${msg.notification?.title} / ${msg.notification?.body}');
      _showLocal(msg);
    });

    // iOS: apresentar notificações FCM mesmo com a app em foreground.
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    _initialized = true;
  }

  // Pede permissão de notificações (iOS obrigatório, Android 13+ também).
  // Retorna true se o utilizador aceitou.
  static Future<bool> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert:       true,
      badge:       true,
      sound:       true,
      provisional: false,
    );
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
           settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  // Retorna o FCM token, aguardando o APNs token primeiro (iOS).
  // Retorna null se o APNs não estiver disponível (simulador, entitlement em falta, etc).
  static Future<String?> getToken() async {
    final apns = await _getApnsToken();
    if (apns == null) {
      debugPrint('FCM: APNs token unavailable — skipping getToken()');
      return null;
    }
    return _messaging.getToken();
  }

  // Subscrever a um tópico (ex: "merchant_<id>" ou "consumer_<id>").
  // No-op se o APNs token não estiver disponível.
  static Future<void> subscribeToTopic(String topic) async {
    final apns = await _getApnsToken();
    if (apns == null) {
      debugPrint('FCM: APNs token unavailable — skipping subscribeToTopic($topic)');
      return;
    }
    await _messaging.subscribeToTopic(topic);
  }

  static Future<void> unsubscribeFromTopic(String topic) =>
      _messaging.unsubscribeFromTopic(topic);

  // iOS regista com o APNs de forma assíncrona após a permissão ser concedida.
  // Aguarda até 30 s pelo token, retorna null em caso de timeout.
  static Future<String?> _getApnsToken() async {
    for (var i = 0; i < 30; i++) {
      final apns = await _messaging.getAPNSToken();
      if (apns != null) return apns;
      await Future.delayed(const Duration(seconds: 1));
    }
    return null;
  }

  static Future<void> _showLocal(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    final data        = message.data;
    final channelId   = data['channel_id']   as String? ?? 'banzami_push';
    final channelName = data['channel_name'] as String? ?? 'Banzami';

    await _localPlugin.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          channelName,
          importance: Importance.high,
          priority:   Priority.high,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
    );
  }
}
```

**Pontos críticos:**

- `_getApnsToken()` faz polling durante 30 s — o iOS regista com o APNs de forma assíncrona após a permissão ser concedida. Tentar obter o FCM token antes do APNs token estar disponível causa um crash (`apns-token-not-set`).
- `subscribeToTopic()` e `getToken()` verificam o APNs token antes de proceder — falham graciosamente em vez de crashar.
- `setForegroundNotificationPresentationOptions` é necessário para o iOS mostrar notificações FCM nativas quando a app está em foreground. Sem isto, as notificações chegam silenciosamente e só são visíveis através do `flutter_local_notifications`.

---

## 10. Integrar no ecrã principal

No ecrã principal de cada flavor, chamar as notificações após o login:

```dart
@override
void initState() {
  super.initState();
  WidgetsBinding.instance.addObserver(this);
  // addPostFrameCallback garante que o contexto está disponível
  WidgetsBinding.instance.addPostFrameCallback((_) => _startNotifications());
}

Future<void> _startNotifications() async {
  final session = context.read<SessionService>().session!;

  // Aguardar permissão ANTES de subscrever ou obter token
  final settings = await FirebaseMessaging.instance.requestPermission(
    alert: true, badge: true, sound: true,
  );
  debugPrint('FCM permission: ${settings.authorizationStatus}');

  // Subscrever ao tópico do utilizador (para notificações dirigidas)
  await PushNotificationService.subscribeToTopic('consumer_${session.consumerId}');

  // Obter token para usar no Firebase Console (testes) ou no backend
  final token = await PushNotificationService.getToken();
  debugPrint('FCM TOKEN: $token');
}
```

**Porquê `addPostFrameCallback`:** o `context.read<>()` não é seguro em `initState()` — o widget ainda não foi inserido na árvore de providers. O callback garante que o primeiro frame já foi renderizado.

---

## 11. Testar end-to-end

### 11.1 Obter o FCM token

Correr a app e fazer login. O token aparece nos logs:

```
flutter: FCM TOKEN (consumer): dbHiKih4pUylvuTGncHqm7:APA91b...
```

### 11.2 Enviar notificação de teste pelo Firebase Console

1. Firebase Console → **Messaging**
2. **Nova campanha** → **Notifications**
3. Passo 1: preencher título e corpo da notificação
4. No painel direito (preview), clicar em **"Envoyer un message de test"** / **"Send test message"**
5. Colar o FCM token no campo e clicar em **+** para o adicionar
6. Clicar em **Tester**

### 11.3 Verificar comportamento por estado da app

| Estado da app | Comportamento esperado |
|---|---|
| Background / fechada | Notificação nativa do iOS (FCM entrega automaticamente) |
| Foreground | `flutter_local_notifications` mostra a notificação local |
| Foreground (iOS) | `setForegroundNotificationPresentationOptions` mostra a notificação nativa também |

---

## 12. Backend — enviar FCM do servidor Go

O teste do Firebase Console envia a notificação **directamente do Firebase para o dispositivo** — o backend não está envolvido. Quando um pagamento real é capturado, é o backend que tem de invocar a API FCM.

### 12.1 Porquê o backend precisa de enviar FCM

```
[Firebase Console "Test"] → Firebase → APNs → dispositivo   ← NÃO envolve o backend
[Pagamento real]          → EMIS callback → Go gateway
                                                ↓
                                        [confirmar pagamento]
                                                ↓
                                       [enviar FCM] ← este passo é necessário
                                                ↓
                                        Firebase → APNs → dispositivo
```

### 12.2 Service account Firebase

1. Firebase Console → **Project Settings** → **Service accounts**
2. Clicar em **"Generate new private key"** → descarregar o ficheiro JSON
3. **Nunca commitar este ficheiro** — contém credenciais de serviço com acesso total ao projeto Firebase
4. Minificar o JSON (opcional mas recomendado para env vars): `jq -c . < service-account.json`

### 12.3 Implementação Go — `notify.FCMService`

**`internal/notify/fcm.go`:**

```go
package notify

import (
    "context"
    "fmt"
    "log/slog"

    firebase "firebase.google.com/go/v4"
    "firebase.google.com/go/v4/messaging"
    "google.golang.org/api/option"
)

type FCMService struct {
    client *messaging.Client
}

// NewFCMService inicializa o cliente FCM a partir do JSON do service account.
// Retorna nil (desabilitado, sem erro) quando credentialsJSON está vazio —
// o gateway arranca normalmente em dev sem Firebase configurado.
func NewFCMService(ctx context.Context, credentialsJSON string) (*FCMService, error) {
    if credentialsJSON == "" {
        return nil, nil
    }
    app, err := firebase.NewApp(ctx, nil, option.WithCredentialsJSON([]byte(credentialsJSON)))
    if err != nil {
        return nil, fmt.Errorf("fcm: init firebase app: %w", err)
    }
    client, err := app.Messaging(ctx)
    if err != nil {
        return nil, fmt.Errorf("fcm: init messaging client: %w", err)
    }
    return &FCMService{client: client}, nil
}

// SendToMerchant publica uma notificação push no tópico FCM "merchant_<merchantID>".
// Erros são logged mas nunca propagados — push notifications são best-effort
// e não devem afectar o fluxo de pagamento.
func (s *FCMService) SendToMerchant(ctx context.Context, merchantID, title, body string) {
    if s == nil {
        return
    }
    _, err := s.client.Send(ctx, &messaging.Message{
        Notification: &messaging.Notification{Title: title, Body: body},
        Android: &messaging.AndroidConfig{Priority: "high"},
        APNS: &messaging.APNSConfig{
            Payload: &messaging.APNSPayload{
                Aps: &messaging.Aps{Sound: "default"},
            },
        },
        Topic: "merchant_" + merchantID,
    })
    if err != nil {
        slog.Error("fcm: merchant notification failed",
            "merchant_id", merchantID, "error", err)
    }
}
```

### 12.4 Disparar após confirmação de pagamento

No handler que processa o callback do provider de pagamento (ex: EMIS), após o `MarkUsed` do payment link:

```go
if link, mlErr := h.paymentLinks.MarkUsed(r.Context(), payment.PaymentLinkID); mlErr != nil {
    slog.Error("acquiring: failed to mark payment link used", ...)
} else {
    // Goroutine — não bloqueia a resposta ao provider.
    // context.Background() porque o request context é cancelado após o handler retornar.
    go h.fcm.SendToMerchant(context.Background(), link.MerchantID,
        "Pagamento recebido",
        notifAmount(payment.AmountMinor, payment.Currency),
    )
}
```

### 12.5 Variável de ambiente

Adicionar ao `docker-compose` ou ao sistema de secrets da infraestrutura:

```yaml
FIREBASE_CREDENTIALS_JSON: '{"type":"service_account","project_id":"banzami",...}'
```

> O valor é o JSON do service account numa única linha (minificado). Em produção, usar um gestor de secrets (ex: variável de ambiente segura no servidor, não em ficheiro).

Na VM, adicionar ao ficheiro `.env` ou diretamente ao `docker run`:

```bash
export FIREBASE_CREDENTIALS_JSON="$(jq -c . < ~/service-account.json)"
docker compose -f docker-compose.full.yml up -d api-gateway
```

---

## 13. Erros comuns e soluções

### `apns-token-not-set` (crash ao subscrever tópico)

**Causa:** `subscribeToTopic()` ou `getToken()` chamados antes do APNs token estar disponível.

**Solução:** Usar o polling `_getApnsToken()` antes de qualquer chamada FCM que dependa do APNs.

---

### APNs token sempre `null` mesmo após 30 s

Verificar por esta ordem:

1. **Bundle ID errado no xcconfig** — o App ID registado no portal não corresponde ao bundle ID que a app usa em runtime. Confirmar `PRODUCT_BUNDLE_IDENTIFIER` no xcconfig ativo.

2. **Xcconfig no sítio errado** — se o `PBXGroup` no `project.pbxproj` que referencia os xcconfig não tiver `path` property, os ficheiros têm de estar na raiz de `ios/`, não em `ios/Flutter/`.

3. **App ID não registado no portal** — `com.banzami.consumer` ou `com.banzami.merchant` pode não existir em Identifiers. Criar com Push Notifications activado.

4. **AppDelegate sem forwarding** — se usar `FlutterImplicitEngineDelegate`, o method swizzling do Firebase pode não capturar o APNs token. Adicionar `registerForRemoteNotifications()` e `Messaging.messaging().apnsToken = deviceToken` explicitamente.

5. **DerivedData em cache** — após mudar o bundle ID, fazer `rm -rf ~/Library/Developer/Xcode/DerivedData/Runner-*` antes de rebuildar.

---

### Notificação não aparece no Firebase Console após inserir o token

**Causa:** O TTL (Time To Live) pode estar a 0 e o dispositivo não estar ligado no momento do envio. Usar TTL de pelo menos 60 s para testes.

---

### `debugPrint` não definido no serviço

**Causa:** Falta o import do foundation.

**Solução:** Adicionar `import 'package:flutter/foundation.dart';` no ficheiro.

---

### APNs token `null` em builds debug após configurar `aps-environment = production`

**Causa:** O iOS recusa emitir APNs tokens de produção para apps assinadas com certificados de desenvolvimento. Se `Runner.entitlements` tiver `production` e a build for debug (certificado development), `getAPNSToken()` devolve sempre `null`.

**Solução:** Criar `Runner-Debug.entitlements` com `aps-environment = development` e apontar os xcconfigs de debug para ele via `CODE_SIGN_ENTITLEMENTS = Runner/Runner-Debug.entitlements` (ver secções 4.2 e 6.4).

---

### Notificações funcionam no Firebase Console mas não chegam em pagamentos reais

**Causa:** O teste do Firebase Console bypassa o backend — envia directamente Firebase → APNs → dispositivo. Para pagamentos reais, é o backend (Go gateway) que tem de invocar a API FCM após confirmar o pagamento. Se o backend não tiver código FCM, as notificações nunca chegam independentemente da configuração Firebase estar correcta.

**Solução:** Implementar `notify.FCMService` no gateway e chamar `SendToMerchant` após confirmar cada pagamento (ver secção 12).

---

### Token FCM aparece truncado nos logs

O FCM token tem ~150 caracteres. Se aparecer cortado, copiar directamente do terminal ou usar um campo de texto maior. O token completo é necessário para o Firebase Console — um token incompleto é rejeitado silenciosamente.

---

## Resumo da ordem de implementação

```
── Flutter / iOS ───────────────────────────────────────────────────────────────

 1. Firebase Console        → criar app iOS por flavor, descarregar plists
 2. Apple Developer         → registar App IDs com Push Notifications
 3. Apple Developer         → gerar chave APNs .p8
 4. Firebase Console        → carregar chave APNs em Cloud Messaging settings
 5. Flutter pubspec         → adicionar firebase_messaging + flutter_local_notifications
 6. ios/config/             → organizar plists por flavor
 7. ios/*.xcconfig          → criar ficheiros de configuração por flavor
 8. ios/*.debug.xcconfig    → CODE_SIGN_ENTITLEMENTS = Runner/Runner-Debug.entitlements
 9. Runner-Debug.entitlements → aps-environment = development
10. Runner.entitlements     → aps-environment = production
11. switch_firebase_config.sh → script de cópia do plist correto
12. AppDelegate.swift       → registerForRemoteNotifications + apnsToken forwarding
13. PushNotificationService → serviço Dart com polling APNs
14. MainScreen              → requestPermission + subscribeToTopic + getToken

── Backend Go ──────────────────────────────────────────────────────────────────

15. go get firebase.google.com/go/v4
16. internal/notify/fcm.go  → FCMService com SendToMerchant
17. config.go               → FirebaseCredentialsJSON (env FIREBASE_CREDENTIALS_JSON)
18. main.go                 → notify.NewFCMService + injectar em Dependencies
19. handler/acquiring.go    → SendToMerchant após confirmação de pagamento
20. docker-compose.full.yml → FIREBASE_CREDENTIALS_JSON: ${FIREBASE_CREDENTIALS_JSON:-}

── Produção ────────────────────────────────────────────────────────────────────

21. Firebase Console        → Service accounts → Generate new private key
22. VM                      → export FIREBASE_CREDENTIALS_JSON="$(jq -c . < sa.json)"
23. VM                      → redeployar o container banzami_gateway
24. Teste                   → disparar pagamento real e verificar notificação
```
