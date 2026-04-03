import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';

const APP_STORE_URL = 'https://apps.apple.com/app/id6760590018?action=write-review';

export const requestAppReview = async () => {
  try {
    const isAvailable = await StoreReview.isAvailableAsync();
    if (isAvailable) {
      await StoreReview.requestReview();
      return;
    }
  } catch {}
  await Linking.openURL(APP_STORE_URL);
};
