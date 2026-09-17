import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

const APP_STORE_URL = 'https://apps.apple.com/app/id6760590018?action=write-review';

const ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package ?? 'br.com.niksai.app';

/** Página do app na loja da plataforma atual, usada como fallback da review nativa. */
export const storeListingUrl = () =>
  Platform.OS === 'android'
    ? `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
    : APP_STORE_URL;

/** Tela de gerenciamento de assinaturas da loja da plataforma atual. */
export const manageSubscriptionsUrl = () =>
  Platform.OS === 'android'
    ? `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`
    : 'itms-apps://apps.apple.com/account/subscriptions';

export const requestAppReview = async () => {
  try {
    const isAvailable = await StoreReview.isAvailableAsync();
    if (isAvailable) {
      await StoreReview.requestReview();
      return;
    }
  } catch {}
  await Linking.openURL(storeListingUrl());
};
