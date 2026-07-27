import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
  LayoutAnimation, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Mail } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { generateAndSaveProtocol } from '../../lib/generateProtocol';
import { attributeCouponIfAny } from '../../lib/couponAttribution';
import { haptics } from '../../lib/haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';

export default function Signup() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, loading } = useAuth();
  const { saveToSupabase, scanResult, onboarding, setProtocolResult, setProtocolGenerating } = useAppStore();
  const { track, identify } = useMixpanel();

  const startProtocolGeneration = (userId: string) => {
    if (!scanResult) return;
    // Lê skinScanId diretamente do store após saveToSupabase tê-lo setado —
    // o closure do render ainda teria o valor antigo (null).
    const freshSkinScanId = useAppStore.getState().skinScanId;
    setProtocolGenerating(true);
    generateAndSaveProtocol({
      scanResult,
      onboardingData: onboarding,
      skinScanId: freshSkinScanId,
      userId,
      onSuccess: setProtocolResult,
      onFinally: () => setProtocolGenerating(false),
    });
  };

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
    haptics.action();
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
    haptics.action();
    if (!password.trim()) return;
    try {
      setLocalLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: 'niks-ai://auth/confirm' },
      });
      if (error) { Alert.alert('Erro ao criar conta', error.message ?? 'Tente novamente.'); return; }
      if (!error && data.user && !data.session) {
        setEmailSent(email);
        setWaitingConfirmation(true);
      } else if (!error && data.session) {
        if (data.session.user?.id) {
          try {
            const Purchases = (await import('react-native-purchases')).default;
            await Purchases.logIn(data.session.user.id);
            // Sincroniza o receipt da Apple com o usuário RC identificado.
            // Sem isso, a compra feita pelo usuário anônimo não é transferida
            // quando o usuário identificado já existia no RC (fluxo: paywall → signup).
            await Purchases.restorePurchases();
          } catch (rcErr) {
            console.warn('[RevenueCat] logIn/restore failed after signup:', rcErr);
          }
          identify(data.session.user.id);
          await saveToSupabase(data.session.user.id);
          // Liga o cupom (se houver) ao user_id real. Não bloqueia: se falhar, a
          // usuária entra normalmente; o webhook ainda confirma a conversão.
          attributeCouponIfAny(data.session.user.id);
          startProtocolGeneration(data.session.user.id);
        }
        track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
        router.push('/(onboarding)/nome');
      }
    } catch (error: any) {
      Alert.alert('Erro ao criar conta', error?.message ?? 'Tente novamente.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResend = async () => {
    haptics.tap();
    await supabase.auth.resend({ type: 'signup', email: emailSent });
    setResendCooldown(30);
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    const interval = setInterval(() => {
      setResendCooldown(prev => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
    }, 1000);
    resendIntervalRef.current = interval;
  };

  const handleUseOtherEmail = () => {
    haptics.tap();
    setWaitingConfirmation(false);
    setEmail(''); setPassword(''); setStep('email');
  };

  const handleGoogleSignIn = async () => {
    haptics.action();
    try {
      const session = await signInWithGoogle();
      if (session?.user?.id) {
        try {
          const Purchases = (await import('react-native-purchases')).default;
          await Purchases.logIn(session.user.id);
          await Purchases.restorePurchases();
        } catch (rcErr) {
          console.warn('[RevenueCat] logIn/restore failed after signup:', rcErr);
        }
        identify(session.user.id);
        await saveToSupabase(session.user.id);
        attributeCouponIfAny(session.user.id);
        startProtocolGeneration(session.user.id);
      }
      track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
      router.push('/(onboarding)/nome');
    } catch (error: any) {
      Alert.alert('Erro', JSON.stringify(error));
    }
  };

  const emailActive = email.trim().length > 0;
  const passwordActive = password.trim().length > 0;
  const emailFocused = focusedField === 'email';
  const passwordFocused = focusedField === 'password';

  if (waitingConfirmation) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 32 }}>
            <View style={{ marginBottom: 24 }}>
              <Mail size={64} color={CORAL} />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '700', color: DEEP, textAlign: 'center', marginBottom: 14, letterSpacing: -0.7, lineHeight: 32 }}>
              Verifique seu e-mail
            </Text>
            <Text style={{ fontSize: 14.5, color: DEEP_SOFT, textAlign: 'center', marginBottom: 8, lineHeight: 21.75 }}>
              {'Enviamos um link de confirmação para '}
              <Text style={{ fontWeight: '700', color: DEEP }}>{emailSent}</Text>
              {'. Clique no link para ativar sua conta.'}
            </Text>
            <Text style={{ fontSize: 13, color: DEEP_SOFT, textAlign: 'center', marginBottom: 40, lineHeight: 19.5, opacity: 0.7 }}>
              Não se esqueça de checar a pasta de spam.
            </Text>
            <TouchableOpacity
              onPress={handleResend}
              disabled={resendCooldown > 0}
              activeOpacity={0.85}
              style={{
                width: '100%', height: 60, borderRadius: 100,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: resendCooldown > 0 ? 'rgba(29,58,68,0.18)' : CORAL,
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: resendCooldown > 0 ? 0 : 14 },
                shadowOpacity: resendCooldown > 0 ? 0 : 0.55,
                shadowRadius: 30,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.2 }}>
                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar e-mail'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleUseOtherEmail} activeOpacity={0.7} style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 15, color: DEEP_SOFT, letterSpacing: -0.1 }}>Usar outro e-mail</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title block */}
            <View style={{ paddingTop: 34, paddingHorizontal: 28 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: CORAL_DEEP, letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14 }}>
                sua conta
              </Text>
              <Text style={{ fontSize: 26, fontWeight: '700', color: DEEP, letterSpacing: -0.7, lineHeight: 29.9 }}>
                {'Bem-vinda! Vamos começar personalizando a '}
                <Text style={{ fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined, fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -0.9 }}>
                  sua jornada
                </Text>
                {'.'}
              </Text>
              <Text style={{ marginTop: 14, fontSize: 14.5, lineHeight: 21.75, color: DEEP_SOFT, letterSpacing: -0.1 }}>
                {'Crie sua conta no '}
                <Text style={{ fontWeight: '700', color: DEEP }}>NIKS</Text>
                {' para começar a sua jornada.'}
              </Text>
            </View>

            <View style={{ flex: 1, minHeight: 32 }} />

            {/* Form */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 14, gap: 14 }}>

              {/* Email field */}
              <View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: DEEP, letterSpacing: -0.1, marginBottom: 10 }}>
                  Endereço de e-mail
                </Text>
                <View style={{
                  height: 56, borderRadius: 16,
                  backgroundColor: '#FFFFFF',
                  borderWidth: emailFocused ? 1.5 : 1,
                  borderColor: emailFocused ? CORAL : 'rgba(29,58,68,0.12)',
                  shadowColor: CORAL,
                  shadowOffset: { width: 0, height: emailFocused ? 6 : 2 },
                  shadowOpacity: emailFocused ? 0.22 : 0.03,
                  shadowRadius: emailFocused ? 22 : 14,
                  paddingHorizontal: 18,
                  justifyContent: 'center',
                }}>
                  <TextInput
                    placeholder="seuemail@exemplo.com"
                    placeholderTextColor="rgba(29,58,68,0.30)"
                    value={email}
                    onChangeText={handleEmailChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    style={{ fontSize: 16, color: DEEP, letterSpacing: -0.15 }}
                  />
                </View>
              </View>

              {/* Password field */}
              {step === 'password' && (
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: DEEP, letterSpacing: -0.1, marginBottom: 10 }}>
                    Defina uma senha para a sua conta
                  </Text>
                  <View style={{
                    height: 56, borderRadius: 16,
                    backgroundColor: '#FFFFFF',
                    borderWidth: passwordFocused ? 1.5 : 1,
                    borderColor: passwordFocused ? DEEP : 'rgba(29,58,68,0.12)',
                    shadowColor: DEEP,
                    shadowOffset: { width: 0, height: passwordFocused ? 4 : 2 },
                    shadowOpacity: passwordFocused ? 0.16 : 0.03,
                    shadowRadius: passwordFocused ? 18 : 14,
                    paddingHorizontal: 18,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                  }}>
                    <TextInput
                      placeholder="Mínimo 8 caracteres"
                      placeholderTextColor="rgba(29,58,68,0.30)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoFocus
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        flex: 1, fontSize: 16, color: DEEP,
                        letterSpacing: (password.length > 0 && !showPassword) ? 4 : -0.15,
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => { haptics.tap(); setShowPassword(!showPassword); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {showPassword
                        ? <EyeOff size={20} color={DEEP} style={{ opacity: 0.55 }} />
                        : <Eye size={20} color={DEEP} style={{ opacity: 0.55 }} />
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Primary CTA */}
              {step === 'email' ? (
                <TouchableOpacity
                  onPress={handleEmailContinue}
                  activeOpacity={0.85}
                  style={{
                    height: 60, borderRadius: 100,
                    backgroundColor: emailActive ? CORAL : 'rgba(29,58,68,0.18)',
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: CORAL,
                    shadowOffset: { width: 0, height: emailActive ? 14 : 0 },
                    shadowOpacity: emailActive ? 0.55 : 0,
                    shadowRadius: 30,
                    elevation: emailActive ? 8 : 0,
                  }}
                >
                  <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: emailActive ? '#FFFFFF' : 'rgba(255,255,255,0.92)' }}>
                    Continuar
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleCreateAccount}
                  activeOpacity={0.85}
                  disabled={localLoading}
                  style={{
                    height: 60, borderRadius: 100,
                    backgroundColor: passwordActive ? CORAL : 'rgba(29,58,68,0.18)',
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: CORAL,
                    shadowOffset: { width: 0, height: passwordActive ? 14 : 0 },
                    shadowOpacity: passwordActive ? 0.55 : 0,
                    shadowRadius: 30,
                    elevation: passwordActive ? 8 : 0,
                  }}
                >
                  {localLoading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: passwordActive ? '#FFFFFF' : 'rgba(255,255,255,0.92)' }}>Criar minha conta</Text>
                  }
                </TouchableOpacity>
              )}

              {/* OR divider + social — only on email step */}
              {step === 'email' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 8 }}>
                    <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(29,58,68,0.16)' }} />
                    <Text style={{ fontSize: 13, color: DEEP_SOFT, letterSpacing: -0.05 }}>ou</Text>
                    <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(29,58,68,0.16)' }} />
                  </View>

                  {/* Google */}
                  <TouchableOpacity
                    onPress={handleGoogleSignIn}
                    activeOpacity={0.85}
                    disabled={loading}
                    style={{
                      height: 56, borderRadius: 100,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 0.5, borderColor: 'rgba(29,58,68,0.12)',
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                      shadowColor: '#2B2724',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.04, shadowRadius: 14,
                    }}
                  >
                    {loading ? <ActivityIndicator color={DEEP} /> : (
                      <>
                        <Svg width={20} height={20} viewBox="0 0 48 48">
                          <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                          <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                          <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                          <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </Svg>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: DEEP, letterSpacing: -0.15 }}>Continuar com o Google</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Apple — iOS only */}
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      onPress={async () => {
                        haptics.action();
                        try {
                          const data = await signInWithApple();
                          if (!data) return;
                          if (data.user?.id) {
                            try {
                              const Purchases = (await import('react-native-purchases')).default;
                              await Purchases.logIn(data.user.id);
                              await Purchases.restorePurchases();
                            } catch (rcErr) {
                              console.warn('[RevenueCat] logIn/restore failed after signup:', rcErr);
                            }
                            identify(data.user.id);
                            await saveToSupabase(data.user.id);
                            attributeCouponIfAny(data.user.id);
                            startProtocolGeneration(data.user.id);
                          }
                          track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
                          router.push('/(onboarding)/nome');
                        } catch (error: any) {
                          Alert.alert('Erro', error?.message ?? 'Tente novamente.');
                        }
                      }}
                      activeOpacity={0.85}
                      disabled={loading}
                      style={{
                        height: 56, borderRadius: 100,
                        backgroundColor: DEEP,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                        shadowColor: DEEP,
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.35, shadowRadius: 18, elevation: 4,
                      }}
                    >
                      {loading ? <ActivityIndicator color="#FFFFFF" /> : (
                        <>
                          <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
                            <Path d="M17.05 12.04c-.03-2.71 2.21-4.01 2.31-4.07-1.26-1.84-3.22-2.09-3.92-2.12-1.67-.17-3.26 1-4.11 1-.86 0-2.17-.98-3.57-.95-1.84.03-3.54 1.07-4.49 2.71-1.92 3.33-.49 8.25 1.38 10.96.91 1.32 2 2.8 3.4 2.75 1.37-.06 1.89-.88 3.54-.88 1.65 0 2.12.88 3.57.85 1.47-.03 2.4-1.35 3.3-2.68 1.04-1.54 1.47-3.04 1.49-3.12-.03-.01-2.87-1.1-2.9-4.36zM14.5 4.27c.75-.91 1.26-2.17 1.12-3.43-1.08.04-2.39.72-3.17 1.62-.7.8-1.31 2.08-1.15 3.32 1.21.09 2.45-.61 3.2-1.51z" fill="#FFFFFF" />
                          </Svg>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.15 }}>Continuar com a Apple</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* Terms */}
            <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 18, alignItems: 'center' }}>
              <Text style={{ textAlign: 'center', fontSize: 12, lineHeight: 18, color: DEEP_SOFT, letterSpacing: -0.05 }}>
                {'Ao continuar, você concorda com nossos '}
                <Text
                  onPress={() => { haptics.tap(); Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5'); }}
                  style={{ color: DEEP, fontWeight: '600', textDecorationLine: 'underline' }}
                >
                  Termos de Uso
                </Text>
                {' e '}
                <Text
                  onPress={() => { haptics.tap(); Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5'); }}
                  style={{ color: DEEP, fontWeight: '600', textDecorationLine: 'underline' }}
                >
                  Política de Privacidade
                </Text>
                {'.'}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
