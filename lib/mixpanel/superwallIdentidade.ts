// Identidade no Superwall igual à do Mixpanel. A integração Superwall → Mixpanel (eventos `sw_*`,
// vindos do SERVIDOR do Superwall: renovação, conversão do trial, cancelamento, reembolso…) usa
// o `appUserId` do Superwall como distinct_id — por isso o `identify` do Superwall roda nos
// mesmos pontos do `identify` do Mixpanel, com o MESMO id (o user_id do Supabase), logo depois
// dele (MixpanelProvider → `executarNoMixpanel`, caso 'identify'). O `reset` do Superwall fica no
// logout e no "apagar conta" (`limparIdentidadeSuperwall`, chamado por `clearLocalData`).
//
// appAccountToken: no iOS o SuperwallKit já manda o `appUserId` como `appAccountToken` da compra
// quando ele é um UUID (o id do Supabase é) — `IdentityManager.appAccountToken` no SDK nativo.
// Identificada antes de comprar → a compra chega na Apple (e no servidor) com o id da conta.
// Compra ANTES do cadastro (o caminho normal do onboarding) vai com o id anônimo do Superwall,
// que o servidor liga à conta depois (lib/assinaturaServidor.ts).
import { useSuperwallStore } from 'expo-superwall';
import { mixpanel } from './mixpanelClient';

const ESPERA_MS = 10_000;

function superwallPronto(): Promise<boolean> {
  if (useSuperwallStore.getState().isConfigured) return Promise.resolve(true);
  return new Promise((resolve) => {
    const fim = (ok: boolean) => { clearTimeout(t); parar(); resolve(ok); };
    const t = setTimeout(() => fim(false), ESPERA_MS);
    const parar = useSuperwallStore.subscribe((s) => { if (s.isConfigured) fim(true); });
  });
}

let ultimo: string | null = null;

/** `Superwall.identify(userId)` com o mesmo id do Mixpanel. Nunca lança; não repete o mesmo id. */
export function identificarSuperwall(userId: string): void {
  if (!userId || userId === ultimo) return;
  ultimo = userId;
  void (async () => {
    try {
      if (!(await superwallPronto())) { ultimo = null; return; }
      const store = useSuperwallStore.getState();
      const attrs = await store.getUserAttributes().catch(() => null);
      if (attrs?.appUserId !== userId) await store.identify(userId);
      aplicarMixpanelNoSuperwall(); // o identify pode trocar os atributos: reaplica
    } catch {
      ultimo = null;
    }
  })();
}

// ── Atributo de integração `mixpanelDistinctId` ──────────────────────────────────────────
// Para os eventos `sw_*` do servidor caírem no perfil certo do Mixpanel — inclusive os da compra
// feita ANTES do cadastro (quando o `appUserId` do Superwall ainda é anônimo) —, o Superwall
// recebe o distinct_id ATUAL do Mixpanel: o anônimo no início, o user_id depois do identify e o
// novo anônimo depois do reset. Sempre o último valor; reaplicado depois do identify e do reset
// do Superwall (que podem limpar os atributos).
let idMixpanel: string | null = null;
let aplicando = false;
let pendente = false;

function aplicarMixpanelNoSuperwall(): void {
  if (!idMixpanel) return;
  if (aplicando) { pendente = true; return; }
  aplicando = true;
  void (async () => {
    try {
      do {
        pendente = false;
        const id = idMixpanel;
        if (!id || !(await superwallPronto())) break;
        await useSuperwallStore.getState().setIntegrationAttributes({ mixpanelDistinctId: id });
        await registrarAliasNoMixpanel();
      } while (pendente);
    } catch {
      // sem o atributo, os `sw_*` caem só pelo appUserId; tenta de novo na próxima mudança
    } finally {
      aplicando = false;
    }
  })();
}

// ── Super property `superwall_alias` (26/nov/2026) ───────────────────────────────────────
// O id anônimo do Superwall deste aparelho, em minúsculas (`$superwallalias:<uuid>`), em todo
// evento do Mixpanel. É o mesmo id que chega na compra (webhook → `loja_eventos.app_user_id`,
// ClickHouse do Superwall): liga quem pagou às telas que viu depois (funil do pós-compra).
// Reaplicada junto com o atributo acima: no início, depois do identify e depois dos resets
// (o do Mixpanel apaga as super properties; o do Superwall troca o id).
async function registrarAliasNoMixpanel(): Promise<void> {
  try {
    const attrs = await useSuperwallStore.getState().getUserAttributes();
    const bruto = typeof attrs?.aliasId === 'string' ? attrs.aliasId.trim() : '';
    if (!bruto) return;
    const alias = (bruto.toLowerCase().startsWith('$superwallalias:') ? bruto : `$SuperwallAlias:${bruto}`).toLowerCase();
    mixpanel.registerSuperProperties({ superwall_alias: alias });
  } catch {
    // sem o alias, os eventos seguem sem ele
  }
}

/** Novo distinct_id do Mixpanel (início, identify, reset): manda ao Superwall. Nunca lança. */
export function definirMixpanelNoSuperwall(distinctId: string): void {
  if (!distinctId) return;
  idMixpanel = distinctId;
  aplicarMixpanelNoSuperwall();
}

/** Depois do `Superwall.reset()` (logout/apagar conta): reaplica o distinct_id atual. */
export function reaplicarMixpanelNoSuperwall(): void {
  aplicarMixpanelNoSuperwall();
}

/** Logout / apagar conta: o próximo identify volta a chamar o SDK. */
export function esquecerIdentidadeSuperwall(): void {
  ultimo = null;
}
