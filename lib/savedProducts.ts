// ─────────────────────────────────────────────────────────────────────────────
// LEGADO. Até out/2026 o "Salvar na minha rotina" guardava o produto de cada passo
// AQUI, no AsyncStorage do celular (chave `saved_routine_products_v1`, por NOME
// normalizado do passo) — sem sincronizar. Desde a Fase 1 do plano da Rotina o produto
// do passo vive no servidor, na "Minha rotina" (lib/minhaRotina.ts), que migra essa
// chave uma vez e a apaga. Ficou só o que ainda é usado: o formato do nome do passo
// (casar passo da rotina ↔ passo da recomendação) e o tipo do produto por passo.
// ─────────────────────────────────────────────────────────────────────────────

export type SavedProduct = {
  imageUrl: string;      // URL da imagem do produto (catálogo `produtos.imagem_url`)
  brand?: string | null;
  name?: string | null;
};

// Chave estável de um passo: minúsculas, sem acento, espaços colapsados.
// Precisa ser idêntica nos dois lados (rotina e recomendação) — por isso mora aqui.
export function normStepKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // remove acentos
    .replace(/\s+/g, ' ')
    .trim();
}
