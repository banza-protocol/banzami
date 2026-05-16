import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// Load release signing credentials from key.properties (gitignored) or environment variables.
// key.properties structure:
//   storeFile=/absolute/path/to/banzami-release.jks
//   storePassword=...
//   keyAlias=banzami
//   keyPassword=...
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

fun keystoreProp(name: String): String =
    keystoreProperties.getProperty(name) ?: System.getenv(name) ?: ""

android {
    namespace = "com.banzami.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    signingConfigs {
        create("release") {
            val storeFilePath = keystoreProp("storeFile")
            if (storeFilePath.isNotEmpty()) {
                storeFile = file(storeFilePath)
            }
            storePassword = keystoreProp("storePassword")
            keyAlias     = keystoreProp("keyAlias")
            keyPassword  = keystoreProp("keyPassword")
        }
    }

    defaultConfig {
        // applicationId is overridden per flavor below — safe fallback.
        applicationId = "com.banzami.consumer"
        minSdk = 24 // Android 7.0 — drops TLS 1.0/1.1-only devices, enforces modern cipher suites
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Two flavors from one codebase, each with its own applicationId so
    // they install side-by-side on the same device.
    flavorDimensions += "app"
    productFlavors {
        create("consumer") {
            dimension = "app"
            applicationId = "com.banzami.consumer"
            resValue("string", "app_name", "Banzami")
        }
        create("merchant") {
            dimension = "app"
            applicationId = "com.banzami.merchant"
            resValue("string", "app_name", "Banzami Comerciante")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}
