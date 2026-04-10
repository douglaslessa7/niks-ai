import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CTAButton } from '../components/ui/CTAButton';
import { supabase } from '../lib/supabase';
import { getCustomerInfo, isSubscribed } from '../lib/revenuecat';
import { usePlacement } from 'expo-superwall';
import { useMixpanel } from '../lib/mixpanel/MixpanelProvider';

export default function Welcome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const { registerPlacement } = usePlacement();
  const { track } = useMixpanel();
  const { width, height } = useWindowDimensions();

  const player = useVideoPlayer(require('../assets/welcome-video.mp4'), (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
          if (__DEV__) {
            router.replace('/(app)/home');
            return;
          }

          try {
            const info = await getCustomerInfo();
            if (isSubscribed(info)) {
              router.replace('/(app)/home');
            } else {
              registerPlacement({ placement: 'paywall_onboarding' });
            }
          } catch {
            registerPlacement({ placement: 'paywall_onboarding' });
          }
        } else {
          setChecking(false);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <View className="absolute inset-0 items-center justify-center bg-white">
        <ActivityIndicator color="#FB7B6B" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top', 'bottom']}>
      <View style={{ flex: 1 }}>
        <View style={{ borderRadius: 24, overflow: 'hidden', marginHorizontal: 20, marginTop: 16 }}>
          <VideoView
            player={player}
            contentFit="contain"
            style={{ width: width - 40, height: height * 0.52 }}
          />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '600', textAlign: 'center', marginTop: 24 }}>
          <Text style={{ color: '#FB7B6B' }}>Bem-vindo </Text>
          <Text style={{ color: '#1A1A1A' }}>ao</Text>
        </Text>
        <Text style={{ fontSize: 34, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginTop: 4 }}>
          NIKS AI
        </Text>
        <Text style={{ fontSize: 22, color: '#9CA3AF', textAlign: 'center', marginTop: 8, paddingHorizontal: 48 }}>
          A melhor forma de cuidar da sua pele
        </Text>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 12 }}>
        <CTAButton
          text="Começar"
          to="/(onboarding)/concerns"
          onPress={() => track('onboarding_step_completed', { step_number: 1, step_name: 'Tela Inicial', step_total: 23 })}
        />
        <View className="items-center flex-row justify-center gap-1">
          <Text className="text-[#9CA3AF] text-[15px]">Já tem conta? </Text>
          <TouchableOpacity onPress={() => router.push('/(onboarding)/login')}>
            <Text className="text-[#1A1A1A] text-[15px] font-semibold">Entrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
