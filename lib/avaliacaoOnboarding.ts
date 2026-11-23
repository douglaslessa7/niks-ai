import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { statusApp } from './gruposServidor';
import { trackFora } from './mixpanel/MixpanelProvider';

// Pedido de avaliação da App Store no ONBOARDING (build 1.64, 23/nov/2026, teste do produto).
// Disparado pelo "Seu caminho" quando a animação termina. Só o pop-up NATIVO (regra 5.6.1 da
// Apple: nada de tela própria antes) e SEM o atalho do `requestAppReview()` para a página da
// App Store — aqui ele tiraria a usuária do meio do onboarding.
//
// Pede só quando TUDO confere; qualquer dúvida = não pede:
//   · iOS;
//   · chave `avaliacao_config.avaliacao_onboarding` = 'brasil' (lida pela `grupos`, ação
//     `convidada_status`; sem resposta em 3 s = não pede — o 'desligado' tem de valer sempre);
//   · conta da App Store do Brasil (storefront 'BRA', pelo RevenueCat) E região do iPhone 'BR';
//   · nunca pedido neste aparelho (marca em AsyncStorage, gravada antes do pedido).
// A cota da Apple (3×/365 dias) é a MESMA dos 3 momentos de dentro do app; a Apple pode não
// mostrar, e no TestFlight nunca mostra — o evento do Mixpanel sai mesmo assim.

const MARCA = 'niks_avaliacao_onboarding_pedida';
const TETO_MS = 3000;

export type DecisaoAvaliacao =
  | 'pedida' | 'fora_brasil' | 'desligado' | 'sem_chave' | 'sem_pais' | 'ja_pedida' | 'indisponivel' | 'nao_ios';

export interface Avaliacao {
  decisao: DecisaoAvaliacao;
  storefront: string | null;
  regiao: string | null;
  chave: string | null;
}

function comTeto<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const relogio = setTimeout(() => resolve(null), ms);
    p.then((v) => resolve(v), () => resolve(null)).finally(() => clearTimeout(relogio));
  });
}

/** Decide se pede (sem pedir). Nunca rejeita. */
export async function decidirAvaliacaoOnboarding(): Promise<Avaliacao> {
  let regiao: string | null = null;
  try { regiao = getLocales()[0]?.regionCode ?? null; } catch {}
  if (Platform.OS !== 'ios') return { decisao: 'nao_ios', storefront: null, regiao, chave: null };

  const [ja, status, loja, disponivel] = await Promise.all([
    AsyncStorage.getItem(MARCA).catch(() => null),
    statusApp(),
    comTeto(Purchases.getStorefront(), TETO_MS),
    StoreReview.isAvailableAsync().catch(() => false),
  ]);
  const chave = status?.avaliacao_onboarding ?? null;
  const storefront = loja?.countryCode ?? null;
  const base = { storefront, regiao, chave };

  if (ja) return { decisao: 'ja_pedida', ...base };
  if (chave == null) return { decisao: 'sem_chave', ...base };
  if (chave !== 'brasil') return { decisao: 'desligado', ...base };
  if (!storefront || !regiao) return { decisao: 'sem_pais', ...base };
  if (storefront.toUpperCase() !== 'BRA' || regiao.toUpperCase() !== 'BR') return { decisao: 'fora_brasil', ...base };
  if (!disponivel) return { decisao: 'indisponivel', ...base };
  return { decisao: 'pedida', ...base };
}

/**
 * Executa o que `decidirAvaliacaoOnboarding` decidiu e registra no Mixpanel
 * (`avaliacao_onboarding`). Só abre o pop-up quando a decisão é 'pedida'.
 */
export async function executarAvaliacaoOnboarding(a: Avaliacao): Promise<void> {
  let decisao = a.decisao;
  if (decisao === 'pedida') {
    try {
      await AsyncStorage.setItem(MARCA, new Date().toISOString());
      await StoreReview.requestReview();
    } catch {
      decisao = 'indisponivel';
    }
  }
  trackFora('avaliacao_onboarding', {
    decisao,
    storefront: a.storefront,
    regiao: a.regiao,
    chave: a.chave,
    versao: Constants.expoConfig?.version ?? null,
    build: Constants.expoConfig?.ios?.buildNumber ?? null,
    plataforma: Platform.OS,
  });
}
