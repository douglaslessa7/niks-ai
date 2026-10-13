import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  LayoutAnimation, UIManager, Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { OB, ObScreen, ObHeader, ObPillButton, useObFrame } from '../../components/onboarding/kit';
import { useAuth } from '../../hooks/useAuth';
import { getCustomerInfo, isSubscribed, loginRevenueCat } from '../../lib/revenuecat';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Entrar na conta (aberta pelo "Já tem conta? Entrar" da tela de nome). VISUAL da tela
// de criar conta (`signup.tsx`, kit do onboarding: fonte do sistema, #FF5EA8, campos
// #F0F0F0), sem a etiqueta "minha conta" e sem destaque colorido no título (out/2026).
// Lógica de login intacta.
const PRIVACY_URL = 'https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5';

export default function Login() {
  const { insets } = useObFrame();
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, signInWithEmail, loading } = useAuth();
  const { track, identify } = useMixpanel();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  const routeAfterLogin = async (userId?: string) => {
    // Garante que o RevenueCat está logado com o usuário que acabou de autenticar
    // ANTES de verificar a assinatura. Sem isso, getCustomerInfo() lê o customer
    // anônimo (o loginRevenueCat do _layout.tsx é fire-and-forget e pode não ter
    // completado) → isSubscribed false → usuário existente cai no paywall/signup.
    if (userId) {
      try {
        await loginRevenueCat(userId);
      } catch {
        // ignora — segue para o check de assinatura mesmo assim
      }
    }
    try {
      const info = await getCustomerInfo();
      if (isSubscribed(info)) {
        router.replace('/(app)/home');
        return;
      }
    } catch {
      // ignora — vai para paywall
    }
    router.replace('/(onboarding)/paywall-soft');
  };

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

  const handleLogin = async () => {
    haptics.action();
    if (!password.trim()) return;
    try {
      setLocalLoading(true);
      const session = await signInWithEmail(email, password);
      if (session.user?.id) identify(session.user.id);
      track('user_logged_in', { method: 'email' });
      await routeAfterLogin(session.user?.id);
    } catch (error: any) {
      Alert.alert('Erro ao entrar', error?.message ?? 'Tente novamente.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    haptics.action();
    try {
      const session = await signInWithGoogle();
      if (session.user?.id) identify(session.user.id);
      track('user_logged_in', { method: 'google' });
      await routeAfterLogin(session.user?.id);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Tente novamente.');
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

  const handleAppleLogin = async () => {
    haptics.action();
    try {
      const data = await signInWithApple();
      if (!data) return;
      if (data.user?.id) identify(data.user.id);
      track('user_logged_in', { method: 'apple' });
      await routeAfterLogin(data.user?.id);
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Tente novamente.');
    }
  };

  return (
    <ObScreen>
      <ObHeader onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 64, paddingBottom: Math.max(18, insets.bottom) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Título */}
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink }}>
              Bem-vinda de volta! Continue a sua jornada.
            </Text>
            <Text style={{ marginTop: 12, fontSize: 17, lineHeight: 23, color: OB.sub }}>
              {'Entre na sua conta no '}
              <Text style={{ fontWeight: '700', color: OB.ink }}>NIKS</Text>
              {' para continuar de onde parou.'}
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
                <Text style={fieldLabel}>Sua senha</Text>
                <View style={[field(focusedField === 'password'), { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                  <TextInput
                    placeholder="Digite sua senha"
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
                <TouchableOpacity activeOpacity={0.7} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: OB.pink }}>
                    Esqueceu sua senha?
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'email' ? (
              <ObPillButton onPress={handleEmailContinue} disabled={!emailActive} style={wide} />
            ) : localLoading ? (
              <View style={[wide, { backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : (
              <ObPillButton label="Entrar" onPress={handleLogin} disabled={!passwordActive} style={wide} />
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
                  onPress={handleGoogleLogin}
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
                      <Text style={{ fontSize: 17, fontWeight: '600', color: OB.ink }}>Entrar com Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    onPress={handleAppleLogin}
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
                        <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Entrar com Apple</Text>
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
