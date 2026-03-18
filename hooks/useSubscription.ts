import { useState, useEffect } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { getCustomerInfo, isSubscribed } from '../lib/revenuecat';

export function useSubscription() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerInfo()
      .then((info) => setSubscribed(isSubscribed(info)))
      .catch(() => setSubscribed(false))
      .finally(() => setLoading(false));

    const listener = Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      setSubscribed(isSubscribed(info));
    });

    return () => listener.remove();
  }, []);

  return { subscribed, loading };
}
