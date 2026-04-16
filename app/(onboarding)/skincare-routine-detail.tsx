import { useState, useEffect } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

export default function SkincareRoutineDetail() {
  const { onboarding, setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  const [description, setDescription] = useState(onboarding.skincare_routine_description ?? '');

  useEffect(() => {
    track('onboarding_step_viewed', { step_name: 'skincare_routine_detail' });
  }, []);

  const title = onboarding.skincare_routine_type === 'prescribed'
    ? 'Quais produtos foram prescritos?'
    : 'Quais produtos você já usa?';

  const handleContinue = () => {
    track('onboarding_step_completed', { step_name: 'skincare_routine_detail' });
    router.push('/(onboarding)/allergies');
  };

  return (
    <QuizLayout progress={90}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="pt-8 flex-1">
            <View className="mb-8">
              <Text className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-2">
                {title}
              </Text>
              <Text className="text-[#9CA3AF] text-[17px]">
                Descreva brevemente. Isso nos ajuda a montar o melhor protocolo para você.
              </Text>
            </View>

            <TextInput
              multiline
              numberOfLines={6}
              placeholder="Ex: uso vitamina C de manhã e hidratante à noite..."
              placeholderTextColor="#9CA3AF"
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                setOnboardingField('skincare_routine_description', text || null);
              }}
              textAlignVertical="top"
              style={{
                backgroundColor: '#F3F3F5',
                borderRadius: 12,
                padding: 16,
                fontSize: 15,
                color: '#1A1A1A',
                minHeight: 140,
              }}
            />

            <View className="flex-1" />

            <View className="pb-8">
              <CTAButton
                text="Continuar"
                disabled={description.length < 3}
                onPress={handleContinue}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </QuizLayout>
  );
}
