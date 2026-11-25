import { Mixpanel } from 'mixpanel-react-native';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { aparelhoInterno } from './aparelhoInterno';

export const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ?? '';
const appVersion = Constants.expoConfig?.version ?? '0.0.0';

// useNative=true: usa o MixpanelSDK nativo iOS/Android (obrigatório para build Xcode)
// trackAutomaticEvents=false: controle manual de todos os eventos
export const mixpanel = new Mixpanel(token, false, true);

/** Super properties fixas. O `reset()` do logout apaga TODAS as super properties — por isso
 *  elas são registradas de novo logo depois dele (ver `MixpanelProvider`). */
export function superPropertiesBase(): Record<string, unknown> {
  // `usuario_interno` base: build de desenvolvimento OU aparelho marcado como do time (Keychain,
  // lib/mixpanel/aparelhoInterno.ts). Com sessão, o e-mail da conta também conta
  // (lib/mixpanel/perfil.ts). Re-registrada depois de todo reset (logout).
  return { platform: Platform.OS, app_version: appVersion, data_source: 'app', usuario_interno: __DEV__ || aparelhoInterno() };
}

export async function initMixpanel(): Promise<void> {
  await mixpanel.init();
  // Log do SDK nativo (print → console do Xcode/devicectl) só em desenvolvimento.
  if (__DEV__) mixpanel.setLoggingEnabled(true);
  mixpanel.registerSuperProperties(superPropertiesBase());
}
