import { PRIVACY_URL, TERMOS_URL } from '../../lib/linksLegais';
import { compraRecenteNoServidor, enviarComprovantes } from '../../lib/assinaturaServidor';
import { aberturaDoCadastro, transferirNoCadastro, type OrigemCompra } from '../../lib/regraCompra';
import { lerCompraNestaSessao, limparCompraNestaSessao } from '../../lib/sinalCompra';
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
import { atualizarCompraPendente } from '../../lib/compraPendente';
import { attributeCouponIfAny } from '../../lib/couponAttribution';
import { avisarTransferenciaFalhou, comTetoRc, confirmPremium, ensureAnonymousRevenueCat } from '../../lib/subscriptionGate';
import { entrarNoGrupoGuardado, lerCodigoGrupo } from '../../lib/convidada';
import { convidadaLigada, validarCodigo } from '../../lib/gruposServidor';
import { mensagemDoCodigo } from '../../lib/codigoConvite';
import { t } from '../../lib/i18n';
import { pwDecisao } from '../../lib/paywallDebug';
import { PULAR_PAYWALL } from '../../lib/devPaywall';
// Import fixo (16/nov/2026): o `await import()` carregava o RevenueCat como pacote à parte no
// Metro e reiniciava o app logo depois do login — o cadastro não terminava (sem perfil, scan e rotina).
import Purchases from 'react-native-purchases';
import { haptics } from '../../lib/haptics';
import { OB, ObScreen, ObPillButton, useObFrame, OB_STEPS, OB_STEP_TOTAL, obStep } from '../../components/onboarding/kit';
import { atualizarNomePerfil, perfilOnboardingConcluido } from '../../lib/mixpanel/perfil';
import { pontosDoPacto, usePosCompraV2 } from '../../lib/posCompraV2';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Tela 24 do onboarding — criar conta, depois do paywall. LAYOUT da versão B (commit
// 8ae3453: "Bem-vinda! Vamos começar personalizando a sua jornada.", e-mail → senha,
// "ou", Google e Apple, termos) no VISUAL do kit (fonte do sistema, #FF5EA8, campos
// #F0F0F0), sem o X e sem a etiqueta "sua conta" (pedido do produto, out/2026). A tela
// "#1 app de skincare com IA" (modelo 10a) saiu; `SignupHeroText.tsx` ficou no repo.
// 07/nov/2026: fundo da home (`ObScreen variant="home"`, tela 9 do design NiksBoasVindas —
// vem depois das boas-vindas pós-pagamento); campos e Google em branco para ler no rosa.
// Lógica de cadastro intacta. → tela de espera (`loading-rotina`, 06/nov/2026), que salva o
// scan e a rotina e abre a home (04/nov/2026: o compromisso passou para antes, depois da
// "Comunidade"; de 20/out a 04/nov era → compromisso → home).

export default function Signup() {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple, loading } = useAuth();
  const { saveToSupabase, armHomeTutorial, setSubscriptionVerified } = useAppStore();
  const { track, identify } = useMixpanel();

  // ── Trava: o cadastro só aparece com `premium` CONFIRMADO no RevenueCat ──────
  // Regra de negócio (out/2026): qualquer outra resposta — erro, timeout, sem
  // internet, link direto `niks-ai://signup`, qualquer caminho que um dia chegue
  // aqui por engano — volta para o paywall. Na dúvida, paywall. Ver
  // `lib/subscriptionGate.ts` e "Guard de assinatura" no README.
  // Com o atalho de dev (`lib/devPaywall.ts`) o paywall é pulado de propósito — a trava também.
  const [liberado, setLiberado] = useState(PULAR_PAYWALL);
  // Pós-compra v2 (lib/posCompraV2.ts): o título do design
  // (design-handoff/pos-compra-v2/15-criar-conta.html), com os pontos que ela juntou.
  const [v2] = useState(() => usePosCompraV2.getState());
  // Comprou ou restaurou NESTA sessão (sinal do paywall, `lib/sinalCompra.ts`). Só com ele a
  // compra pode vir de outra conta. A abertura nunca conta "Superwall ACTIVE" como pagamento:
  // qualquer assinatura do Apple ID do aparelho passaria (caso da convidada na 1.0.60 (2)).
  const compraNestaSessao = useRef<OrigemCompra | null>(null);
  useEffect(() => {
    if (PULAR_PAYWALL) return;
    let ativo = true;
    (async () => {
      await ensureAnonymousRevenueCat('cadastro');
      const sinal = await lerCompraNestaSessao();
      // Convidada: sem compra nesta sessão, só com o código ainda válido no servidor e a função ligada.
      let conviteValido = false;
      if (!sinal) {
        const convite = await lerCodigoGrupo();
        const valido = convite && await convidadaLigada() ? await validarCodigo(convite.codigo) : null;
        conviteValido = !!valido?.valido && !valido.cheio;
      }
      if (!ativo) return;
      const abertura = aberturaDoCadastro(sinal, conviteValido);
      if (abertura === 'convidada') { setLiberado(true); return; }
      if (abertura === 'pagou') {
        compraNestaSessao.current = sinal;
        await pwDecisao('Tela de cadastro abriu (trava da abertura)', 'CADASTRO liberado', 'cadastro',
          'Compra ou restauração confirmada pelo paywall nesta sessão.');
        if (!ativo) return;
        setLiberado(true);
      } else {
        await pwDecisao('Tela de cadastro abriu (trava da abertura)', 'PAYWALL — cadastro bloqueado', 'paywall',
          'Chegou ao cadastro sem compra nem restauração nesta sessão. Voltou ao paywall.');
        router.replace('/(onboarding)/paywall-soft');
      }
    })();
    return () => { ativo = false; };
  }, []);

  // Conta criada → home (04/nov/2026, pedido do produto: o compromisso foi para antes, logo
  // depois da "Comunidade"; de 20/out a 04/nov/2026 a conta ia ao compromisso, que levava à
  // home). A permissão de
  // notificação é pedida ANTES da conta (depois do horário da rotina; o token vai no
  // `saveToSupabase`), então a tela de notificações pós-cadastro saiu do fluxo
  // (out/2026). Este é agora o ÚNICO ponto em que uma usuária NOVA entra no app — por
  // isso o tutorial de primeiro acesso da home é armado AQUI
  // (conta existente que refaz o onboarding também passa; quem barra é o servidor,
  // `users.home_tutorial_seen_at`).
  // ⚠️ Confere o `premium` DE NOVO, já com a identidade da conta nova (o
  // Purchases.logIn troca a identidade do RevenueCat). Só então marca o
  // `subscriptionVerified` que faz o guard do (app)/_layout pular a verificação.
  // Sem premium → paywall (já com sessão: comprar ou restaurar leva à home).
  const grupoDaConvidada = useRef<string | null>(null);
  const finishOnboarding = async () => {
    if (!PULAR_PAYWALL) {
      let transferenciaFalhou = false;
      let ok = await confirmPremium({
        attempts: 2,
        label: 'cadastro:conta_criada',
        transferir: transferirNoCadastro(compraNestaSessao.current),
        onTransferenciaFalhou: () => { transferenciaFalhou = true; },
      });
      // 2b (26/nov/2026): comprou nesta sessão, mas o aparelho não confirma (o paywall pode ter
      // liberado pela confirmação do servidor). O servidor liga a compra feita com o id deste
      // aparelho à conta nova (`confirmar-compra`) e diz se ela é assinante.
      if (!ok && compraNestaSessao.current && !transferenciaFalhou) {
        const srv = await compraRecenteNoServidor(transferirNoCadastro(compraNestaSessao.current));
        ok = srv?.assinante === true;
        track(ok ? 'compra_confirmada' : 'compra_sem_confirmacao', {
          tipo: 'cadastro', fonte: ok ? 'servidor' : null, com_sessao: true,
          servidor: srv?.assinante ?? null, servidor_compra: srv?.confirmado ?? null, servidor_ligada: srv?.ligada ?? null,
        });
      }
      if (!ok && grupoDaConvidada.current) {
        track('convidada_conta_criada', { grupo_id: grupoDaConvidada.current });
        // Fim do onboarding (fecha o `timeEvent` aberto no `(onboarding)/_layout` → $duration).
        track('onboarding_completed', { onboarding_version: '2.0', passos_total: OB_STEP_TOTAL, caminho: 'convidada' });
        perfilOnboardingConcluido();
        router.replace({ pathname: '/(app)/grupo', params: { id: grupoDaConvidada.current } } as any);
        return;
      }
      if (!ok) {
        await pwDecisao('Conta criada (confere na identidade nova)', 'PAYWALL — conta criada sem premium', 'paywall',
          'Depois do Purchases.logIn a conta nova não tinha o premium.');
        if (transferenciaFalhou) await avisarTransferenciaFalhou();
        router.replace('/(onboarding)/paywall-soft');
        return;
      }
      await pwDecisao('Conta criada (confere na identidade nova)', 'HOME — conta com premium', 'home');
      void limparCompraNestaSessao();
      setSubscriptionVerified(true);
    }
    track('onboarding_step_completed', obStep(OB_STEPS.criarConta, 'Criar Conta'));
    // Fim do onboarding (fecha o `timeEvent` aberto no `(onboarding)/_layout` → $duration).
    track('onboarding_completed', { onboarding_version: '2.0', passos_total: OB_STEP_TOTAL, caminho: 'cadastro' });
    perfilOnboardingConcluido();
    armHomeTutorial();
    // 06/nov/2026: a conta vai para a TELA DE ESPERA, que aguarda a análise completa (disparada
    // na compra), grava o scan e a rotina e só então abre a home. `replace`: não volta ao cadastro.
    router.replace('/(onboarding)/loading-rotina' as any);
  };

  // Conta criada: o perfil (`users`) é gravado já; o scan e a rotina, pela tela de espera
  // (o relatório completo só chega depois da compra). O registro da compra pendente ganha o
  // user_id — se o app fechar agora, a retomada salva nesta conta.
  const salvarConta = async (userId: string) => {
    // `termos`: esta tela mostra a frase dos Termos — grava o aceite (1.64).
    await saveToSupabase(userId, { scan: false, termos: true });
    // Antes de gerar a rotina: quem acabou de pagar já fica reconhecida no servidor.
    await enviarComprovantes(transferirNoCadastro(compraNestaSessao.current));
    // Liga o cupom (se houver) ao user_id real. Não bloqueia: se falhar, a
    // usuária entra normalmente; o webhook ainda confirma a conversão.
    attributeCouponIfAny(userId);
    await atualizarCompraPendente({ userId });
    // Código do onboarding: entra no grupo. Vale para convidada e para quem assinou.
    const r = await entrarNoGrupoGuardado();
    if (r && 'grupoId' in r) grupoDaConvidada.current = r.grupoId;
    else if (r) Alert.alert(t(mensagemDoCodigo(r.motivo)));
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

  // Opções → campo de e-mail (só depois do toque em "Continuar com e-mail").
  const [comEmail, setComEmail] = useState(false);
  const abrirEmail = () => {
    haptics.tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setComEmail(true);
  };
  const fecharEmail = () => {
    haptics.tap();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setComEmail(false);
    setStep('email');
    setPassword('');
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

  const handleCreateAccount = async () => {
    haptics.action();
    if (!password.trim()) return;
    try {
      setLocalLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: 'niks-ai://auth/confirm' },
      });
      if (error) { Alert.alert(t('Erro ao criar conta'), error.message ?? t('Tente novamente.')); return; }
      if (!error && data.user && !data.session) {
        track('signup_completed', { method: 'email', confirmacao_pendente: true });
        setEmailSent(email);
        setWaitingConfirmation(true);
      } else if (!error && data.session) {
        if (data.session.user?.id) {
          try {
            await comTetoRc(Purchases.logIn(data.session.user.id));
            // Sincroniza o receipt da Apple com o usuário RC identificado.
            // Sem isso, a compra feita pelo usuário anônimo não é transferida
            // quando o usuário identificado já existia no RC (fluxo: paywall → signup).
            await comTetoRc(Purchases.restorePurchases(), 30000);
          } catch (rcErr) {
            console.warn('[RevenueCat] logIn/restore failed after signup:', rcErr);
          }
          identify(data.session.user.id);
          track('signup_completed', { method: 'email' });
          atualizarNomePerfil(useAppStore.getState().pendingName);
          await salvarConta(data.session.user.id);
          await finishOnboarding();
        }
      }
    } catch (error: any) {
      Alert.alert(t('Erro ao criar conta'), error?.message ?? t('Tente novamente.'));
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
          await comTetoRc(Purchases.logIn(data.user.id));
          await comTetoRc(Purchases.restorePurchases(), 30000);
        } catch (rcErr) {
          console.warn('[RevenueCat] logIn/restore failed after signup:', rcErr);
        }
        identify(data.user.id);
        track('signup_completed', { method: 'apple' });
        atualizarNomePerfil(useAppStore.getState().pendingName);
        await salvarConta(data.user.id);
        // Só com conta criada (antes ia para a home mesmo sem `user.id`).
        await finishOnboarding();
      }
    } catch (error: any) {
      Alert.alert(t('Erro'), error?.message ?? t('Tente novamente.'));
    }
  };

  const handleGoogleSignIn = async () => {
    haptics.action();
    try {
      const session = await signInWithGoogle();
      if (session?.user?.id) {
        try {
          await comTetoRc(Purchases.logIn(session.user.id));
          await comTetoRc(Purchases.restorePurchases(), 30000);
        } catch (rcErr) {
          console.warn('[RevenueCat] logIn/restore failed after signup:', rcErr);
        }
        identify(session.user.id);
        track('signup_completed', { method: 'google' });
        atualizarNomePerfil(useAppStore.getState().pendingName);
        await salvarConta(session.user.id);
        // Só com conta criada (antes ia para a home mesmo sem sessão).
        await finishOnboarding();
      }
    } catch (error: any) {
      Alert.alert(t('Erro'), JSON.stringify(error));
    }
  };

  const emailActive = email.trim().length > 0;
  const passwordActive = password.trim().length > 0;

  const fieldLabel = { fontSize: 15, lineHeight: 20, fontWeight: '600' as const, color: OB.ink, marginBottom: 8 };
  const field = (focused: boolean) => ({
    height: 57, borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: focused ? OB.pink : 'transparent',
  });
  const wide = { width: '100%' as const, height: 50, borderRadius: 25 };

  // Trava ainda conferindo o `premium`: nada do formulário aparece.
  if (!liberado) {
    return (
      <ObScreen variant="home">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={OB.pink} />
        </View>
      </ObScreen>
    );
  }

  if (waitingConfirmation) {
    return (
      <ObScreen variant="home">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 }}>
          <View style={{ marginBottom: 24 }}>
            <Mail size={64} color={OB.pink} />
          </View>
          <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink, textAlign: 'center', marginBottom: 12 }}>
            {t('Verifique seu e-mail')}
          </Text>
          <Text style={{ fontSize: 17, lineHeight: 23, color: OB.sub, textAlign: 'center', marginBottom: 8 }}>
            {t('Enviamos um link de confirmação para ')}
            <Text style={{ fontWeight: '600', color: OB.ink }}>{emailSent}</Text>
            {t('. Clique no link para ativar sua conta.')}
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 20, color: OB.sub, textAlign: 'center', marginBottom: 36 }}>
            {t('Não se esqueça de checar a pasta de spam.')}
          </Text>
          <ObPillButton
            label={resendCooldown > 0 ? t('Reenviar em {{segundos}}s', { segundos: resendCooldown }) : t('Reenviar e-mail')}
            onPress={handleResend}
            disabled={resendCooldown > 0}
            style={wide}
          />
          <TouchableOpacity onPress={handleUseOtherEmail} activeOpacity={0.7} style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 17, color: OB.sub }}>{t('Usar outro e-mail')}</Text>
          </TouchableOpacity>
        </View>
      </ObScreen>
    );
  }

  return (
    <ObScreen variant="home">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 40, paddingBottom: Math.max(18, insets.bottom) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Título (versão B, sem a etiqueta "sua conta" e sem destaque colorido) */}
          {v2.ativo ? (
            <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
              <Text style={{ fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.4, color: OB.ink }}>
                {t('Crie sua conta pra guardar sua rotina')}
              </Text>
              <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 21, color: '#6B6B6B' }}>
                {t('Seus ')}
                <Text style={{ fontWeight: '700', color: OB.pink }}>{t('{{n}} NIKS Points', { n: pontosDoPacto() })}</Text>
                {v2.qtdProdutos > 0
                  ? t(', seus produtos e a foto do seu dia 1 ficam salvos no seu perfil.')
                  : t(' e a foto do seu dia 1 ficam salvos no seu perfil.')}
              </Text>
            </View>
          ) : (
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, color: OB.ink }}>
              {t('Bem-vinda! Vamos começar personalizando a sua jornada.')}
            </Text>
            <Text style={{ marginTop: 12, fontSize: 17, lineHeight: 23, color: OB.sub }}>
              {t('Crie sua conta no ')}
              <Text style={{ fontWeight: '700', color: OB.ink }}>NIKS</Text>
              {t(' para começar a sua jornada.')}
            </Text>
          </View>
          )}

          <View style={{ flex: 1, minHeight: 32 }} />

          {/* Apple e Google primeiro — são os principais (pedido do produto, 07/nov/2026). O
              e-mail é opcional, embaixo: só um botão; o campo aparece depois do toque. */}
          <View style={{ paddingHorizontal: 24, gap: 14 }}>
            {!comEmail ? (
              <>
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
                        <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>{t('Continuar com a Apple')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleGoogleSignIn}
                  activeOpacity={0.85}
                  disabled={loading}
                  style={[wide, {
                    backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
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
                      <Text style={{ fontSize: 17, fontWeight: '600', color: OB.ink }}>{t('Continuar com o Google')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={abrirEmail}
                  activeOpacity={0.7}
                  style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 17, fontWeight: '600', color: OB.pink }}>{t('Continuar com e-mail')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View>
                  <Text style={fieldLabel}>{t('Endereço de e-mail')}</Text>
                  <View style={[field(focusedField === 'email'), { justifyContent: 'center' }]}>
                    <TextInput
                      placeholder={t('seuemail@exemplo.com')}
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
                      autoFocus
                      style={{ fontSize: 17, color: OB.ink }}
                    />
                  </View>
                </View>

                {step === 'password' && (
                  <View>
                    <Text style={fieldLabel}>{t('Defina uma senha para a sua conta')}</Text>
                    <View style={[field(focusedField === 'password'), { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                      <TextInput
                        placeholder={t('Mínimo 8 caracteres')}
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
                  <ObPillButton label={t('Criar minha conta')} onPress={handleCreateAccount} disabled={!passwordActive} style={wide} />
                )}
                <TouchableOpacity
                  onPress={fecharEmail}
                  activeOpacity={0.7}
                  style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 16, color: OB.sub }}>{t('Voltar para Apple e Google')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Termos */}
          <Text style={{ marginTop: 16, paddingHorizontal: 24, textAlign: 'center', fontSize: 13, lineHeight: 18, color: OB.sub }}>
            {t('Ao continuar, você concorda com os ')}
            <Text
              onPress={() => { haptics.tap(); Linking.openURL(TERMOS_URL); }}
              style={{ color: OB.ink, fontWeight: '600', textDecorationLine: 'underline' }}
            >
              {t('Termos de Uso')}
            </Text>
            {t(' e a ')}
            <Text
              onPress={() => { haptics.tap(); Linking.openURL(PRIVACY_URL); }}
              style={{ color: OB.ink, fontWeight: '600', textDecorationLine: 'underline' }}
            >
              {t('Política de Privacidade')}
            </Text>
            {t('. Não toleramos conteúdo ofensivo nem abuso.')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ObScreen>
  );
}
