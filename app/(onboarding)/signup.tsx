import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
  LayoutAnimation, UIManager, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Mail } from 'lucide-react-native';
import Svg, { Path, Rect, G, Ellipse, Circle } from 'react-native-svg';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold,
  Nunito_700Bold,
  Nunito_600SemiBold,
  Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { saveOnboardingProtocol } from '../../lib/onboardingPrefetch';
import { attributeCouponIfAny } from '../../lib/couponAttribution';
import { haptics } from '../../lib/haptics';
import { useObFrame, OB_STEPS, obStep } from '../../components/onboarding/kit';
import { SignupHeroText } from '../../components/onboarding/SignupHeroText';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEEP = '#121212';
const DEEP_SOFT = '#515151';
const CORAL = '#FF9D9D';
const CORAL_DEEP = '#F2808E';

export default function Signup() {
  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Nunito_400Regular,
  });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold' : undefined;
  const fReg   = fontsLoaded ? 'Nunito_400Regular' : undefined;
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, loading } = useAuth();
  const { saveToSupabase, scanResult, onboarding, setProtocolResult, setProtocolGenerating } = useAppStore();
  const { track, identify } = useMixpanel();
  const armHomeTutorial = useAppStore((s) => s.armHomeTutorial);

  // Fim do onboarding: conta criada → HOME. O carrossel pós-cadastro (`apresentacao`)
  // saiu do fluxo completo, então o tutorial de primeiro acesso é armado AQUI — este
  // é agora o único caminho de usuária NOVA até a home (login, paywall de
  // reengajamento e `index` com sessão são de conta existente). Conta existente que
  // refaz o onboarding também passa, e quem barra é o servidor
  // (`users.home_tutorial_seen_at`). Ver "Feature: Tutorial de primeiro acesso".
  const finishOnboarding = () => {
    track('onboarding_step_completed', obStep(OB_STEPS.criarConta, 'Criar Conta'));
    armHomeTutorial();
    router.replace('/(app)/home');
  };

  const startProtocolGeneration = (userId: string) => {
    if (!scanResult) return;
    // Lê skinScanId diretamente do store após saveToSupabase tê-lo setado —
    // o closure do render ainda teria o valor antigo (null).
    const freshSkinScanId = useAppStore.getState().skinScanId;
    setProtocolGenerating(true);
    // A rotina costuma já estar pronta (gerada em segundo plano desde o objetivo):
    // aqui ela só é gravada com o user_id. Se as respostas mudaram, falhou ou não
    // existe, gera como antes. Não bloqueia a navegação. Ver `lib/onboardingPrefetch.ts`.
    saveOnboardingProtocol({
      scanResult,
      onboardingData: onboarding,
      skinScanId: freshSkinScanId,
      userId,
      onSuccess: setProtocolResult,
      onFinally: () => setProtocolGenerating(false),
    });
  };

  useEffect(() => {
    track('onboarding_step_viewed', obStep(OB_STEPS.criarConta, 'Criar Conta'));
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
  // Tela 10a mostra só os três botões; "Continuar com e-mail" abre o formulário.
  const [showEmailForm, setShowEmailForm] = useState(false);
  const { y, insets } = useObFrame();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // O design é desenhado em 393 pt de largura: centraliza as posições horizontais.
  const x0 = (screenW - 393) / 2;
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
        finishOnboarding();
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

  const handleAppleSignIn = async () => {
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
      finishOnboarding();
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Tente novamente.');
    }
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
      finishOnboarding();
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
            <Text style={{ fontFamily: fXBold, fontSize: 28, fontWeight: '800', color: DEEP, textAlign: 'center', marginBottom: 14, letterSpacing: -0.7, lineHeight: 32 }}>
              Verifique seu e-mail
            </Text>
            <Text style={{ fontFamily: fReg, fontSize: 14.5, color: DEEP_SOFT, textAlign: 'center', marginBottom: 8, lineHeight: 21.75 }}>
              {'Enviamos um link de confirmação para '}
              <Text style={{ fontFamily: fXBold, fontWeight: '700', color: DEEP }}>{emailSent}</Text>
              {'. Clique no link para ativar sua conta.'}
            </Text>
            <Text style={{ fontFamily: fReg, fontSize: 13, color: DEEP_SOFT, textAlign: 'center', marginBottom: 40, lineHeight: 19.5, opacity: 0.7 }}>
              Não se esqueça de checar a pasta de spam.
            </Text>
            <TouchableOpacity
              onPress={handleResend}
              disabled={resendCooldown > 0}
              activeOpacity={0.85}
              style={{
                width: '100%', height: 60, borderRadius: 100,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: resendCooldown > 0 ? 'rgba(18,18,18,0.18)' : CORAL,
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: resendCooldown > 0 ? 0 : 14 },
                shadowOpacity: resendCooldown > 0 ? 0 : 0.55,
                shadowRadius: 30,
                marginBottom: 8,
              }}
            >
              <Text style={{ fontFamily: fSemi, fontSize: 17, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.2 }}>
                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar e-mail'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleUseOtherEmail} activeOpacity={0.7} style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: fReg, fontSize: 15, color: DEEP_SOFT, letterSpacing: -0.1 }}>Usar outro e-mail</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Tela 10a · Criar conta (clone do Flo) ─────────────────────────────────
  if (!showEmailForm) {
    const btn = {
      height: 46, borderRadius: 23,
      flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 12,
    };
    const btnText = { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 };
    // Botões na mesma grade do resto (Apple no topo a 627 pt). Em telas baixas em
    // que não cabem, sobem até ficarem a 19 pt da safe area de baixo.
    const buttonCount = Platform.OS === 'ios' ? 3 : 2;
    const buttonsH = 46 * buttonCount + 17 * (buttonCount - 1);
    const buttonsTop = Math.min(y(799) - buttonsH, screenH - insets.bottom - 19 - buttonsH);
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        {/* X 19 × 19 */}
        <View style={{ position: 'absolute', left: x0 + 22, top: y(59.5) }}>
          <Svg width={19} height={19} viewBox="0 0 19 19">
            <Path d="M1.5 1.5 L17.5 17.5 M17.5 1.5 L1.5 17.5" fill="none" stroke="#121212" strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </View>

        {/* Dois ramos de 7 flores */}
        {FLOWERS.map(([left, top, rot, size], i) => (
          <View key={i} style={{ position: 'absolute', left: x0 + left, top: y(top), transform: [{ rotate: `${rot}deg` }] }}>
            <Flower size={size} />
          </View>
        ))}

        {/* "#1" e "app de / skincare com IA*" — contornos da SF nos pesos exatos do design */}
        <View pointerEvents="none" style={{ position: 'absolute', left: x0, top: y(0), width: 393, height: 852 }}>
          <SignupHeroText />
        </View>

        <View style={{ position: 'absolute', left: x0 + 17, width: 359, top: y(404), alignItems: 'center', gap: 12 }}>
          <Text numberOfLines={1} style={{ fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, color: '#121212', textAlign: 'center' }}>
            Cuide da sua pele de verdade
          </Text>
          <Text style={{ paddingHorizontal: 13, fontSize: 18, lineHeight: 25, fontWeight: '400', color: '#818181', textAlign: 'center' }}>
            90% das usuárias dizem que o NIKS entende o que a pele delas precisa.
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: '#818181', textAlign: 'center' }}>
            Com base em pesquisa com usuárias do NIKS
          </Text>
        </View>

        {/* Três botões de 46 pt, 17 pt entre eles; o último termina a 53 pt da base do frame */}
        <View style={{ position: 'absolute', left: x0 + 17, width: 359, top: buttonsTop, gap: 17 }}>
          {Platform.OS === 'ios' && (
            <TouchableOpacity onPress={handleAppleSignIn} disabled={loading} activeOpacity={0.85} style={[btn, { backgroundColor: '#000000' }]}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : (
                <>
                  <Svg width={22} height={22} viewBox="0 0 24 24">
                    <Path fill="#FFFFFF" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </Svg>
                  <Text style={[btnText, { color: '#FFFFFF' }]}>Continuar com Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleGoogleSignIn} disabled={loading} activeOpacity={0.85} style={[btn, { backgroundColor: '#F0F0F0' }]}>
            {loading ? <ActivityIndicator color="#121212" /> : (
              <>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
                  <Path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24z" />
                  <Path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1z" />
                  <Path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.88 8.87 4.77 12 4.77z" />
                </Svg>
                <Text style={[btnText, { color: '#121212' }]}>Continuar com Google</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptics.action(); setShowEmailForm(true); }}
            activeOpacity={0.85}
            style={[btn, { backgroundColor: '#F0F0F0' }]}
          >
            <Svg width={25} height={21} viewBox="0 0 25 21">
              <Rect x={0} y={0} width={25} height={21} rx={4} fill="#121212" />
              <Path d="M5 6 L12.5 12 L20 6" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[btnText, { color: '#121212' }]}>Continuar com e-mail</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>
        <TouchableOpacity
          onPress={() => { haptics.tap(); setShowEmailForm(false); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ position: 'absolute', left: 22, top: 5.5, zIndex: 1 }}
        >
          <Svg width={19} height={19} viewBox="0 0 19 19">
            <Path d="M1.5 1.5 L17.5 17.5 M17.5 1.5 L1.5 17.5" fill="none" stroke="#121212" strokeWidth={1.8} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Title block */}
            <View style={{ paddingTop: 34, paddingHorizontal: 28 }}>
              <Text style={{ fontFamily: fSemi, fontSize: 10, fontWeight: '600', color: CORAL_DEEP, letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14 }}>
                sua conta
              </Text>
              <Text style={{ fontFamily: fXBold, fontSize: 26, fontWeight: '800', color: DEEP, letterSpacing: -0.7, lineHeight: 29.9 }}>
                {'Bem-vinda! Vamos começar personalizando a '}
                <Text style={{ fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -0.9 }}>
                  sua jornada
                </Text>
                {'.'}
              </Text>
              <Text style={{ fontFamily: fReg, marginTop: 14, fontSize: 14.5, lineHeight: 21.75, color: DEEP_SOFT, letterSpacing: -0.1 }}>
                {'Crie sua conta no '}
                <Text style={{ fontFamily: fXBold, fontWeight: '700', color: DEEP }}>NIKS</Text>
                {' para começar a sua jornada.'}
              </Text>
            </View>

            <View style={{ flex: 1, minHeight: 32 }} />

            {/* Form */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 14, gap: 14 }}>

              {/* Email field */}
              <View>
                <Text style={{ fontFamily: fSemi, fontSize: 14, fontWeight: '600', color: DEEP, letterSpacing: -0.1, marginBottom: 10 }}>
                  Endereço de e-mail
                </Text>
                <View style={{
                  height: 56, borderRadius: 16,
                  backgroundColor: '#FFFFFF',
                  borderWidth: emailFocused ? 1.5 : 1,
                  borderColor: emailFocused ? CORAL : 'rgba(18,18,18,0.12)',
                  shadowColor: CORAL,
                  shadowOffset: { width: 0, height: emailFocused ? 6 : 2 },
                  shadowOpacity: emailFocused ? 0.22 : 0.03,
                  shadowRadius: emailFocused ? 22 : 14,
                  paddingHorizontal: 18,
                  justifyContent: 'center',
                }}>
                  <TextInput
                    placeholder="seuemail@exemplo.com"
                    placeholderTextColor="rgba(18,18,18,0.30)"
                    value={email}
                    onChangeText={handleEmailChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    style={{ fontFamily: fReg, fontSize: 16, color: DEEP, letterSpacing: -0.15 }}
                  />
                </View>
              </View>

              {/* Password field */}
              {step === 'password' && (
                <View>
                  <Text style={{ fontFamily: fSemi, fontSize: 14, fontWeight: '600', color: DEEP, letterSpacing: -0.1, marginBottom: 10 }}>
                    Defina uma senha para a sua conta
                  </Text>
                  <View style={{
                    height: 56, borderRadius: 16,
                    backgroundColor: '#FFFFFF',
                    borderWidth: passwordFocused ? 1.5 : 1,
                    borderColor: passwordFocused ? DEEP : 'rgba(18,18,18,0.12)',
                    shadowColor: DEEP,
                    shadowOffset: { width: 0, height: passwordFocused ? 4 : 2 },
                    shadowOpacity: passwordFocused ? 0.16 : 0.03,
                    shadowRadius: passwordFocused ? 18 : 14,
                    paddingHorizontal: 18,
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                  }}>
                    <TextInput
                      placeholder="Mínimo 8 caracteres"
                      placeholderTextColor="rgba(18,18,18,0.30)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoFocus
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      style={{
                        flex: 1, fontFamily: fReg, fontSize: 16, color: DEEP,
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
                    backgroundColor: emailActive ? CORAL : 'rgba(18,18,18,0.18)',
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: CORAL,
                    shadowOffset: { width: 0, height: emailActive ? 14 : 0 },
                    shadowOpacity: emailActive ? 0.55 : 0,
                    shadowRadius: 30,
                    elevation: emailActive ? 8 : 0,
                  }}
                >
                  <Text style={{ fontFamily: fSemi, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: emailActive ? '#FFFFFF' : 'rgba(255,255,255,0.92)' }}>
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
                    backgroundColor: passwordActive ? CORAL : 'rgba(18,18,18,0.18)',
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
                    : <Text style={{ fontFamily: fSemi, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: passwordActive ? '#FFFFFF' : 'rgba(255,255,255,0.92)' }}>Criar minha conta</Text>
                  }
                </TouchableOpacity>
              )}

            </View>

            {/* Terms */}
            <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 18, alignItems: 'center' }}>
              <Text style={{ fontFamily: fReg, textAlign: 'center', fontSize: 12, lineHeight: 18, color: DEEP_SOFT, letterSpacing: -0.05 }}>
                {'Ao continuar, você concorda com nossos '}
                <Text
                  onPress={() => { haptics.tap(); Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5'); }}
                  style={{ fontFamily: fSemi, color: DEEP, fontWeight: '600', textDecorationLine: 'underline' }}
                >
                  Termos de Uso
                </Text>
                {' e '}
                <Text
                  onPress={() => { haptics.tap(); Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5'); }}
                  style={{ fontFamily: fSemi, color: DEEP, fontWeight: '600', textDecorationLine: 'underline' }}
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

// Tela 10a: dois ramos de 7 flores — [left, top, rotação°, tamanho] no frame de 393 × 852.
const FLOWERS: [number, number, number, number][] = [
  [94.3, 148.3, 20, 10], [288.7, 148.3, -20, 10],
  [72.0, 158.8, -15, 14.5], [306.6, 158.8, 15, 14.5],
  [54.3, 175.4, 30, 18], [320.7, 175.4, -30, 18],
  [42.1, 199.3, 5, 21.5], [329.4, 199.3, -5, 21.5],
  [40.9, 228.8, -20, 23.5], [328.6, 228.8, 20, 23.5],
  [48.3, 261.0, 15, 28], [316.7, 261.0, -15, 28],
  [73.1, 287.6, -5, 22], [297.9, 287.6, 5, 22],
];

function Flower({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="-1 -1 2 2">
      <G fill="#FFC4DA">
        {[0, 60, 120, 180, 240, 300].map((r) => (
          <Ellipse key={r} cx={0} cy={-0.52} rx={0.2} ry={0.44} transform={`rotate(${r})`} />
        ))}
      </G>
      <Circle cx={0} cy={0} r={0.13} fill="#FFFFFF" />
    </Svg>
  );
}
