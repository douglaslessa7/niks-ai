import { getAccessToken } from './sessionToken';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ─────────────────────────────────────────────────────────────────────────────
// CHAMADA à Edge Function `analisar-produto` — ponto único.
//
// Extraída de `hooks/useProductAnalysis.ts` quando a análise em LOTE do primeiro
// fluxo da Coleção passou a precisar da mesma chamada fora de um componente React
// (o lote roda como função de módulo, em background, sobrevivendo à navegação).
// O hook continua dono do que é de TELA (%, aviso de alta demanda, erro, retry);
// aqui mora só a requisição.
//
// ⚠️ A análise usa SEMPRE o scan de pele mais recente da usuária — a Edge Function
// monta o context pack sozinha (`buildContext` → `getLastScan`). É por isso que, no
// primeiro fluxo, as fotos dos produtos ficam na fila e só são analisadas DEPOIS
// que o scan de 6 fotos foi salvo: assim a compatibilidade nasce contra o retrato
// novo da pele, sem precisar recalcular nada depois.
// ─────────────────────────────────────────────────────────────────────────────

export type ProdutoImagem = { base64: string; mimeType: string };

export type AnalisarProdutoParams = {
  /** images[0] = produto (obrigatória); images[1] = rótulo de ingredientes (opcional). */
  images: ProdutoImagem[];
  /** Idempotência: a mesma string em duas tentativas nunca gera dois `product_scans`. */
  clientScanId?: string;
  /** Título da página (fluxo de share por link) — contexto extra não verificado. */
  productName?: string | null;
};

/**
 * Resposta da `analisar-produto`. `status: 'precisa_foto'` = a IA não conseguiu ler
 * o produto (foto borrada, embalagem gasta, marca pequena, outra língua) — nesse caso
 * NADA é persistido pela Edge Function e não vem `scan_id`.
 */
export type AnaliseProduto = {
  scan_id?: string | null;
  status?: 'ok' | 'precisa_foto';
  produto?: { nome?: string; marca?: string; categoria?: string; ativos_detectados?: string[] };
  compatibilidade?: number;
  veredito?: 'pode_usar' | 'com_ressalva' | 'evitaria';
  resumo?: string;
  explicacao?: string;
  o_que_faz?: string;
  resultado_esperado_para_voce?: string;
  decisao_rotina?: {
    tipo?: 'adicionar' | 'substituir' | 'manter_rotina';
    passo?: string;
    periodo?: string;
    produto_substituivel?: string;
    justificativa?: string;
  };
  avisos?: string[];
  mensagem?: string;
  [k: string]: unknown;
};

export async function analisarProduto(
  { images, clientScanId, productName }: AnalisarProdutoParams,
): Promise<AnaliseProduto> {
  if (!images?.[0]?.base64) throw new Error('Sem imagem do produto');

  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Sem sessão válida');

  const name = productName?.trim();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/analisar-produto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      images: images.map((i) => ({ base64: i.base64, mimeType: i.mimeType || 'image/jpeg' })),
      ...(clientScanId ? { clientScanId } : {}),
      ...(name ? { productName: name } : {}),
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(JSON.stringify(errBody));
  }
  return (await response.json()) as AnaliseProduto;
}

/** Id de scan estável para idempotência entre tentativas da MESMA análise. */
export function novoClientScanId(prefix = 'prod'): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}
