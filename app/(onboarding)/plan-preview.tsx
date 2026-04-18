import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, CheckCircle, Calendar, Camera, Utensils, Sun, TrendingUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const HOW_TO_ITEMS = [
  { Icon: Camera,     text: 'Use seu Skin Score para acompanhar a evolução' },
  { Icon: Utensils,   text: 'Escaneie suas refeições e veja o impacto na pele' },
  { Icon: Sun,        text: 'Siga seu protocolo matinal e noturno' },
  { Icon: TrendingUp, text: 'Acompanhe seu progresso semana a semana' },
];

const CARD_CREAM = {
  backgroundColor: Colors.white,
  borderRadius: 16,
  padding: 16,
  marginBottom: 12,
} as const;

export default function PlanPreview() {
  const scanResult = useAppStore((s) => s.scanResult);
  const { track } = useMixpanel();
  const router = useRouter();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 });
  }, []);

  const scoreProjetado = useMemo(() => {
    const base = Math.floor(Math.random() * 6) + 90;
    return Math.min(Math.max(base, (scanResult?.skin_score ?? 60) + 20), 95);
  }, []);

  const currentScore = scanResult?.skin_score ?? 0;

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
                <View style={{ height: 2, width: '92%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 32, paddingBottom: 32 }}
          >
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
                    backgroundColor: Colors.scanBtn,
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ fontSize: 10, color: Colors.white, fontWeight: '600' }}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Widget 1 — Linha do Tempo */}
            <View style={CARD_CREAM}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <Calendar size={14} color={Colors.scanBtn} strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.tabActive }}>
                  Linha do Tempo do seu Progresso
                </Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.scanBtn }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.black }}>SCORE ATUAL</Text>
                </View>
                <View style={{ backgroundColor: Colors.white, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.scanBtn }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.black }}>SEU POTENCIAL</Text>
                </View>
              </View>

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
                {HOW_TO_ITEMS.map(({ Icon, text }, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.scanBtn, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={18} color={Colors.white} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: Colors.black, lineHeight: 18 }}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Footer */}
            <Text style={{ fontSize: 10, color: Colors.gray, textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
              Plano baseado em: Journal of Dermatology, Nutrition Research, SBD
            </Text>

            <TouchableOpacity
              onPress={() => {
                track('onboarding_step_completed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 });
                router.push('/(onboarding)/signup' as any);
              }}
              activeOpacity={0.8}
              style={{
                backgroundColor: Colors.scanBtn,
                borderRadius: 100,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
                Vamos começar!
              </Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
