import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  LayoutAnimation, UIManager, Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
} from 'react-native';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Mail } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

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
      <Path d="M19.6 10.227c0-.709-.064-1.39-.182-2.045H10v3.868h5.382a4.6 4.6 0 01-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z" fill="#4285F4" />
      <Path d="M10 20c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H1.064v2.59A9.996 9.996 0 0010 20z" fill="#34A853" />
      <Path d="M4.405 11.9c-.2-.6-.314-1.24-.314-1.9 0-.66.114-1.3.314-1.9V5.51H1.064A9.996 9.996 0 000 10c0 1.614.386 3.14 1.064 4.49l3.34-2.59z" fill="#FBBC05" />
      <Path d="M10 3.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C14.959.99 12.695 0 10 0 6.09 0 2.71 2.24 1.064 5.51l3.34 2.59C5.19 5.736 7.395 3.977 10 3.977z" fill="#EA4335" />
    </Svg>
  );
}

export default function Signup() {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, loading } = useAuth();
  const { saveToSupabase } = useAppStore();
  const { track, identify } = useMixpanel();

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  const [waitingConfirmation, setWaitingConfirmation] = useState(false);
  const [emailSent, setEmailSent] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleCreateAccount = async () => {
    if (!password.trim()) return;
    try {
      setLocalLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'niks-ai://auth/confirm',
        },
      });
      if (error) {
        Alert.alert('Erro ao criar conta', error.message ?? 'Tente novamente.');
        return;
      }
      if (!error && data.user && !data.session) {
        setEmailSent(email);
        setWaitingConfirmation(true);
      } else if (!error && data.session) {
        if (data.session.user?.id) {
          identify(data.session.user.id);
          await saveToSupabase(data.session.user.id);
        }
        track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
        router.push('/(onboarding)/skincare-routine');
      }
    } catch (error: any) {
      Alert.alert('Erro ao criar conta', error?.message ?? 'Tente novamente.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResend = async () => {
    await supabase.auth.resend({ type: 'signup', email: emailSent });
    setResendCooldown(30);
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    resendIntervalRef.current = interval;
  };

  const handleUseOtherEmail = () => {
    setWaitingConfirmation(false);
    setEmail('');
    setPassword('');
    setStep('email');
  };

  const handleGoogleSignIn = async () => {
    try {
      const session = await signInWithGoogle();
      if (session?.user?.id) {
        identify(session.user.id);
        await saveToSupabase(session.user.id);
      }
      track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
      router.push('/(onboarding)/skincare-routine');
    } catch (error: any) {
      Alert.alert('Erro', JSON.stringify(error));
    }
  };

  const emailBorderColor = focusedField === 'email' ? '#2A7C6F' : '#E5E7EB';
  const passwordBorderColor = focusedField === 'password' ? '#2A7C6F' : '#E5E7EB';

  if (waitingConfirmation) {
    return (
      <QuizLayout progress={96} showBack>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 }}>
          <View style={{ marginBottom: 24 }}>
            <Mail size={64} color={Colors.accent} />
          </View>

          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1D3A44', textAlign: 'center', marginBottom: 16 }}>
            Verifique seu e-mail
          </Text>

          <Text style={{ fontSize: 15, color: '#9CA3AF', textAlign: 'center', marginBottom: 8, lineHeight: 22 }}>
            Enviamos um link de confirmação para{' '}
            <Text style={{ fontWeight: 'bold', color: '#1A1A1A' }}>{emailSent}</Text>
            {'. '}Clique no link para ativar sua conta.
          </Text>

          <Text style={{ fontSize: 13, color: Colors.muted, textAlign: 'center', marginBottom: 40 }}>
            Não se esqueça de checar a pasta de spam.
          </Text>

          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0}
            activeOpacity={0.85}
            style={{
              width: '100%',
              height: 52,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: resendCooldown > 0 ? '#E5E7EB' : Colors.accent,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: resendCooldown > 0 ? '#9CA3AF' : Colors.accent }}>
              Reenviar e-mail
            </Text>
          </TouchableOpacity>

          {resendCooldown > 0 && (
            <Text style={{ fontSize: 13, color: Colors.muted, marginBottom: 16 }}>
              Reenviar disponível em {resendCooldown}s
            </Text>
          )}

          <TouchableOpacity
            onPress={handleUseOtherEmail}
            activeOpacity={0.7}
            style={{ marginTop: 8 }}
          >
            <Text style={{ fontSize: 15, color: Colors.muted }}>Usar outro e-mail</Text>
          </TouchableOpacity>
        </View>
      </QuizLayout>
    );
  }

  return (
    <QuizLayout progress={96} showBack>
      <KeyboardAvoidingView
        style={{ flex: 1, paddingTop: 32 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Heading */}
        <View className="mb-8">
          <Text className="text-[28px] font-bold text-[#1A1A1A] leading-tight tracking-tight">
            Salve seu progresso
          </Text>
          <Text className="text-[15px] text-[#8A8A8E] mt-2">
            Crie sua conta no{' '}
            <Text className="font-bold text-[#1A1A1A]">NIKS AI</Text>
            {' '}para começar a sua jornada.
          </Text>
        </View>

        {/* Spacer */}
        <View className="flex-1" />

        <View className="gap-3 mb-8">
          {/* Email field — sempre visível */}
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
                Defina uma senha para a sua conta
              </Text>
              <View>
                <TextInput
                  placeholder="Mínimo 8 caracteres"
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
              onPress={handleCreateAccount}
              activeOpacity={0.85}
              disabled={localLoading}
              style={{
                height: 52,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: password.trim() ? '#FB7B6B' : '#D1D5DB',
              }}
            >
              {localLoading
                ? <ActivityIndicator color="white" />
                : <Text className="text-white text-[17px] font-semibold">Criar minha conta</Text>
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

              {/* Continuar com o Google */}
              <TouchableOpacity
                onPress={handleGoogleSignIn}
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
                        Continuar com o Google
                      </Text>
                    </>
                  )
                }
              </TouchableOpacity>

              {/* Continuar com a Apple — só iOS */}
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const data = await signInWithApple();
                      if (!data) return;
                      if (data.user?.id) {
                        identify(data.user.id);
                        await saveToSupabase(data.user.id);
                      }
                      track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
                      router.push('/(onboarding)/skincare-routine');
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
                    ? <ActivityIndicator color="white" />
                    : (
                      <>
                        <AppleIcon />
                        <Text className="text-white text-[16px] font-semibold">
                          Continuar com a Apple
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
    </QuizLayout>
  );
}
