import { Mixpanel } from 'mixpanel-react-native';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ?? '';
const appVersion = Constants.expoConfig?.version ?? '0.0.0';

// useNative=true: usa o MixpanelSDK nativo iOS/Android (obrigatório para build Xcode)
// trackAutomaticEvents=false: controle manual de todos os eventos
export const mixpanel = new Mixpanel(token, false, true);

export async function initMixpanel(): Promise<void> {
  await mixpanel.init();
  mixpanel.registerSuperProperties({
    platform: Platform.OS,
    app_version: appVersion,
    data_source: 'app',
  });
}
