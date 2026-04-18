import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const GENDERS = ['Masculino', 'Feminino', 'Outro'];
const HINT_COLOR = '#C0B8B5';

export default function Gender() {
  const [selected, setSelected] = useState<string | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 3, step_name: 'Gênero', step_total: 23 });
  }, []);

  const handleSelect = useCallback((gender: string) => {
    setSelected(gender);
    setOnboardingField('genero', gender);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      track('onboarding_step_completed', { step_number: 3, step_name: 'Gênero', step_total: 23 });
      if (gender === 'Feminino') {
        router.push('/(onboarding)/pregnancy');
      } else {
        router.push('/(onboarding)/birthday');
      }
    }, 300);
  }, []);

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
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
                <View style={{ height: 2, width: '16%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 40, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{
              fontSize: 11,
              fontWeight: '700',
              color: Colors.scanBtn,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              Sobre você
            </Text>

            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 31,
              marginBottom: 8,
            }}>
              Qual é o seu gênero?
            </Text>

            <Text style={{
              fontSize: 13,
              color: Colors.gray,
              lineHeight: 20,
              marginBottom: 28,
            }}>
              Isso nos ajuda a personalizar seu protocolo de skincare.
            </Text>

            <View style={{ gap: 10 }}>
              {GENDERS.map((gender) => {
                const isSelected = selected === gender;
                return (
                  <TouchableOpacity
                    key={gender}
                    activeOpacity={0.8}
                    onPress={() => handleSelect(gender)}
                    style={{
                      backgroundColor: Colors.white,
                      borderRadius: 100,
                      paddingVertical: 18,
                      paddingHorizontal: 24,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderWidth: 1.5,
                      borderColor: isSelected ? Colors.scanBtn : 'transparent',
                      shadowColor: isSelected ? Colors.scanBtn : '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: isSelected ? 0.15 : 0.06,
                      shadowRadius: isSelected ? 12 : 8,
                      elevation: 2,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '500', color: Colors.tabActive }}>
                      {gender}
                    </Text>
                    {isSelected && (
                      <View style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: Colors.scanBtn,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <Check size={12} color={Colors.white} strokeWidth={3} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ fontSize: 11, color: HINT_COLOR, textAlign: 'center', marginTop: 12 }}>
              Toque para selecionar e avançar
            </Text>
          </ScrollView>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
