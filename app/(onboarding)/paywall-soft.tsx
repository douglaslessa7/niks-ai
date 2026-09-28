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
import {
  armSuppressReapresentar,
  canShowDownsell,
  consumeSuppressReapresentar,
  consumeNextPlacement,
  markDownsellShown,
  nextPaywallPlacement,
  requestDownsell,
  subscribeDownsellRequest,
  dslog, // TEMP-DS
} from '../../lib/paywallFlow';
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
    // Não assinou — reapresenta o paywall (bloqueio total). Na PRIMEIRA saída da
    // sessão o que volta é o downsell (segunda chance, uma vez só); depois dela,
    // o paywall normal. Quem decide é `nextPaywallPlacement`, para o fechamento
    // no X e o cancelamento da folha da Apple dividirem o mesmo flag.
    const next = nextPaywallPlacement();
    dslog('handleAfterPaywall: não assinante, registerPlacement', next); // TEMP-DS
    registerPlacement({ placement: next });
  };

  const { registerPlacement } = usePlacement({
    onPresent: (info: any) => {
      dslog('onPresent', { identifier: info?.identifier, name: info?.name, products: info?.productIds ?? info?.products?.map?.((p: any) => p?.id ?? p?.identifier) }); // TEMP-DS
    },
    onDismiss: async (info: any, result: any) => {
      dslog('onDismiss', { identifier: info?.identifier, result }); // TEMP-DS
      // Fechamento causado pelo botão "TENHO CUPOM": pula ESTA reapresentação (uso
      // único). Se não estiver armada, segue o fluxo normal (fail closed) intacto.
      if (consumeSuppressReapresentar()) return;
      await handleAfterPaywall();
    },
    onSkip: async (reason: any) => {
      dslog('onSkip', reason); // TEMP-DS
      // Superwall decidiu não exibir (já assinante, holdout) — verifica e entra
      await handleAfterPaywall();
    },
    onError: async (error: any) => {
      dslog('onError', String(error)); // TEMP-DS
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
      // TEMP-DS: todo evento do SDK, para ver o que chega na desistência da folha.
      const ev: any = (eventInfo as any)?.event;
      dslog('evento', ev?.event, {
        produto: ev?.product?.productIdentifier ?? ev?.product?.identifier ?? ev?.product?.id,
        paywall: ev?.paywallInfo?.identifier,
        erro: ev?.error,
        canShowDownsell: canShowDownsell(),
      });
      if (eventInfo?.event?.event !== 'transactionAbandon') return;
      if (!canShowDownsell()) { dslog('transactionAbandon: downsell já mostrado, nada a fazer'); return; } // TEMP-DS
      markDownsellShown();
      armSuppressReapresentar();
      dslog('transactionAbandon: dismiss() ...'); // TEMP-DS
      try { await Superwall.shared.dismiss(); dslog('transactionAbandon: dismiss() ok'); } catch (e) { dslog('transactionAbandon: dismiss() erro', String(e)); } // TEMP-DS
      requestDownsell();
    },
  });

  // TEMP-DS: foto das offerings do RevenueCat (o produto do paywall está em alguma?).
  useEffect(() => {
    dslog('paywall-soft montada'); // TEMP-DS
    Purchases.getOfferings()
      .then((o) => {
        const all = Object.values(o.all).map((of) => ({
          offering: of.identifier,
          current: o.current?.identifier === of.identifier,
          produtos: of.availablePackages.map((p) => p.product.identifier),
        }));
        const achados = ['com.niksai.anual129', 'br.com.niksai.app.mensal.39', 'br.com.niksai.app.anual.99'].map(
          (id) => ({ id, emOffering: all.filter((of) => of.produtos.some((p) => p === id || p.startsWith(id + ':'))).map((of) => of.offering) }),
        );
        dslog('RC offerings', all);
        dslog('RC produtos do paywall', achados);
      })
      .catch((e) => dslog('RC getOfferings erro', String(e)));
    return () => dslog('paywall-soft desmontada'); // TEMP-DS
  }, []);

  // Pedido de downsell (vindo do `transactionAbandon` acima): aqui só registramos
  // o placement — é este registro, e não um `Superwall.shared.register` solto, que
  // carrega os callbacks de fail closed acima (onSkip/onError → paywall_onboarding).
  useEffect(() => {
    if (__DEV__) return;
    return subscribeDownsellRequest(() => {
      dslog('listener do downsell: registerPlacement paywall_downsell'); // TEMP-DS
      registerPlacement({ placement: 'paywall_downsell' })
        .then(() => dslog('registerPlacement paywall_downsell resolvido')) // TEMP-DS
        .catch((e) => dslog('registerPlacement paywall_downsell erro', String(e))); // TEMP-DS
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
      const task = InteractionManager.runAfterInteractions(() => {
        registerPlacement({ placement });
      });
      return () => task.cancel();
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
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSubscriptionVerified(true);
        router.replace(session?.user ? '/(app)/home' : '/(onboarding)/signup');
      });
      return;
    }

    if (hasRegistered.current) return;
    hasRegistered.current = true;

    const task = InteractionManager.runAfterInteractions(() => {
      dslog('registro inicial: paywall_onboarding'); // TEMP-DS
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
