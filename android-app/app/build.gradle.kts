plugins {
    id("com.android.application")
}

val releaseStorePath = providers.environmentVariable("COAST_KEYSTORE_FILE").orNull
val releaseStorePassword = providers.environmentVariable("COAST_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("COAST_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("COAST_KEY_PASSWORD").orNull
val releaseSigningReady = listOf(
    releaseStorePath,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword,
).all { !it.isNullOrBlank() }

android {
    namespace = "com.elementeracoast.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.elementeracoast.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1-a2"

        buildConfigField("String", "COAST_URL", "\"https://app.elementeracoast.com\"")
        buildConfigField("String", "UPDATE_MANIFEST_URL", "\"https://app.elementeracoast.com/public/app-update.json\"")
        buildConfigField("String", "UPDATE_PAGE_URL", "\"https://app.elementeracoast.com/updates\"")
        buildConfigField("String", "RELEASE_NAME", "\"A2.0\"")
        buildConfigField("String", "EXPECTED_WEB_LABEL", "\"A2 / P6.4+A1\"")
        buildConfigField("String", "EXPECTED_WEB_COMMIT", "\"f3f3acd\"")
        buildConfigField("String", "EXPECTED_MCP_VERSION", "\"1.9.2\"")
    }

    signingConfigs {
        if (releaseSigningReady) {
            create("release") {
                storeFile = file(requireNotNull(releaseStorePath))
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ""
            isDebuggable = true
        }
        getByName("release") {
            isMinifyEnabled = false
            if (releaseSigningReady) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        warningsAsErrors = false
    }
}
