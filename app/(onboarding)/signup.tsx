import { View, Text, TouchableOpacity } from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { useRouter } from 'expo-router';

export default function Signup() {
  const router = useRouter();

  return (
    <QuizLayout progress={96} showBack>
      <View className="pt-8 flex-1">
        <View className="mb-12">
          <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
            Salve seu progresso
          </Text>
          <Text className="text-[#9CA3AF] text-[17px]">
            Crie sua conta para guardar seus dados.
          </Text>
        </View>

        <View className="gap-4">
          {/* Sign in with Apple */}
          <TouchableOpacity
            onPress={() => router.push('/(onboarding)/paywall-soft')}
            activeOpacity={0.85}
            className="w-full py-4 rounded-[14px] items-center justify-center bg-[#1A1A1A] flex-row gap-3"
          >
            <Text className="text-white text-[17px] font-semibold"> Continuar com Apple</Text>
          </TouchableOpacity>

          {/* Sign in with Google */}
          <TouchableOpacity
            onPress={() => router.push('/(onboarding)/paywall-soft')}
            activeOpacity={0.85}
            className="w-full py-4 rounded-[14px] items-center justify-center bg-[#F5F5F7] flex-row gap-3"
          >
            <Text className="text-[#1A1A1A] text-[17px] font-semibold">G  Continuar com Google</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1" />

        <Text className="text-center text-[13px] text-[#9CA3AF] pb-8 leading-relaxed">
          Ao continuar, você concorda com nossos{'\n'}
          Termos de Uso e Política de Privacidade.
        </Text>
      </View>
    </QuizLayout>
  );
}
