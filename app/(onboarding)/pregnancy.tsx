// SQL to run in Supabase Dashboard:
// ALTER TABLE users ADD COLUMN IF NOT EXISTS pregnancy_status text;

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

type PregnancyStatus = 'none' | 'pregnant' | 'breastfeeding' | 'trying';

const options: { label: string; value: PregnancyStatus }[] = [
  { label: 'Nenhuma das anteriores', value: 'none' },
  { label: 'Estou grávida', value: 'pregnant' },
  { label: 'Estou amamentando', value: 'breastfeeding' },
  { label: 'Estou tentando engravidar', value: 'trying' },
];

export default function Pregnancy() {
  const [selected, setSelected] = useState<PregnancyStatus | null>(null);
  const { setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'pregnancy' });
  }, []);

  const handleSelect = (value: PregnancyStatus) => {
    setSelected(value);
    setOnboardingField('pregnancy_status', value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleContinue = () => {
    track('onboarding_step_completed', { step_name: 'pregnancy' });
    router.push('/(onboarding)/birthday');
  };

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 16, paddingHorizontal: 24 }}>
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
                <View style={{ height: 2, width: '20%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{
              fontSize: 26,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 31,
              marginBottom: 8,
            }}>
              IMPORTANTE
            </Text>

            <Text style={{
              fontSize: 13,
              color: Colors.gray,
              lineHeight: 20,
              marginBottom: 28,
            }}>
              {'Alguns ativos do protocolo precisam ser evitados em certas situações, '}
              <Text style={{ color: Colors.scanBtn }}>por favor, selecione a que se aplica a você:</Text>
            </Text>

            <View style={{ gap: 10, marginBottom: 32 }}>
              {options.map(({ label, value }) => {
                const isSelected = selected === value;
                return (
                  <TouchableOpacity
                    key={value}
                    activeOpacity={0.8}
                    onPress={() => handleSelect(value)}
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
                opacity: !selected ? 0.6 : 1,
                marginTop: 8,
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
