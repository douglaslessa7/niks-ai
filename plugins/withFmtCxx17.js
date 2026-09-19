const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * `fmt` compilado em C++17 — conserta o build com `buildReactNativeFromSource: true`.
 *
 * ⚠️ O BUG: o pod `fmt` 11.0.2 (o que o React Native 0.83.4 fixa) não compila com o
 * clang do Xcode 26 em C++20. São ~25 erros iguais a este, todos em `format-inl.h`:
 *
 *     error: call to consteval function
 *     'fmt::basic_format_string<...>::basic_format_string<FMT_COMPILE_STRING, 0>'
 *     is not a constant expression
 *
 * ⚠️ POR QUE SÓ APARECEU AGORA: enquanto o React Native vinha como binário pronto, o
 * `fmt` também vinha pronto e não era compilado aqui. Ao ligar
 * `ios.buildReactNativeFromSource: true` (Sessão 61, necessário para o dev client),
 * ele passou a ser compilado — e o build de desenvolvimento parou de subir. Mesma
 * história do `patches/react-native+0.83.4.patch`.
 *
 * ⚠️ A CORREÇÃO: o próprio `fmt` desliga o `consteval` quando o padrão é anterior a
 * C++20 (`base.h`: `#elif FMT_CPLUSPLUS < 201709L → #define FMT_USE_CONSTEVAL 0`).
 * Então basta compilar **o pod `fmt`, e só ele**, em C++17. Não muda ABI: o
 * `FMT_CONSTEVAL` só afeta a checagem em tempo de compilação do `FMT_STRING`, não a
 * assinatura das funções que saem do `format.cc`. Os outros pods continuam em C++20.
 *
 * ⚠️ NÃO ADIANTA `-DFMT_USE_CONSTEVAL=0`: o `base.h` redefine essa macro
 * incondicionalmente logo depois, e a nossa define é ignorada (com warning de
 * redefinição). Testado.
 *
 * ⚠️ NÃO ADIANTA MEXER NO xcconfig: o `react_native_post_install` grava
 * `CLANG_CXX_LANGUAGE_STANDARD` direto nos build settings de cada target do
 * `Pods.xcodeproj`, e build setting ganha de xcconfig. Por isso este hook roda
 * **depois** dele, no fim do `post_install`, e escreve no target.
 *
 * ⚠️ AO SUBIR O REACT NATIVE: confira se o `fmt` passou de 11.0.2 (o upstream
 * corrigiu isto no 11.1). Se passou, **apague este plugin**, não o mantenha por
 * inércia — é o mesmo teste do patch do Hermes.
 */

const HOOK = `
    # >>> niks: fmt em C++17 (ver plugins/withFmtCxx17.js) >>>
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt'
        target.build_configurations.each do |config|
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end
    end
    # <<< niks: fmt em C++17 <<<
`;

const MARKER = 'niks: fmt em C++17';

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf8');

      if (contents.includes(MARKER)) return cfg; // idempotente

      // Entra no FIM do `post_install`, depois do `react_native_post_install`.
      const anchor = '    )\n  end\nend';
      if (!contents.includes(anchor)) {
        throw new Error(
          '[niks-fmt] não achei o fim do post_install no ios/Podfile — o template do ' +
            'Expo mudou. Ajuste plugins/withFmtCxx17.js antes de seguir.',
        );
      }

      fs.writeFileSync(podfile, contents.replace(anchor, `    )\n${HOOK}  end\nend`));
      return cfg;
    },
  ]);
