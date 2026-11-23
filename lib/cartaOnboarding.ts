import { escolherPontoForte, escolherProblema, NOME_PROBLEMA, NOME_REGIAO, type AnaliseRapida, type ProblemaId, type RegiaoId } from './analiseRapida';
import { t } from './i18n';

// A carta da chegada no onboarding (`(carta)/carta.tsx?modo=onboarding`), a tela "Seu
// caminho" que vem depois dela (`(scan)/seu-caminho.tsx`) e a tela final
// (`(onboarding)/rotina-pronta-v2.tsx`) leem TUDO daqui — a escolha da carta, o problema e
// os números —, para nenhuma tela mostrar um dado diferente do que a carta mostrou.
//
// Desde 06/nov/2026 (pedido do produto) as cartas vêm da ANÁLISE RÁPIDA (`lib/analiseRapida.ts`,
// antes da compra) e são DUAS, em sequência: a Carta 1, notícia boa (o ponto forte, um
// problema que ela NÃO marcou — `pontoForteDoOnboarding`), e a Carta 2, de alerta, com um dos
// problemas que ela marcou em "O que mais te incomoda na sua pele hoje?" (`cartaDoOnboarding`).
// O "Seu caminho" e a tela final usam só a de alerta.

/** A carta da IDADE sai do onboarding por enquanto (06/nov/2026, pedido do produto). O código
 *  fica: com `true`, volta a regra de antes — idade da pele (da análise rápida) MAIOR que a
 *  dela → carta da idade; senão, a de alerta. */
export const CARTA_IDADE_NO_ONBOARDING = false;

/** A carta de alerta: "Você tem 40% mais [problema] do que a usuária padrão." Número FIXO por
 *  decisão do produto (não vem do scan) → `real: false`, e o caminho não usa número. Quando
 *  houver a comparação real com a média das usuárias, troque para `real: true` com o número
 *  medido: o caminho muda sozinho para "De N% para 0% acima da média".
 *  (Objeto, e não constantes soltas, para os testes trocarem em memória pelo depurador.) */
// ⚠️ PROVISÓRIO — NÃO PODE IR AO AR. O 40% é fixo só para teste (06/nov/2026); antes de publicar,
// trocar pela comparação real com as usuárias ou tirar o número (ver README, "Análise de pele só
// depois da compra").
// 23/nov/2026 (decisão do produto): SEM número na tela. A carta diz "Seu scan mostrou [problema]
// acima do ideal para a sua pele." `numero` 0 só marca a carta como revelada (nada é exibido).
export const CARTA_ALERTA: { numero: number; real: boolean } = { numero: 0, real: false };

/** A Carta 1, notícia boa: "Você tem menos [problema] do que 30% das usuárias."
 *  ⚠️ PROVISÓRIO — NÃO PODE IR AO AR. O 30% é fixo só para teste (06/nov/2026, pedido do
 *  produto); não vem de dado nenhum. Antes de publicar, trocar pelo número real ou tirar. */
// 23/nov/2026: SEM número. A carta diz "[ponto forte] é um dos pontos fortes da sua pele."
export const CARTA_PONTO_FORTE: { numero: number } = { numero: 0 };

/** O problema que ela quase não tem, dito como qualidade ("Tom uniforme", não "manchas"). */
const PONTO_FORTE_NOME: Record<ProblemaId, string> = {
  acne: 'Pele livre de acne', manchas: 'Tom uniforme', cravos: 'Poros limpos', oleosidade: 'Oleosidade equilibrada',
  rugas: 'Pele firme', poros: 'Poros discretos', olheiras: 'Olhar descansado', ressecamento: 'Pele hidratada',
  textura: 'Textura lisa',
};

/** A Carta 1 (o ponto forte). null = pular a Carta 1 (nenhum problema não marcado com
 *  intensidade 0 ou 1, ou a análise não avaliou os outros problemas). Nunca é um problema
 *  que ela marcou, nem o da carta de alerta. */
export type PontoForteOnboarding = { problema: ProblemaId; nome: string; numero: number };
export function pontoForteDoOnboarding(
  rapida: AnaliseRapida | null | undefined,
  o: { concerns: readonly string[] | null | undefined },
): PontoForteOnboarding | null {
  const alerta = escolherProblema(rapida, o.concerns);
  const p = escolherPontoForte(rapida, o.concerns, alerta?.problema ?? null);
  return p ? { problema: p.problema, nome: t(PONTO_FORTE_NOME[p.problema] ?? NOME_PROBLEMA[p.problema]), numero: CARTA_PONTO_FORTE.numero } : null;
}

/** Versão SEM número, pronta e DESLIGADA (06/nov/2026, pedido do produto, "para trocar em
 *  breve"): "Encontramos sinais de [problema] [na região]". Com `true`, a carta troca o 40%
 *  por essa frase (a região é a que a foto mostrou; sem região, só o problema). */
export const CARTA_ALERTA_SEM_NUMERO = false;

export type CartaOnboarding =
  /** "Idade da sua pele": a da análise rápida e a que ela informou (null se não informou). */
  | { tipo: 'idade'; idadePele: number; idadeReal: number | null }
  /** A de alerta. `nome` = o problema na frase; `regiao`/`regiaoTexto` = onde a foto mais
   *  mostrou (null se a foto não mostrou — foi o 1º que ela marcou); `real` = o número veio
   *  de um dado medido; `semNumero` = a versão "Encontramos sinais de…". */
  | {
      tipo: 'comparacao'; problema: ProblemaId; nome: string; regiao: RegiaoId | null; regiaoTexto: string | null;
      numero: number; real: boolean; semNumero: boolean;
    };

/** A carta do onboarding. Sem nenhum problema possível (não deveria acontecer) → null. */
export function cartaDoOnboarding(
  rapida: AnaliseRapida | null | undefined,
  o: { concerns: readonly string[] | null | undefined; birthday: string | number | null | undefined },
): CartaOnboarding | null {
  if (CARTA_IDADE_NO_ONBOARDING && rapida?.foto_valida && rapida.idade_pele != null) {
    const idadePele = rapida.idade_pele;
    const idadeReal = Number(o.birthday) || null;
    if (idadeReal == null || idadePele > idadeReal) return { tipo: 'idade', idadePele, idadeReal };
  }
  const p = escolherProblema(rapida, o.concerns);
  if (!p) return null;
  return {
    tipo: 'comparacao',
    problema: p.problema,
    nome: t(NOME_PROBLEMA[p.problema]),
    regiao: p.regiao,
    regiaoTexto: p.regiao ? t(NOME_REGIAO[p.regiao]) : null,
    numero: CARTA_ALERTA.numero,
    real: CARTA_ALERTA.real,
    semNumero: CARTA_ALERTA_SEM_NUMERO,
  };
}

/** Um ponto da trilha: a linha em negrito e a de baixo. */
export type PassoCaminho = { titulo: string; sub: string };
export type CaminhoOnboarding = {
  /** Título em 2 linhas: a 1ª leve, a 2ª em destaque (como na referência do Tapfit). */
  titulo: [string, string];
  /** Os 3 pontos da trilha, de cima para baixo. */
  pontos: [PassoCaminho, PassoCaminho, PassoCaminho];
  /** Ao lado da flor, no fim da trilha. */
  final: PassoCaminho;
};

// "3 semanas" com espaço que não quebra: o "3" nunca fica sozinho no fim de uma linha.
const META_LINHA = t('sua meta em 3 semanas.');
const SEMANA_1: PassoCaminho = { titulo: t('Semana 1: rotina montada'), sub: t('focada no que sua pele precisa') };
const SEMANA_2: PassoCaminho = { titulo: t('Semana 2: produtos certos'), sub: t('compatibilidade antes de comprar') };

function semNumero(problema: string): CaminhoOnboarding {
  return {
    titulo: [t('Menos sinais de {{problema}}:', { problema }), META_LINHA],
    pontos: [{ titulo: t('Hoje: sinais de {{problema}}', { problema }), sub: t('foi o que sua análise mostrou') }, SEMANA_1, SEMANA_2],
    final: { titulo: t('Semana 3'), sub: t('Sua meta: menos sinais de {{problema}}', { problema }) },
  };
}

/** O caminho de 3 semanas a partir da carta que ela viu — sempre com o MESMO problema e os
 *  MESMOS números da carta. Sem número medido, nenhum número aparece. É uma meta, nunca uma
 *  promessa. */
export function caminhoDaCarta(c: CartaOnboarding): CaminhoOnboarding {
  if (c.tipo === 'idade') {
    const { idadePele: pele, idadeReal: real } = c;
    if (real != null && pele > real) {
      return {
        titulo: [t('De {{pele}} para {{real}} anos de pele:', { pele, real }), META_LINHA],
        pontos: [{ titulo: t('Hoje: pele de {{pele}} anos', { pele }), sub: t('foi o que sua análise mostrou') }, SEMANA_1, SEMANA_2],
        final: { titulo: t('Semana 3'), sub: t('Sua meta: {{real}} anos', { real }) },
      };
    }
    // Pele com a MESMA idade dela (ou idade não informada): não há de onde para onde ir.
    // ⚠️ Problema "envelhecimento" provisório, a confirmar com o produto.
    return semNumero(t('envelhecimento'));
  }
  if (c.real && !c.semNumero) {
    return {
      titulo: [t('De {{numero}}% para 0% acima da média:', { numero: c.numero }), META_LINHA],
      pontos: [{ titulo: t('Hoje: {{numero}}% mais {{nome}}', { numero: c.numero, nome: c.nome }), sub: t('que a média da sua idade') }, SEMANA_1, SEMANA_2],
      final: { titulo: t('Semana 3'), sub: t('Sua meta: 0% acima da média') },
    };
  }
  return semNumero(c.nome);
}
