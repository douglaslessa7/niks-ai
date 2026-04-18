import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

export default function SkincareRoutineDetail() {
  const { onboarding, setOnboardingField } = useAppStore();
  const { track } = useMixpanel();
  const router = useRouter();

  const [description, setDescription] = useState(onboarding.skincare_routine_description ?? '');
  const [focused, setFocused] = useState(false);

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
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>

            <View style={{ marginTop: 16 }}>
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                <View style={{ height: 2, width: '90%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 40, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={{
                fontSize: 11,
                fontWeight: '700',
                color: Colors.scanBtn,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Sua rotina
              </Text>

              <Text style={{
                fontSize: 26,
                fontWeight: '800',
                color: Colors.tabActive,
                lineHeight: 31,
                marginBottom: 8,
              }}>
                {title}
              </Text>

              <Text style={{
                fontSize: 13,
                color: Colors.gray,
                lineHeight: 20,
                marginBottom: 28,
              }}>
                Descreva brevemente. Isso nos ajuda a montar o melhor protocolo para você.
              </Text>

              <TextInput
                multiline
                numberOfLines={6}
                placeholder="Ex: uso vitamina C de manhã e hidratante à noite..."
                placeholderTextColor={Colors.gray}
                value={description}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChangeText={(text) => {
                  setDescription(text);
                  setOnboardingField('skincare_routine_description', text || null);
                }}
                textAlignVertical="top"
                style={{
                  backgroundColor: Colors.white,
                  borderRadius: 16,
                  padding: 16,
                  fontSize: 15,
                  color: Colors.tabActive,
                  minHeight: 140,
                  borderWidth: 1.5,
                  borderColor: focused ? Colors.scanBtn : 'rgba(0,0,0,0.08)',
                  marginBottom: 24,
                }}
              />

              <TouchableOpacity
                onPress={handleContinue}
                disabled={description.length < 3}
                activeOpacity={0.8}
                style={{
                  backgroundColor: description.length < 3 ? '#E5E7EB' : Colors.scanBtn,
                  borderRadius: 100,
                  paddingVertical: 16,
                  alignItems: 'center',
                  opacity: description.length < 3 ? 0.6 : 1,
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: description.length < 3 ? Colors.gray : Colors.white,
                }}>
                  Continuar
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
