import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const waterOptions = ['Menos de 1L', '1-2L', '2-3L', '3L+'];
const sleepOptions = ['4-5', '6', '7', '8', '9+'];

function Chip({ selected, onPress, children }: { selected: boolean; onPress: () => void; children: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: selected ? Colors.scanBtn : Colors.white,
        borderRadius: 100,
        paddingVertical: 12,
        paddingHorizontal: 20,
        marginRight: 8,
        borderWidth: 1.5,
        borderColor: selected ? Colors.scanBtn : 'transparent',
        shadowColor: selected ? Colors.scanBtn : '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: selected ? 0.15 : 0.06,
        shadowRadius: selected ? 12 : 8,
        elevation: 2,
      }}
    >
      <Text style={{ fontSize: 15, fontWeight: '500', color: selected ? Colors.white : Colors.tabActive }}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

export default function HydrationSleep() {
  const [water, setWater] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 8, step_name: 'Hidratação e Sono', step_total: 23 });
  }, []);

  const handleContinue = () => {
    track('onboarding_step_completed', { step_number: 8, step_name: 'Hidratação e Sono', step_total: 23 });
    router.push('/(onboarding)/sunscreen');
  };

  const isDisabled = !water || !sleep;

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 24, paddingHorizontal: 18 }}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>

            <View style={{ marginTop: 16 }}>
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                <View style={{ height: 2, width: '46%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 40, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Label */}
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: Colors.scanBtn,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              Seu estilo de vida
            </Text>

            {/* Title */}
            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 31,
              marginBottom: 8,
            }}>
              Como está sua hidratação e sono?
            </Text>

            {/* Subtitle */}
            <Text style={{
              fontSize: 13,
              color: Colors.gray,
              lineHeight: 20,
              marginBottom: 28,
            }}>
              Dois pilares da saúde da pele.
            </Text>

            {/* Water Section */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.tabActive, marginBottom: 12 }}>
                Litros de água por dia
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row' }}>
                  {waterOptions.map((option) => (
                    <Chip
                      key={option}
                      selected={water === option}
                      onPress={() => { setWater(option); setOnboardingField('hydration', option); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      {option}
                    </Chip>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Sleep Section */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.tabActive, marginBottom: 12 }}>
                Horas de sono por noite
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row' }}>
                  {sleepOptions.map((option) => (
                    <Chip
                      key={option}
                      selected={sleep === option}
                      onPress={() => { setSleep(option); setOnboardingField('sleep', option); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      {option}
                    </Chip>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* CTA Button */}
            <TouchableOpacity
              onPress={handleContinue}
              disabled={isDisabled}
              activeOpacity={0.8}
              style={{
                backgroundColor: isDisabled ? '#E5E7EB' : Colors.scanBtn,
                borderRadius: 100,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: isDisabled ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: isDisabled ? Colors.gray : Colors.white }}>
                Continuar
              </Text>
            </TouchableOpacity>
          </ScrollView>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
