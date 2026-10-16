const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Facebook Android SDK como dependência de RUNTIME do app — pedido pelo README do
 * Paywallo (`@virex-tech/paywallo-sdk`, "Optional: Facebook `_fbp` on Android").
 *
 * O SDK do Paywallo declara o Facebook SDK como `compileOnly`. Sem o `implementation`
 * no app, `metaBridge.getAnonymousID()` devolve `null` e o Paywallo cai num
 * `PW_<uuid>` gerado localmente, que a Meta NÃO reconhece como `_fbp` — a atribuição
 * de anúncio do Facebook perde o cookie matching no Android.
 *
 * Por plugin porque a pasta `android/` é gerada (gitignorada) — editar o
 * `android/app/build.gradle` à mão some no próximo `prebuild`.
 *
 * Idempotente: não duplica a linha se o prebuild rodar de novo sem `--clean`.
 */
const DEPENDENCY = "implementation 'com.facebook.android:facebook-android-sdk:latest.release'";

module.exports = function withFacebookAndroidSdk(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults;
    if (gradle.language !== 'groovy') {
      throw new Error('withFacebookAndroidSdk: só sabe editar build.gradle em Groovy.');
    }
    if (gradle.contents.includes('com.facebook.android:facebook-android-sdk')) return cfg;
    const anchor = /dependencies\s*\{/;
    if (!anchor.test(gradle.contents)) {
      throw new Error('withFacebookAndroidSdk: bloco `dependencies {` não encontrado no app/build.gradle.');
    }
    gradle.contents = gradle.contents.replace(anchor, (m) => `${m}\n    ${DEPENDENCY}`);
    return cfg;
  });
};
