// ─────────────────────────────────────────────────────────────────────────────
// MINHA COLEÇÃO — os produtos que a usuária tem em casa.
//
// Fonte de verdade: tabela `colecao_produtos` no Supabase (RLS por usuária), NÃO
// AsyncStorage. É o que faz a Coleção sobreviver a reinstalar o app e trocar de
// celular — o limite que o `lib/savedProducts.ts` (por aparelho) já tinha mostrado.
//
// Este módulo é a ÚNICA porta de escrita da Coleção no app. Quem analisa produto
// continua sendo a Edge Function `analisar-produto` (via `lib/analisarProduto`);
// aqui só se grava a declaração "tenho isso em casa" + a cópia denormalizada do
// veredito que a tela e a rotina consomem.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { invalidateCache } from './cache';
import type { AnaliseProduto } from './analisarProduto';

const BUCKET = 'product-scans';

export type ColecaoStatus = 'identificado' | 'nao_identificado';

export type ColecaoItem = {
  id: string;
  productScanId: string | null;
  imagePath: string | null;
  /** URL assinada da foto (1h). Gerada na leitura — NUNCA cachear (expira). */
  photoUrl: string | null;
  nome: string | null;
  marca: string | null;
  categoria: string | null;
  ativos: string[];
  compatibilidade: number | null;
  veredito: string | null;
  status: ColecaoStatus;
  resultado: AnaliseProduto | null;
  createdAt: string;
};

/**
 * Veredito que tira o produto da rotina. É a expressão do "não serve pra sua
 * pele" da própria IA (`evitaria` = faixa 0–35 de compatibilidade). `com_ressalva`
 * continua entrando na rotina, só que ranqueado abaixo de um `pode_usar` — a
 * ideia da feature é usar o que ela já tem, não exigir perfeição.
 * Mudar a régua é mudar esta constante (e o gêmeo dela na `recomendar-produtos`).
 */
export const VEREDITO_INCOMPATIVEL = 'evitaria';

/** Um item só pode ocupar um passo da rotina se foi identificado E não é incompatível. */
export function entraNaRotina(item: ColecaoItem): boolean {
  return item.status === 'identificado' && item.veredito !== VEREDITO_INCOMPATIVEL;
}

/** Por que este produto não entra na rotina — texto vindo da própria análise. */
export function motivoIncompativel(item: ColecaoItem): string {
  const r = item.resultado ?? {};
  return (
    (typeof r.resumo === 'string' && r.resumo) ||
    (typeof r.explicacao === 'string' && r.explicacao) ||
    'A NIKS avaliou que este produto não é o ideal para a sua pele agora.'
  );
}

export const colecaoCacheKey = (userId: string) => `colecao:${userId}`;

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Itens da Coleção, mais recentes primeiro, com as fotos já assinadas.
 * ⚠️ As URLs assinadas expiram em 1h → este resultado NÃO pode ser cacheado em
 * disco (mesma regra da aba "Escaneados"). O cache por chave serve só para a
 * contagem/estado, nunca para as URLs.
 */
export async function listarColecao(userId: string): Promise<ColecaoItem[]> {
  const { data: rows, error } = await supabase
    .from('colecao_produtos')
    .select('id, product_scan_id, image_path, produto_nome, produto_marca, categoria, ativos_detectados, compatibilidade, veredito, status, resultado, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const paths = rows.map((r: any) => r.image_path).filter(Boolean) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    (data ?? []).forEach((s: any) => {
      if (s?.path && s?.signedUrl && !s.error) signed.set(s.path, s.signedUrl);
    });
  }

  return rows.map((r: any) => ({
    id: r.id,
    productScanId: r.product_scan_id ?? null,
    imagePath: r.image_path ?? null,
    photoUrl: r.image_path ? (signed.get(r.image_path) ?? null) : null,
    nome: r.produto_nome ?? null,
    marca: r.produto_marca ?? null,
    categoria: r.categoria ?? null,
    ativos: Array.isArray(r.ativos_detectados) ? r.ativos_detectados : [],
    compatibilidade: typeof r.compatibilidade === 'number' ? r.compatibilidade : null,
    veredito: r.veredito ?? null,
    status: (r.status === 'nao_identificado' ? 'nao_identificado' : 'identificado') as ColecaoStatus,
    resultado: (r.resultado ?? null) as AnaliseProduto | null,
    createdAt: r.created_at,
  }));
}

/** Quantos itens a usuária tem em casa (usado para decidir textos e estados vazios). */
export async function contarColecao(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('colecao_produtos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return 0;
  return count ?? 0;
}

// ── Escrita ──────────────────────────────────────────────────────────────────

/** Campos denormalizados a partir de uma análise da `analisar-produto`. */
function camposDaAnalise(analise: AnaliseProduto) {
  return {
    produto_nome: analise?.produto?.nome ?? null,
    produto_marca: analise?.produto?.marca ?? null,
    categoria: analise?.produto?.categoria ?? null,
    ativos_detectados: Array.isArray(analise?.produto?.ativos_detectados)
      ? analise.produto!.ativos_detectados!
      : [],
    compatibilidade: typeof analise?.compatibilidade === 'number' ? analise.compatibilidade : null,
    veredito: analise?.veredito ?? null,
    resultado: analise ?? null,
  };
}

/**
 * Adiciona à Coleção um produto JÁ analisado e salvo em `product_scans` — é o
 * caminho do pop-up "você tem esse produto em casa?" e do lote quando a análise
 * volta `ok`.
 *
 * Idempotente: o índice único (user_id, product_scan_id) faz o segundo toque em
 * "Sim" (ou a mesma linha aberta pelo histórico) não duplicar o item.
 */
export async function adicionarDoScan(
  userId: string,
  productScanId: string,
  analise?: AnaliseProduto,
): Promise<void> {
  // A foto e a análise já estão na linha do scan; ler de lá evita depender do que
  // a tela tem em mãos (o histórico, por exemplo, não tem o base64).
  const { data: scan } = await supabase
    .from('product_scans')
    .select('image_path, produto_nome, produto_marca, resultado, skin_scan_id')
    .eq('id', productScanId)
    .maybeSingle();

  const fonte = (analise ?? scan?.resultado ?? {}) as AnaliseProduto;
  const campos = camposDaAnalise(fonte);

  const { error } = await supabase.from('colecao_produtos').insert({
    user_id: userId,
    product_scan_id: productScanId,
    image_path: scan?.image_path ?? null,
    skin_scan_id: scan?.skin_scan_id ?? null,
    status: 'identificado',
    ...campos,
    produto_nome: campos.produto_nome ?? scan?.produto_nome ?? null,
    produto_marca: campos.produto_marca ?? scan?.produto_marca ?? null,
  });
  // 23505 = já está na Coleção (índice único). Não é erro para quem chamou.
  if (error && (error as any).code !== '23505') throw error;
  invalidateCache(colecaoCacheKey(userId));
}

/**
 * Adiciona um item NÃO IDENTIFICADO — a IA não conseguiu ler o produto
 * (`status: 'precisa_foto'`), e nesse caso a Edge Function não persiste nada.
 * O app sobe a foto (policy de INSERT no bucket, migration 20260922120000) para
 * o card existir com imagem e ela poder refazer a foto depois.
 */
export async function adicionarNaoIdentificado(
  userId: string,
  base64: string,
  mimeType = 'image/jpeg',
): Promise<void> {
  let imagePath: string | null = null;
  try {
    const path = `${userId}/colecao_${Date.now()}_${Math.floor(Math.random() * 1e4)}.jpg`;
    // Mesma conversão base64 → bytes do `uploadScanPhoto` (store/onboarding.ts):
    // o RN não tem Buffer, e passar a string base64 direto sobe um arquivo corrompido.
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes.buffer, { contentType: mimeType });
    if (!upErr) imagePath = path;
    else console.warn('[colecao] upload da foto não identificada falhou:', upErr);
  } catch (e) {
    console.warn('[colecao] upload da foto não identificada falhou:', e);
  }

  const { error } = await supabase.from('colecao_produtos').insert({
    user_id: userId,
    image_path: imagePath,
    status: 'nao_identificado',
    ativos_detectados: [],
  });
  if (error) throw error;
  invalidateCache(colecaoCacheKey(userId));
}

/**
 * Um item não identificado virou identificado (ela refez a foto, ou mandou a do
 * rótulo de ingredientes). Atualiza a linha EM VEZ de criar outra — senão a
 * Coleção acumula um card morto por tentativa.
 */
export async function identificarItem(
  userId: string,
  itemId: string,
  analise: AnaliseProduto,
  productScanId: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = {
    ...camposDaAnalise(analise),
    status: 'identificado',
    updated_at: new Date().toISOString(),
  };
  if (productScanId) {
    patch.product_scan_id = productScanId;
    const { data: scan } = await supabase
      .from('product_scans')
      .select('image_path, skin_scan_id')
      .eq('id', productScanId)
      .maybeSingle();
    if (scan?.image_path) patch.image_path = scan.image_path;
    if (scan?.skin_scan_id) patch.skin_scan_id = scan.skin_scan_id;
  }

  const { error } = await supabase
    .from('colecao_produtos')
    .update(patch)
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
  invalidateCache(colecaoCacheKey(userId));
}

/**
 * Remove itens da Coleção. ⚠️ SEMPRE por `id` explícito (`in(...)`) — nunca por
 * `user_id` ou qualquer filtro amplo (regra do projeto; um DELETE por `user_id`
 * já apagou 21 linhas por engano em produção).
 *
 * Remove só a linha da Coleção: o `product_scans` correspondente continua no
 * histórico ("Escaneados"), que é imutável de propósito.
 */
export async function removerItens(userId: string, ids: string[]): Promise<void> {
  const limpos = [...new Set(ids.filter(Boolean))];
  if (limpos.length === 0) return;
  const { error } = await supabase
    .from('colecao_produtos')
    .delete()
    .eq('user_id', userId)   // cinto de segurança; o filtro que apaga é o `in`
    .in('id', limpos);
  if (error) throw error;
  invalidateCache(colecaoCacheKey(userId));
}

/** Um `product_scan` já está na Coleção? (decide se o pop-up do resultado aparece) */
export async function scanJaNaColecao(userId: string, productScanId: string): Promise<boolean> {
  const { data } = await supabase
    .from('colecao_produtos')
    .select('id')
    .eq('user_id', userId)
    .eq('product_scan_id', productScanId)
    .maybeSingle();
  return !!data?.id;
}
