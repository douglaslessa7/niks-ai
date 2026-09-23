const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { withDangerousMod, withXcodeProject, withPlugins } = require('@expo/config-plugins');

/**
 * Action Extension "Escanear no NIKS" — a linha DE BAIXO do share sheet (ações),
 * ao lado de "Pesquisar no Google".
 *
 * ⚠️ POR QUE UM PLUGIN NOSSO: o `expo-share-intent` cria SÓ uma Share Extension —
 * o `NSExtensionPointIdentifier` é hardcoded em `com.apple.share-services`
 * (plugin/build/ios/writeIosShareExtensionFiles.js) e não há hook para um segundo
 * target. Aqui criamos um target irmão com `com.apple.ui-services`.
 *
 * ⚠️ REAPROVEITA TUDO: a extensão grava a MESMA chave (`<scheme>ShareKey`) no MESMO
 * App Group e abre a MESMA URL (`niks-ai://dataUrl=…`) que a Share. O módulo nativo
 * do pacote deriva a chave da própria URL, então `useShareIntent` → ShareIntentBridge
 * → `pendingShare` → `(app)/_layout` → `share-product-loading` funciona **sem uma
 * linha de JS nova**. Não distinguimos share de action no app, de propósito.
 *
 * ⚠️ O Swift NÃO é copiado para o repo: lemos o template do próprio pacote e
 * aplicamos as mesmas substituições que ele faz. Atualizar o pacote atualiza as duas
 * extensões juntas.
 *
 * Roda a cada `expo prebuild` (por isso sobrevive à regeneração de `ios/`) e é
 * idempotente: se o target já existe, não faz nada — o mesmo guard do pacote.
 */

const TARGET_NAME = 'NIKSAction';
const DISPLAY_NAME = 'Escanear no NIKS';
const BUNDLE_SUFFIX = '.action-extension';
const INFO_PLIST_FILE = 'ActionExtension-Info.plist';
const ENTITLEMENTS_FILE = 'ActionExtension.entitlements';
const VIEW_CONTROLLER_FILE = 'ShareViewController.swift';
const PRIVACY_FILE = 'PrivacyInfo.xcprivacy';
const STORYBOARD_FILE = 'MainInterface.storyboard';
const ASSETS_DIR = 'Assets.xcassets';
const ICON_SOURCE = path.join('assets', 'action-extension', 'AppIcon.appiconset');

// Mesmas regras da Share: URL, página (com o preprocessor de metatags), imagem e texto.
const ACTIVATION_RULES = {
  NSExtensionActivationSupportsWebURLWithMaxCount: 1,
  NSExtensionActivationSupportsWebPageWithMaxCount: 1,
  NSExtensionActivationSupportsImageWithMaxCount: 1,
  NSExtensionActivationSupportsText: true,
};

const firstScheme = (scheme) => (Array.isArray(scheme) ? scheme[0] : scheme);

const appGroupFor = (config) =>
  config.ios?.entitlements?.['com.apple.security.application-groups']?.[0] ||
  `group.${config.ios?.bundleIdentifier}`;

/** Template Swift do expo-share-intent, com as mesmas substituições do pacote. */
function viewControllerContent(scheme, appGroup) {
  const template = path.join(
    require.resolve('expo-share-intent/package.json'),
    '..',
    'plugin/build/ios/ShareExtensionViewController.swift',
  );
  return fs
    .readFileSync(template, 'utf8')
    .replace(/<SCHEME>/g, scheme)
    .replace(/<GROUPIDENTIFIER>/g, appGroup)
    // `true` = sem UI: a extensão grava no App Group e abre o app na hora.
    .replace(/<HIDEVIEW>/g, 'true');
}

function infoPlistContent(appGroup) {
  return plist.build({
    CFBundleName: '$(PRODUCT_NAME)',
    CFBundleDisplayName: DISPLAY_NAME,
    CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
    CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
    CFBundleExecutable: '$(EXECUTABLE_NAME)',
    CFBundleInfoDictionaryVersion: '6.0',
    CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
    NSExtension: {
      NSExtensionAttributes: {
        NSExtensionActivationRule: ACTIVATION_RULES,
        // Mesmo preprocessor da Share: lê as metatags (e o nosso `niks:image`) na
        // própria página do Safari. O arquivo vem do target da Share; aqui só
        // declaramos o nome, e copiamos o JS para a pasta deste target.
        NSExtensionJavaScriptPreprocessingFile: 'ShareExtensionPreprocessor',
      },
      // ⚠️ STORYBOARD, NÃO `NSExtensionPrincipalClass`. Todo o trabalho da
      // `ShareViewController` começa em `viewDidLoad` (→ `handleViewLoad`, porque
      // `hideView = true`). Com principal class e sem storyboard, o host NUNCA carrega
      // a view do controller: a extensão sobe, recebe a requisição e encerra sem fazer
      // nada — no simulador o botão animava e o app não abria, sem UM log sequer,
      // sem gravar no App Group e sem nenhum pedido de `openURL` no `lsd`.
      // O storyboard do pacote serve aqui sem alteração: ele usa
      // `customClass="ShareViewController" customModuleProvider="target"`, que resolve
      // a classe no módulo do target ATUAL (`NIKSAction`), não no da Share.
      NSExtensionMainStoryboard: 'MainInterface',
      NSExtensionPointIdentifier: 'com.apple.ui-services',
    },
    AppGroupIdentifier: appGroup,
  });
}

const entitlementsContent = (appGroup) =>
  plist.build({ 'com.apple.security.application-groups': [appGroup] });

const privacyContent = () =>
  plist.build({
    NSPrivacyAccessedAPITypes: [
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
        NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
      },
    ],
    NSPrivacyCollectedDataTypes: [],
    NSPrivacyTracking: false,
  });

/** Escreve os arquivos do target em ios/NIKSAction/. */
const withActionExtensionFiles = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const dir = path.join(iosRoot, TARGET_NAME);
      const scheme = firstScheme(cfg.scheme);
      if (!scheme) throw new Error('[niks-action] `scheme` ausente no app.json');
      const appGroup = appGroupFor(cfg);

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, INFO_PLIST_FILE), infoPlistContent(appGroup));
      fs.writeFileSync(path.join(dir, ENTITLEMENTS_FILE), entitlementsContent(appGroup));
      fs.writeFileSync(path.join(dir, PRIVACY_FILE), privacyContent());
      fs.writeFileSync(
        path.join(dir, VIEW_CONTROLLER_FILE),
        viewControllerContent(scheme, appGroup),
      );

      // Preprocessor e storyboard: usam os MESMOS arquivos que o plugin da Share gerou
      // (o preprocessor inclui o nosso `preprocessorInjectJS`; o storyboard resolve a
      // classe pelo módulo do target atual, então serve aqui sem alteração).
      // ⚠️ O storyboard é OBRIGATÓRIO — sem ele o `viewDidLoad` nunca dispara e a
      // extensão encerra sem fazer nada. Ver o comentário no `infoPlistContent`.
      const shareDir = path.join(iosRoot, 'NIKSShare');
      for (const file of ['ShareExtensionPreprocessor.js', STORYBOARD_FILE]) {
        const src = path.join(shareDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(dir, file));
        } else if (file === STORYBOARD_FILE) {
          throw new Error(
            `[niks-action] ${file} não encontrado em ios/NIKSShare/ — registre este ` +
              'plugin DEPOIS de expo-share-intent no app.json. Sem o storyboard a ' +
              'Action Extension abre e não faz nada.',
          );
        } else {
          console.warn(
            `[niks-action] ${file} não encontrado — registre este plugin DEPOIS de expo-share-intent no app.json`,
          );
        }
      }

      // Ícone template (preto + alpha) do share sheet.
      const iconSrc = path.join(projectRoot, ICON_SOURCE);
      const iconDst = path.join(dir, ASSETS_DIR, 'AppIcon.appiconset');
      fs.mkdirSync(iconDst, { recursive: true });
      for (const file of fs.readdirSync(iconSrc)) {
        fs.copyFileSync(path.join(iconSrc, file), path.join(iconDst, file));
      }
      fs.writeFileSync(
        path.join(dir, ASSETS_DIR, 'Contents.json'),
        JSON.stringify({ info: { version: 1, author: 'niks' } }, null, 2),
      );

      return cfg;
    },
  ]);

/** Cria o target no pbxproj. Mesmo desenho do plugin do pacote. */
const withActionExtensionTarget = (config) =>
  withXcodeProject(config, (cfg) => {
    const pbx = cfg.modResults;
    const appIdentifier = cfg.ios?.bundleIdentifier;
    const bundleId = `${appIdentifier}${BUNDLE_SUFFIX}`;

    // Idempotência: prebuild roda a cada build e não pode duplicar o target.
    if (pbx.pbxTargetByName(TARGET_NAME)) {
      console.log(`[niks-action] ${TARGET_NAME} já existe no projeto. Pulando…`);
      return cfg;
    }
    const groups = pbx.hash.project.objects.PBXGroup;
    if (Object.values(groups).some((g) => g && g.name === TARGET_NAME)) {
      console.log(`[niks-action] grupo ${TARGET_NAME} já existe. Pulando…`);
      return cfg;
    }

    // ⚠️ CAMINHOS COMPLETOS, não nomes soltos. O `addBuildPhase` do `xcode` casa os
    // arquivos pelo **path** e reaproveita o PBXBuildFile quando a string bate — com
    // nomes soltos, `PrivacyInfo.xcprivacy` e `ShareViewController.swift` colidiam com
    // os arquivos IDÊNTICOS da Share Extension, o mesmo build file ia parar em duas
    // Resources phases e o CocoaPods quebrava com
    // "Consistency issue: no parent for object `PrivacyInfo.xcprivacy`".
    // Por isso o grupo é criado SEM path (os filhos já carregam `NIKSAction/…`).
    const inTarget = (file) => `${TARGET_NAME}/${file}`;
    const sourceFiles = [inTarget(VIEW_CONTROLLER_FILE)];
    const resourceFiles = [
      inTarget(ASSETS_DIR),
      inTarget(STORYBOARD_FILE),
      inTarget('ShareExtensionPreprocessor.js'),
      inTarget(PRIVACY_FILE),
    ];
    const configFiles = [inTarget(INFO_PLIST_FILE), inTarget(ENTITLEMENTS_FILE)];

    const group = pbx.addPbxGroup(
      [...sourceFiles, ...resourceFiles, ...configFiles],
      TARGET_NAME,
      TARGET_NAME,
    );
    // ⚠️ O grupo NÃO pode ter `path`: os filhos já são `NIKSAction/<arquivo>` e o
    // `sourceTree = "<group>"` somaria os dois (`NIKSAction/NIKSAction/…`). Passar
    // `undefined` para o `addPbxGroup` também não serve — a lib grava a string
    // literal `path = undefined` no pbxproj e o Xcode falha com
    // "The file couldn't be opened because there is no such file". Então criamos com
    // path e removemos a chave depois.
    delete pbx.hash.project.objects.PBXGroup[group.uuid].path;
    const rootGroups = pbx.hash.project.objects.PBXGroup;
    for (const key of Object.keys(rootGroups)) {
      if (rootGroups[key].name === undefined && rootGroups[key].path === undefined) {
        pbx.addToPbxGroup(group.uuid, key);
      }
    }

    const target = pbx.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME);
    pbx.addBuildPhase(sourceFiles, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    pbx.addBuildPhase(resourceFiles, 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    pbx.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    // Team: o do projeto; se não houver, o do app.json.
    const team = mainAppDevelopmentTeam(pbx) || cfg.ios?.appleTeamId;

    const configurations = pbx.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key].buildSettings;
      // Casa pelo PRODUCT_NAME exato — é assim que o plugin da Share faz, e é o que
      // impede um target de sobrescrever as settings do outro.
      if (settings?.PRODUCT_NAME !== `"${TARGET_NAME}"`) continue;
      settings.INFOPLIST_FILE = `"${TARGET_NAME}/${INFO_PLIST_FILE}"`;
      settings.CODE_SIGN_ENTITLEMENTS = `"${TARGET_NAME}/${ENTITLEMENTS_FILE}"`;
      settings.CODE_SIGN_STYLE = 'Automatic';
      settings.GENERATE_INFOPLIST_FILE = 'YES';
      settings.PRODUCT_BUNDLE_IDENTIFIER = `"${bundleId}"`;
      settings.SWIFT_VERSION = '5.0';
      settings.TARGETED_DEVICE_FAMILY = '"1"'; // o app é só iPhone
      settings.CLANG_ENABLE_MODULES = 'YES';
      settings.ASSETCATALOG_COMPILER_APPICON_NAME = 'AppIcon';
      settings.MARKETING_VERSION = `"${cfg.version}"`;
      settings.CURRENT_PROJECT_VERSION = `"${cfg.ios?.buildNumber || '1'}"`;
      settings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO'; // regra do projeto
      if (team) settings.DEVELOPMENT_TEAM = team;
    }
    if (team) {
      pbx.addTargetAttribute('DevelopmentTeam', team);
      pbx.addTargetAttribute('DevelopmentTeam', team, target);
    }

    return cfg;
  });

/** Team do app (ignora targets de extensão/widget) — mesma heurística do pacote. */
function mainAppDevelopmentTeam(pbx) {
  const configurations = pbx.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    const settings = configurations[key].buildSettings;
    const name = settings?.PRODUCT_NAME ?? '';
    if (name.includes('Extension') || name.includes('Action') || name.includes('Widget')) continue;
    if (settings?.DEVELOPMENT_TEAM) return settings.DEVELOPMENT_TEAM;
  }
  return undefined;
}

/** Registra o target para o EAS (o projeto builda pelo Xcode, mas isto evita surpresa). */
const withActionExtensionEasConfig = (config) => {
  const bundleId = `${config.ios?.bundleIdentifier}${BUNDLE_SUFFIX}`;
  const extensions =
    config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? [];
  if (!extensions.some((e) => e.targetName === TARGET_NAME)) {
    extensions.push({
      targetName: TARGET_NAME,
      bundleIdentifier: bundleId,
      entitlements: { 'com.apple.security.application-groups': [appGroupFor(config)] },
    });
  }
  config.extra = config.extra ?? {};
  config.extra.eas = config.extra.eas ?? {};
  config.extra.eas.build = config.extra.eas.build ?? {};
  config.extra.eas.build.experimental = config.extra.eas.build.experimental ?? {};
  config.extra.eas.build.experimental.ios = config.extra.eas.build.experimental.ios ?? {};
  config.extra.eas.build.experimental.ios.appExtensions = extensions;
  return config;
};

module.exports = (config) =>
  withPlugins(config, [
    withActionExtensionEasConfig,
    withActionExtensionFiles,
    withActionExtensionTarget,
  ]);
