import { useEffect } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { Canvas, Circle as SkiaCircle, BlurMask } from '@shopify/react-native-skia';
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

function MetricCard({ name, metric }: { name: string; metric: SkinMetric }) {
  const color = metricColors[name] ?? Colors.gray;
  const label = metricLabels[name] ?? name;

  return (
    <View style={{
      width: '47%',
      borderRadius: 16,
      backgroundColor: Colors.white,
      padding: 14,
      minHeight: 110,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
      justifyContent: 'space-between',
      overflow: 'hidden',
    }}>
      {/* Skia glow blob — fica atrás de tudo */}
      <Canvas style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }}>
        <SkiaCircle cx={60} cy={60} r={40} color={color} opacity={0.35}>
          <BlurMask blur={18} style="normal" />
        </SkiaCircle>
      </Canvas>

      {/* Ícone de cadeado no canto superior direito */}
      <View style={{ position: 'absolute', top: 10, right: 10 }}>
        <Lock size={12} color={Colors.gray} />
      </View>

      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.black, marginBottom: 8 }}>
        {label}
      </Text>

      {/* Pill coral cobrindo o número */}
      <View
        style={{
          width: 50,
          height: 24,
          backgroundColor: 'rgba(0,0,0,0.12)',
          borderRadius: 12,
          marginBottom: 8,
        }}
      />
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

  // Sempre mostrar 6 cards borrados como preview — os valores são ocultos de qualquer forma
  const dummy: SkinMetric = { score: 0, label: '', insight: '' }
  const metrics: [string, SkinMetric][] = [
    ['acne',        scanResult?.acne ?? dummy],
    ['skin_age',    { score: 0, label: String(scanResult?.skin_age ?? 0), insight: '' }],
    ['hydration',   scanResult?.metrics?.hydration ?? dummy],
    ['oiliness',    scanResult?.metrics?.oiliness  ?? dummy],
    ['dark_spots',  scanResult?.metrics?.dark_spots ?? dummy],
    ['texture',     scanResult?.metrics?.texture    ?? dummy],
  ];

  return (
    <QuizLayout progress={76} showBack>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="pt-8">
          {/* Headline da IA */}
          {scanResult?.headline && (
            <Text style={{
              fontSize: 14,
              color: Colors.gray,
              textAlign: 'center',
              marginBottom: 8,
              paddingHorizontal: 16,
            }}>
              {scanResult.headline}
            </Text>
          )}

          {/* Título */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <Text style={{ fontSize: 32, fontWeight: '800', color: Colors.black }}>
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
                backgroundColor: '#E5E7EB',
              }}
            >
              {scanImageUri ? (
                <Image
                  source={{ uri: scanImageUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: '#E5E7EB' }} />
              )}
            </View>
          </View>

          {/* Light metrics card — métricas borradas */}
          <View
            style={{
              backgroundColor: Colors.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.18)',
              paddingHorizontal: 24,
              paddingTop: 80,
              paddingBottom: 24,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.black, marginBottom: 16, textAlign: 'center' }}>
              Suas métricas detalhadas
            </Text>

            <View className="flex-row flex-wrap gap-3">
              {metrics.map(([name, metric]) => (
                <MetricCard key={name} name={name} metric={metric} />
              ))}
            </View>
          </View>

          {/* Locked cards */}
          <View style={{ marginBottom: 8 }}>
            <View style={{
              backgroundColor: Colors.cardBg,
              borderRadius: 16,
              paddingVertical: 20,
              paddingHorizontal: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 8,
            }}>
              <Lock size={22} color={Colors.muted} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.muted }}>
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
