import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';

export const requestAppReview = async () => {
  const isAvailable = await StoreReview.isAvailableAsync();
  if (isAvailable) {
    await StoreReview.requestReview();
  } else {
    await Linking.openURL(
      'https://apps.apple.com/app/id6760590018?action=write-review'
    );
  }
};
