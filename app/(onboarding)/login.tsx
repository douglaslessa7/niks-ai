import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  LayoutAnimation, UIManager, Platform, Alert, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../hooks/useAuth';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { usePlacement } from 'expo-superwall';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

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
  const { track, identify } = useMixpanel();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

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
      setLocalLoading(true);
      const session = await signInWithEmail(email, password);
      if (session.user?.id) identify(session.user.id);
      track('user_logged_in', { method: 'email' });
      await routeAfterLogin();
    } catch (error: any) {
      Alert.alert('Erro ao entrar', error?.message ?? 'Tente novamente.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const session = await signInWithGoogle();
      if (session.user?.id) identify(session.user.id);
      track('user_logged_in', { method: 'google' });
      await routeAfterLogin();
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Tente novamente.');
    }
  };

  const emailBorderColor = focusedField === 'email' ? Colors.scanBtn : 'rgba(0,0,0,0.12)';
  const passwordBorderColor = focusedField === 'password' ? Colors.scanBtn : 'rgba(0,0,0,0.12)';

  return (
    <LinearGradient colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']} locations={[0, 0.4, 0.7, 1]} style={{ flex: 1 }}>
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
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 18, paddingTop: 32, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Heading */}
              <View style={{ marginBottom: 32 }}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: Colors.tabActive, lineHeight: 31, marginBottom: 8 }}>
                  Bem-vindo de volta
                </Text>
                <Text style={{ fontSize: 13, color: Colors.gray, lineHeight: 20 }}>
                  Entre na sua conta no{' '}
                  <Text style={{ fontWeight: '700', color: Colors.tabActive }}>NIKS AI</Text>
                  {' '}para continuar sua jornada.
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
                      Sua senha
                    </Text>
                    <View>
                      <TextInput
                        placeholder="Digite sua senha"
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
                    <TouchableOpacity activeOpacity={0.7} style={{ alignSelf: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: Colors.scanBtn }}>
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
                      borderRadius: 100, paddingVertical: 16,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: email.trim() ? Colors.scanBtn : Colors.disabled,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>Continuar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleLogin}
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
                      : <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>Entrar</Text>
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
                      onPress={handleGoogleLogin}
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
                          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.tabActive }}>Entrar com Google</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {Platform.OS === 'ios' && (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            const data = await signInWithApple();
                            if (!data) return;
                            if (data.user?.id) identify(data.user.id);
                            track('user_logged_in', { method: 'apple' });
                            await routeAfterLogin();
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
                            <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>Entrar com Apple</Text>
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
