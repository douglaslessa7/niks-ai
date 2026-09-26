const fs = require('node:fs');
const path = require('node:path');
const { withFinalizedMod } = require('@expo/config-plugins');

/**
 * Splash nativa do iOS — sobrescreve as 3 imagens da logo geradas pelo
 * `expo-splash-screen` pelas nossas, já no tamanho certo.
 *
 * ⚠️ O BUG: sem o `sharp-cli` GLOBAL na máquina, o `@expo/image-utils` redimensiona
 * com o Jimp, que grava o RGB PRÉ-MULTIPLICADO pelo alpha num PNG comum. O iOS lê o
 * PNG como alpha direto e escurece de novo: a logo #FF5EA8 saía acinzentada
 * (~rgb 151,56,100 no pixel mais forte). Medido pixel a pixel no
 * `SplashScreenLogo.imageset/image@3x.png` gerado.
 *
 * ⚠️ POR QUE UM PLUGIN (e não instalar o sharp-cli): o sharp só é usado se estiver
 * instalado globalmente em quem roda o prebuild — no Mac do sócio o bug voltaria.
 * Com as imagens versionadas em `assets/onboarding/splash-ios/` (RGB #FF5EA8 em
 * todo pixel + o alpha original reamostrado sem overshoot: área no @1x, bilinear no
 * @2x/@3x) o resultado é o mesmo em qualquer máquina.
 *
 * `withFinalizedMod` roda DEPOIS de todos os outros mods — inclusive o que gera as
 * imagens do splash —, então a ordem dos plugins no app.json não importa.
 *
 * Ao trocar a logo da splash: regenerar os 3 PNGs a partir de
 * `assets/onboarding/splash-logo-FF5EA8.png` (134/268/402 px) e manter
 * `imageWidth: 134` no plugin `expo-splash-screen` do app.json.
 */
const FILES = ['image.png', 'image@2x.png', 'image@3x.png'];

module.exports = function withSplashLogoFix(config) {
  return withFinalizedMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const appName = cfg.modRequest.projectName;
      const dest = path.join(iosRoot, appName, 'Images.xcassets', 'SplashScreenLogo.imageset');
      if (!fs.existsSync(dest)) {
        throw new Error(`[withSplashLogoFix] não achei ${dest} — o expo-splash-screen mudou o caminho?`);
      }
      for (const f of FILES) {
        fs.copyFileSync(path.join(projectRoot, 'assets/onboarding/splash-ios', f), path.join(dest, f));
      }
      return cfg;
    },
  ]);
};
