// Idioma da resposta (etapa 3 da tradução, nov/2026). O app manda `idioma: 'pt' | 'en'`
// no corpo; sem o campo (builds antigas) ou com outro valor = português, exatamente como
// antes. Em português NADA aqui é usado.
export type Idioma = 'pt' | 'en'

export function idiomaDoCorpo(body: unknown): Idioma {
  return (body as { idioma?: unknown } | null)?.idioma === 'en' ? 'en' : 'pt'
}

const REGRAS_EN =
  `- Write every text she reads in natural American English, talking to "you", in the NIKS voice (warm, light, close — never a literal translation), with the same rules of <Escrita> (short, direct sentences starting with the verb; each item up to 90 characters).\n` +
  `- The word is "analysis". Never "diagnosis", never state a disease, never promise how fast it will heal.\n` +
  `- Never translate JSON keys or code values (status, ref, quando, dermatologista, resolvida).`

// Análise da foto: vai no fim do texto da usuária, só em inglês.
export const INSTRUCAO_EN =
  `\n\nRESPONSE LANGUAGE: American English (the user's phone is in English). This replaces "Português do Brasil" in <Escrita>.\n` +
  `${REGRAS_EN}\n- Text fields: produtos[].como_usar, cuidados, evitar.`

// Conversa de acompanhamento: idem.
export const INSTRUCAO_EN_CONVERSA =
  `\n\nRESPONSE LANGUAGE: American English (the user's phone is in English). This replaces "Português do Brasil" in your writing rules; she may also write in English.\n` +
  `${REGRAS_EN}\n- Text field: texto.`
