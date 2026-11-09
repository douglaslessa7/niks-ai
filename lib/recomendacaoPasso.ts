// ─────────────────────────────────────────────────────────────────────────────
// Onde um produto da estante deve entrar na rotina — a sugestão da folha "Em qual passo?".
// Só lê o que já existe, sem gastar IA:
//   · escaneado → `decisao_rotina` da analisar-produto;
//   · catálogo  → passo do mesmo tipo da categoria; sem nenhum, o passo e o período salvos
//     na recomendação dela (`recomendacoes_produtos`). Fora dela, nada é destacado.
// Só sugere: ela pode escolher qualquer passo.
// ─────────────────────────────────────────────────────────────────────────────
import { diasDoPasso } from './frequencia';
import { normTexto, ROTULO_TIPO, tipoDoPasso, tipoPorTexto, type TipoPasso } from './tipoPasso';
import type { Periodo, PassoRotina } from './minhaRotina';
import type { DecisaoRotina } from './adicionarDoScan';

export type RecomendacaoPasso =
  | { tipo: 'nenhuma' }
  | { tipo: 'aviso'; texto: string }
  | { tipo: 'passos'; porque: Record<string, string> }  // id do passo → a linha do porquê
  | { tipo: 'novo'; nome: string; periodos: Periodo[]; dias: string[] | null; porque: string; decisao: DecisaoRotina };

export type EntradaRecomendacao = {
  escaneado: boolean;
  categoria: string | null;
  veredito: string | null;
  decisao: DecisaoRotina | null;
  passoRecomendado: { passo: string; periodo: string | null } | null; // catálogo: o da recomendação dela
  passos: PassoRotina[];
};

const TEXTO_JA_COBRE = 'Sua rotina já cobre isso. Se quiser, escolha um passo.';
const TEXTO_EVITARIA = 'Não é o mais indicado pra sua pele. Se quiser, escolha um passo.';

const norm = (s?: string | null) => normTexto(s ?? '').replace(/\s+/g, ' ').trim();
const nomeDoPasso = (p: PassoRotina) => p.nome?.trim() || p.produto?.nome?.trim() || 'Passo';
const periodosDe = (v: string | null | undefined): Periodo[] => (v === 'am+pm' ? ['am', 'pm'] : v === 'pm' ? ['pm'] : ['am']);
const frequencia = (dias: string[] | null) => (dias ? `${dias.length}x por semana` : 'todo dia');

const DEPOIS_DE: Record<TipoPasso, string> = {
  limpeza: 'da limpeza', tonico: 'do tônico', serum: 'do sérum', olhos: 'do cuidado com os olhos',
  hidratante: 'do hidratante', protetor: 'do protetor',
};

function textoEntrada(depois: PassoRotina | undefined, dias: string[] | null): string {
  if (!depois) return `Entra na sua rotina, ${frequencia(dias)}`;
  const tipo = tipoDoPasso(depois.nome ?? '', depois.ingrediente ?? '');
  const onde = tipo ? DEPOIS_DE[tipo] : `de ${nomeDoPasso(depois)}`;
  return `Entra depois ${onde}, ${frequencia(dias)}`;
}

const substitui = (p: PassoRotina) => `Substitui seu ${p.produto?.nome?.trim() || nomeDoPasso(p)}`;

function doScan(d: DecisaoRotina, e: EntradaRecomendacao): RecomendacaoPasso {
  if (d.tipo === 'manter_rotina') return { tipo: 'aviso', texto: TEXTO_JA_COBRE };
  if (d.tipo !== 'adicionar' && d.tipo !== 'substituir') return { tipo: 'nenhuma' };
  const periodos = periodosDe(d.periodo);
  const dias = diasDoPasso(Array.isArray(d.dias) ? d.dias : null);

  if (d.tipo === 'substituir') {
    const porque: Record<string, string> = {};
    for (const per of periodos) {
      const lista = e.passos.filter((p) => p.periodo === per);
      const alvo = lista.find((p) => p.id === d.substitui_passo_id)
        ?? lista.find((p) => !!d.produto_substituivel && (norm(p.nome) === norm(d.produto_substituivel) || norm(nomeDoPasso(p)) === norm(d.produto_substituivel)));
      if (alvo) porque[alvo.id] = substitui(alvo);
    }
    if (Object.keys(porque).length) return { tipo: 'passos', porque };
  }

  const nome = d.passo?.trim() || (tipoPorTexto(e.categoria ?? '') ? ROTULO_TIPO[tipoPorTexto(e.categoria ?? '')!] : 'Novo passo');
  return {
    tipo: 'novo', nome, periodos, dias: dias,
    porque: textoEntrada(e.passos.find((p) => p.id === d.depois_do_passo_id), dias),
    decisao: d,
  };
}

function doCatalogo(e: EntradaRecomendacao): RecomendacaoPasso {
  // "Máscara com ácidos" não é sérum, embora a palavra "ácido" levasse a isso.
  const tipo = /m[aá]scara|esfolia|peeling/i.test(e.categoria ?? '') ? null : tipoPorTexto(e.categoria ?? '');
  const porque: Record<string, string> = {};
  if (tipo) {
    for (const per of ['am', 'pm'] as Periodo[]) {
      const doTipo = e.passos.filter((p) => p.periodo === per && tipoDoPasso(p.nome ?? '', p.ingrediente ?? '') === tipo);
      const alvo = doTipo.find((p) => !p.produto) ?? doTipo[0];
      if (alvo) porque[alvo.id] = alvo.produto ? substitui(alvo) : `Entra no seu passo de ${ROTULO_TIPO[tipo].toLowerCase()}`;
    }
  }
  if (Object.keys(porque).length) return { tipo: 'passos', porque };
  const rec = e.passoRecomendado;
  if (!rec) return { tipo: 'nenhuma' };
  const periodo = rec.periodo === 'am' || rec.periodo === 'pm' || rec.periodo === 'am+pm' ? rec.periodo : null;
  return {
    tipo: 'novo', nome: rec.passo, periodos: periodosDe(periodo), dias: null,
    porque: 'Recomendado pra sua rotina, todo dia',
    decisao: { tipo: 'adicionar', passo: rec.passo, periodo, dias: null },
  };
}

export function recomendarPasso(e: EntradaRecomendacao): RecomendacaoPasso {
  // Vale antes de tudo: nesse caso a análise grava "manter_rotina", e "já cobre" seria falso.
  if (e.veredito === 'evitaria') return { tipo: 'aviso', texto: TEXTO_EVITARIA };
  if (e.escaneado) return e.decisao ? doScan(e.decisao, e) : { tipo: 'nenhuma' };
  return doCatalogo(e);
}

/** Abre no período da recomendação; nos dois ou sem nenhuma, no período atual do dia. */
export function periodoInicial(r: RecomendacaoPasso, passos: PassoRotina[], agora: Date = new Date()): Periodo {
  const h = agora.getHours();
  const atual: Periodo = h >= 4 && h < 12 ? 'am' : 'pm';
  let periodos: Periodo[] = [];
  if (r.tipo === 'novo') periodos = r.periodos;
  if (r.tipo === 'passos') {
    periodos = [...new Set(passos.filter((p) => r.porque[p.id]).map((p) => p.periodo))];
  }
  return periodos.length === 1 ? periodos[0] : atual;
}
