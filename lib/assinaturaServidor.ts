// ─────────────────────────────────────────────────────────────────────────────
// Assinatura conferida no SERVIDOR (fase 3 — grupos). A compra acontece antes da conta, então
// o evento de loja (webhook do Superwall → `assinaturas_loja`) chega só com ids anônimos.
//
// Parte B, Fase 0A (08/nov/2026): a cada abertura com sessão, o app manda ao servidor os ids
// anônimos deste aparelho (Superwall e, enquanto existir, RevenueCat) e o que ele mesmo vê
// (`premium`). O servidor liga as compras à conta e registra se os dois discordam. Antes ia
// só o id do RevenueCat, uma vez por conta: as compras novas, que chegam com o id do
// Superwall, nunca eram ligadas.
// Também identifica a conta no Superwall, para as próximas compras já chegarem com ela.
// Nunca bloqueia nada: é só para o servidor saber.
// ─────────────────────────────────────────────────────────────────────────────
import { SuperwallExpoModule, useSuperwallStore } from 'expo-superwall';
import { comprovantesApple } from './comprovanteApple';
import { supabase } from './supabase';
import { getCustomerInfo, isPremium } from './revenuecat';

const FN_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/assinatura`;
const FN_COMPROVANTE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/comprovar-assinatura`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PREFIXO_SUPERWALL = '$SuperwallAlias:';
const ESPERA_SUPERWALL_MS = 10000;
// ⚠️ Ligado para o teste junto com a compra sandbox (08/nov/2026). Se o A/B do paywall mudar,
// voltar para false.
const IDENTIFY_LIGADO = true;

let emAndamento = false;

/** O SDK do Superwall não pode ser chamado antes de configurado. */
function superwallPronto(esperaMs = ESPERA_SUPERWALL_MS): Promise<boolean> {
  if (useSuperwallStore.getState().isConfigured) return Promise.resolve(true);
  return new Promise((resolve) => {
    const fim = (ok: boolean) => { clearTimeout(t); parar(); resolve(ok); };
    const t = setTimeout(() => fim(false), esperaMs);
    const parar = useSuperwallStore.subscribe((s) => { if (s.isConfigured) fim(true); });
  });
}

/** Devolve o id anônimo da compra e identifica a conta no Superwall. */
async function identidadeSuperwall(uid: string): Promise<string | null> {
  try {
    if (!(await superwallPronto())) return null;
    const store = useSuperwallStore.getState();
    const attrs = await store.getUserAttributes();
    const atual = typeof attrs?.appUserId === 'string' ? attrs.appUserId : '';
    // Identificado como outra conta: esse id anônimo não é desta pessoa.
    if (atual && atual !== uid) {
      if (IDENTIFY_LIGADO) await store.identify(uid);
      return null;
    }
    const alias = typeof attrs?.aliasId === 'string' ? attrs.aliasId : '';
    if (!atual && IDENTIFY_LIGADO) await store.identify(uid);
    if (!alias) return null;
    return alias.startsWith(PREFIXO_SUPERWALL) ? alias : `${PREFIXO_SUPERWALL}${alias}`;
  } catch {
    return null;
  }
}

/** Confere a assinatura no servidor e liga as compras anônimas à conta logada. */
export async function vincularAssinatura(uid: string): Promise<void> {
  if (emAndamento) return;
  emAndamento = true;
  try {
    const superwallId = await identidadeSuperwall(uid);
    const info = await getCustomerInfo().catch(() => null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const headers = { Authorization: `Bearer ${session.access_token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' };
    // Prova da Apple (0B): vai antes, para o `conferir` já ver a compra ligada.
    const jws = await comprovantesApple();
    if (jws.length) await fetch(FN_COMPROVANTE, { method: 'POST', headers, body: JSON.stringify({ jws }) }).catch(() => {});
    await fetch(FN_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        acao: 'conferir',
        rc_id: info?.originalAppUserId ?? null,
        superwall_id: superwallId,
        premium: info ? isPremium(info) : null,
      }),
    });
  } catch {
    // sem rede: tenta na próxima abertura
  } finally {
    emAndamento = false;
  }
}

/** Ao sair da conta: a próxima pessoa do aparelho recebe um id anônimo novo. */
export async function limparIdentidadeSuperwall(): Promise<void> {
  try {
    const store = useSuperwallStore.getState();
    if (store.isConfigured) await store.reset();
  } catch {
    // não impede a saída da conta
  }
}

const TETO_MS = 4000;
const ESPERA_PORTAO_MS = 5000;

function comTeto<T>(p: Promise<T>, ms = TETO_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

const cabecalhos = (token: string) => ({ Authorization: `Bearer ${token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' });

type StatusSuperwall = 'ACTIVE' | 'INACTIVE' | null;

/** `null` = sem resposta (não configurado, erro ou UNKNOWN depois de alguns segundos). */
async function statusSuperwall(): Promise<StatusSuperwall> {
  if (!(await superwallPronto(ESPERA_PORTAO_MS))) return null;
  for (let i = 0; i < 3; i++) {
    const st = await comTeto(SuperwallExpoModule.getSubscriptionStatus());
    if (st?.status === 'ACTIVE' || st?.status === 'INACTIVE') return st.status;
    if (i < 2) await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function servidorConfirma(token: string): Promise<boolean | null> {
  const resp = await comTeto(fetch(FN_URL, { method: 'POST', headers: cabecalhos(token), body: JSON.stringify({ acao: 'status' }) }));
  if (!resp?.ok) return null;
  const r = await comTeto(resp.json());
  return typeof r?.assinante === 'boolean' ? r.assinante : null;
}

/** A assinatura do Apple ID deste aparelho está ligada a OUTRA conta NIKS? Na dúvida, não. */
async function compraDeOutraConta(token: string): Promise<boolean> {
  const jws = await comprovantesApple();
  if (!jws.length) return false;
  const resp = await comTeto(fetch(FN_COMPROVANTE, { method: 'POST', headers: cabecalhos(token), body: JSON.stringify({ jws }) }));
  if (!resp?.ok) return false;
  const r = await comTeto(resp.json());
  return Number(r?.conflitos) > 0 && Number(r?.ligadas) === 0;
}

export type ConferenciaPortao = {
  confirmado: boolean;
  /** Compra ligada a outra conta: vai ao paywall, e o RevenueCat não pode liberar. */
  outraConta: boolean;
  superwall: StatusSuperwall;
  servidor: boolean | null;
  token: string | null;
};

/**
 * Parte B, Fase 0C, Etapa 1: Superwall → servidor. Quem chama (`confirmPremium`) usa o
 * RevenueCat só como reserva. Sem sessão, só o Superwall pode responder. Nunca lança.
 */
export async function conferirPortao(): Promise<ConferenciaPortao> {
  const base: ConferenciaPortao = { confirmado: false, outraConta: false, superwall: null, servidor: null, token: null };
  try {
    base.superwall = await statusSuperwall();
    const { data: { session } } = await supabase.auth.getSession();
    base.token = session?.access_token ?? null;
    if (!base.token) return { ...base, confirmado: base.superwall === 'ACTIVE' };
    base.servidor = await servidorConfirma(base.token);
    if (base.servidor === true) return { ...base, confirmado: true };
    if (base.superwall !== 'ACTIVE') return base;
    const outraConta = await compraDeOutraConta(base.token);
    return { ...base, confirmado: !outraConta, outraConta };
  } catch {
    return base;
  }
}

/** Registra que o RevenueCat discordou da decisão. Só com sessão. Nunca lança. */
export async function registrarDiscordanciaRc(c: ConferenciaPortao, rc: boolean | null): Promise<void> {
  if (!c.token) return;
  try {
    await comTeto(fetch(FN_URL, {
      method: 'POST',
      headers: cabecalhos(c.token),
      body: JSON.stringify({ acao: 'discordancia_rc', rc, superwall: c.superwall }),
    }));
  } catch {
    // é só medição
  }
}
