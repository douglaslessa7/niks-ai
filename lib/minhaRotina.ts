// ─────────────────────────────────────────────────────────────────────────────
// "Minha rotina" (plano da Rotina, Fase 1 — out/2026): a rotina que ela FAZ no dia a
// dia, na tabela `minha_rotina_passos` (um registro por passo; RLS = só as próprias
// linhas). Nasce como CÓPIA da rotina ideal (`protocolos`, que nunca é alterada) pela
// função do banco `criar_minha_rotina()` — idempotente, roda uma vez por usuária.
// Migration: supabase/migrations/20261009120000_create_minha_rotina.sql.
//
// Produto de cada passo: um produto do catálogo (`produto_catalogo_id`, ex.: um
// recomendado que ela salvou) ou, a partir da Fase 2, um item da estante dela
// (`colecao_item_id`). Substitui o antigo `lib/savedProducts` (AsyncStorage, só no
// celular, por NOME do passo) — os produtos salvos lá migram para cá uma vez e a
// chave antiga é apagada.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { normStepKey } from './savedProducts';
import { listColecao, findInColecao, addToColecao } from './colecao';
import { getUserId } from './currentUser';
import { listarEscaneados } from './escaneados';
import { avaliarProduto, type Aviso, type NivelAviso } from './avisoProduto';

export type Periodo = 'am' | 'pm';

// De onde vem o produto do passo (no máximo um — CHECK no banco):
// estante (`colecao_item_id`), escaneado sem ir à estante (`product_scan_id`) ou um
// recomendado do catálogo que ela ainda não tem (`produto_catalogo_id`).
export type OrigemProduto = 'estante' | 'escaneado' | 'catalogo';
export type RefProduto = { origem: OrigemProduto; id: string };

export type ProdutoDoPasso = {
  origem: OrigemProduto;
  id: string;
  marca: string | null;
  nome: string | null;
  imagemUrl: string | null;   // foto original (catálogo: pública; estante/scan: URL assinada)
  recorteUrl: string | null;  // recorte sem fundo, quando pronto
};

export type PassoRotina = {
  id: string;
  periodo: Periodo;
  ordem: number;
  nome: string | null;        // opcional (Fase 3): o passo tem nome OU produto
  ingrediente: string | null;
  instrucao: string | null;
  comoUsar: string[] | null;
  tempoEspera: string | null;
  cor: string | null;
  dias: string[] | null;
  origem: string;
  produto: ProdutoDoPasso | null;
  aviso: Aviso;               // aviso do produto pra pele dela (Fase 2)
  passoIdealNome: string | null; // nome do passo da ideal de onde veio (recomendações)
};

export type MinhaRotina = { am: PassoRotina[]; pm: PassoRotina[] };

// Chave antiga do `lib/savedProducts` (produtos salvos no celular, por nome do passo).
const LEGADO_KEY = 'saved_routine_products_v1';

const SELECT = 'id, periodo, ordem, nome, ingrediente, instrucao, como_usar, tempo_espera, cor, dias, origem, '
  + 'passo_ideal, colecao_item_id, product_scan_id, aviso_nivel, aviso_texto, '
  + 'produto:produtos(id, marca, nome, imagem_url, imagem_recorte_url, imagem_recorte_status)';

function mapPasso(r: any): PassoRotina {
  const p = r.produto;
  return {
    aviso: { nivel: (r.aviso_nivel ?? 'nenhum') as NivelAviso, texto: r.aviso_texto ?? null },
    passoIdealNome: typeof r.passo_ideal?.nome === 'string' ? r.passo_ideal.nome : null,
    id: r.id,
    periodo: r.periodo,
    ordem: r.ordem,
    nome: typeof r.nome === 'string' && r.nome.trim() ? r.nome : null,
    ingrediente: r.ingrediente ?? null,
    instrucao: r.instrucao ?? null,
    comoUsar: Array.isArray(r.como_usar) ? r.como_usar.map(String) : null,
    tempoEspera: r.tempo_espera ?? null,
    cor: r.cor ?? null,
    dias: Array.isArray(r.dias) ? r.dias : null,
    origem: r.origem,
    produto: p ? {
      origem: 'catalogo',
      id: p.id,
      marca: p.marca ?? null,
      nome: p.nome ?? null,
      imagemUrl: p.imagem_url ?? null,
      recorteUrl: p.imagem_recorte_status === 'ok' ? (p.imagem_recorte_url ?? null) : null,
    } : null,
  };
}

/** Há produtos salvos pelo antigo savedProducts NESTE celular, ainda não migrados? */
export async function temProdutosNoCelular(): Promise<boolean> {
  try { return !!(await AsyncStorage.getItem(LEGADO_KEY)); } catch { return false; }
}

/** Passos da Minha rotina, por período e na ordem, com o produto de cada um resolvido. */
export async function listarMinhaRotina(userId: string): Promise<MinhaRotina> {
  const { data, error } = await supabase
    .from('minha_rotina_passos')
    .select(SELECT)
    .eq('user_id', userId)
    .order('periodo', { ascending: true })
    .order('ordem', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const passos = rows.map(mapPasso);

  // Produto da ESTANTE ou ESCANEADO: as fotos são privadas (URL assinada) — resolve em
  // lote, só se algum passo usa essa origem.
  const colIds = rows.map((r: any) => r.colecao_item_id).filter(Boolean) as string[];
  const scanIds = rows.map((r: any) => r.product_scan_id).filter(Boolean) as string[];
  const [colecao, scans] = await Promise.all([
    colIds.length ? listColecao(userId).catch(() => []) : Promise.resolve([]),
    scanIds.length ? listarEscaneados(userId, scanIds).catch(() => []) : Promise.resolve([]),
  ]);
  const colPorId = new Map(colecao.map((c) => [c.id, c]));
  const scanPorId = new Map(scans.map((x) => [x.id, x]));
  rows.forEach((r: any, i: number) => {
    const c = r.colecao_item_id ? colPorId.get(r.colecao_item_id) : undefined;
    if (c) {
      passos[i].produto = {
        origem: 'estante', id: c.id, marca: c.marca, nome: c.nome,
        imagemUrl: c.photoUrl, recorteUrl: c.cutoutStatus === 'ok' ? c.cutoutUrl : null,
      };
    }
    const sc = r.product_scan_id ? scanPorId.get(r.product_scan_id) : undefined;
    if (sc) {
      passos[i].produto = {
        origem: 'escaneado', id: sc.id, marca: sc.brand, nome: sc.name,
        imagemUrl: sc.photoUrl, recorteUrl: sc.cutoutUrl ?? null,
      };
    }
  });
  return { am: passos.filter((p) => p.periodo === 'am'), pm: passos.filter((p) => p.periodo === 'pm') };
}

/**
 * Aviso de QUALQUER produto (estante, escaneado ou catálogo) pra pele dela — a mesma
 * regra da folha "Escolher produto". Usado pelas listas completas do "Ver todos".
 */
export async function avisoDoProduto(userId: string, ref: RefProduto): Promise<Aviso> {
  if (ref.origem === 'catalogo') return avisoProdutoCatalogo(userId, ref.id);
  let scanId = ref.origem === 'escaneado' ? ref.id : null;
  if (ref.origem === 'estante') {
    const { data: c } = await supabase.from('colecao_produtos').select('origem, produto_id, product_scan_id').eq('id', ref.id).maybeSingle();
    if (c?.produto_id) return avisoProdutoCatalogo(userId, c.produto_id);
    scanId = c?.product_scan_id ?? null;
  }
  if (!scanId) return { nivel: 'nenhum', texto: null };
  const [{ data: u }, { data: sc }] = await Promise.all([
    supabase.from('users').select('pregnancy_status, tipo_pele').eq('id', userId).maybeSingle(),
    supabase.from('product_scans').select('produto_nome, resultado').eq('id', scanId).maybeSingle(),
  ]);
  const r: any = sc?.resultado ?? {};
  return avaliarProduto({
    nome: sc?.produto_nome ?? r?.produto?.nome ?? null, categoria: r?.produto?.categoria ?? null,
    ativos: Array.isArray(r?.produto?.ativos_detectados) ? r.produto.ativos_detectados : null,
    veredito: r?.veredito ?? null, compat: typeof r?.compatibilidade === 'number' ? r.compatibilidade : null,
    avisosAnalise: Array.isArray(r?.avisos) ? r.avisos : null,
  }, { pregnancyStatus: u?.pregnancy_status ?? null, tipoPele: u?.tipo_pele ?? null });
}

/** Aviso de um produto do CATÁLOGO pra pele dela (mesma regra da folha "Escolher produto"). */
export async function avisoProdutoCatalogo(userId: string, produtoId: string): Promise<Aviso> {
  const [{ data: u }, { data: p }] = await Promise.all([
    supabase.from('users').select('pregnancy_status, tipo_pele').eq('id', userId).maybeSingle(),
    supabase.from('produtos').select('nome, categoria, ativos_principais, seguro_gestante, tipos_pele').eq('id', produtoId).maybeSingle(),
  ]);
  return avaliarProduto({
    nome: p?.nome ?? null, categoria: p?.categoria ?? null,
    ativos: Array.isArray(p?.ativos_principais) ? p.ativos_principais : null,
    seguroGestante: typeof p?.seguro_gestante === 'boolean' ? p.seguro_gestante : null,
    tiposPele: Array.isArray(p?.tipos_pele) ? p.tipos_pele : null,
  }, { pregnancyStatus: u?.pregnancy_status ?? null, tipoPele: u?.tipo_pele ?? null });
}

/**
 * TODO produto da rotina está na ESTANTE (decisão de out/2026): devolve o item da
 * estante do produto — o que já existe (mesmo produto: mesmo id ou mesma marca + nome,
 * ver findInColecao) ou um novo. Recomendado (catálogo) e escaneado entram assim.
 */
export async function paraEstante(userId: string, ref: RefProduto): Promise<string> {
  if (ref.origem === 'estante') return ref.id;
  if (ref.origem === 'catalogo') {
    const { data: p, error } = await supabase.from('produtos').select('id, nome, marca, categoria, imagem_url').eq('id', ref.id).maybeSingle();
    if (error || !p) throw error ?? new Error('produto não encontrado');
    const ja = await findInColecao(userId, { produtoId: p.id, nome: p.nome, marca: p.marca });
    const id = ja ?? await addToColecao(userId, { origem: 'catalogo', produtoId: p.id, nome: p.nome, marca: p.marca, categoria: p.categoria, imagemUrl: p.imagem_url });
    if (!id) throw new Error('não entrou na estante');
    return id;
  }
  const { data: sc, error } = await supabase.from('product_scans').select('id, produto_nome, produto_marca, resultado').eq('id', ref.id).maybeSingle();
  if (error || !sc) throw error ?? new Error('scan não encontrado');
  const nome = sc.produto_nome ?? sc.resultado?.produto?.nome ?? null;
  const marca = sc.produto_marca ?? sc.resultado?.produto?.marca ?? null;
  const ja = await findInColecao(userId, { productScanId: sc.id, nome, marca });
  const id = ja ?? await addToColecao(userId, {
    origem: 'scan', productScanId: sc.id, nome, marca,
    categoria: sc.resultado?.produto?.categoria ?? null,
    compat: typeof sc.resultado?.compatibilidade === 'number' ? sc.resultado.compatibilidade : null,
  });
  if (!id) throw new Error('não entrou na estante');
  return id;
}

/**
 * Põe (ou tira, com `ref = null`) o produto de UM passo, gravando o aviso calculado pra
 * pele dela (lib/avisoProduto). O produto vai SEMPRE pela estante: de qualquer origem,
 * entra nela se ainda não estiver, e o passo aponta para o item da estante. Tirar o
 * produto do passo não tira da estante.
 */
export async function definirProdutoDoPasso(passoId: string, ref: RefProduto | null, aviso: Aviso): Promise<void> {
  let colecaoId: string | null = null;
  if (ref) {
    const uid = await getUserId();
    if (!uid) throw new Error('sem sessão');
    colecaoId = await paraEstante(uid, ref);
  }
  const { error } = await supabase
    .from('minha_rotina_passos')
    .update({
      colecao_item_id: colecaoId,
      product_scan_id: null,
      produto_catalogo_id: null,
      aviso_nivel: ref ? aviso.nivel : 'nenhum',
      aviso_texto: ref ? aviso.texto : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', passoId);
  if (error) throw error;
}

/**
 * Garante que a Minha rotina existe (cópia da ideal) e migra os produtos que ela tinha
 * salvo NESTE celular. 'sem-ideal' = ainda não há rotina ideal salva (ex.: logo depois
 * do cadastro) — a tela segue mostrando a ideal e tenta de novo no próximo foco.
 */
export async function garantirMinhaRotina(userId: string): Promise<'ok' | 'sem-ideal' | 'falhou'> {
  const { data, error } = await supabase.rpc('criar_minha_rotina');
  if (error) {
    console.warn('[minha rotina] criar falhou:', error.message);
    return 'falhou';
  }
  if (data === -1) return 'sem-ideal';
  await migrarProdutosDoCelular(userId);
  return 'ok';
}

// Produtos que ela salvou pelo antigo "Salvar na minha rotina" (AsyncStorage, por
// nome do passo, foto do catálogo) → produto do passo de MESMO NOME na Minha rotina
// (manhã e noite, como antes). Só preenche passo sem produto. A chave antiga só é
// apagada depois de gravar tudo — se falhar, tenta de novo na próxima vez.
async function migrarProdutosDoCelular(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LEGADO_KEY);
    if (!raw) return;
    const salvos = JSON.parse(raw) as Record<string, { imageUrl?: string }>;
    const urls = [...new Set(Object.values(salvos ?? {}).map((s) => s?.imageUrl).filter((u): u is string => !!u))];
    if (!urls.length) { await AsyncStorage.removeItem(LEGADO_KEY); return; }

    const [{ data: prods, error: e1 }, { data: passos, error: e2 }] = await Promise.all([
      supabase.from('produtos').select('id, imagem_url').in('imagem_url', urls),
      supabase.from('minha_rotina_passos').select('id, nome, produto_catalogo_id, colecao_item_id, product_scan_id').eq('user_id', userId),
    ]);
    if (e1 || e2) return;
    const idPorUrl = new Map((prods ?? []).map((p: any) => [p.imagem_url as string, p.id as string]));

    for (const passo of passos ?? []) {
      if (passo.produto_catalogo_id || passo.colecao_item_id || passo.product_scan_id) continue;
      const salvo = passo.nome ? salvos[normStepKey(passo.nome)] : undefined;
      const prodId = salvo?.imageUrl ? idPorUrl.get(salvo.imageUrl) : undefined;
      if (!prodId) continue;
      const { error } = await supabase
        .from('minha_rotina_passos')
        .update({ produto_catalogo_id: prodId, product_scan_id: null, updated_at: new Date().toISOString() })
        .eq('id', passo.id);
      if (error) return; // não apaga a chave antiga: tenta de novo depois
    }
    await AsyncStorage.removeItem(LEGADO_KEY);
  } catch (e) {
    console.warn('[minha rotina] migração dos produtos do celular falhou:', e);
  }
}


/** Produto de cada passo, por NOME normalizado do passo (para a tela de Produtos saber o que já está na rotina). */
export async function produtosDaRotinaPorNome(userId: string): Promise<Record<string, { imageUrl: string; brand: string | null; name: string | null }>> {
  const { am, pm } = await listarMinhaRotina(userId);
  const out: Record<string, { imageUrl: string; brand: string | null; name: string | null }> = {};
  for (const p of [...am, ...pm]) {
    if (p.nome && p.produto?.imagemUrl) out[normStepKey(p.nome)] = { imageUrl: p.produto.imagemUrl, brand: p.produto.marca, name: p.produto.nome };
  }
  return out;
}

/** Quantos passos há em cada período da Minha rotina (home e lembretes). null = ainda não criada. */
export async function contarPassosMinhaRotina(userId: string): Promise<{ am: number; pm: number } | null> {
  const { data, error } = await supabase.from('minha_rotina_passos').select('periodo').eq('user_id', userId);
  if (error || !data?.length) return null;
  return {
    am: data.filter((r: any) => r.periodo === 'am').length,
    pm: data.filter((r: any) => r.periodo === 'pm').length,
  };
}

// ── Edição da Minha rotina (Fase 3) ─────────────────────────────────────────

/** Dias da semana, na ordem da semana brasileira (formato da coluna `dias`). */
export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const DIA_POR_GETDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** O dia da semana de uma data (use a sessão-do-dia: até 04:00 ainda é "ontem"). */
export function diaDaSemana(d: Date): string {
  return DIA_POR_GETDAY[d.getDay()];
}

/** O passo vale neste dia? Sem `dias` = todo dia. (No dia em que não vale, sai do checklist.) */
export function passoValeNoDia(p: Pick<PassoRotina, 'dias'>, dia: string): boolean {
  return !p.dias?.length || p.dias.includes(dia);
}

/** Nova ordem de um período: `ids` na ordem em que ficaram. */
export async function reordenarPassos(ids: string[]): Promise<void> {
  const agora = new Date().toISOString();
  const res = await Promise.all(ids.map((id, i) =>
    supabase.from('minha_rotina_passos').update({ ordem: i + 1, updated_at: agora }).eq('id', id)));
  const erro = res.find((r) => r.error)?.error;
  if (erro) throw erro;
}

/** Remove um passo da Minha rotina (a rotina ideal não muda). */
export async function removerPasso(id: string): Promise<void> {
  const { error } = await supabase.from('minha_rotina_passos').delete().eq('id', id);
  if (error) throw error;
}

/** "+ Novo passo": nome livre (opcional), no fim do período. Devolve o passo criado. */
export async function criarPasso(userId: string, periodo: Periodo, nome: string | null, dias: string[] | null): Promise<PassoRotina> {
  const { data: ult } = await supabase
    .from('minha_rotina_passos').select('ordem').eq('user_id', userId).eq('periodo', periodo)
    .order('ordem', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from('minha_rotina_passos')
    .insert({ user_id: userId, periodo, ordem: (ult?.ordem ?? 0) + 1, nome: nome?.trim() || null, dias: dias?.length ? dias : null, origem: 'usuaria' })
    .select(SELECT)
    .single();
  if (error) throw error;
  return mapPasso(data);
}

/** Muda o nome (vazio = sem nome) e/ou os dias de um passo (null/vazio = todo dia). */
export async function atualizarPasso(id: string, campos: { nome?: string | null; dias?: string[] | null }): Promise<void> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (campos.nome !== undefined) upd.nome = campos.nome?.trim() || null;
  if (campos.dias !== undefined) upd.dias = campos.dias?.length ? campos.dias : null;
  const { error } = await supabase.from('minha_rotina_passos').update(upd).eq('id', id);
  if (error) throw error;
}

/** Nome para mostrar um passo onde só cabe um nome: o do passo; sem ele, o do produto. */
export function nomeDoPasso(p: Pick<PassoRotina, 'nome' | 'produto'>): string {
  return p.nome?.trim() || p.produto?.nome?.trim() || 'Passo';
}
