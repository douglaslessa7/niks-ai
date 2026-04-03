import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  LayoutAnimation, UIManager, Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../../hooks/useAuth';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { usePlacement } from 'expo-superwall';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M14.12 10.47c-.02-2.13 1.74-3.16 1.82-3.21-1-1.46-2.55-1.66-3.1-1.68-1.32-.13-2.58.78-3.25.78-.67 0-1.7-.76-2.8-.74-1.44.02-2.77.84-3.51 2.13-1.5 2.59-.38 6.43 1.07 8.53.72 1.03 1.57 2.18 2.68 2.14 1.08-.04 1.49-.69 2.8-.69 1.3 0 1.67.69 2.81.67 1.16-.02 1.89-1.05 2.6-2.08.82-1.19 1.16-2.34 1.18-2.4-.03-.01-2.28-.87-2.3-3.45z"
        fill="white"
      />
      <Path
        d="M12.02 4.17c.6-.73 1-1.73.89-2.74-.86.04-1.9.57-2.51 1.29-.55.64-1.03 1.66-.9 2.64.95.07 1.93-.48 2.52-1.19z"
        fill="white"
      />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.31z" fill="#4285F4" />
      <Path d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H1.07v2.58A10 10 0 0 0 10 20z" fill="#34A853" />
      <Path d="M4.41 11.92A6.01 6.01 0 0 1 4.1 10c0-.67.11-1.32.31-1.92V5.5H1.07A10 10 0 0 0 0 10c0 1.61.39 3.14 1.07 4.5l3.34-2.58z" fill="#FBBC05" />
      <Path d="M10 3.96c1.47 0 2.79.5 3.83 1.49l2.87-2.87C14.95.99 12.69 0 10 0A10 10 0 0 0 1.07 5.5l3.34 2.58C5.2 5.72 7.4 3.96 10 3.96z" fill="#EA4335" />
    </Svg>
  );
}

export default function Login() {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, signInWithEmail, loading } = useAuth();
  const { registerPlacement } = usePlacement();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const routeAfterLogin = async () => {
    try {
      const info = await getCustomerInfo();
      if (isSubscribed(info)) {
        router.replace('/(app)/home');
      } else {
        registerPlacement({ placement: 'paywall_onboarding' });
      }
    } catch {
      registerPlacement({ placement: 'paywall_onboarding' });
    }
  };

  const handleEmailContinue = () => {
    if (!email.trim()) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep('password');
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (step === 'password') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStep('email');
    }
  };

  const handleLogin = async () => {
    if (!password.trim()) return;
    try {
      await signInWithEmail(email, password);
      await routeAfterLogin();
    } catch (error: any) {
      Alert.alert('Erro ao entrar', error?.message ?? 'Tente novamente.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      await routeAfterLogin();
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Tente novamente.');
    }
  };

  const emailBorderColor = focusedField === 'email' ? '#2A7C6F' : '#E5E7EB';
  const passwordBorderColor = focusedField === 'password' ? '#2A7C6F' : '#E5E7EB';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 max-w-[393px] w-full mx-auto">
        {/* Back button */}
        <View className="pt-4 px-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="w-9 h-9 rounded-full bg-[#F6F4EE] items-center justify-center"
          >
            <ArrowLeft size={18} color="#1A1A1A" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <View>
            <Text
              className="text-[32px] font-bold text-[#1A1A1A] leading-tight tracking-tight mb-3"
            >
              Bem-vindo de volta
            </Text>
            <Text className="text-[16px] text-[#8A8A8E]">
              Entre na sua conta no{' '}
              <Text className="font-bold text-[#1A1A1A]">NIKS AI</Text>
              {' '}para continuar sua jornada.
            </Text>
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Form + Buttons */}
          <View className="gap-3">
            {/* Email field */}
            <View className="gap-1.5">
              <Text className="text-[13px] font-semibold text-[#1A1A1A]">
                Endereço de e-mail
              </Text>
              <TextInput
                placeholder="seuemail@exemplo.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                style={{
                  height: 52,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  fontSize: 16,
                  color: '#1A1A1A',
                  borderWidth: 1.5,
                  borderColor: emailBorderColor,
                  backgroundColor: '#FFFFFF',
                }}
              />
            </View>

            {/* Password field — aparece no step password */}
            {step === 'password' && (
              <View className="gap-1.5">
                <Text className="text-[13px] font-semibold text-[#1A1A1A]">
                  Sua senha
                </Text>
                <View>
                  <TextInput
                    placeholder="Digite sua senha"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoFocus
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      height: 52,
                      paddingHorizontal: 16,
                      paddingRight: 48,
                      borderRadius: 12,
                      fontSize: 16,
                      color: '#1A1A1A',
                      borderWidth: 1.5,
                      borderColor: passwordBorderColor,
                      backgroundColor: '#FAFAFA',
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showPassword
                      ? <EyeOff size={20} color="#9CA3AF" />
                      : <Eye size={20} color="#9CA3AF" />
                    }
                  </TouchableOpacity>
                </View>
                <TouchableOpacity className="self-end" activeOpacity={0.7}>
                  <Text className="text-[13px] font-medium text-[#2A7C6F]">
                    Esqueceu sua senha?
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* CTA button */}
            {step === 'email' ? (
              <TouchableOpacity
                onPress={handleEmailContinue}
                activeOpacity={0.85}
                style={{
                  height: 52,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: email.trim() ? '#1A1A1A' : '#D1D5DB',
                }}
              >
                <Text className="text-white text-[17px] font-semibold">Continuar</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleLogin}
                activeOpacity={0.85}
                disabled={loading}
                style={{
                  height: 52,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: password.trim() ? '#FB7B6B' : '#D1D5DB',
                }}
              >
                {loading
                  ? <ActivityIndicator color="white" />
                  : <Text className="text-white text-[17px] font-semibold">Entrar</Text>
                }
              </TouchableOpacity>
            )}

            {/* Divider + social buttons — só no step email */}
            {step === 'email' && (
              <>
                <View className="flex-row items-center gap-3 py-1">
                  <View className="flex-1 h-[1px] bg-[#E5E7EB]" />
                  <Text className="text-[13px] text-[#9CA3AF]">ou</Text>
                  <View className="flex-1 h-[1px] bg-[#E5E7EB]" />
                </View>

                {/* Entrar com Google */}
                <TouchableOpacity
                  onPress={handleGoogleLogin}
                  activeOpacity={0.85}
                  disabled={loading}
                  className="w-full flex-row items-center justify-center gap-3"
                  style={{
                    height: 52,
                    borderRadius: 14,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: '#E5E7EB',
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#1A1A1A" />
                    : (
                      <>
                        <GoogleIcon />
                        <Text className="text-[#1A1A1A] text-[16px] font-semibold">
                          Entrar com Google
                        </Text>
                      </>
                    )
                  }
                </TouchableOpacity>

               {/* Entrar com Apple — só iOS */}
               {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        const data = await signInWithApple();
                        if (!data) return;
                        await routeAfterLogin();
                      } catch (error: any) {
                        Alert.alert('Erro', error?.message ?? 'Tente novamente.');
                      }
                    }}
                    activeOpacity={0.85}
                    disabled={loading}
                    className="w-full flex-row items-center justify-center gap-3"
                    style={{
                      height: 52,
                      borderRadius: 14,
                      backgroundColor: '#1A1A1A',
                    }}
                  >
                    {loading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : (
                        <>
                          <AppleIcon />
                          <Text className="text-white text-[16px] font-semibold">
                            Entrar com Apple
                          </Text>
                        </>
                      )
                    }
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Terms */}
            <View className="flex-row flex-wrap justify-center items-center px-2 pt-1">
              <Text className="text-[11px] text-[#9CA3AF] leading-relaxed">
                Ao continuar, você concorda com nossos{' '}
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5')}>
                <Text className="text-[11px] text-[#1A1A1A] underline font-medium leading-relaxed">Termos de Uso</Text>
              </TouchableOpacity>
              <Text className="text-[11px] text-[#9CA3AF] leading-relaxed">{' '}e{' '}</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5')}>
                <Text className="text-[11px] text-[#1A1A1A] underline font-medium leading-relaxed">Política de Privacidade</Text>
              </TouchableOpacity>
              <Text className="text-[11px] text-[#9CA3AF] leading-relaxed">.</Text>
            </View>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
