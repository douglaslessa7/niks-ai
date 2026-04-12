import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { CheckCircle, Calendar } from 'lucide-react-native';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const HOW_TO_ITEMS = [
  { emoji: '📷', text: 'Use seu Skin Score para acompanhar a evolução' },
  { emoji: '🍽️', text: 'Escaneie suas refeições e veja o impacto na pele' },
  { emoji: '☀️', text: 'Siga seu protocolo matinal e noturno' },
  { emoji: '📈', text: 'Acompanhe seu progresso semana a semana' },
];

const TIMELINE = [
  { week: 'Semana 1', color: Colors.scanBtn, text: 'Primeiros ajustes visíveis na oleosidade e textura' },
  { week: 'Semana 4', color: Colors.scanBtn, text: 'Redução perceptível de acne e manchas' },
  { week: 'Semana 8', color: '#4CAF50',      text: 'Pele transformada — score acima de 90' },
];

const CARD_WHITE = {
  backgroundColor: Colors.white,
  borderRadius: 16,
  padding: 16,
  marginBottom: 12,
} as const;

const CARD_CREAM = {
  backgroundColor: Colors.cardBg,
  borderRadius: 16,
  padding: 16,
  marginBottom: 12,
} as const;

export default function PlanPreview() {
  const scanResult = useAppStore((s) => s.scanResult);
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 });
  }, []);

  const scoreProjetado = useMemo(() => {
    const base = Math.floor(Math.random() * 6) + 90;
    return Math.min(Math.max(base, (scanResult?.skin_score ?? 60) + 20), 95);
  }, []);

  const currentScore = scanResult?.skin_score ?? 0;

  return (
    <QuizLayout progress={92}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="pt-8">

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <CheckCircle size={36} color={Colors.scanBtn} strokeWidth={2} />
            <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.tabActive, flex: 1, lineHeight: 28 }}>
              Parabéns! Seu protocolo está pronto!
            </Text>
          </View>

          {/* Pills */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {['✦ Baseado no seu scan', '✦ Protocolo personalizado'].map((label) => (
              <View
                key={label}
                style={{
                  backgroundColor: Colors.cardBg,
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 10, color: Colors.muted, fontWeight: '600' }}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Widget 1 — Linha do Tempo */}
          <View style={CARD_CREAM}>
            {/* Card header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <Calendar size={14} color={Colors.scanBtn} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.tabActive }}>
                Linha do Tempo do seu Progresso
              </Text>
            </View>

            {/* Score labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ backgroundColor: '#F0EEEA', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.muted }}>SCORE ATUAL</Text>
              </View>
              <View style={{ backgroundColor: '#F0EEEA', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.muted }}>SEU POTENCIAL</Text>
              </View>
            </View>

            {/* Progress line */}
            <View style={{ position: 'relative', height: 24, justifyContent: 'center', marginVertical: 8 }}>
              <View style={{ position: 'absolute', left: 12, right: 12, height: 1.5, backgroundColor: 'rgba(0,0,0,0.1)' }} />
              <View style={{
                position: 'absolute', left: 0,
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: Colors.scanBtn,
                borderWidth: 3, borderColor: Colors.white,
                shadowColor: Colors.scanBtn, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 4,
              }} />
              <View style={{
                position: 'absolute', right: 0,
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: Colors.white,
                borderWidth: 2, borderColor: Colors.gray,
              }} />
            </View>

            {/* Score values */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.tabActive, lineHeight: 32 }}>
                  {currentScore}
                </Text>
                <Text style={{ fontSize: 11, color: Colors.gray }}>pontos hoje</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 28, fontWeight: '800', color: '#2E7D32', lineHeight: 32 }}>
                  {scoreProjetado}
                </Text>
                <Text style={{ fontSize: 11, color: '#2E7D32' }}>em 3 meses</Text>
              </View>
            </View>
          </View>

          {/* Widget 2 — Como alcançar seus objetivos */}
          <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.07)', padding: 14, marginBottom: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.tabActive, marginBottom: 14 }}>
              Como alcançar seus objetivos
            </Text>
            <View style={{ gap: 12 }}>
              {HOW_TO_ITEMS.map(({ emoji, text }, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.cardBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{emoji}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, color: Colors.black, lineHeight: 18 }}>{text}</Text>
                </View>
              ))}
            </View>
          </View>


          {/* Footer */}
          <Text style={{ fontSize: 10, color: Colors.gray, textAlign: 'center', marginBottom: 20 }}>
            Plano baseado em: Journal of Dermatology, Nutrition Research, SBD
          </Text>

          <View className="pb-8">
            <CTAButton
              text="Vamos começar!"
              to="/(onboarding)/signup"
              onPress={() => track('onboarding_step_completed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 })}
            />
          </View>

        </View>
      </ScrollView>
    </QuizLayout>
  );
}
