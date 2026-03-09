import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Lock } from 'lucide-react-native';
import Svg, { Ellipse, Path, Circle } from 'react-native-svg';

function FaceIllustration() {
  return (
    <Svg width={200} height={200} viewBox="0 0 200 200" fill="none">
      <Ellipse cx={100} cy={100} rx={50} ry={60} stroke="#1A1A1A" strokeWidth={2} fill="none" />
      <Path d="M 40 80 Q 45 70 55 75 L 60 85" stroke="#1A1A1A" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M 160 80 Q 155 70 145 75 L 140 85" stroke="#1A1A1A" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx={75} cy={60} r={2} fill="#1A1A1A" />
      <Circle cx={125} cy={60} r={2} fill="#1A1A1A" />
      <Circle cx={100} cy={50} r={2} fill="#1A1A1A" />
      <Circle cx={70} cy={130} r={2} fill="#1A1A1A" />
      <Circle cx={130} cy={130} r={2} fill="#1A1A1A" />
    </Svg>
  );
}

export default function Trust() {
  return (
    <QuizLayout progress={88}>
      <View className="flex-1 justify-center items-center">
        {/* Illustration */}
        <View className="mb-12 relative">
          <View
            className="absolute items-center justify-center"
            style={{ top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <View style={{ width: 192, height: 192, borderRadius: 96, backgroundColor: 'rgba(204,251,241,0.4)' }} />
          </View>
          <View style={{ zIndex: 1 }}>
            <FaceIllustration />
          </View>
        </View>

        {/* Main Text */}
        <View className="items-center mb-10">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight text-center mb-4">
            Obrigado por confiar em nós
          </Text>
          <Text className="text-[17px] text-[#9CA3AF] text-center">
            Agora vamos personalizar NIKS AI para você...
          </Text>
        </View>

        {/* Privacy Card */}
        <View className="bg-[#F5F5F7] rounded-[16px] p-4 mb-12 flex-row items-start gap-3">
          <View className="w-6 h-6 items-center justify-center mt-0.5">
            <Lock size={20} color="#1A1A1A" />
          </View>
          <Text className="flex-1 text-[15px] text-[#1A1A1A] leading-relaxed">
            Sua privacidade e segurança são nossa prioridade. Suas fotos nunca serão compartilhadas.
          </Text>
        </View>

        <View className="flex-1" />

        <View className="pb-8 w-full">
          <CTAButton text="Continuar" to="/(onboarding)/plan-preview" />
        </View>
      </View>
    </QuizLayout>
  );
}
