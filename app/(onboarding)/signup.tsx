import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
  LayoutAnimation, UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Mail } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { saveOnboardingProtocol } from '../../lib/onboardingPrefetch';
import { attributeCouponIfAny } from '../../lib/couponAttribution';
import { confirmPremium, ensureAnonymousRevenueCat, pwlog } from '../../lib/subscriptionGate';
import { haptics } from '../../lib/haptics';
import { OB, ObScreen, ObPillButton, useObFrame, OB_STEPS, obStep } from '../../components/onboarding/kit';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Tela 24 do onboarding — criar conta, depois do paywall. LAYOUT da versão B (commit
// 8ae3453: "Bem-vinda! Vamos começar personalizando a sua jornada.", e-mail → senha,
// "ou", Google e Apple, termos) no VISUAL do kit (fonte do sistema, #FF5EA8, campos
// #F0F0F0), sem o X e sem a etiqueta "sua conta" (pedido do produto, out/2026). A tela
// "#1 app de skincare com IA" (modelo 10a) saiu; `SignupHeroText.tsx` ficou no repo.
// Lógica de cadastro intacta. → notificações.
const PRIVACY_URL = 'https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5';

export default function Signup() {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, loading } = useAuth();
  const { saveToSupabase, scanResult, onboarding, setProtocolResult, setProtocolGenerating, armHomeTutorial, setSubscriptionVerified } = useAppStore();
  const { track, identify } = useMixpanel();

  // ── Trava: o cadastro só aparece com `premium` CONFIRMADO no RevenueCat ──────
  // Regra de negócio (out/2026): qualquer outra resposta — erro, timeout, sem
  // internet, link direto `niks-ai://signup`, qualquer caminho que um dia chegue
  // aqui por engano — volta para o paywall. Na dúvida, paywall. Ver
  // `lib/subscriptionGate.ts` e "Guard de assinatura" no README.
  // Em __DEV__ o paywall é pulado de propósito (atalho de dev) — a trava também.
  const [liberado, setLiberado] = useState(__DEV__);
  useEffect(() => {
    if (__DEV__) return;
    let ativo = true;
    (async () => {
      await ensureAnonymousRevenueCat('cadastro');
      const ok = await confirmPremium({ label: 'cadastro:abertura' });
      if (!ativo) return;
      if (ok) {
        setLiberado(true);
      } else {
        pwlog('cadastro aberto sem premium → paywall'); // TEMP-PWGUARD
        router.replace('/(onboarding)/paywall-soft');
      }
    })();
    return () => { ativo = false; };
  }, []);

  // Conta criada → home. A permissão de notificação é pedida ANTES da conta (depois do
  // horário da rotina; o token vai no `saveToSupabase`), então a tela de notificações
  // pós-cadastro saiu do fluxo (out/2026). Este é agora o ÚNICO ponto em que uma usuária
  // NOVA entra no app — por isso o tutorial de primeiro acesso da home é armado AQUI
  // (conta existente que refaz o onboarding também passa; quem barra é o servidor,
  // `users.home_tutorial_seen_at`).
  // ⚠️ Confere o `premium` DE NOVO, já com a identidade da conta nova (o
  // Purchases.logIn troca a identidade do RevenueCat). Só então marca o
  // `subscriptionVerified` que faz o guard do (app)/_layout pular a verificação.
  // Sem premium → paywall (já com sessão: comprar ou restaurar leva à home).
  const finishOnboarding = async () => {
    if (!__DEV__) {
      const ok = await confirmPremium({ attempts: 2, label: 'cadastro:conta_criada' });
      if (!ok) {
        pwlog('conta criada sem premium na identidade nova → paywall'); // TEMP-PWGUARD
        router.replace('/(onboarding)/paywall-soft');
        return;
      }
      setSubscriptionVerified(true);
    }
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

  // Só conta como "viu o cadastro" depois da trava liberar.
  useEffect(() => {
    if (!liberado) return;
    track('onboarding_step_viewed', obStep(OB_STEPS.criarConta, 'Criar Conta'));
  }, [liberado]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [waitingConfirmation, setWaitingConfirmation] = useState(false);
  const [emailSent, setEmailSent] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const { insets } = useObFrame();
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
          await finishOnboarding();
        }
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
        // Só com conta criada (antes ia para a home mesmo sem `user.id`).
        await finishOnboarding();
      }
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
        // Só com conta criada (antes ia para a home mesmo sem sessão).
        await finishOnboarding();
      }
    } catch (error: any) {
      Alert.alert('Erro', JSON.stringify(error));
    }
  };

  const emailActive = email.trim().length > 0;
  const passwordActive = password.trim().length > 0;

  const fieldLabel = { fontSize: 15, lineHeight: 20, fontWeight: '600' as const, color: OB.ink, marginBottom: 8 };
  const field = (focused: boolean) => ({
    height: 57, borderRadius: 12, backgroundColor: OB.option, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: focused ? OB.pink : 'transparent',
  });
  const wide = { width: '100%' as const, height: 50, borderRadius: 25 };

  // Trava ainda conferindo o `premium`: nada do formulário aparece.
  if (!liberado) {
    return (
      <ObScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={OB.pink} />
        </View>
      </ObScreen>
    );
  }

  if (waitingConfirmation) {
    return (
      <ObScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 }}>
          <View style={{ marginBottom: 24 }}>
            <Mail size={64} color={OB.pink} />
          </View>
          <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink, textAlign: 'center', marginBottom: 12 }}>
            Verifique seu e-mail
          </Text>
          <Text style={{ fontSize: 17, lineHeight: 23, color: OB.sub, textAlign: 'center', marginBottom: 8 }}>
            {'Enviamos um link de confirmação para '}
            <Text style={{ fontWeight: '600', color: OB.ink }}>{emailSent}</Text>
            {'. Clique no link para ativar sua conta.'}
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 20, color: OB.sub, textAlign: 'center', marginBottom: 36 }}>
            Não se esqueça de checar a pasta de spam.
          </Text>
          <ObPillButton
            label={resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : 'Reenviar e-mail'}
            onPress={handleResend}
            disabled={resendCooldown > 0}
            style={wide}
          />
          <TouchableOpacity onPress={handleUseOtherEmail} activeOpacity={0.7} style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 17, color: OB.sub }}>Usar outro e-mail</Text>
          </TouchableOpacity>
        </View>
      </ObScreen>
    );
  }

  return (
    <ObScreen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 40, paddingBottom: Math.max(18, insets.bottom) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Título (versão B, sem a etiqueta "sua conta" e sem destaque colorido) */}
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink }}>
              Bem-vinda! Vamos começar personalizando a sua jornada.
            </Text>
            <Text style={{ marginTop: 12, fontSize: 17, lineHeight: 23, color: OB.sub }}>
              {'Crie sua conta no '}
              <Text style={{ fontWeight: '700', color: OB.ink }}>NIKS</Text>
              {' para começar a sua jornada.'}
            </Text>
          </View>

          <View style={{ flex: 1, minHeight: 32 }} />

          {/* Formulário */}
          <View style={{ paddingHorizontal: 24, gap: 14 }}>
            <View>
              <Text style={fieldLabel}>Endereço de e-mail</Text>
              <View style={[field(focusedField === 'email'), { justifyContent: 'center' }]}>
                <TextInput
                  placeholder="seuemail@exemplo.com"
                  placeholderTextColor={OB.sub}
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={OB.pink}
                  cursorColor={OB.pink}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  style={{ fontSize: 17, color: OB.ink }}
                />
              </View>
            </View>

            {step === 'password' && (
              <View>
                <Text style={fieldLabel}>Defina uma senha para a sua conta</Text>
                <View style={[field(focusedField === 'password'), { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                  <TextInput
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor={OB.sub}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoFocus
                    selectionColor={OB.pink}
                    cursorColor={OB.pink}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    style={{ flex: 1, fontSize: 17, color: OB.ink }}
                  />
                  <TouchableOpacity
                    onPress={() => { haptics.tap(); setShowPassword(!showPassword); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showPassword
                      ? <EyeOff size={20} color={OB.sub} />
                      : <Eye size={20} color={OB.sub} />}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {step === 'email' ? (
              <ObPillButton onPress={handleEmailContinue} disabled={!emailActive} style={wide} />
            ) : localLoading ? (
              <View style={[wide, { backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : (
              <ObPillButton label="Criar minha conta" onPress={handleCreateAccount} disabled={!passwordActive} style={wide} />
            )}

            {/* "ou" + Google + Apple — só no passo do e-mail */}
            {step === 'email' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: OB.divider }} />
                  <Text style={{ fontSize: 15, color: OB.sub }}>ou</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: OB.divider }} />
                </View>

                <TouchableOpacity
                  onPress={handleGoogleSignIn}
                  activeOpacity={0.85}
                  disabled={loading}
                  style={[wide, {
                    backgroundColor: OB.option, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                  }]}
                >
                  {loading ? <ActivityIndicator color={OB.ink} /> : (
                    <>
                      <Svg width={20} height={20} viewBox="0 0 48 48">
                        <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </Svg>
                      <Text style={{ fontSize: 17, fontWeight: '600', color: OB.ink }}>Continuar com o Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    onPress={handleAppleSignIn}
                    activeOpacity={0.85}
                    disabled={loading}
                    style={[wide, {
                      backgroundColor: OB.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }]}
                  >
                    {loading ? <ActivityIndicator color="#FFFFFF" /> : (
                      <>
                        <Svg width={20} height={20} viewBox="0 0 24 24">
                          <Path d="M17.05 12.04c-.03-2.71 2.21-4.01 2.31-4.07-1.26-1.84-3.22-2.09-3.92-2.12-1.67-.17-3.26 1-4.11 1-.86 0-2.17-.98-3.57-.95-1.84.03-3.54 1.07-4.49 2.71-1.92 3.33-.49 8.25 1.38 10.96.91 1.32 2 2.8 3.4 2.75 1.37-.06 1.89-.88 3.54-.88 1.65 0 2.12.88 3.57.85 1.47-.03 2.4-1.35 3.3-2.68 1.04-1.54 1.47-3.04 1.49-3.12-.03-.01-2.87-1.1-2.9-4.36zM14.5 4.27c.75-.91 1.26-2.17 1.12-3.43-1.08.04-2.39.72-3.17 1.62-.7.8-1.31 2.08-1.15 3.32 1.21.09 2.45-.61 3.2-1.51z" fill="#FFFFFF" />
                        </Svg>
                        <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Continuar com a Apple</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Termos */}
          <Text style={{ marginTop: 16, paddingHorizontal: 24, textAlign: 'center', fontSize: 13, lineHeight: 18, color: OB.sub }}>
            {'Ao continuar, você concorda com nossos '}
            <Text
              onPress={() => { haptics.tap(); Linking.openURL(PRIVACY_URL); }}
              style={{ color: OB.ink, fontWeight: '600', textDecorationLine: 'underline' }}
            >
              Termos de Uso
            </Text>
            {' e '}
            <Text
              onPress={() => { haptics.tap(); Linking.openURL(PRIVACY_URL); }}
              style={{ color: OB.ink, fontWeight: '600', textDecorationLine: 'underline' }}
            >
              Política de Privacidade
            </Text>
            {'.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ObScreen>
  );
}
