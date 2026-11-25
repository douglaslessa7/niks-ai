// Ponte Superwall → Mixpanel (paywall e compras feitos NO APP). Quem compra é o próprio Superwall
// (StoreKit). Renovação, conversão do trial, cancelamento e reembolso vêm do servidor do Superwall
// (integração Superwall → Mixpanel, eventos `sw_*`), não daqui.
//
// Montada UMA vez no layout raiz, dentro do `SuperwallProvider`, SEM `handlerId`: um ouvinte sem
// handlerId recebe também os eventos dos `usePlacement` (paywall-soft, AvisoCadeado) — ver
// `isMatchingSubscriber` em expo-superwall/build/src/internal/superwallEventBridge.js (v1.0.9).
// Não mexe em nada do fluxo de compra: só lê e manda ao Mixpanel.
import { useSuperwallEvents } from 'expo-superwall';
import type { PaywallInfo, PaywallResult, SuperwallEventInfo } from 'expo-superwall';
import { trackFora } from './MixpanelProvider';
import { forcarPlano } from './perfil';

function propsPaywall(info: PaywallInfo | null | undefined): Record<string, unknown> {
  return {
    placement: info?.presentedByEventWithName ?? null,
    paywall_id: info?.identifier ?? null,
    paywall_name: info?.name ?? null,
    experiment_id: info?.experiment?.id ?? null,
    variant_id: info?.experiment?.variant?.id ?? null,
  };
}

type ProdutoSw = {
  id?: string; productIdentifier?: string; price?: number; period?: string; currencyCode?: string | null;
};

function periodo(period: string | undefined): string | null {
  const p = (period ?? '').toLowerCase();
  if (p.startsWith('year')) return 'anual';
  if (p.startsWith('month')) return 'mensal';
  if (p.startsWith('week')) return 'semanal';
  return p || null;
}

function propsProduto(produto: ProdutoSw | null | undefined): Record<string, unknown> {
  return {
    product_id: produto?.productIdentifier ?? produto?.id ?? null,
    // `periodo`, não `plano`: `plano` é a super property (free/trial/pago/convidada/expirado) e
    // uma propriedade do evento com o mesmo nome a sobrescreveria.
    periodo: periodo(produto?.period),
    preco: typeof produto?.price === 'number' ? produto.price : null,
    moeda: produto?.currencyCode ?? null,
  };
}

function fimDoTrial(produto: { trialPeriodEndDate?: string | null } | null | undefined): number | null {
  const t = produto?.trialPeriodEndDate ? Date.parse(produto.trialPeriodEndDate) : NaN;
  return Number.isFinite(t) ? t : null;
}

function motivoFechou(info: PaywallInfo, result: PaywallResult): string {
  if (result?.type === 'purchased') return 'comprou';
  if (result?.type === 'restored') return 'restaurou';
  if (info?.closeReason === 'manualClose') return 'x';
  if (info?.closeReason === 'forNextPaywall') return 'proximo_paywall';
  return 'fechou';
}

function aoEvento(e: SuperwallEventInfo) {
  const ev = e?.event as any;
  if (!ev?.event) return;
  try {
    switch (ev.event) {
      case 'paywallOpen':
        // Uma vez por abertura real do paywall (inclusive downsell, cupom e convidada).
        trackFora('paywall_viewed', { screen: 'superwall', ...propsPaywall(ev.paywallInfo) });
        break;
      case 'transactionStart':
        trackFora('transaction_started', { ...propsPaywall(ev.paywallInfo), ...propsProduto(ev.product) });
        break;
      case 'transactionComplete': {
        // Numa compra COM trial o SuperwallKit manda `transactionComplete` (type
        // FREE_TRIAL_START) e, logo depois, `freeTrialStart` — a mesma compra vira
        // `purchase_completed` (com_trial: true) e `trial_started`. Compra paga =
        // `purchase_completed` com `com_trial: false` (type SUBSCRIPTION_START).
        // ⚠️ No SK2 o SDK marca FREE_TRIAL_START para QUALQUER oferta de introdução
        // (`transaction.offer != nil`), não só teste grátis — hoje os produtos não têm outra.
        const comTrial = ev.type === 'FREE_TRIAL_START';
        trackFora('purchase_completed', {
          fonte: 'superwall', tipo: ev.type ?? null, com_trial: comTrial,
          ...propsPaywall(ev.paywallInfo), ...propsProduto(ev.product),
        });
        forcarPlano(comTrial ? 'trial' : 'pago', fimDoTrial(ev.product)); // na hora, antes do status do Superwall virar
        break;
      }
      case 'freeTrialStart':
        trackFora('trial_started', { ...propsPaywall(ev.paywallInfo), ...propsProduto(ev.product) });
        forcarPlano('trial', fimDoTrial(ev.product));
        break;
      case 'transactionAbandon':
        trackFora('transaction_abandoned', { ...propsPaywall(ev.paywallInfo), ...propsProduto(ev.product) });
        break;
      case 'transactionFail':
        trackFora('transaction_failed', { ...propsPaywall(ev.paywallInfo), erro: String(ev.error ?? '').slice(0, 200) });
        break;
      case 'transactionRestore':
        trackFora('purchase_restored', { fonte: 'superwall', restore_type: ev.restoreType ?? null, ...propsPaywall(ev.paywallInfo) });
        break;
    }
  } catch {}
}

export function SuperwallMixpanelBridge() {
  useSuperwallEvents({
    onSuperwallEvent: aoEvento,
    onPaywallDismiss: (info, result) => {
      try {
        trackFora('paywall_closed', { motivo: motivoFechou(info, result), close_reason: info?.closeReason ?? null, ...propsPaywall(info) });
      } catch {}
    },
  });
  return null;
}
