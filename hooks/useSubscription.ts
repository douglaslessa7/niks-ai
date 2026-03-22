import { useState, useEffect } from 'react';
import { getCustomerInfo, isPremium } from '../lib/revenuecat';

export function useSubscription() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerInfo()
      .then((info) => setIsSubscribed(isPremium(info)))
      .catch(() => setIsSubscribed(false))
      .finally(() => setLoading(false));
  }, []);

  return { isSubscribed, loading };
}
