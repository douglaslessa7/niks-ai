// ─────────────────────────────────────────────────────────────────────────────
// AVALIAÇÃO CLÍNICA — Camada 1 (veredito + compatibilidade 0–100).
//
// FONTE ÚNICA da régua, usada por DOIS consumidores com entradas diferentes:
//   • `analisar-produto`   → entrada é a FOTO do produto (lê rótulo/ingredientes);
//   • `recomendar-produtos`→ entrada é a FICHA do produto no catálogo.
//
// ⚠️ POR QUE ISTO EXISTE NUM ARQUIVO SÓ. Os dois números aparecem LADO A LADO na
// rotina (o da Minha Coleção e o do recomendado), e a usuária decide em cima da
// comparação. Duas réguas com a mesma cara mentiriam para ela. Se for mexer na
// régua, mexe aqui — nunca copiar este texto para dentro de uma function.
//
// ⚠️ O texto abaixo é uma CÓPIA VERBATIM do Passo 3 do prompt da `analisar-produto`
// (que agora o interpola daqui, em vez de ter o seu próprio). Alterar o texto
// altera a análise de produto por foto também — é esse o ponto.
//
// ⚠️ DIFERENÇA DE EVIDÊNCIA, conhecida e deliberadamente INVISÍVEL na interface:
// a nota da Coleção nasce de uma foto (a IA lê o rótulo real, com concentração); a
// do catálogo nasce da ficha (`ativos_principais`, sem concentração). Mesma régua,
// qualidades de evidência diferentes — o produto de catálogo tende a pontuar de
// forma mais "limpa", por não ter o ruído de uma foto mal lida. **Decisão de
// produto: NÃO sinalizar a origem na tela.** Saber que uma nota veio de foto e
// outra de ficha não ajuda a usuária a decidir; só planta dúvida sobre o número.
// A diferença fica registrada aqui e no README, não na interface.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Camada 1 do prompt clínico: cortes duros de segurança, definição do veredito e
 * a régua do número (faixas por veredito). Verbatim, compartilhado.
 */
export const CAMADA1_SEGURANCA_E_COMPATIBILIDADE = `## Passo 3 — Momento 2, Camada 1: cabe na pele dela?
Antes de pensar em rotina, decida se é seguro e adequado AGORA. Cortes duros (qualquer um → veredito "evitaria", e a Camada 2 não acontece):
- Alérgeno/reação confirmada no perfil ou memória → na dúvida, corta.
- Gravidez/amamentação/tentativa: nunca valide retinoides (retinol, retinal, tretinoína, adapaleno), ácido salicílico >2%, hidroquinona, kójico em alta concentração → evitaria, e diga pra confirmar com o obstetra.
- Barreira comprometida/severamente comprometida: qualquer AHA, BHA, retinoide, vitamina C L-AA puro, niacinamida >5%, fragrância, álcool desnaturado → evitaria agora; diga quando faria sentido retomar.
- Rosácea presente: AHAs, BHA >0,5%, L-AA puro, fragrância, álcool, esfoliante físico → evitaria.
Se não bater em corte:
- "pode_usar" — adequado e seguro.
- "com_ressalva" — usável, com um cuidado (introduzir devagar, não na mesma noite de outro ativo forte, fototipo pede versão mais suave).
O \`veredito\` é EXCLUSIVAMENTE a conclusão de segurança/adequação desta Camada 1: sempre um de "pode_usar", "com_ressalva" ou "evitaria". Ele nunca carrega a conclusão de rotina — "manter_rotina" NÃO é um veredito (é valor de \`decisao_rotina.tipo\`, decidido na Camada 2, Passo 4). Se o produto é seguro e usável, o veredito é "pode_usar" mesmo que depois você conclua que a rotina dela já cobre isso.
Fototipo IV–VI: mandélico > glicólico; derivados de vit C (SAP/MAP) > L-AA puro; azelaico como despigmentante preferencial; niacinamida 2–5% se houver HPI; nunca hidroquinona.

### Compatibilidade (o número)
\`compatibilidade\` é um inteiro de 0 a 100 que expressa QUÃO BEM esse produto se adequa e é seguro pra pele dela — tipo de pele, fototipo, barreira, alergias, gravidez, contraindicações do scan. É a tradução numérica desta Camada 1, nada além disso.
Ele NÃO mede se vale a pena adicionar o produto à rotina, se o produto é "bom", nem se ela deveria comprá-lo. Um produto pode ser altamente compatível com a pele dela E completamente redundante na rotina dela — nesse caso, compatibilidade alta + \`decisao_rotina.tipo: "manter_rotina"\` é a combinação correta e esperada. Não force coerência entre os dois: eles medem coisas diferentes.
Decida o \`veredito\` PRIMEIRO, pelos cortes duros e critérios acima. Só depois derive o número, dentro da faixa do veredito que você já decidiu:
- "evitaria" → 0 a 35
- "com_ressalva" → 40 a 70
- "pode_usar" → 75 a 100
O número NUNCA cai fora da faixa do veredito. Se você decidiu "evitaria", a compatibilidade é baixa, ponto — não existe retinol 80% compatível pra uma usuária grávida.
Nunca use o número para justificar ou racionalizar a decisão de rotina. A Camada 2 (Passo 4) é decidida pelos critérios dela, ignorando o score.`

/** Faixa numérica de cada veredito — o prompt promete, isto garante. */
export const FAIXA_POR_VEREDITO: Record<string, [number, number]> = {
  evitaria: [0, 35],
  com_ressalva: [40, 70],
  pode_usar: [75, 100],
}

/**
 * Guarda determinística: o modelo pode devolver número fora da faixa do veredito
 * que ele mesmo escolheu (o prompt proíbe, mas prompt não é garantia). Traz o
 * número para dentro da faixa em vez de descartar a avaliação inteira.
 * Veredito desconhecido → devolve `null` (melhor sem nota do que com nota errada;
 * a tela já sabe não desenhar a barra quando não há número).
 */
export function clampCompatibilidade(veredito: unknown, valor: unknown): number | null {
  const faixa = FAIXA_POR_VEREDITO[String(veredito)]
  if (!faixa) return null
  const n = typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor) : null
  if (n === null) return faixa[0] // sem número mas com veredito válido: piso da faixa
  return Math.min(faixa[1], Math.max(faixa[0], n))
}
