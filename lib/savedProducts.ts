// ─────────────────────────────────────────────────────────────────────────────
// Chave estável de um PASSO da rotina.
//
// ⚠️ O que este arquivo era: "produtos salvos na rotina" em AsyncStorage, gravado
// pelo botão "Salvar na minha rotina" da tela de Produtos e lido pela Rotina para
// trocar o ícone do passo pela foto do produto. **Aposentado pela Minha Coleção**,
// que faz a mesma coisa do lado do servidor (sincroniza entre aparelhos, sabe a
// compatibilidade e alimenta a própria montagem da rotina). Quem dá a foto de cada
// passo hoje é `lib/rotinaProdutos.ts`; o botão virou "Tenho esse produto em casa".
//
// O que SOBROU aqui é só o `normStepKey`, que continua sendo a chave única de
// casamento passo↔produto em três lugares (deep-link da Rotina para o detalhe do
// produto, o mapa de fotos dos passos e a tela de Produtos). Ele fica neste
// arquivo porque é onde os dois lados já o importavam — mover agora só criaria
// churn de imports sem ganho.
//
// ⚠️ Os dados antigos em AsyncStorage (chave `saved_routine_products_v1`) NÃO são
// migrados: eles guardavam só a foto de um produto do CATÁLOGO por passo, sem
// produto_id nem compatibilidade — não dá para deduzir deles que ela "tem o
// produto em casa". Ficam órfãos e param de ser lidos.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chave estável de um passo: minúsculas, sem acento, espaços colapsados.
 * Precisa ser idêntica em todos os consumidores — por isso mora num lugar só.
 */
export function normStepKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // remove acentos
    .replace(/\s+/g, ' ')
    .trim();
}
