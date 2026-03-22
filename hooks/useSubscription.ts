import { useState, useEffect } from 'react';
import { getCustomerInfo, isPremium } from '../lib/revenuecat';

export function useSubscription() {
  const [isSubscribed, setIsSubscribed] = useState(false);
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { getCustomerInfo, isSubscribed } from '../lib/revenuecat';

export function useSubscription() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerInfo()
      .then((info) => setIsSubscribed(isPremium(info)))
      .catch(() => setIsSubscribed(false))
      .finally(() => setLoading(false));
  }, []);

  return { isSubscribed, loading };
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
