import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { requestPushPermission, savePushToken } from '../../lib/notifications';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';

export default function Notifications() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const navigateToApp = async () => {
    if (__DEV__) {
      router.replace('/(onboarding)/nome');
      return;
    }

    try {
      const infoPromise = getCustomerInfo();
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 8000)
      );
      const info = await Promise.race([infoPromise, timeoutPromise]);

      if (info && isSubscribed(info)) {
        router.replace('/(onboarding)/nome');
      } else {
        router.replace('/(onboarding)/paywall-soft');
      }
    } catch {
      router.replace('/(onboarding)/paywall-soft');
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active' && loadingRef.current) {
        loadingRef.current = false;
        setLoading(false);
        await navigateToApp();
      }
    });
    return () => subscription.remove();
  }, []);

  const handleActivate = async () => {
    setLoading(true);
    loadingRef.current = true;
    try {
      const token = await Promise.race([
        requestPushPermission(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);

      if (token) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await savePushToken(user.id, token);
        }
      }
    } catch (error) {
      console.error('[Notifications] Erro:', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      await navigateToApp();
    }
  };

  const handleSkip = async () => {
    await navigateToApp();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6">
        {/* Heading */}
        <View className="mt-10 mb-4">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Ative as notificações
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            Lembraremos você nos melhores momentos para cuidar da pele.
          </Text>
        </View>

        {/* Spacer */}
        <View className="flex-1" />

        {/* Bell illustration */}
        <View className="items-center justify-center mb-12">
          {/* Halo verde */}
          <View
            style={{
              position: 'absolute',
              width: 128,
              height: 128,
              borderRadius: 64,
              backgroundColor: 'rgba(134,239,172,0.15)',
            }}
          />
          {/* Círculo cinza + ícone */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#F5F5F7',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bell size={40} color="#1A1A1A" />
          </View>
        </View>

        {/* Spacer */}
        <View className="flex-1" />

        {/* Botões */}
        <View className="gap-4 pb-8">
          <TouchableOpacity
            onPress={handleActivate}
            disabled={loading}
            activeOpacity={0.85}
            className="w-full bg-[#1A1A1A] rounded-[12px] h-[56px] items-center justify-center"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white text-[17px] font-semibold">Ativar notificações</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSkip}
            disabled={loading}
            activeOpacity={0.7}
            className="w-full py-2 items-center"
          >
            <Text className="text-[#9CA3AF] text-[17px]">Agora não</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
