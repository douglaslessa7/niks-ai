import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Check, Camera, Utensils, Sun, TrendingUp } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const features = [
  { Icon: Camera, text: 'Use seu Skin Score para acompanhar a evolução' },
  { Icon: Utensils, text: 'Escaneie suas refeições e veja o impacto na pele' },
  { Icon: Sun, text: 'Siga seu protocolo matinal e noturno' },
  { Icon: TrendingUp, text: 'Acompanhe seu progresso semana a semana' },
];

const r = 28;
const circ = 2 * Math.PI * r;

export default function PlanPreview() {
  const scanResult = useAppStore((s) => s.scanResult);
  const { track } = useMixpanel();
  const score = scanResult?.skin_score ?? 0;
  const offset = circ * (1 - score / 100);

  return (
    <QuizLayout progress={92}>
      <View className="pt-8 flex-1">
        {/* Success Header */}
        <View className="flex-row items-center gap-3 mb-8">
          <View className="w-8 h-8 rounded-full bg-[#1A1A1A] items-center justify-center">
            <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text className="text-[26px] font-bold text-[#1A1A1A] leading-tight tracking-tight flex-1">
            Parabéns! Seu protocolo está pronto!
          </Text>
        </View>

        {/* Skin Score Card */}
        <View className="bg-[#F5F5F7] rounded-[16px] p-4 mb-8 flex-row items-center gap-4">
          <View style={{ width: 64, height: 64 }}>
            <Svg width={64} height={64} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={32} cy={32} r={r} stroke="#E5E7EB" strokeWidth={4} fill="none" />
              <Circle
                cx={32} cy={32} r={r}
                stroke="#10B981" strokeWidth={4} fill="none"
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round"
              />
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
              <Text className="text-[16px] font-bold text-[#1A1A1A]">{score}</Text>
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-[17px] font-semibold text-[#1A1A1A]">Skin Score: {score}/100</Text>
            <Text className="text-[14px] text-[#9CA3AF]">Vamos melhorar juntos</Text>
          </View>
        </View>

        {/* Features */}
        <Text className="text-[20px] font-semibold text-[#1A1A1A] mb-4">
          Como alcançar seus objetivos:
        </Text>
        <View className="gap-4 mb-8">
          {features.map(({ Icon, text }, i) => (
            <View key={i} className="flex-row items-start gap-3">
              <View key={i} className="w-10 h-10 rounded-full bg-[#F5F5F7] items-center justify-center">
                <Icon size={20} color="#1A1A1A" />
              </View>
              <Text className="text-[15px] text-[#1A1A1A] leading-relaxed flex-1 pt-2">{text}</Text>
            </View>
          ))}
        </View>

        <Text className="text-[13px] text-[#9CA3AF] mb-8">
          Plano baseado em: Journal of Dermatology, Nutrition Research, SBD
        </Text>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton
              text="Vamos começar!"
              to="/(onboarding)/signup"
              onPress={() => track('onboarding_step_completed', { step_number: 21, step_name: 'Protocolo Pronto', step_total: 23 })}
            />
        </View>
      </View>
    </QuizLayout>
  );
}
