import { View, Text, TouchableOpacity } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { useRouter } from 'expo-router';
import { Apple } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4" />
      <Path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853" />
      <Path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05" />
      <Path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335" />
    </Svg>
  );
}

export default function Signup() {
  const router = useRouter();

  return (
    <QuizLayout progress={96} showBack>
      <View className="pt-8 flex-1">
        {/* Heading */}
        <View className="mb-16">
          <Text className="text-[32px] font-bold text-niks-black leading-tight tracking-tight">
            Salve seu progresso
          </Text>
        </View>

        {/* Spacer — empurra botões para o fundo */}
        <View className="flex-1" />

        {/* Buttons */}
        <View className="gap-4 mb-8">
          {/* Continuar com a Apple */}
          <TouchableOpacity
            onPress={() => router.push('/(onboarding)/paywall-soft')}
            activeOpacity={0.85}
            className="w-full h-14 rounded-[12px] items-center justify-center bg-niks-black flex-row gap-3"
          >
            <Apple size={20} color="white" fill="white" />
            <Text className="text-white text-[17px] font-medium">Continuar com a Apple</Text>
          </TouchableOpacity>

          {/* Continuar com o Google */}
          <TouchableOpacity
            onPress={() => router.push('/(onboarding)/paywall-soft')}
            activeOpacity={0.85}
            className="w-full h-14 rounded-[12px] items-center justify-center bg-white border border-[#E5E7EB] flex-row gap-3"
          >
            <GoogleIcon />
            <Text className="text-niks-black text-[17px] font-medium">Continuar com o Google</Text>
          </TouchableOpacity>
        </View>

        <View className="pb-8" />
      </View>
    </QuizLayout>
  );
}
