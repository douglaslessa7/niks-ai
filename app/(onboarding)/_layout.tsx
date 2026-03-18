import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function OnboardingLayout() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/(app)/home');
    });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
