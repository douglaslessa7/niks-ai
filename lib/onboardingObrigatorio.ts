// ─────────────────────────────────────────────────────────────────────────────
// Para onde vai quem está logada SEM assinatura (build 1.64, decisões do produto de 22/nov/2026).
//
//   1. convidada de grupo com acesso ativo → o grupo (o chamador cuida, como antes);
//   2. foi convidada de verdade e perdeu o acesso → "Você não está em nenhum grupo" (`sem-grupo`);
//   3. conta sem as respostas do onboarding (nova ou antiga) → tela rosa ("Conta criada!" /
//      "Que bom te ver!", `conta-sem-onboarding`) → onboarding completo, já logada (sem o
//      "Entrar") → paywall → boas-vindas (`bv-*`) → SEM cadastro: `concluirComContaLogada`
//      grava perfil, Termos e compra na conta da sessão → "Criando uma rotina só sua" → home;
//   4. o resto (onboarding feito) → paywall, como antes da tela "sem grupo".
//
// Até a 1.63, com o modo convidada ligado (`grupos_config.convidada_ligada`, desde 02/nov), TODA
// conta sem assinatura caía em "sem grupo" (no lugar do paywall). Quem chama `decidirSemAssinatura`:
// `routeAfterLogin` (login.tsx), o guard do `(app)/_layout` e a reconferência ao voltar ao app.
//
// Assinante pelo aparelho (Superwall ACTIVE) entra, com ou sem onboarding. Só a compra ligada a
// OUTRA conta não vale, e isso o `confirmPremium` já decide pela prova da Apple (`outraConta`).
// A 1.64 (1) tinha aqui `assinaturaDeOutraConta` (Superwall ACTIVE + servidor "não assina" + sem
// onboarding → regra de quem não assina): sem a prova, ela não distinguia a compra de outra conta
// da compra ainda SEM conta no servidor — quem pagou caía no "Que bom te ver!". Saiu na 1.64 (2).
//
// "Onboarding feito" = dores salvas OU scan de pele OU rotina ideal. Erro na leitura = feito
// (nunca prende quem já tem tudo por falta de internet). Assinante sem onboarding segue direto.
// ─────────────────────────────────────────────────────────────────────────────
import { Alert } from 'react-native';
import type { Router } from 'expo-router';
import { supabase } from './supabase';
import { useAppStore } from '../store/onboarding';
import { trackFora } from './mixpanel/MixpanelProvider';
import { lerCompraNestaSessao, limparCompraNestaSessao } from './sinalCompra';
import { transferirNoCadastro } from './regraCompra';
import { enviarComprovantes } from './assinaturaServidor';
import { atualizarCompraPendente } from './compraPendente';
import { entrarNoGrupoGuardado } from './convidada';
import { mensagemDoCodigo } from './codigoConvite';
import { t } from './i18n';
import { foiConvidada } from './acesso';
import { convidadaLigada } from './gruposServidor';

/** Conta criada há até 10 min = acabou de nascer neste "Entrar". */
const CONTA_NOVA_MS = 10 * 60_000;

type Usuaria = { id: string; created_at?: string } | null | undefined;

/** A conta já tem as respostas do onboarding? Erro na leitura → `true`. */
export async function onboardingFeito(uid: string): Promise<boolean> {
  try {
    const [u, s, p] = await Promise.all([
      supabase.from('users').select('concerns').eq('id', uid).maybeSingle(),
      supabase.from('skin_scans').select('id').eq('user_id', uid).limit(1),
      supabase.from('protocolos').select('id').eq('user_id', uid).limit(1),
    ]);
    if (u.error || s.error || p.error) {
      console.warn('[onboardingObrigatorio] leitura falhou; segue como feito:', u.error ?? s.error ?? p.error);
      return true;
    }
    const dores = Array.isArray(u.data?.concerns) ? u.data!.concerns.length : 0;
    return dores > 0 || (s.data?.length ?? 0) > 0 || (p.data?.length ?? 0) > 0;
  } catch (e) {
    console.warn('[onboardingObrigatorio] leitura falhou; segue como feito:', e);
    return true;
  }
}

/**
 * Sem assinatura e sem acesso de convidada ativa (o chamador garante): sem grupo, tela rosa do
 * onboarding ou paywall. `eraConvidada`: o chamador já sabe que ela era convidada (ex.: a
 * reconferência ao voltar ao app viu 'convidada' → 'sem_acesso').
 */
export async function decidirSemAssinatura(
  user: Usuaria, router: Router, origem: 'login' | 'abertura' | 'reconferir', eraConvidada = false,
): Promise<'sem-grupo' | 'onboarding' | 'paywall'> {
  const uid = user?.id;
  if (uid && (eraConvidada || await foiConvidada(uid)) && await convidadaLigada()) {
    router.replace('/(onboarding)/sem-grupo' as any);
    return 'sem-grupo';
  }
  if (uid && !(await onboardingFeito(uid))) {
    const criada = user?.created_at ? Date.parse(user.created_at) : NaN;
    const nova = Number.isFinite(criada) && Date.now() - criada <= CONTA_NOVA_MS;
    trackFora('login_sem_onboarding', { conta: nova ? 'nova' : 'existente', origem });
    router.replace(`/(onboarding)/conta-sem-onboarding?conta=${nova ? 'nova' : 'antiga'}` as any);
    return 'onboarding';
  }
  router.replace('/(onboarding)/paywall-soft');
  return 'paywall';
}

/**
 * Fim das boas-vindas de quem fez o onboarding JÁ LOGADA (em vez do cadastro): o que o
 * `signup` faria com a conta nova, aqui na conta da sessão. A compra já foi confirmada no
 * paywall com esta mesma identidade (o RevenueCat já está nesta conta), então não confere
 * de novo. Nada aqui segura a tela: o que falhar, a "Criando uma rotina só sua" refaz.
 */
export async function concluirComContaLogada(uid: string): Promise<void> {
  const st = useAppStore.getState();
  try {
    // A tela de login mostra a frase dos Termos: grava o aceite (1.64), como o cadastro.
    await st.saveToSupabase(uid, { scan: false, termos: true });
  } catch (e) {
    console.warn('[onboardingObrigatorio] perfil não gravou (a tela de espera grava de novo):', e);
  }
  try {
    await enviarComprovantes(transferirNoCadastro(await lerCompraNestaSessao()));
  } catch (e) {
    console.warn('[onboardingObrigatorio] comprovantes:', e);
  }
  await atualizarCompraPendente({ userId: uid });
  try {
    const r = await entrarNoGrupoGuardado();
    if (r && !('grupoId' in r)) Alert.alert(t(mensagemDoCodigo(r.motivo)));
  } catch (e) {
    console.warn('[onboardingObrigatorio] grupo:', e);
  }
  void limparCompraNestaSessao();
  trackFora('onboarding_refeito_concluido');
  st.armHomeTutorial();
}
