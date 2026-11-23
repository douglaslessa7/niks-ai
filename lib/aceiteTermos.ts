// ─────────────────────────────────────────────────────────────────────────────
// Aceite dos Termos de Uso no cadastro e no login (build 1.64; servidor: migration
// 20261218120000_termos_aceitos.sql). As duas telas mostram "Ao continuar, você concorda com
// os Termos de Uso e a Política de Privacidade…"; o cadastro grava `users.termos_aceitos_em` +
// `termos_versao`, e o login grava quando o "Entrar" com Apple/Google cria uma conta nova. A seção 4 dos Termos publicados em 19/11/2026 cobre o envio de dados de
// uso à Apple em pedidos de reembolso: a função `apple-notificacoes` só responde à Apple por
// quem tem esse aceite ANTES do pedido.
//
// A DATA gravada é sempre a do servidor (gatilho `users_termos_aceitos`), e um 2º aceite não
// muda o 1º. ⚠️ A migration precisa estar no ar ANTES desta build ir para a loja; se não
// estiver, o cadastro grava a conta sem estes campos (ver `saveToSupabase`).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

/** Versão dos Termos mostrados no cadastro (publicados em 19/11/2026). */
export const VERSAO_TERMOS = 'termos-2026-11-19';

/** Campos para o upsert de `users` no cadastro (a data real vem do servidor). */
export function camposAceiteTermos(): Record<string, string> {
  return { termos_aceitos_em: new Date().toISOString(), termos_versao: VERSAO_TERMOS };
}

/**
 * Login com Apple/Google que CRIOU uma conta nova (a tela de login também mostra a frase dos
 * Termos): registra o aceite. Conta antiga (criada há mais de 10 min) não é tocada. Nunca
 * trava o login: falha só é registrada.
 */
export async function registrarAceiteSeContaNova(user?: { id?: string; created_at?: string } | null): Promise<void> {
  if (!user?.id || !user.created_at) return;
  if (Date.now() - new Date(user.created_at).getTime() > 10 * 60_000) return;
  try {
    const { error } = await supabase.from('users').update(camposAceiteTermos()).eq('id', user.id);
    if (error) console.warn('[aceiteTermos] login: gravar o aceite falhou:', error.message);
  } catch (e) {
    console.warn('[aceiteTermos] login: gravar o aceite falhou:', e);
  }
}

/**
 * Compra confirmada no paywall (1.64): o paywall mostra "Ao continuar, você concorda com os
 * Termos de Uso e a Política de Privacidade". Com conta logada (reengajamento, cadeados da
 * convidada), grava o aceite na hora — o gatilho do servidor põe a data dele e nunca troca um
 * aceite anterior. Sem conta, não há onde gravar: o cadastro logo depois grava (`termos: true`).
 * Nunca trava a compra: falha só é registrada.
 */
export async function registrarAceiteNaCompra(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const { error } = await supabase.from('users').update(camposAceiteTermos()).eq('id', uid);
    if (error) console.warn('[aceiteTermos] compra: gravar o aceite falhou:', error.message);
  } catch (e) {
    console.warn('[aceiteTermos] compra: gravar o aceite falhou:', e);
  }
}

/** SÓ DESENVOLVIMENTO: registra o aceite na conta logada (teste do reembolso em sandbox). */
export async function registrarAceiteTermosTeste(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return 'Sem conta logada.';
  const { error } = await supabase.from('users').update(camposAceiteTermos()).eq('id', uid);
  return error ? `Falhou: ${error.message}` : 'Aceite dos Termos registrado nesta conta.';
}
