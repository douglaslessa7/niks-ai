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
  downsellPlacementPara,
  markDownsellShown,
  nextPaywallPlacement,
  requestDownsell,
  subscribeDownsellRequest,
} from '../../lib/paywallFlow';
import { avisarTransferenciaFalhou, confirmPremium, ensureAnonymousRevenueCat } from '../../lib/subscriptionGate';
import { pwDecisao } from '../../lib/paywallDebug';
import { forcarPaywallDev } from '../../lib/devReset';
import { PULAR_PAYWALL } from '../../lib/devPaywall';
import { attributeCouponIfAny } from '../../lib/couponAttribution';
import { haptics } from '../../lib/haptics';
import { t } from '../../lib/i18n';
import { OB, ObPillButton } from '../../components/onboarding/kit';
import { iniciarAnaliseCompleta } from '../../lib/onboardingPrefetch';
import { atualizarCompraPendente, registrarCompraPendente } from '../../lib/compraPendente';
import { lerCodigoGrupo } from '../../lib/convidada';
import { assinaturaDoAppleId } from '../../lib/assinaturaServidor';
import { deveriaPerguntar } from '../../lib/regraCompra';
import { marcarCompraNestaSessao } from '../../lib/sinalCompra';
import { registrarAceiteNaCompra } from '../../lib/aceiteTermos';
import PerguntaAssinatura, { PERGUNTA_ASSINATURA_LIGADA } from '../../components/assinatura/PerguntaAssinatura';
import { posCompraV2Ligado } from '../../lib/posCompraV2';

// 1ª tela depois da compra confirmada. Pós-compra v2 (lib/posCompraV2.ts) SÓ com a chave de
// desenvolvimento ligada (`posCompraV2Dev`, sempre false em Release): o fluxo de sempre não muda.
function inicioDasBoasVindas(): string {
  return posCompraV2Ligado() ? '/(onboarding)/pc-boas-vindas' : '/(onboarding)/bv-entrou';
}

// Compra confirmada (06/nov/2026): a análise completa e a rotina só rodam a partir daqui.
// Se há um scan do onboarding na memória, guarda a foto e o estado no aparelho (para o app
// poder fechar até a conta ficar pronta — `lib/compraPendente.ts`) e dispara a análise.
// Devolve se havia onboarding (→ a tela de espera salva tudo na conta).
async function liberarAnaliseCompleta(): Promise<boolean> {
  const s = useAppStore.getState();
  if (s.scanSource !== 'onboarding' || !s.skinImageBase64) return false;
  await registrarCompraPendente();
  iniciarAnaliseCompleta();
  return true;
}

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
  // Assinatura no Apple ID que não é desta conta: pergunta antes de usar (lib/regraCompra.ts).
  const [pergunta, setPergunta] = useState(false);
  // Convite válido no onboarding, ainda sem conta: paywall da convidada, com X e sem downsell.
  const grupoConvite = useRef<string | null>(null);
  const placementBase = () => grupoConvite.current !== null ? 'paywall_convidada' : 'paywall_onboarding';

  // `paywall_viewed` saiu daqui (disparava a CADA render desta tela): agora sai uma vez por
  // abertura real do paywall, com placement e paywall_id, em lib/mixpanel/superwallBridge.tsx.

  // Pede um placement ao Superwall. Paywallo: atributos de anúncio ANTES de todo
  // registerPlacement (nunca lança, segura no máx. 1,5 s — ver "Paywallo" no README).
  // `isCancelled`: o blur da tela não alcança um sync já em voo.
  const present = async (placement: string, motivo: string, isCancelled?: () => boolean) => {
    await syncSuperwallAttributes({ timeoutMs: 1500 });
    if (isCancelled?.()) return;
    try {
      if (placement === 'paywall_convidada') track('convidada_paywall_aberto', { origem: 'onboarding' });
      await registerPlacement({ placement });
    } catch (e) {
      void paywallNaoApareceu(placementBase(), `registerPlacement(${placement}) lançou`);
    }
  };

  // Fail closed para "o paywall não apareceu": pede de novo; depois de
  // MAX_FALHAS_SEGUIDAS para e mostra "Tentar de novo". NUNCA consulta o RevenueCat
  // para liberar — o cadastro só abre por compra/restauração confirmada.
  const paywallNaoApareceu = async (placement: string, motivo: string) => {
    falhasRef.current += 1;
    if (falhasRef.current > MAX_FALHAS_SEGUIDAS) {
      await pwDecisao(motivo, 'PARADO em "Não conseguimos carregar agora"', 'parado',
        `O paywall não apareceu ${MAX_FALHAS_SEGUIDAS}x seguidas. Nunca libera o cadastro.`);
      setSemPaywall(true);
      return;
    }
    await pwDecisao(motivo, `PAYWALL de novo (${placement})`, 'paywall',
      motivo.includes('NoAudienceMatch')
        ? 'O Superwall não mostrou este paywall porque a campanha só aparece para quem ele vê SEM assinatura no Apple ID (downsell e cupom). Confira "Superwall vê".'
        : undefined);
    setTimeout(() => { void present(placement, motivo); }, 600);
  };

  // Compra ou restauração dentro do paywall: SÓ aqui o RevenueCat é consultado
  // para liberar. Confirmou o `premium` → cadastro (nova usuária) ou home (já tem
  // conta). Não confirmou → paywall de novo (ela pode tocar em "Restaurar compra").
  const confirmarESeguir = async (tipo: 'purchased' | 'restored') => {
    // Comprou ou restaurou neste aparelho: a compra que estiver em outra conta vem para esta.
    let transferenciaFalhou = false;
    const transferencia = {
      transferir: tipo === 'restored' ? 'restaurar' as const : 'compra' as const,
      onTransferenciaFalhou: () => { transferenciaFalhou = true; },
    };
    let ok = await confirmPremium({ source: 'sync', attempts: 3, label: `paywall:${tipo}`, ...transferencia });
    // "Restaurar compra" que o sync não resolveu: aí sim o restore do RevenueCat
    // (foi ela quem pediu para restaurar).
    if (!ok && tipo === 'restored' && !transferenciaFalhou) {
      ok = await confirmPremium({ source: 'restore', label: 'paywall:restored', ...transferencia });
    }
    if (!ok) {
      await pwDecisao(`onDismiss(${tipo})`, 'PAYWALL de novo (paywall_onboarding)', 'paywall',
        'O Superwall disse que houve compra/restauração, mas o RevenueCat não confirmou o premium.');
      if (transferenciaFalhou) await avisarTransferenciaFalhou();
      void present(placementBase(), `${tipo}_sem_premium`);
      return;
    }
    // Sinal explícito para o cadastro e as boas-vindas: SÓ aqui (purchased/restored confirmado).
    await marcarCompraNestaSessao(tipo === 'restored' ? 'restaurar' : 'compra');
    // 1.64: o paywall mostra a frase dos Termos — compra com conta logada registra o aceite.
    if (tipo === 'purchased') await registrarAceiteNaCompra();
    const comOnboarding = await liberarAnaliseCompleta();
    const { data: { session } } = await supabase.auth.getSession();
    await pwDecisao(`onDismiss(${tipo})`, session?.user ? 'HOME (já tinha conta)' : 'CADASTRO', session?.user ? 'home' : 'cadastro',
      tipo === 'restored'
        ? 'Ela tocou em "Restaurar compra" e o RevenueCat confirmou o premium.'
        : 'O Superwall devolveu "comprou" e o RevenueCat confirmou o premium.');
    if (session?.user) {
      // Já tem conta (reengajamento): o RevenueCat já está logado nesta conta (o
      // guard do (app)/_layout fez o loginRevenueCat antes de mandar para cá), então
      // a confirmação vale para ela. Não passa pelo signup → atribui o cupom aqui.
      setSubscriptionVerified(true);
      attributeCouponIfAny(session.user.id);
      if (comOnboarding) {
        // 1.64: fez o onboarding já logada (conta do "Entrar", `lib/onboardingObrigatorio.ts`):
        // as boas-vindas, como quem começou do zero; no fim, em vez do cadastro, a tela de
        // espera grava perfil, scan e rotina NESTA conta (`concluirComContaLogada`, bv-nivel).
        // O registro da compra já leva o user_id: se o app fechar nas boas-vindas, a retomada
        // (app/index.tsx) reconhece a compra desta conta (criada ANTES da compra).
        await atualizarCompraPendente({ userId: session.user.id });
        router.replace(inicioDasBoasVindas() as any);
        return;
      }
      router.replace('/(app)/home');
    } else {
      // Nova usuária. O `subscriptionVerified` NÃO é marcado aqui: a identidade
      // muda no cadastro (Purchases.logIn), e é o signup que confere de novo e marca.
      // 07/nov/2026: antes do cadastro, as boas-vindas pós-pagamento (`bv-*`, telas 1–8 do
      // design NiksBoasVindas); a última leva ao cadastro (que confere o premium de novo).
      router.replace(inicioDasBoasVindas() as any);
    }
  };

  const { registerPlacement } = usePlacement({
    onPresent: () => {
      falhasRef.current = 0;
      setSemPaywall(false);
    },
    onDismiss: async (info, result?: PaywallResult) => {
      // Fechamento causado pelo botão "TENHO CUPOM" ou pelo cancelamento da folha da
      // Apple (que pede o downsell): pula ESTA reapresentação (uso único).
      if (consumeSuppressReapresentar()) {
        return;
      }
      if (result?.type === 'purchased' || result?.type === 'restored') {
        await confirmarESeguir(result.type);
        return;
      }
      // Convidada fechou no X: cria a conta e entra só no grupo. Sem downsell.
      if (grupoConvite.current !== null && result?.type === 'declined') {
        track('convidada_paywall_fechado', { origem: 'onboarding' });
        router.replace('/(onboarding)/signup');
        return;
      }
      if (grupoConvite.current !== null) {
        void present(placementBase(), 'dismiss_convidada');
        return;
      }
      // Recusou (X) ou resultado desconhecido: nada de RevenueCat, nada de restore
      // automático. Paywall de novo — na 1ª saída da sessão, o downsell (mesmo flag
      // do cancelamento da folha da Apple). Qual downsell sai do paywall que ela viu
      // (`info.identifier`): "Paywall OG 149" → paywall_downsell_149; senão, paywall_downsell.
      const placement = nextPaywallPlacement(info?.identifier);
      await pwDecisao(`onDismiss(${result?.type ?? 'sem resultado'}) — fechou sem pagar`, `PAYWALL de novo (${placement})`, 'paywall',
        `Paywall que ela viu: ${info?.identifier ?? '?'}`);
      void present(placement, 'dismiss_recusou');
    },
    onSkip: (reason) => {
      // Superwall não apresentou (holdout, sem público — ex.: o downsell para quem o
      // Superwall vê com assinatura no Apple ID). Antes liberava se o RevenueCat
      // dissesse premium; agora é sempre paywall (restaurar é pelo botão).
      void paywallNaoApareceu(grupoConvite.current !== null ? placementBase() : nextPaywallPlacement(), `onSkip(${reason?.type ?? '?'})`);
    },
    onError: (error) => {
      void paywallNaoApareceu(placementBase(), `onError(${String(error)})`);
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
      if (grupoConvite.current !== null) return;
      if (!canShowDownsell()) {
        return;
      }
      // Qual downsell: o do paywall em que ela desistiu ("Paywall OG 149" →
      // paywall_downsell_149; qualquer outro → paywall_downsell). Lido ANTES do dismiss.
      const ev = eventInfo.event as { paywallInfo?: { identifier?: string } };
      const paywallVisto = ev.paywallInfo?.identifier;
      const placement = downsellPlacementPara(paywallVisto);
      markDownsellShown();
      armSuppressReapresentar();
      try { await Superwall.shared.dismiss(); } catch {}
      await pwDecisao('transactionAbandon — desistiu na folha da Apple', `DOWNSELL (${placement})`, 'paywall',
        `Paywall que ela viu: ${paywallVisto ?? '?'}`);
      requestDownsell(placement);
    },
  });

  // Pedido de downsell (vindo do `transactionAbandon` acima): aqui só registramos
  // o placement — é este registro, e não um `Superwall.shared.register` solto, que
  // carrega os callbacks de fail closed acima (onSkip/onError → paywall).
  useEffect(() => {
    if (PULAR_PAYWALL) return;
    return subscribeDownsellRequest((placement) => {
      void present(placement, 'transactionAbandon');
    });
  }, []);

  // Ao VOLTAR da tela de cupom, reapresenta o paywall certo: com desconto (cupom
  // válido) ou o normal (voltar/descartar). O primeiro foco é ignorado — o registro
  // inicial continua sendo feito pelo useEffect abaixo, sem alteração.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (PULAR_PAYWALL) return;
      if (firstFocus.current) { firstFocus.current = false; return; }
      const placement = consumeNextPlacement() ?? placementBase();
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
    if (PULAR_PAYWALL) {
      // Atalho de dev: pula o paywall. Mas NÃO pode mandar todo mundo pro signup —
      // quem já tem sessão (login pela tela "Entrar") já tem conta e deve ir pra home.
      // Sem esse check, logar numa conta existente em dev caía na tela de criar conta.
      // ⚠️ Só existe no Metro e sem EXPO_PUBLIC_PAYWALL_REAL=1 (`lib/devPaywall.ts`). Em
      // Release/TestFlight/App Store é sempre false e este bloco não roda.
      liberarAnaliseCompleta().then((comOnboarding) => supabase.auth.getSession().then(({ data: { session } }) => {
        setSubscriptionVerified(true);
        router.replace(session?.user ? (comOnboarding ? '/(onboarding)/loading-rotina' as any : '/(app)/home') : inicioDasBoasVindas() as any);
      }));
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
      const { data: { session } } = await supabase.auth.getSession();
      const convite = session ? null : await lerCodigoGrupo();
      if (cancelled) return;
      grupoConvite.current = convite?.grupo ?? null;
      // Assinatura ativa no Apple ID que não é desta conta, sem compra nem restauração agora:
      // pergunta antes. A convidada nunca é perguntada (entra como convidada).
      // `forcarPaywallDev()`: SÓ __DEV__ (menu "NIKS: forçar paywall"); em Release é sempre false.
      if (PERGUNTA_ASSINATURA_LIGADA && grupoConvite.current === null && !forcarPaywallDev()) {
        const a = await assinaturaDoAppleId();
        if (cancelled) return;
        if (deveriaPerguntar({ convite: false, sinal: null, ...a })) {
          setPergunta(true);
          track('assinatura_pergunta_vista', { com_sessao: a.temSessao, outra_conta: a.outraConta });
          return;
        }
      }
      void present(placementBase(), 'inicial', () => cancelled);
    });

    return () => { cancelled = true; task.cancel(); };
  }, []);

  // "Usar nesta conta" = o mesmo que tocar em "Restaurar compra" (origem `restaurar`).
  const usarAssinatura = async () => {
    track('assinatura_pergunta_usou');
    setPergunta(false);
    await confirmarESeguir('restored');
  };
  // 1.64 (2): "Agora não" volta para a pergunta. Antes chamava o paywall, que o Superwall não
  // mostra para quem já assina no Apple ID (`userIsSubscribed`) — ela caía em "Não conseguimos
  // carregar agora", sem saída. Com a assinatura ativa, o caminho é usá-la nesta conta.
  const recusarAssinatura = () => {
    track('assinatura_pergunta_recusou');
    haptics.warning();
  };

  const tentarDeNovo = () => {
    haptics.action();
    falhasRef.current = 0;
    setSemPaywall(false);
    void present(placementBase(), 'tentar_de_novo');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      {pergunta ? (
        <PerguntaAssinatura onUsar={() => { void usarAssinatura(); }} onAgoraNao={recusarAssinatura} />
      ) : semPaywall ? (
        <>
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '700', color: OB.ink, textAlign: 'center' }}>
            {t('Não conseguimos carregar agora')}
          </Text>
          <Text style={{ marginTop: 8, marginBottom: 28, fontSize: 16, lineHeight: 22, color: OB.sub, textAlign: 'center' }}>
            {t('Confira sua conexão e tente de novo.')}
          </Text>
          <ObPillButton label={t('Tentar de novo')} onPress={tentarDeNovo} />
        </>
      ) : (
        <ActivityIndicator color={OB.pink} />
      )}
    </View>
  );
}
