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

type RoutineType = 'zero' | 'complement' | 'prescribed' | 'unsure';

const OPTIONS: { label: string; value: RoutineType }[] = [
  { label: 'Não tenho rotina — quero começar do zero', value: 'zero' },
  { label: 'Tenho uma rotina que funciona — quero completar o que falta', value: 'complement' },
  { label: 'Um dermatologista me prescreveu produtos', value: 'prescribed' },
  { label: 'Tenho uma rotina, mas não sei se está funcionando', value: 'unsure' },
];


export default function SkincareRoutine() {
  const [selected, setSelected] = useState<RoutineType | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'skincare_routine' });
  }, []);

  const handleSelect = useCallback((value: RoutineType) => {
    setSelected(value);
    setOnboardingField('skincare_routine_type', value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleContinue = () => {
    if (!selected) return;
    track('onboarding_step_completed', { step_name: 'skincare_routine', routine_type: selected });
    if (selected === 'complement' || selected === 'prescribed') {
      router.push('/(onboarding)/skincare-routine-detail');
    } else {
      router.push('/(onboarding)/allergies');
    }
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
                <View style={{ height: 2, width: '88%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
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
              Sua rotina
            </Text>

            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 31,
              marginBottom: 8,
            }}>
              Como está sua rotina de skincare hoje?
            </Text>

            <Text style={{
              fontSize: 13,
              color: Colors.gray,
              lineHeight: 20,
              marginBottom: 28,
            }}>
              Isso nos ajuda a criar o melhor protocolo para você.
            </Text>

            <View style={{ gap: 10 }}>
              {OPTIONS.map(({ label, value }) => {
                const isSelected = selected === value;
                return (
                  <TouchableOpacity
                    key={value}
                    activeOpacity={0.8}
                    onPress={() => handleSelect(value)}
                    style={{
                      backgroundColor: Colors.white,
                      borderRadius: 20,
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
                    <Text style={{ fontSize: 15, fontWeight: '500', color: Colors.tabActive, flex: 1, paddingRight: 12 }}>
                      {label}
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

            <TouchableOpacity
              onPress={handleContinue}
              disabled={!selected}
              activeOpacity={0.8}
              style={{
                backgroundColor: !selected ? '#E5E7EB' : Colors.scanBtn,
                borderRadius: 100,
                paddingVertical: 16,
                alignItems: 'center',
                marginTop: 12,
                opacity: !selected ? 0.6 : 1,
              }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: !selected ? Colors.gray : Colors.white,
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
