import { useEffect } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Lock } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppStore, SkinMetric } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

const r = 70;
const circ = 2 * Math.PI * r;

const metricColors: Record<string, string> = {
  hydration: '#3B82F6',
  oiliness: '#F59E0B',
  texture: '#10B981',
  acne: '#8B5CF6',
  dark_spots: '#EF4444',
  sensitivity: '#06B6D4',
  skin_age: '#EC4899',
};

const metricLabels: Record<string, string> = {
  hydration: 'Hidratação',
  oiliness: 'Oleosidade',
  texture: 'Textura',
  acne: 'Acne',
  dark_spots: 'Manchas',
  sensitivity: 'Elasticidade',
  skin_age: 'Idade da Pele',
};

const BlurredNumber = ({ value }: { value: number }) => (
  <View style={{ position: 'relative' }}>
    <Text style={{ fontSize: 28, fontWeight: '700', color: Colors.black }}>
      {value}
    </Text>
    <BlurView
      intensity={60}
      tint="light"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    />
  </View>
);

function MetricCard({ name, metric }: { name: string; metric: SkinMetric }) {
  const color = metricColors[name] ?? Colors.gray;
  const label = metricLabels[name] ?? name;

  return (
    <View
      style={{
        width: '47%',
        borderRadius: 16,
        backgroundColor: Colors.white,
        padding: 14,
        minHeight: 110,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.black, marginBottom: 8 }}>
        {label}
      </Text>

      <View style={{ marginBottom: 8 }}>
        <BlurredNumber value={metric.score} />
      </View>

      {/* Progress bar */}
      <View style={{ height: 4, backgroundColor: Colors.lightGray, borderRadius: 2, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            width: `${Math.max(15, metric.score)}%`,
            backgroundColor: color,
            borderRadius: 2,
            opacity: 0.3,
          }}
        />
      </View>
    </View>
  );
}

export default function Results() {
  const scanResult = useAppStore((s) => s.scanResult);
  const scanImageUri = useAppStore((s) => s.scanImageUri);
  const { track } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 17, step_name: 'Resultado do Scan', step_total: 23 });
  }, []);

  const score = scanResult?.skin_score ?? 0;
  const offset = circ * (1 - score / 100);

  const getFakeMetricScore = (skinScore: number, metricOffset: number): number => {
    const base = skinScore + metricOffset;
    return Math.min(95, Math.max(20, base));
  };

  const dummy: SkinMetric = { score: 0, label: '', insight: '' };

  const metrics: [string, SkinMetric][] = [
    ['acne',       scanResult?.acne ?? dummy],
    ['skin_age',   { score: getFakeMetricScore(score, -7),  label: '', insight: '' }],
    ['hydration',  { score: getFakeMetricScore(score, +12), label: '', insight: '' }],
    ['oiliness',   { score: getFakeMetricScore(score, -3),  label: '', insight: '' }],
    ['dark_spots', { score: getFakeMetricScore(score, +5),  label: '', insight: '' }],
    ['texture',    { score: getFakeMetricScore(score, -15), label: '', insight: '' }],
  ];

  return (
    <QuizLayout progress={76} showBack bgColor={Colors.cardBg}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="pt-8">
          {/* Headline da IA */}
          {scanResult?.headline && (
            <Text className="text-[15px] text-[#9CA3AF] text-center mb-2">
              {scanResult.headline}
            </Text>
          )}

          {/* Título */}
          <View className="mb-6 items-center">
            <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
              Seu Skin Score
            </Text>
          </View>

          {/* Score Ring */}
          <View className="items-center mb-2">
            <View style={{ width: 160, height: 160 }}>
              <Svg width={160} height={160} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Circle cx={80} cy={80} r={r} stroke="#E5E7EB" strokeWidth={6} fill="none" />
                <Circle
                  cx={80} cy={80} r={r}
                  stroke={Colors.scanBtn} strokeWidth={6} fill="none"
                  strokeDasharray={circ} strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              </Svg>
              <View style={{ position: 'absolute', top: 0, left: 0, width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 56, fontWeight: '700', color: '#1A1A1A' }}>{score}</Text>
              </View>
            </View>
          </View>

          <Text className="text-[14px] text-[#9CA3AF] text-center mb-8">de 100</Text>

          {/* Foto do usuário */}
          <View className="items-center" style={{ marginBottom: -60, zIndex: 2 }}>
            <View
              style={{
                width: 128,
                height: 128,
                borderRadius: 64,
                borderWidth: 4,
                borderColor: Colors.scanBtn,
                overflow: 'hidden',
                backgroundColor: Colors.disabled,
              }}
            >
              {scanImageUri ? (
                <Image
                  source={{ uri: scanImageUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: Colors.disabled }} />
              )}
            </View>
          </View>

          {/* Metrics card */}
          <View
            style={{
              backgroundColor: Colors.lightGray,
              borderRadius: 16,
              borderWidth: 0.5,
              borderColor: 'rgba(0,0,0,0.08)',
              paddingHorizontal: 16,
              paddingTop: 80,
              paddingBottom: 16,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: '700',
                color: Colors.black,
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              Suas métricas detalhadas
            </Text>

            {/* 2x3 grid — Acne visible, others blurred */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {metrics.map(([name, metric]) => (
                <MetricCard key={name} name={name} metric={metric} />
              ))}
            </View>
          </View>

          {/* Locked cards */}
          <View className="gap-3 mb-8">
            <View className="bg-niks-light rounded-card h-24 flex-row items-center justify-center gap-2 overflow-hidden">
              <Lock size={16} color="#1A1A1A" />
              <Text className="text-[15px] font-semibold text-niks-black">
                Seu Protocolo Personalizado
              </Text>
            </View>
          </View>

          <View className="pb-8">
            <CTAButton
              text="Continuar"
              to="/(onboarding)/goal"
              onPress={() => track('onboarding_step_completed', { step_number: 17, step_name: 'Resultado do Scan', step_total: 23 })}
            />
          </View>
        </View>
      </ScrollView>
    </QuizLayout>
  );
}
