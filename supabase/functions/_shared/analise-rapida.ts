// Formato da `analise-rapida` (06/nov/2026), compartilhado:
//   • a `analise-rapida` confere o pedido do app e a resposta do modelo (`pedidosValidos`,
//     `validar`);
//   • a `analyze-skin` confere a âncora que o app manda depois da compra (`validarAncora`).
// Teste em `analise-rapida/validar_test.ts`.

// Os problemas de "O que mais te incomoda na sua pele hoje?" (`components/onboarding/
// answers.ts` › CONCERN_LABELS, menos "Outro") com os nomes que o app usa
// (`lib/analiseRapida.ts`). Mudou lá, muda aqui.
export const PROBLEMAS = ['acne', 'manchas', 'cravos', 'oleosidade', 'rugas', 'poros', 'olheiras', 'ressecamento', 'textura'] as const
// As mesmas regiões de `region_insights` na `analyze-skin`.
export const REGIOES = ['testa', 'nariz_zona_t', 'bochechas', 'queixo_mandibula', 'area_periocular'] as const

export type Problema = (typeof PROBLEMAS)[number]
export type Regiao = (typeof REGIOES)[number]
/** 0 = não aparece na foto, 1 = leve, 2 = moderado, 3 = intenso. */
export type Intensidade = 0 | 1 | 2 | 3
export type ItemProblema = { problema: Problema; intensidade: Intensidade; regiao: Regiao | null }
export type Resultado = { foto_valida: boolean; idade_pele: number | null; problemas: ItemProblema[] }
/** O problema da carta de alerta (escolhido no app) + a idade, que a `analyze-skin` mantém,
 *  e o ponto forte da Carta 1 (06/nov/2026), que ela não pode apresentar como problema
 *  principal. `pontoForte` null = sem Carta 1 (ou app antigo). */
export type Ancora = { idade_pele: number | null; problema: Problema; intensidade: Intensidade; regiao: Regiao | null; pontoForte: Problema | null }

const ehProblema = (v: unknown): v is Problema => (PROBLEMAS as readonly unknown[]).includes(v)
const ehRegiao = (v: unknown): v is Regiao => (REGIOES as readonly unknown[]).includes(v)
const intensidadeDe = (v: unknown): Intensidade | null => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 3 ? (n as Intensidade) : null
}
const idadeDe = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 10 && n <= 80 ? n : null
}

/** Os problemas que ela marcou, sem repetição e na ordem dela. Lista vazia (só marcou
 *  "Outro") → todos, e a foto decide. (Desde 06/nov/2026 a `analise-rapida` avalia sempre os
 *  9 e não usa mais isto; fica para os testes e para quem precisar da regra.) */
export function pedidosValidos(lista: unknown): Problema[] {
  const vistos: Problema[] = []
  if (Array.isArray(lista)) for (const p of lista) if (ehProblema(p) && !vistos.includes(p)) vistos.push(p)
  return vistos.length ? vistos : [...PROBLEMAS]
}

/** Confere a resposta do modelo para os `pedidos`. null = fora do formato (vale nova
 *  tentativa). Devolve um item por pedido, na ordem dos pedidos. Idade fora de 10–80 vira
 *  null (a carta da idade está fora do onboarding; não vale uma nova chamada). */
export function validar(r: any, pedidos: readonly Problema[]): Resultado | null {
  if (!r || typeof r !== 'object' || typeof r.foto_valida !== 'boolean') return null
  if (!r.foto_valida) return { foto_valida: false, idade_pele: null, problemas: [] }
  if (!Array.isArray(r.problemas)) return null
  const problemas: ItemProblema[] = []
  for (const p of pedidos) {
    const item = r.problemas.find((x: any) => x?.problema === p)
    const intensidade = intensidadeDe(item?.intensidade)
    if (!item || intensidade === null) return null
    if (intensidade > 0 && !ehRegiao(item.regiao)) return null
    problemas.push({ problema: p, intensidade, regiao: intensidade > 0 ? item.regiao : null })
  }
  return { foto_valida: true, idade_pele: idadeDe(r.idade_pele), problemas }
}

/** Confere a âncora mandada pelo app à `analyze-skin`. null = ignorar (análise como antes). */
export function validarAncora(a: any): Ancora | null {
  if (!a || typeof a !== 'object' || !ehProblema(a.problema)) return null
  const intensidade = intensidadeDe(a.intensidade)
  if (intensidade === null) return null
  return {
    idade_pele: idadeDe(a.idade_pele),
    problema: a.problema,
    intensidade,
    regiao: intensidade > 0 && ehRegiao(a.regiao) ? a.regiao : null,
    // O ponto forte nunca é o mesmo problema da carta de alerta.
    pontoForte: ehProblema(a.ponto_forte) && a.ponto_forte !== a.problema ? a.ponto_forte : null,
  }
}
