import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
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
      <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-white">
        <ActivityIndicator color="#FB7B6B" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 max-w-[393px] w-full mx-auto overflow-hidden">
        {/* BR Badge */}
        <View className="absolute top-6 right-6 z-10">
          <View className="w-10 h-10 rounded-full bg-[#F5F5F7] items-center justify-center">
            <Text className="text-sm font-semibold text-[#1A1A1A]">BR</Text>
          </View>
        </View>

        {/* Content */}
        <View className="flex-1 justify-between px-6 py-16">
          {/* Phone Mockup Illustration */}
          <View className="items-center pt-8">
            <View className="relative" style={{ transform: [{ rotate: '8deg' }] }}>
              {/* Phone frame */}
              <View
                className="w-32 overflow-hidden"
                style={{
                  height: 256,
                  backgroundColor: '#1A1A1A',
                  borderRadius: 24,
                  borderWidth: 3,
                  borderColor: '#1A1A1A',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.3,
                  shadowRadius: 16,
                  elevation: 10,
                }}
              >
                {/* Notch */}
                <View
                  className="bg-black mx-auto rounded-b-xl"
                  style={{ width: 64, height: 16 }}
                />

                {/* Screen content */}
                <View
                  className="flex-1 items-center justify-center relative"
                  style={{ backgroundColor: '#1e293b' }}
                >
                  {/* Face outline */}
                  <View style={{ width: 80, height: 96, position: 'relative' }}>
                    {/* Head shape */}
                    <View
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: '#60a5fa',
                        opacity: 0.8,
                        top: 0, left: 0, right: 0, bottom: 0,
                      }}
                    />
                    {/* Detection zones */}
                    <View style={{ position: 'absolute', top: 16, left: 12, width: 20, height: 20, backgroundColor: 'rgba(96,165,250,0.3)', borderRadius: 4, borderWidth: 1, borderColor: '#60a5fa' }} />
                    <View style={{ position: 'absolute', top: 16, right: 12, width: 20, height: 20, backgroundColor: 'rgba(74,222,128,0.3)', borderRadius: 4, borderWidth: 1, borderColor: '#4ade80' }} />
                    <View style={{ position: 'absolute', top: 40, left: 20, width: 32, height: 20, backgroundColor: 'rgba(250,204,21,0.3)', borderRadius: 4, borderWidth: 1, borderColor: '#facc15' }} />
                    <View style={{ position: 'absolute', bottom: 24, left: 16, width: 40, height: 32, backgroundColor: 'rgba(192,132,252,0.3)', borderRadius: 4, borderWidth: 1, borderColor: '#c084fc' }} />
                  </View>

                  {/* Scanning text */}
                  <Text
                    style={{
                      position: 'absolute',
                      bottom: 16,
                      color: '#FFFFFF',
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  >
                    Scanning...
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Heading */}
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
            Descubra a verdade sobre sua pele
          </Text>

          {/* Bottom CTA Section */}
          <View className="gap-4">
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
        </View>
      </View>
    </SafeAreaView>
  );
}
