import { View, Text, ScrollView, Image } from 'react-native';
import { Canvas, Circle as SkiaCircle, BlurMask } from '@shopify/react-native-skia';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Lock } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppStore, SkinMetric } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const r = 70;
const circ = 2 * Math.PI * r;

const CANVAS_W = 160;
const CANVAS_H = 60;

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

function MetricCard({ name, metric: _metric }: { name: string; metric: SkinMetric }) {
  const color = metricColors[name] ?? '#9CA3AF';
  return (
    <View
      style={{
        width: '47%',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 16,
        minHeight: 120,
        overflow: 'hidden',
      }}
    >
      {/* Título */}
      <Text style={{ fontSize: 14, fontWeight: '600', color: 'white', marginBottom: 12 }}>
        {metricLabels[name] ?? name}
      </Text>

      {/* Score pill borrado — design original, bloqueado até assinar */}
      <View
        style={{
          width: 50,
          height: 24,
          backgroundColor: 'rgba(255,255,255,0.38)',
          borderRadius: 12,
          marginBottom: 8,
        }}
      />

      {/* Skia glow blob */}
      <Canvas
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: CANVAS_H,
        }}
      >
        <SkiaCircle cx={CANVAS_W / 2} cy={CANVAS_H} r={40} color={color} opacity={0.55}>
          <BlurMask blur={18} style="normal" />
        </SkiaCircle>
      </Canvas>
    </View>
  );
}

export default function Results() {
  const scanResult = useAppStore((s) => s.scanResult);
  const scanImageUri = useAppStore((s) => s.scanImageUri);
  const { track } = useMixpanel();

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
                  stroke="#10B981" strokeWidth={6} fill="none"
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
                borderColor: '#10B981',
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

          {/* Dark metrics card — métricas borradas */}
          <View
            style={{
              backgroundColor: '#1E1E2E',
              borderRadius: 24,
              paddingHorizontal: 24,
              paddingTop: 80,
              paddingBottom: 24,
              marginBottom: 16,
            }}
          >
            <Text className="text-[17px] font-bold text-white mb-4 text-center">
              Suas métricas detalhadas
            </Text>

            <View className="flex-row flex-wrap gap-3">
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
