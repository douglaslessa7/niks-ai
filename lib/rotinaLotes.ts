// ─────────────────────────────────────────────────────────────────────────────
// "Montar minha rotina com meus produtos" — o lote no servidor (plano da Rotina,
// Fase 6). Tabela `rotina_lotes` (migração 20261009180000) + função
// `montar-rotina-com-produtos` em modo lote (`{ caminhos, tem_rotulo }`): ela cria o
// lote, responde na hora e roda a IA em segundo plano; no fim grava o resultado,
// põe os produtos identificados na estante e manda o push.
//
// O app: envia as fotos (lib/loteProdutos.enviarLote) → `iniciarLote` → tela
// "Montando sua rotina…" (acompanha com `buscarLote`) → "Sua rotina está pronta"
// (`marcarVisto`). A Minha rotina é trocada AUTOMATICAMENTE no servidor quando o lote
// termina (função do banco `aplicar_lote_rotina`; rotina vazia não apaga a atual).
// Teto: 1 lote por dia (fuso de Brasília); lote com erro não conta.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';

export type StatusLote = 'processando' | 'pronto' | 'erro';

export type ProdutoResultado = {
  indice: number;
  identificado: boolean;
  nome: string | null;
  marca: string | null;
  categoria: string | null;
  leu_rotulo: boolean;
  precisao: 'alta' | 'baixa' | null;
  veredito: 'pode_usar' | 'com_ressalva' | 'evitaria' | null;
  compatibilidade: number | null;
  nivel_aviso: 'nenhum' | 'leve' | 'forte';
  motivo: string | null;
  avisos: string[];
  uso: { diario: boolean; dias: string[] | null } | null;
  colecao_item_id?: string | null;
};
export type PassoResultado = { produto_indice: number; passo: string; instrucao: string; dias: string[] | null };
export type ResultadoLote = {
  produtos: ProdutoResultado[];
  rotina: { am: PassoResultado[]; pm: PassoResultado[] };
  fora_da_rotina: { produto_indice: number; motivo: string }[];
  faltam: { passo_ideal: string; periodo: 'am' | 'pm'; por_que: string }[];
  cobre_tudo: boolean;
};

export type Lote = {
  id: string;
  status: StatusLote;
  caminhos: string[];
  tem_rotulo: boolean[];
  resultado: ResultadoLote | null;
  erro: string | null;
  criado_em: string;
  concluido_em: string | null;
  visto_em: string | null;
  aplicado_em: string | null;
};

const CAMPOS = 'id, status, caminhos, tem_rotulo, resultado, erro, criado_em, concluido_em, visto_em, aplicado_em';

/** 00:00 de hoje no fuso de Brasília (UTC−3, sem horário de verão), em ISO. */
export function inicioDoDiaBrasilia(agora: Date = new Date()): string {
  const br = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3)).toISOString();
}

/** O lote de hoje que conta para o teto (processando ou pronto), se houver. */
export async function loteDeHoje(userId: string): Promise<Lote | null> {
  const { data } = await supabase
    .from('rotina_lotes').select(CAMPOS)
    .eq('user_id', userId).neq('status', 'erro').gte('criado_em', inicioDoDiaBrasilia())
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  return (data as Lote | null) ?? null;
}

export async function buscarLote(id: string): Promise<Lote | null> {
  const { data } = await supabase.from('rotina_lotes').select(CAMPOS).eq('id', id).maybeSingle();
  return (data as Lote | null) ?? null;
}

/**
 * O lote que pede atenção agora (para o aviso dentro do app): o mais recente que
 * ainda está processando, ou que terminou (pronto/erro) e ela ainda não viu.
 */
export async function lotePendente(userId: string): Promise<Lote | null> {
  const { data } = await supabase
    .from('rotina_lotes').select(CAMPOS)
    .eq('user_id', userId).is('visto_em', null)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  return (data as Lote | null) ?? null;
}

export class TetoDoDiaError extends Error {}

/** Começa a montagem no servidor. Devolve o código do lote. */
export async function iniciarLote(caminhos: string[], temRotulo: boolean[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('montar-rotina-com-produtos', {
    body: { caminhos, tem_rotulo: temRotulo },
  });
  if (error) {
    const status = (error as any)?.context?.status;
    if (status === 429) throw new TetoDoDiaError('teto');
    throw error;
  }
  if (!data?.lote_id) throw new Error('sem lote_id');
  return data.lote_id as string;
}

/** Lote que deu erro: tenta de novo com as MESMAS fotos (já estão no bucket). */
export async function tentarDeNovo(lote: Lote): Promise<string> {
  await marcarVisto(lote.id);
  return iniciarLote(lote.caminhos, lote.tem_rotulo);
}

export async function marcarVisto(id: string): Promise<void> {
  await supabase.from('rotina_lotes').update({ visto_em: new Date().toISOString() }).eq('id', id).is('visto_em', null);
}
