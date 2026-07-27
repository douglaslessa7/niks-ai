import { useCallback, useEffect, useRef } from 'react';
import { View, ActivityIndicator, InteractionManager } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { usePlacement, useSuperwallEvents } from 'expo-superwall';
import Superwall from 'expo-superwall/compat';
import Purchases from 'react-native-purchases';
import { getCustomerInfo, isSubscribed } from '../../lib/revenuecat';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { armSuppressReapresentar, consumeSuppressReapresentar, consumeNextPlacement } from '../../lib/paywallFlow';
import { attributeCouponIfAny } from '../../lib/couponAttribution';

export default function PaywallSoft() {
  const router = useRouter();
  const hasRegistered = useRef(false);
  const { track } = useMixpanel();
  const setSubscriptionVerified = useAppStore((s) => s.setSubscriptionVerified);

  track('paywall_viewed', { screen: 'soft' });

  const handleAfterPaywall = async () => {
    try {
      let info = await getCustomerInfo();

      // Fallback: se o cache do RC não mostrar assinatura ativa, sincroniza
      // com a App Store. Isso cobre: (1) cache desatualizado pós-compra,
      // (2) usuário anônimo comprou mas RC foi trocado para usuário identificado
      // sem transferir a assinatura, (3) onPurchase retornou 'failed' mas a
      // Apple processou o pagamento normalmente.
      if (!isSubscribed(info)) {
        try {
          info = await Purchases.restorePurchases();
        } catch {
          // Se o restore falhar, info continua com o valor anterior
        }
      }

      if (isSubscribed(info)) {
        // Assinante confirmada — marca no store para (app)/_layout.tsx não re-verificar
        setSubscriptionVerified(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Usuária já tem conta (reengajamento) — não passa pelo signup, então atribui
          // o cupom aqui (não bloqueia; o webhook ainda confirma a conversão) e vai à home.
          attributeCouponIfAny(session.user.id);
          router.replace('/(app)/home');
        } else {
          // Nova usuária — precisa criar a conta
          router.replace('/(onboarding)/signup');
        }
        return;
      }
    } catch {
      // ignora erro — vai reapresentar o paywall
    }
    // Não assinou — reapresenta o paywall (bloqueio total)
    registerPlacement({ placement: 'paywall_onboarding' });
  };

  const { registerPlacement } = usePlacement({
    onPresent: () => {},
    onDismiss: async () => {
      // Fechamento causado pelo botão "TENHO CUPOM": pula ESTA reapresentação (uso
      // único). Se não estiver armada, segue o fluxo normal (fail closed) intacto.
      if (consumeSuppressReapresentar()) return;
      await handleAfterPaywall();
    },
    onSkip: async () => {
      // Superwall decidiu não exibir (já assinante, holdout) — verifica e entra
      await handleAfterPaywall();
    },
    onError: async () => {
      // SDK falhou — reapresenta (fail closed)
      registerPlacement({ placement: 'paywall_onboarding' });
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
  });

  // Ao VOLTAR da tela de cupom, reapresenta o paywall certo: com desconto (cupom
  // válido) ou o normal (voltar/descartar). O primeiro foco é ignorado — o registro
  // inicial continua sendo feito pelo useEffect abaixo, sem alteração.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (__DEV__) return;
      if (firstFocus.current) { firstFocus.current = false; return; }
      const placement = consumeNextPlacement() ?? 'paywall_onboarding';
      const task = InteractionManager.runAfterInteractions(() => {
        registerPlacement({ placement });
      });
      return () => task.cancel();
    }, [])
  );

  useEffect(() => {
    if (__DEV__) {
      // Atalho de dev: pula o paywall. Mas NÃO pode mandar todo mundo pro signup —
      // quem já tem sessão (login pela tela "Entrar") já tem conta e deve ir pra home.
      // Sem esse check, logar numa conta existente em dev caía na tela de criar conta.
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSubscriptionVerified(true);
        router.replace(session?.user ? '/(app)/home' : '/(onboarding)/signup');
      });
      return;
    }

    if (hasRegistered.current) return;
    hasRegistered.current = true;

    const task = InteractionManager.runAfterInteractions(() => {
      registerPlacement({ placement: 'paywall_onboarding' });
    });

    return () => task.cancel();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#FB7B6B" />
    </View>
  );
}
