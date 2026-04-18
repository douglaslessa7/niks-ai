import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  LayoutAnimation, UIManager, Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Eye, EyeOff, Mail } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
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

const Header = ({ onBack }: { onBack: () => void }) => (
  <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
    <TouchableOpacity
      onPress={onBack}
      activeOpacity={0.7}
      style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <ChevronLeft size={20} color="#6B7280" />
    </TouchableOpacity>
    <View style={{ marginTop: 16 }}>
      <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
        <View style={{ height: 2, width: '96%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
      </View>
    </View>
  </View>
);

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
        email, password,
        options: { emailRedirectTo: 'niks-ai://auth/confirm' },
      });
      if (error) { Alert.alert('Erro ao criar conta', error.message ?? 'Tente novamente.'); return; }
      if (!error && data.user && !data.session) {
        setEmailSent(email);
        setWaitingConfirmation(true);
      } else if (!error && data.session) {
        if (data.session.user?.id) { identify(data.session.user.id); await saveToSupabase(data.session.user.id); }
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
      setResendCooldown(prev => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
    }, 1000);
    resendIntervalRef.current = interval;
  };

  const handleUseOtherEmail = () => {
    setWaitingConfirmation(false);
    setEmail(''); setPassword(''); setStep('email');
  };

  const handleGoogleSignIn = async () => {
    try {
      const session = await signInWithGoogle();
      if (session?.user?.id) { identify(session.user.id); await saveToSupabase(session.user.id); }
      track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
      router.push('/(onboarding)/skincare-routine');
    } catch (error: any) {
      Alert.alert('Erro', JSON.stringify(error));
    }
  };

  const emailBorderColor = focusedField === 'email' ? Colors.scanBtn : 'rgba(0,0,0,0.12)';
  const passwordBorderColor = focusedField === 'password' ? Colors.tabActive : 'rgba(0,0,0,0.12)';

  if (waitingConfirmation) {
    return (
      <LinearGradient colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']} locations={[0, 0.4, 0.7, 1]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>
            <Header onBack={() => router.back()} />
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 }}>
              <View style={{ marginBottom: 24 }}>
                <Mail size={64} color={Colors.scanBtn} />
              </View>
              <Text style={{ fontSize: 26, fontWeight: '800', color: Colors.tabActive, textAlign: 'center', marginBottom: 12, lineHeight: 31 }}>
                Verifique seu e-mail
              </Text>
              <Text style={{ fontSize: 13, color: Colors.gray, textAlign: 'center', marginBottom: 8, lineHeight: 20 }}>
                Enviamos um link de confirmação para{' '}
                <Text style={{ fontWeight: '700', color: Colors.tabActive }}>{emailSent}</Text>
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
                  width: '100%', borderRadius: 100, paddingVertical: 16,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: Colors.white,
                  borderWidth: 1.5,
                  borderColor: resendCooldown > 0 ? Colors.disabled : Colors.scanBtn,
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: resendCooldown > 0 ? Colors.gray : Colors.scanBtn }}>
                  Reenviar e-mail
                </Text>
              </TouchableOpacity>
              {resendCooldown > 0 && (
                <Text style={{ fontSize: 13, color: Colors.muted, marginBottom: 16 }}>
                  Reenviar disponível em {resendCooldown}s
                </Text>
              )}
              <TouchableOpacity onPress={handleUseOtherEmail} activeOpacity={0.7} style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 15, color: Colors.muted }}>Usar outro e-mail</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']} locations={[0, 0.4, 0.7, 1]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>
          <Header onBack={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }} />

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 18, paddingTop: 32, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Heading */}
              <View style={{ marginBottom: 32 }}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: Colors.tabActive, lineHeight: 31, marginBottom: 8 }}>
                  Salve seu progresso
                </Text>
                <Text style={{ fontSize: 13, color: Colors.gray, lineHeight: 20 }}>
                  Crie sua conta no{' '}
                  <Text style={{ fontWeight: '700', color: Colors.tabActive }}>NIKS AI</Text>
                  {' '}para começar a sua jornada.
                </Text>
              </View>

              <View style={{ flex: 1 }} />

              <View style={{ gap: 12 }}>
                {/* Email field */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.tabActive }}>
                    Endereço de e-mail
                  </Text>
                  <TextInput
                    placeholder="seuemail@exemplo.com"
                    placeholderTextColor={Colors.gray}
                    value={email}
                    onChangeText={handleEmailChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      height: 52, paddingHorizontal: 16, borderRadius: 14,
                      fontSize: 15, color: Colors.tabActive,
                      borderWidth: 1.5, borderColor: emailBorderColor,
                      backgroundColor: Colors.white,
                    }}
                  />
                </View>

                {/* Password field */}
                {step === 'password' && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.tabActive }}>
                      Defina uma senha para a sua conta
                    </Text>
                    <View>
                      <TextInput
                        placeholder="Mínimo 8 caracteres"
                        placeholderTextColor={Colors.gray}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoFocus
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        style={{
                          height: 52, paddingHorizontal: 16, paddingRight: 48,
                          borderRadius: 14, fontSize: 15, color: Colors.tabActive,
                          borderWidth: 1.5, borderColor: passwordBorderColor,
                          backgroundColor: Colors.white,
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 14, top: 14 }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {showPassword ? <EyeOff size={20} color={Colors.gray} /> : <Eye size={20} color={Colors.gray} />}
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
                      borderRadius: 100, paddingVertical: 16,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: email.trim() ? Colors.scanBtn : Colors.disabled,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>Continuar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleCreateAccount}
                    activeOpacity={0.85}
                    disabled={localLoading}
                    style={{
                      borderRadius: 100, paddingVertical: 16,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: password.trim() ? Colors.scanBtn : Colors.disabled,
                    }}
                  >
                    {localLoading
                      ? <ActivityIndicator color={Colors.white} />
                      : <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>Criar minha conta</Text>
                    }
                  </TouchableOpacity>
                )}

                {/* Divider + social — só no step email */}
                {step === 'email' && (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
                      <Text style={{ fontSize: 13, color: Colors.gray }}>ou</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.08)' }} />
                    </View>

                    <TouchableOpacity
                      onPress={handleGoogleSignIn}
                      activeOpacity={0.85}
                      disabled={loading}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                        borderRadius: 100, paddingVertical: 16,
                        backgroundColor: Colors.white,
                        borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)',
                      }}
                    >
                      {loading ? <ActivityIndicator color={Colors.tabActive} /> : (
                        <>
                          <GoogleIcon />
                          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.tabActive }}>Continuar com o Google</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {Platform.OS === 'ios' && (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const data = await signInWithApple();
                            if (!data) return;
                            if (data.user?.id) { identify(data.user.id); await saveToSupabase(data.user.id); }
                            track('onboarding_step_completed', { step_number: 22, step_name: 'Criar Conta', step_total: 23 });
                            router.push('/(onboarding)/skincare-routine');
                          } catch (error: any) {
                            Alert.alert('Erro', error?.message ?? 'Tente novamente.');
                          }
                        }}
                        activeOpacity={0.85}
                        disabled={loading}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                          borderRadius: 100, paddingVertical: 16,
                          backgroundColor: Colors.tabActive,
                        }}
                      >
                        {loading ? <ActivityIndicator color={Colors.white} /> : (
                          <>
                            <AppleIcon />
                            <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>Continuar com a Apple</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* Terms */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4 }}>
                  <Text style={{ fontSize: 11, color: Colors.gray, lineHeight: 18 }}>Ao continuar, você concorda com nossos </Text>
                  <TouchableOpacity onPress={() => Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5')}>
                    <Text style={{ fontSize: 11, color: Colors.tabActive, textDecorationLine: 'underline', fontWeight: '500', lineHeight: 18 }}>Termos de Uso</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 11, color: Colors.gray, lineHeight: 18 }}> e </Text>
                  <TouchableOpacity onPress={() => Linking.openURL('https://niks-ai-privacidade.notion.site/POL-TICA-DE-PRIVACIDADE-NIKS-AI-323c5d237bfe80a2a446fcf57b35aef5')}>
                    <Text style={{ fontSize: 11, color: Colors.tabActive, textDecorationLine: 'underline', fontWeight: '500', lineHeight: 18 }}>Política de Privacidade</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 11, color: Colors.gray, lineHeight: 18 }}>.</Text>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
