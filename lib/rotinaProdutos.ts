// ─────────────────────────────────────────────────────────────────────────────
// O PRODUTO que ocupa cada PASSO da rotina (foto + marca + nome).
//
// Substituiu o antigo `lib/savedProducts.ts` (AsyncStorage, por aparelho): a fonte
// agora é a recomendação salva (`recomendacoes_produtos`), e acompanha a conta
// entre aparelhos.
//
// ⚠️ SÓ passo com produto ESCOLHIDO aparece aqui — os dois casos em que a usuária
// decidiu, não a IA:
//   • `em_casa`  → produto da Minha Coleção (foto que ELA tirou, bucket privado);
//   • `fixado`   → produto do catálogo que ela fixou no passo ("Adicionar à minha
//                  rotina"; foto pública de `produtos.imagem_url`).
// Passo com mera recomendação da IA NÃO entra: a Rotina mostraria um produto que
// ela não escolheu (e, no caso da foto, daria a entender que ela tem em casa).
//
// ⚠️ A URL da foto de `em_casa` é ASSINADA (1h): o resultado desta função NUNCA
// pode ser cacheado em disco. Por isso a Rotina a chama a cada foco.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase';
import { getUserId } from './currentUser';
import { normStepKey } from './savedProducts';

export type ProdutoDoPasso = {
  photoUrl: string | null;
  marca: string | null;
  nome: string | null;
};

type PassoRecomendacao = {
  passo?: string;
  fixado?: boolean;
  em_casa?: { image_path?: string | null; marca?: string | null; nome?: string | null } | null;
  produtos?: Array<{ produto_id?: string; principal?: boolean }>;
};

/** `normStepKey(nome do passo)` → produto que ocupa o passo. */
export async function getProdutosDosPassos(): Promise<Record<string, ProdutoDoPasso>> {
  const userId = await getUserId();
  if (!userId) return {};

  const { data: row } = await supabase
    .from('recomendacoes_produtos')
    .select('recomendacao')
    .eq('user_id', userId)
    .maybeSingle();

  const passos = Array.isArray(row?.recomendacao) ? (row!.recomendacao as PassoRecomendacao[]) : [];

  const out: Record<string, ProdutoDoPasso> = {};
  const porPath = new Map<string, string[]>();      // image_path → chaves de passo
  const porProduto = new Map<string, string[]>();   // produto_id → chaves de passo

  for (const p of passos) {
    const nome = p?.passo;
    if (!nome) continue;
    const chave = normStepKey(nome);

    if (p.em_casa) {
      out[chave] = { photoUrl: null, marca: p.em_casa.marca ?? null, nome: p.em_casa.nome ?? null };
      if (p.em_casa.image_path) {
        porPath.set(p.em_casa.image_path, [...(porPath.get(p.em_casa.image_path) ?? []), chave]);
      }
      continue;
    }

    if (p.fixado) {
      const principal = (p.produtos ?? []).find((x) => x?.principal) ?? (p.produtos ?? [])[0];
      if (principal?.produto_id) {
        porProduto.set(principal.produto_id, [...(porProduto.get(principal.produto_id) ?? []), chave]);
      }
    }
  }

  if (porPath.size > 0) {
    const { data: signed } = await supabase.storage
      .from('product-scans')
      .createSignedUrls([...porPath.keys()], 3600);
    (signed ?? []).forEach((s: any) => {
      if (!s?.path || !s?.signedUrl || s.error) return;
      for (const chave of porPath.get(s.path) ?? []) {
        out[chave] = { ...(out[chave] ?? { marca: null, nome: null }), photoUrl: s.signedUrl };
      }
    });
  }

  if (porProduto.size > 0) {
    const { data: prods } = await supabase
      .from('produtos')
      .select('id, marca, nome, imagem_url')
      .in('id', [...porProduto.keys()]);
    (prods ?? []).forEach((p: any) => {
      for (const chave of porProduto.get(p.id) ?? []) {
        out[chave] = {
          photoUrl: p.imagem_url ?? null,
          marca: p.marca ?? null,
          nome: p.nome ?? null,
        };
      }
    });
  }

  return out;
}
