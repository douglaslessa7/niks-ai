// ═══════════════════════════════════════════════════════════════════════════
// analise-rapida — ANÁLISE LEVE do scan do ONBOARDING (06/nov/2026)
//
// Roda logo depois do scan, ANTES da compra, no lugar da `analyze-skin`. Recebe a foto e
// devolve só o que as cartas do onboarding usam — nada de relatório:
//   { foto_valida, idade_pele, problemas: [{ problema, intensidade 0–3, regiao }] }
// com os 9 problemas de "O que mais te incomoda na sua pele hoje?", SEMPRE todos, na ordem da
// lista (06/nov/2026, pedido do produto: a Carta 1, o ponto forte, sai de um problema que ela
// NÃO marcou). O que ela marcou NÃO vai ao modelo (não puxa a nota dos marcados para cima); o
// campo `problemas` do pedido ainda é aceito (o app da loja manda) e ignorado — a resposta
// traz os marcados de qualquer jeito. O app escolhe as cartas (`lib/analiseRapida.ts`). A
// análise completa (`analyze-skin`) só roda DEPOIS da compra e recebe o problema da carta de
// alerta, o ponto forte e a idade, para não contradizer as cartas.
// Motivo: ~93% de quem faz o scan não compra (1–6/nov/2026: 484 análises × 23 contas).
//
// Barata de propósito: prompt curto, foto reduzida no app (~768 px de largura, só para
// esta chamada), resposta mínima por `json_schema` estrito. Chamada com a anon key, antes
// de a conta existir (mesmo padrão da `analyze-skin`; `verify_jwt` no `config.toml`).
//
// Os valores são ESTIMATIVAS REAIS DA FOTO: o prompt proíbe exagerar e inventar, e a
// idade que ela declarou NÃO é enviada (não puxa a estimativa). Os textos da carta
// continuam no app (`lib/cartaOnboarding.ts`, `components/cartas/Carta.tsx`).
// ═══════════════════════════════════════════════════════════════════════════
import { PROBLEMAS, REGIOES, validar, type Problema } from '../_shared/analise-rapida.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Teto da foto recebida (base64). A do app tem ~100–200 KB; isto só barra abuso (a função
// é anônima e cada chamada custa).
const MAX_BASE64 = 3_000_000
const TIMEOUT_MS = 30_000

const SYSTEM_PROMPT = `Você avalia a pele de UMA foto de rosto, como um dermatologista olhando a foto, e responde só o que é visível nela, em JSON.

1. foto_valida — true se há um rosto de frente, nítido e com luz suficiente para avaliar a pele. false se não há rosto, ou se está borrado, escuro demais, cortado ou coberto. Com false, idade_pele é null e problemas é uma lista vazia.

2. idade_pele — a idade APARENTE da pele, em anos inteiros, estimada só pelo que se vê: textura, linhas, firmeza, uniformidade do tom e viço. Seja realista: não envelheça nem rejuvenesça de propósito.

3. problemas — para CADA um dos 9 problemas abaixo, estime só pela foto:
- intensidade: 0 = não aparece na foto, 1 = leve, 2 = moderado, 3 = intenso;
- regiao: onde ele mais aparece — testa, nariz_zona_t, bochechas, queixo_mandibula ou area_periocular; null quando a intensidade é 0.
Devolva os 9, um item por problema.

O que cada problema quer dizer:
- acne: espinhas e lesões inflamadas
- manchas: hiperpigmentação, melasma, marcas escuras
- cravos: comedões abertos ou fechados
- oleosidade: brilho e excesso de sebo
- rugas: linhas finas, rugas, perda de firmeza
- poros: poros dilatados
- olheiras: escurecimento ou sombra abaixo dos olhos
- ressecamento: descamação, aspereza, pele opaca por falta de hidratação
- textura: relevo irregular da pele

Regras: estime com honestidade. Não exagere e não invente — se um problema não aparece na foto, a intensidade é 0. Avalie cada problema por conta própria, sem deixar um puxar a nota do outro.`

function esquemaDaResposta(pedidos: readonly Problema[]) {
  return {
    name: 'analise_rapida',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['foto_valida', 'idade_pele', 'problemas'],
      properties: {
        foto_valida: { type: 'boolean' },
        idade_pele: { type: ['integer', 'null'] },
        problemas: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['problema', 'intensidade', 'regiao'],
            properties: {
              problema: { type: 'string', enum: [...pedidos] },
              intensidade: { type: 'integer', enum: [0, 1, 2, 3] },
              regiao: { type: ['string', 'null'], enum: [...REGIOES, null] },
            },
          },
        },
      },
    },
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // `problemas` (o que ela marcou) chega do app e é ignorado de propósito — ver o topo.
    const { imageBase64 } = await req.json().catch(() => ({}))
    if (typeof imageBase64 !== 'string' || !imageBase64) return json({ error: 'imageBase64 é obrigatório' }, 400)
    if (imageBase64.length > MAX_BASE64) return json({ error: 'foto grande demais' }, 413)
    const pedidos = PROBLEMAS

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    let ultimoErro = ''

    // 2 tentativas: nova só em erro do servidor, tempo esgotado ou resposta fora do formato.
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const inicio = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'gpt-5.4-mini',
            // Família GPT-5: sempre `max_completion_tokens` (nunca `max_tokens`), e o teto
            // inclui o raciocínio — teto curto devolve resposta vazia (README). A resposta
            // tem ~100 tokens; cobra-se só o que sai.
            max_completion_tokens: 1000,
            response_format: { type: 'json_schema', json_schema: esquemaDaResposta(pedidos) },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                  { type: 'text', text: `Avalie os 9 problemas: ${pedidos.join(', ')}.` },
                ],
              },
            ],
          }),
        })
        const data = await response.json().catch(() => ({}))
        const choice = data?.choices?.[0]
        console.log(`[analise-rapida] tentativa ${tentativa} · HTTP ${response.status} · ${Date.now() - inicio} ms · pedidos=${pedidos.length} · finish_reason=${choice?.finish_reason ?? '-'} · usage=${JSON.stringify(data?.usage ?? {})}`)
        if (!response.ok || !choice) {
          ultimoErro = `HTTP ${response.status}: ${JSON.stringify(data?.error ?? data).slice(0, 300)}`
          // 4xx (exceto 429) não melhora tentando de novo.
          if (response.status >= 400 && response.status < 500 && response.status !== 429) break
          continue
        }
        let parsed: unknown = null
        try { parsed = JSON.parse(choice.message?.content ?? '') } catch { parsed = null }
        const resultado = validar(parsed, pedidos)
        if (resultado) return json(resultado)
        ultimoErro = `resposta fora do formato: ${String(choice.message?.content ?? '').slice(0, 200)}`
      } catch (e) {
        ultimoErro = (e as Error)?.name === 'AbortError' ? `tempo esgotado (${TIMEOUT_MS} ms)` : String(e)
      } finally {
        clearTimeout(timer)
      }
      console.error(`[analise-rapida] tentativa ${tentativa}: ${ultimoErro}`)
    }

    return json({ error: 'Erro ao analisar a foto' }, 502)
  } catch (error) {
    console.error('[analise-rapida] erro:', error)
    return json({ error: 'Erro interno' }, 500)
  }
})
