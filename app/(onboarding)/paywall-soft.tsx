import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, InteractionManager } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { usePlacement, useSuperwallEvents } from 'expo-superwall';
import type { PaywallResult } from 'expo-superwall';
import Superwall from 'expo-superwall/compat';
import { syncSuperwallAttributes } from '@virex-tech/paywallo-sdk';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  armSuppressReapresentar,
  canShowDownsell,
  consumeSuppressReapresentar,
  consumeNextPlacement,
  markDownsellShown,
  nextPaywallPlacement,
  requestDownsell,
  subscribeDownsellRequest,
} from '../../lib/paywallFlow';
import { confirmPremium, ensureAnonymousRevenueCat, pwlog } from '../../lib/subscriptionGate';
import { attributeCouponIfAny } from '../../lib/couponAttribution';
import { haptics } from '../../lib/haptics';
import { OB, ObPillButton } from '../../components/onboarding/kit';

// Paywall sem resposta (onSkip / onError / register que lança) seguidas vezes:
// depois disso para de pedir em ciclo e mostra "Tentar de novo". Nunca o cadastro.
const MAX_FALHAS_SEGUIDAS = 3;

export default function PaywallSoft() {
  const router = useRouter();
  const hasRegistered = useRef(false);
  const { track } = useMixpanel();
  const setSubscriptionVerified = useAppStore((s) => s.setSubscriptionVerified);
  const falhasRef = useRef(0);
  const [semPaywall, setSemPaywall] = useState(false);

  track('paywall_viewed', { screen: 'soft' });

  // Pede um placement ao Superwall. Paywallo: atributos de anúncio ANTES de todo
  // registerPlacement (nunca lança, segura no máx. 1,5 s — ver "Paywallo" no README).
  // `isCancelled`: o blur da tela não alcança um sync já em voo.
  const present = async (placement: string, motivo: string, isCancelled?: () => boolean) => {
    await syncSuperwallAttributes({ timeoutMs: 1500 });
    if (isCancelled?.()) return;
    pwlog(`registerPlacement ${placement} (${motivo})`); // TEMP-PWGUARD
    try {
      await registerPlacement({ placement });
    } catch (e) {
      pwlog(`registerPlacement ${placement} lançou`, String(e)); // TEMP-PWGUARD
      paywallNaoApareceu('paywall_onboarding', 'register_lancou');
    }
  };

  // Fail closed para "o paywall não apareceu": pede de novo; depois de
  // MAX_FALHAS_SEGUIDAS para e mostra "Tentar de novo". NUNCA consulta o RevenueCat
  // para liberar — o cadastro só abre por compra/restauração confirmada.
  const paywallNaoApareceu = (placement: string, motivo: string) => {
    falhasRef.current += 1;
    if (falhasRef.current > MAX_FALHAS_SEGUIDAS) {
      pwlog(`paywall não apareceu ${falhasRef.current - 1}x seguidas (${motivo}) → "Tentar de novo"`); // TEMP-PWGUARD
      setSemPaywall(true);
      return;
    }
    setTimeout(() => { void present(placement, motivo); }, 600);
  };

  // Compra ou restauração dentro do paywall: SÓ aqui o RevenueCat é consultado
  // para liberar. Confirmou o `premium` → cadastro (nova usuária) ou home (já tem
  // conta). Não confirmou → paywall de novo (ela pode tocar em "Restaurar compra").
  const confirmarESeguir = async (tipo: 'purchased' | 'restored') => {
    let ok = await confirmPremium({ source: 'sync', attempts: 3, label: `paywall:${tipo}` });
    // "Restaurar compra" que o sync não resolveu: aí sim o restore do RevenueCat
    // (foi ela quem pediu para restaurar).
    if (!ok && tipo === 'restored') {
      ok = await confirmPremium({ source: 'restore', label: 'paywall:restored' });
    }
    if (!ok) {
      pwlog(`paywall:${tipo} sem premium confirmado → paywall`); // TEMP-PWGUARD
      void present('paywall_onboarding', `${tipo}_sem_premium`);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Já tem conta (reengajamento): o RevenueCat já está logado nesta conta (o
      // guard do (app)/_layout fez o loginRevenueCat antes de mandar para cá), então
      // a confirmação vale para ela. Não passa pelo signup → atribui o cupom aqui.
      setSubscriptionVerified(true);
      attributeCouponIfAny(session.user.id);
      pwlog('premium confirmado, com sessão → home'); // TEMP-PWGUARD
      router.replace('/(app)/home');
    } else {
      // Nova usuária. O `subscriptionVerified` NÃO é marcado aqui: a identidade
      // muda no cadastro (Purchases.logIn), e é o signup que confere de novo e marca.
      pwlog('premium confirmado, sem sessão → cadastro'); // TEMP-PWGUARD
      router.replace('/(onboarding)/signup');
    }
  };

  const { registerPlacement } = usePlacement({
    onPresent: () => {
      falhasRef.current = 0;
      setSemPaywall(false);
    },
    onDismiss: async (_info, result?: PaywallResult) => {
      // Fechamento causado pelo botão "TENHO CUPOM" ou pelo cancelamento da folha da
      // Apple (que pede o downsell): pula ESTA reapresentação (uso único).
      if (consumeSuppressReapresentar()) {
        pwlog(`onDismiss (${result?.type ?? '?'}) suprimido`); // TEMP-PWGUARD
        return;
      }
      pwlog(`onDismiss → ${result?.type ?? 'sem resultado'}`); // TEMP-PWGUARD
      if (result?.type === 'purchased' || result?.type === 'restored') {
        await confirmarESeguir(result.type);
        return;
      }
      // Recusou (X) ou resultado desconhecido: nada de RevenueCat, nada de restore
      // automático. Paywall de novo — na 1ª saída da sessão, o downsell (mesmo flag
      // do cancelamento da folha da Apple).
      void present(nextPaywallPlacement(), 'dismiss_recusou');
    },
    onSkip: (reason) => {
      // Superwall não apresentou (holdout, sem público — ex.: o downsell para quem o
      // Superwall vê com assinatura no Apple ID). Antes liberava se o RevenueCat
      // dissesse premium; agora é sempre paywall (restaurar é pelo botão).
      pwlog('onSkip', reason); // TEMP-PWGUARD
      paywallNaoApareceu(nextPaywallPlacement(), 'onSkip');
    },
    onError: (error) => {
      pwlog('onError', String(error)); // TEMP-PWGUARD
      paywallNaoApareceu('paywall_onboarding', 'onError');
    },
  });

  // Botão "TENHO CUPOM" do paywall → custom action `showPromoRedeem`. Fecha o paywall
  // (suprimindo a reapresentação, uso único) e abre a tela própria de cupom. Ela não
  // tem nenhuma navegação para dentro do app: só volta para cá (com ou sem desconto).
  const handlingCoupon = useRef(false);
  useSuperwallEvents({
    onCustomPaywallAction: async (name) => {
      if (name !== 'showPromoRedeem' || handlingCoupon.current) return;
      handlingCoupon.current = true;
      try {
        track('coupon_button_tapped');
        armSuppressReapresentar();
        try { await Superwall.shared.dismiss(); } catch {}
        router.push('/(onboarding)/promo-cupom');
      } finally {
        handlingCoupon.current = false;
      }
    },
    // Cancelamento da folha de pagamento da Apple → downsell. Quem compra hoje é o
    // PRÓPRIO Superwall (o CustomPurchaseController não está ativo — ver o bloco
    // `userCancelled` em app/_layout.tsx), então o cancelamento só é visível por
    // este evento do delegate. É o EVENTO `transactionAbandon`, gratuito — não o
    // placement `transaction_abandon`, que exige o plano Scale do Superwall.
    // Mesma sequência do botão de cupom: marca o flag, arma a supressão (senão o
    // onDismiss reapresentaria o paywall normal por cima), fecha e pede o downsell.
    // Cancelar DENTRO do downsell dispara o evento de novo, mas o flag já está
    // marcado e nada acontece — ela segue no paywall.
    onSuperwallEvent: async (eventInfo) => {
      if (eventInfo?.event?.event !== 'transactionAbandon') return;
      if (!canShowDownsell()) {
        pwlog('transactionAbandon: downsell já mostrado nesta sessão'); // TEMP-PWGUARD
        return;
      }
      pwlog('transactionAbandon → downsell'); // TEMP-PWGUARD
      markDownsellShown();
      armSuppressReapresentar();
      try { await Superwall.shared.dismiss(); } catch {}
      requestDownsell();
    },
  });

  // Pedido de downsell (vindo do `transactionAbandon` acima): aqui só registramos
  // o placement — é este registro, e não um `Superwall.shared.register` solto, que
  // carrega os callbacks de fail closed acima (onSkip/onError → paywall).
  useEffect(() => {
    if (__DEV__) return;
    return subscribeDownsellRequest(() => {
      void present('paywall_downsell', 'transactionAbandon');
    });
  }, []);

  // Ao VOLTAR da tela de cupom, reapresenta o paywall certo: com desconto (cupom
  // válido) ou o normal (voltar/descartar). O primeiro foco é ignorado — o registro
  // inicial continua sendo feito pelo useEffect abaixo, sem alteração.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (__DEV__) return;
      if (firstFocus.current) { firstFocus.current = false; return; }
      const placement = consumeNextPlacement() ?? 'paywall_onboarding';
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        void present(placement, 'volta_do_cupom', () => cancelled);
      });
      return () => { cancelled = true; task.cancel(); };
    }, [])
  );

  // Destino da abertura = paywall (não-assinante): a splash pode revelar.
  useEffect(() => {
    useAppStore.getState().markSplashDestinationReady();
  }, []);

  useEffect(() => {
    if (__DEV__) {
      // Atalho de dev: pula o paywall. Mas NÃO pode mandar todo mundo pro signup —
      // quem já tem sessão (login pela tela "Entrar") já tem conta e deve ir pra home.
      // Sem esse check, logar numa conta existente em dev caía na tela de criar conta.
      // ⚠️ Só existe em __DEV__ (Metro). Em Release/TestFlight/App Store o __DEV__ é
      // false e este bloco não roda.
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSubscriptionVerified(true);
        router.replace(session?.user ? '/(app)/home' : '/(onboarding)/signup');
      });
      return;
    }

    if (hasRegistered.current) return;
    hasRegistered.current = true;

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(async () => {
      // Sem sessão, o RevenueCat precisa estar anônimo antes de qualquer compra ou
      // confirmação — senão valeria o premium de uma conta anterior do aparelho.
      await ensureAnonymousRevenueCat('paywall');
      if (cancelled) return;
      void present('paywall_onboarding', 'inicial', () => cancelled);
    });

    return () => { cancelled = true; task.cancel(); };
  }, []);

  const tentarDeNovo = () => {
    haptics.action();
    falhasRef.current = 0;
    setSemPaywall(false);
    void present('paywall_onboarding', 'tentar_de_novo');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      {semPaywall ? (
        <>
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', color: OB.ink, textAlign: 'center' }}>
            Não conseguimos carregar agora
          </Text>
          <Text style={{ marginTop: 8, marginBottom: 28, fontSize: 16, lineHeight: 22, color: OB.sub, textAlign: 'center' }}>
            Confira sua conexão e tente de novo.
          </Text>
          <ObPillButton label="Tentar de novo" onPress={tentarDeNovo} />
        </>
      ) : (
        <ActivityIndicator color="#FB7B6B" />
      )}
    </View>
  );
}
