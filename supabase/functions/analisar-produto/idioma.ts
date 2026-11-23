// Idioma da resposta (etapa 3 da tradução, nov/2026). O app manda `idioma: 'pt' | 'en'`
// no corpo; sem o campo (builds antigas) ou com outro valor = português, exatamente como
// antes. Em português NADA aqui é usado: o texto para a IA e os textos do código ficam iguais.
export type Idioma = 'pt' | 'en'

export function idiomaDoCorpo(body: unknown): Idioma {
  return (body as { idioma?: unknown } | null)?.idioma === 'en' ? 'en' : 'pt'
}

// Vai no FIM do texto da usuária (a parte sem cache), só em inglês. O prompt de sistema
// não muda (o cache dele é o mesmo para as duas línguas).
export const INSTRUCAO_EN =
  `\n\nRESPONSE LANGUAGE: American English (the user's phone is in English).\n` +
  `- Write every text she reads in natural American English, in the NIKS voice (warm, light, close, like a friend who knows skincare — never a literal translation): ` +
  `mensagem, nota, o_que_faz, resumo, explicacao, resultado_esperado_para_voce, ressalvas[].texto, decisao_rotina.passo, decisao_rotina.produto_substituivel, decisao_rotina.justificativa and avisos. ` +
  `produto.ativos_detectados in their usual English/INCI names (e.g. "salicylic acid 2%", "niacinamide").\n` +
  `- Never translate: JSON keys and every code value (status, confianca, veredito, compatibilidade, ressalvas[].codigo, decisao_rotina.tipo, periodo, the passo_id codes).\n` +
  `- Keep in Portuguese, exactly as the instructions define: produto.categoria (limpeza, tônico, sérum, hidratante, oclusivo, protetor solar…) and the day codes in decisao_rotina.dias (Seg, Ter, Qua, Qui, Sex, Sáb, Dom).\n` +
  `- produto.nome and produto.marca: as printed on the package (do not translate).\n` +
  `- The same voice rules apply in English: never "diagnosis", "cure", "guaranteed", "miracle", "perfect product".`
