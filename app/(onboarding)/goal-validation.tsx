import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

type TimelineItem = {
  period: string;
  description: string;
};

const TIMELINE: TimelineItem[] = [
  { period: 'Semana 2', description: 'Primeiros ajustes na oleosidade e textura' },
  { period: 'Mês 1', description: 'Redução visível de acne e manchas' },
  { period: 'Mês 3', description: 'Pele transformada — Skin Score acima de 90' },
];

export default function GoalValidation() {
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', {
      step_number: 19,
      step_name: 'Goal Validation',
      step_total: 28,
    });
  }, []);

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('onboarding_step_completed', {
      step_number: 19,
      step_name: 'Goal Validation',
      step_total: 28,
    });
    router.push('/(onboarding)/goal');
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
                <View style={{ height: 2, width: '80%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 32, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >

            {/* Celebration icon */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: 'rgba(251,123,107,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 44 }}>🎯</Text>
              </View>
            </View>

            {/* Headline */}
            <Text style={{
              fontSize: 28,
              fontWeight: '800',
              color: Colors.tabActive,
              lineHeight: 34,
              marginBottom: 12,
              textAlign: 'center',
            }}>
              Sua meta é totalmente possível
            </Text>

            {/* Subtitle */}
            <Text style={{
              fontSize: 15,
              color: Colors.gray,
              lineHeight: 22,
              marginBottom: 24,
              textAlign: 'center',
              paddingHorizontal: 8,
            }}>
              Com o protocolo certo, resultados visíveis começam em 2 semanas. Aos 3 meses, a transformação é inegável.
            </Text>

            {/* Green validation badge */}
            <View style={{
              backgroundColor: 'rgba(34,197,94,0.1)',
              borderRadius: 16,
              paddingVertical: 16,
              paddingHorizontal: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              marginBottom: 32,
            }}>
              <View style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: '#22C55E',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>✓</Text>
              </View>
              <Text style={{
                fontSize: 14,
                color: Colors.tabActive,
                lineHeight: 20,
                flex: 1,
              }}>
                <Text style={{ fontWeight: '700' }}>92% dos usuários</Text>
                <Text style={{ fontWeight: '400' }}> com perfil parecido com o seu atingem seus objetivos</Text>
              </Text>
            </View>

            {/* Timeline */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{
                fontSize: 11,
                fontWeight: '700',
                color: Colors.scanBtn,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginBottom: 16,
              }}>
                Sua jornada
              </Text>

              {TIMELINE.map((item, index) => {
                const isLast = index === TIMELINE.length - 1;
                return (
                  <View
                    key={item.period}
                    style={{
                      flexDirection: 'row',
                      gap: 14,
                      marginBottom: isLast ? 0 : 16,
                    }}
                  >
                    {/* Left column: dot + connector */}
                    <View style={{ alignItems: 'center' }}>
                      <View style={{
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: Colors.scanBtn,
                        shadowColor: Colors.scanBtn,
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 4,
                        elevation: 2,
                      }} />
                      {!isLast && (
                        <View style={{
                          width: 2,
                          flex: 1,
                          backgroundColor: 'rgba(251,123,107,0.3)',
                          marginTop: 4,
                        }} />
                      )}
                    </View>

                    {/* Right column: texts */}
                    <View style={{ flex: 1, paddingBottom: isLast ? 0 : 4 }}>
                      <Text style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: Colors.tabActive,
                        marginBottom: 4,
                      }}>
                        {item.period}
                      </Text>
                      <Text style={{
                        fontSize: 13,
                        color: Colors.gray,
                        lineHeight: 19,
                      }}>
                        {item.description}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

          </ScrollView>

          {/* CTA */}
          <View style={{ paddingHorizontal: 18, paddingBottom: 32, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={handleContinue}
              activeOpacity={0.85}
              style={{
                backgroundColor: Colors.scanBtn,
                borderRadius: 100,
                paddingVertical: 16,
                width: '100%',
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: Colors.white,
                textAlign: 'center',
              }}>
                Continuar
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
