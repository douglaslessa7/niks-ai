import { View, Text, useWindowDimensions } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import Svg, { Polyline, Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const data = [
  { week: 'Semana 1', score: 45 },
  { week: 'Semana 2', score: 58 },
  { week: 'Semana 3', score: 68 },
  { week: 'Mês 2', score: 75 },
  { week: 'Mês 3', score: 85 },
];

const CHART_H = 192;

function SimpleLineChart() {
  const { width: screenWidth } = useWindowDimensions();
  // QuizLayout px-6 (24 each side) + card p-6 (24 each side) = 96px total horizontal padding
  const CHART_W = Math.min(screenWidth, 393) - 96;

  const maxScore = 100;
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_W,
    y: CHART_H - (d.score / maxScore) * CHART_H,
  }));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = [
    `M ${points[0].x},${points[0].y}`,
    ...points.slice(1).map((p) => `L ${p.x},${p.y}`),
    `L ${points[points.length - 1].x},${CHART_H}`,
    `L ${points[0].x},${CHART_H}`,
    'Z',
  ].join(' ');

  return (
    <View style={{ width: CHART_W }}>
      <Svg width={CHART_W} height={CHART_H}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1A1A1A" stopOpacity={0.1} />
            <Stop offset="100%" stopColor="#1A1A1A" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#areaGrad)" />
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke="#1A1A1A"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#1A1A1A" />
        ))}
      </Svg>
      {/* X-axis labels */}
      <View className="flex-row justify-between mt-2">
        {data.map((d) => (
          <Text key={d.week} className="text-[11px] text-[#9CA3AF]">{d.week}</Text>
        ))}
      </View>
    </View>
  );
}

export default function SocialProof() {
  return (
    <QuizLayout progress={56}>
      <View className="pt-8 flex-1">
        <View className="mb-10">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
            NIKS AI entrega resultados reais
          </Text>
        </View>

        {/* Chart Card */}
        <View className="bg-[#F5F5F7] rounded-[16px] p-6 mb-8">
          <Text className="text-[15px] text-[#9CA3AF] mb-4">Saúde da pele</Text>
          <View className="items-center mb-4">
            <SimpleLineChart />
          </View>
          <Text className="text-[15px] text-[#1A1A1A] leading-relaxed">
            <Text className="font-semibold">89%</Text> dos usuários notaram melhora visível em 30 dias
          </Text>
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton text="Continuar" to="/(onboarding)/food-analysis" />
        </View>
      </View>
    </QuizLayout>
  );
}
