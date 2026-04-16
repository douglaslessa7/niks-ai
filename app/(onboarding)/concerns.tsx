import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const concerns = [
  'Acne', 'Manchas', 'Oleosidade', 'Rugas',
  'Poros dilatados', 'Olheiras', 'Ressecamento', 'Textura irregular',
];

export default function Concerns() {
  const [selected, setSelected] = useState<string[]>([]);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 2, step_name: 'Preocupações de Pele', step_total: 23 });
  }, []);

  const toggle = (item: string) => {
    setSelected((prev) => {
      const next = prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item];
      setOnboardingField('concerns', next);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleContinue = () => {
    track('onboarding_step_completed', { step_number: 2, step_name: 'Preocupações de Pele', step_total: 23 });
    router.push('/(onboarding)/gender');
  };

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
                <View style={{ height: 2, width: '8%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
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
              Sua pele
            </Text>

            {/* Title */}
            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 31,
              marginBottom: 8,
            }}>
              Qual é sua principal preocupação?
            </Text>

            {/* Subtitle */}
            <Text style={{
              fontSize: 13,
              color: Colors.gray,
              lineHeight: 20,
              marginBottom: 28,
            }}>
              Selecione uma ou mais opções.
            </Text>

            {/* 2-column grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {concerns.map((concern) => {
                const isSelected = selected.includes(concern);
                return (
                  <TouchableOpacity
                    key={concern}
                    activeOpacity={0.8}
                    onPress={() => toggle(concern)}
                    style={{
                      width: '48%',
                      backgroundColor: Colors.white,
                      borderRadius: 100,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: isSelected ? Colors.scanBtn : 'transparent',
                      shadowColor: isSelected ? Colors.scanBtn : '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isSelected ? 0.15 : 0.06,
                      shadowRadius: isSelected ? 12 : 8,
                      elevation: 2,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '500', color: Colors.tabActive, textAlign: 'center' }}>
                      {concern}
                    </Text>
                    {isSelected && (
                      <View style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: Colors.scanBtn,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Check size={10} color={Colors.white} strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* CTA Button */}
            <TouchableOpacity
              onPress={handleContinue}
              disabled={selected.length === 0}
              activeOpacity={0.8}
              style={{
                backgroundColor: selected.length === 0 ? '#E5E7EB' : Colors.scanBtn,
                borderRadius: 100,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: selected.length === 0 ? 0.6 : 1,
              }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: selected.length === 0 ? Colors.gray : Colors.white,
              }}>
                Continuar
              </Text>
            </TouchableOpacity>
          </ScrollView>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
