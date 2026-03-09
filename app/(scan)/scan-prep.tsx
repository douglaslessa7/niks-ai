import { View, Text } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { Sun, Sparkles, User } from 'lucide-react-native';

const instructions = [
  { Icon: Sun, text: 'Boa iluminação natural' },
  { Icon: Sparkles, text: 'Rosto limpo, sem maquiagem' },
  { Icon: User, text: 'Cabelo preso para trás' },
];

export default function ScanPrep() {
  return (
    <QuizLayout progress={68} showBack>
      <View className="pt-8 flex-1">
        {/* Heading */}
        <View className="mb-10">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Agora vamos analisar sua pele com IA
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">Para melhores resultados:</Text>
        </View>

        {/* Instructions */}
        <View className="gap-6 mb-8">
          {instructions.map(({ Icon, text }, index) => (
            <View key={index} className="flex-row items-center gap-4">
              <View className="w-12 h-12 rounded-full bg-[#F5F5F7] items-center justify-center flex-shrink-0">
                <Icon size={20} color="#1A1A1A" />
              </View>
              <Text className="text-[17px] text-[#1A1A1A]">{text}</Text>
            </View>
          ))}
        </View>

        <View className="flex-1" />

        <View className="pb-8">
          <CTAButton text="Abrir câmera" to="/(scan)/camera" />
        </View>
      </View>
    </QuizLayout>
  );
}
