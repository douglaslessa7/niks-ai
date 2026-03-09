import { View, Text, ScrollView, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Lock } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';

const score = 72;
const r = 70;
const circ = 2 * Math.PI * r;
const offset = circ * (1 - score / 100);

const FACE_URI =
  'https://images.unsplash.com/photo-1559674850-47859f577fba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=300';

const metrics = [
  { name: 'Hidratação', score: 85, color: '#3B82F6' },
  { name: 'Oleosidade', score: 62, color: '#F59E0B' },
  { name: 'Textura', score: 78, color: '#10B981' },
  { name: 'Poros', score: 65, color: '#8B5CF6' },
  { name: 'Manchas', score: 58, color: '#EF4444' },
  { name: 'Elasticidade', score: 80, color: '#06B6D4' },
];

function MetricCard({ metric }: { metric: (typeof metrics)[0] }) {
  return (
    <View
      style={{
        width: '47%',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 16,
        justifyContent: 'space-between',
        minHeight: 108,
        overflow: 'hidden',
      }}
    >
      {/* Título — nítido, exatamente como no Figma */}
      <Text style={{ fontSize: 14, fontWeight: '600', color: 'white' }}>
        {metric.name}
      </Text>

      {/* Número "blur-md": oval branca simulando filter:blur(12px) no texto */}
      <View
        style={{
          width: 50,
          height: 24,
          backgroundColor: 'rgba(255,255,255,0.38)',
          borderRadius: 12,
        }}
      />

      {/* Barra "blur-sm": track + fill colorido mais alto simulando filter:blur(4px) */}
      <View
        style={{
          height: 10,
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderRadius: 5,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${metric.score}%`,
            backgroundColor: metric.color,
            opacity: 0.7,
            borderRadius: 5,
          }}
        />
      </View>
    </View>
  );
}

export default function Results() {
  return (
    <QuizLayout progress={76} showBack>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="pt-8">
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

          {/* "de 100" */}
          <Text className="text-[14px] text-[#9CA3AF] text-center mb-8">de 100</Text>

          {/* Face photo overlapping the dark card */}
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
              <Image
                source={{ uri: FACE_URI }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* Dark metrics card */}
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

            {/* Grid 2 colunas */}
            <View className="flex-row flex-wrap gap-3">
              {metrics.map((metric, index) => (
                <MetricCard key={index} metric={metric} />
              ))}
            </View>
          </View>

          {/* Locked cards */}
          <View className="gap-3 mb-8">
            {/* Protocolo — fundo #F5F5F7 limpo com overlay branco/60 */}
            <View
              style={{
                backgroundColor: '#F5F5F7',
                borderRadius: 16,
                height: 96,
                overflow: 'hidden',
              }}
            >
              {/* Linhas borradas simulando conteúdo escondido */}
              <View style={{ padding: 16, gap: 8 }}>
                <View style={{ height: 10, backgroundColor: 'rgba(26,26,26,0.12)', borderRadius: 4, width: '75%' }} />
                <View style={{ height: 10, backgroundColor: 'rgba(156,163,175,0.12)', borderRadius: 4, width: '50%' }} />
                <View style={{ height: 10, backgroundColor: 'rgba(26,26,26,0.12)', borderRadius: 4, width: '66%' }} />
              </View>
              {/* Overlay branco translúcido + lock */}
              <View
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(255,255,255,0.82)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                <Lock size={18} color="#1A1A1A" />
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#1A1A1A' }}>
                  Seu Protocolo Personalizado
                </Text>
              </View>
            </View>

            {/* Análise Alimentar — gradiente laranja→verde→rosa (from-orange-200 via-green-200 to-red-200) com overlay */}
            <View
              style={{
                borderRadius: 16,
                height: 96,
                overflow: 'hidden',
              }}
            >
              {/* Gradiente de fundo simulando blur-lg do Figma */}
              <LinearGradient
                colors={['#fed7aa', '#bbf7d0', '#fecaca']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
              {/* Overlay branco translúcido + lock */}
              <View
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(255,255,255,0.72)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  paddingHorizontal: 16,
                }}
              >
                <Lock size={18} color="#1A1A1A" />
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#1A1A1A', textAlign: 'center' }}>
                  Analise Alimentar
                </Text>
              </View>
            </View>
          </View>

          <View className="pb-8">
            <CTAButton text="Continuar" to="/(onboarding)/goal" />
          </View>
        </View>
      </ScrollView>
    </QuizLayout>
  );
}
