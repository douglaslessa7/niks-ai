import * as ImageManipulator from 'expo-image-manipulator';

// ─────────────────────────────────────────────────────────────────────────────
// Análise RÁPIDA do scan do onboarding (06/nov/2026) — a Edge Function `analise-rapida`.
// Roda logo depois do scan, ANTES da compra, no lugar da análise completa (`analyze-skin`,
// que agora só roda depois da compra — `lib/onboardingPrefetch.ts`).
//
// Recebe os problemas que ela marcou em "O que mais te incomoda na sua pele hoje?" e devolve,
// estimado SÓ pela foto, a intensidade de cada um (0 = não aparece, 1 leve, 2 moderado,
// 3 intenso) e a região onde ele mais aparece. A carta do onboarding mostra UM desses
// problemas (`escolherProblema`); "Seu caminho" e a tela final usam o mesmo
// (`lib/cartaOnboarding.ts`). Formato e conferência no servidor:
// `supabase/functions/_shared/analise-rapida.ts` — mudou lá, muda aqui.
// ─────────────────────────────────────────────────────────────────────────────

export type ProblemaId = 'acne' | 'manchas' | 'cravos' | 'oleosidade' | 'rugas' | 'poros' | 'olheiras' | 'ressecamento' | 'textura';
export type RegiaoId = 'testa' | 'nariz_zona_t' | 'bochechas' | 'queixo_mandibula' | 'area_periocular';
export type ItemProblema = { problema: ProblemaId; intensidade: 0 | 1 | 2 | 3; regiao: RegiaoId | null };
export type AnaliseRapida = { foto_valida: boolean; idade_pele: number | null; problemas: ItemProblema[] };

/** Opção de "O que mais te incomoda" (valor gravado em `onboarding.concerns`) → problema.
 *  "Outro" fica de fora: não tem como virar carta. */
export const PROBLEMA_DA_QUEIXA: Record<string, ProblemaId> = {
  'Acne/espinhas': 'acne',
  Manchas: 'manchas',
  Cravos: 'cravos',
  Oleosidade: 'oleosidade',
  Rugas: 'rugas',
  'Poros dilatados': 'poros',
  Olheiras: 'olheiras',
  Ressecamento: 'ressecamento',
  'Textura irregular': 'textura',
};
/** A ordem da tela de "O que mais te incomoda" — vale quando ela só marcou "Outro". */
export const TODOS_PROBLEMAS: ProblemaId[] = ['acne', 'manchas', 'cravos', 'oleosidade', 'rugas', 'poros', 'olheiras', 'ressecamento', 'textura'];
/** O problema DENTRO da frase ("Você tem 40% mais acne…", "Seu maior desafio: acne"). Os
 *  mesmos nomes das frases do loading da rotina (`answers.ts` › CONCERN_LOADING), menos a
 *  textura: "irregularidade na textura". */
export const NOME_PROBLEMA: Record<ProblemaId, string> = {
  acne: 'acne', manchas: 'manchas', cravos: 'cravos', oleosidade: 'oleosidade', rugas: 'rugas',
  poros: 'poros dilatados', olheiras: 'olheiras', ressecamento: 'ressecamento',
  // "textura irregular" na frase ficava "40% mais textura irregular" — trocado a pedido do
  // produto (06/nov/2026).
  textura: 'irregularidade na textura',
};
/** A região na frase (só na versão "Encontramos sinais de…", hoje desligada). */
export const NOME_REGIAO: Record<RegiaoId, string> = {
  testa: 'na testa', nariz_zona_t: 'na zona T', bochechas: 'nas bochechas',
  queixo_mandibula: 'no queixo', area_periocular: 'ao redor dos olhos',
};

/** Os problemas que ela marcou, sem "Outro", sem repetir, na ordem em que marcou. */
export function problemasMarcados(concerns: readonly string[] | null | undefined): ProblemaId[] {
  const out: ProblemaId[] = [];
  for (const c of concerns ?? []) {
    const p = PROBLEMA_DA_QUEIXA[c];
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * O problema da carta (regra do produto, 06/nov/2026):
 *   • um problema marcado → esse;
 *   • 2 ou 3 → o de MAIOR intensidade na foto (empate → o que ela marcou primeiro);
 *   • nenhum aparece na foto (todos 0) → o primeiro que ela marcou.
 * Só "Outro" marcado → a foto decide entre todos (mesma regra; todos 0 → o 1º da lista).
 * Sem análise (falhou ou ainda não chegou) → o primeiro marcado, sem intensidade.
 */
export function escolherProblema(r: AnaliseRapida | null | undefined, concerns: readonly string[] | null | undefined): ItemProblema | null {
  const marcados = problemasMarcados(concerns);
  const candidatos = marcados.length ? marcados : TODOS_PROBLEMAS;
  const itens: ItemProblema[] = candidatos.map((p) =>
    (r?.foto_valida ? r.problemas.find((x) => x.problema === p) : undefined) ?? { problema: p, intensidade: 0, regiao: null });
  if (!itens.length) return null;
  if (marcados.length === 1) return itens[0];
  let melhor = itens[0];
  for (const it of itens) if (it.intensidade > melhor.intensidade) melhor = it;
  return melhor.intensidade > 0 ? melhor : itens[0];
}

/**
 * O PONTO FORTE da Carta 1 (06/nov/2026, regra do produto):
 *   • NUNCA um problema que ela marcou como incômodo, nem o da carta de alerta (`excluir`);
 *   • entre os que ela NÃO marcou, o 1º com intensidade 0 na foto (ordem da lista);
 *   • nenhum com 0 → o 1º com intensidade 1;
 *   • nenhum → null (a Carta 1 é pulada).
 * Só usa problema que a análise AVALIOU: a `analise-rapida` antiga (antes de 06/nov/2026)
 * devolvia só os marcados → sem dado dos outros → null, e o onboarding segue só com a de alerta.
 */
export function escolherPontoForte(
  r: AnaliseRapida | null | undefined,
  concerns: readonly string[] | null | undefined,
  excluir: ProblemaId | null | undefined,
): ItemProblema | null {
  if (!r?.foto_valida) return null;
  const marcados = problemasMarcados(concerns);
  const livres = TODOS_PROBLEMAS
    .filter((p) => !marcados.includes(p) && p !== excluir)
    .map((p) => r.problemas.find((x) => x.problema === p))
    .filter((x): x is ItemProblema => !!x);
  return livres.find((x) => x.intensidade === 0) ?? livres.find((x) => x.intensidade === 1) ?? null;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
// Só para esta chamada: a foto vai reduzida (a original fica para a análise completa).
const LARGURA_ENVIO = 768;

let ultimoErro = 'unknown';
export const ultimoErroAnaliseRapida = () => ultimoErro;

/** Chama a `analise-rapida` (1 + 1 tentativa, 2 s entre elas). null = falhou (a tela de
 *  carregamento mostra o erro e "Tentar novamente", como antes). */
export async function chamarAnaliseRapida(foto: { uri: string; base64: string }, concerns: readonly string[]): Promise<AnaliseRapida | null> {
  let base64 = foto.base64;
  try {
    const menor = await ImageManipulator.manipulateAsync(foto.uri, [{ resize: { width: LARGURA_ENVIO } }], {
      compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true,
    });
    if (menor.base64) base64 = menor.base64;
  } catch (e) {
    console.warn('[analiseRapida] não reduziu a foto, vai a original:', e);
  }
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/analise-rapida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        // `problemas`: a função nova (06/nov/2026) ignora e avalia os 9; a anterior usa.
        body: JSON.stringify({ imageBase64: base64, problemas: problemasMarcados(concerns) }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`);
      if (typeof data?.foto_valida !== 'boolean' || !Array.isArray(data?.problemas)) throw new Error('resposta fora do formato');
      return data as AnaliseRapida;
    } catch (e) {
      ultimoErro = (e as Error)?.message ?? String(e);
      console.warn(`[analiseRapida] tentativa ${tentativa} falhou:`, ultimoErro);
      if (tentativa < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}
