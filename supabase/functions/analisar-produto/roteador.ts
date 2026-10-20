import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { custoUsd, MODELO_OPENAI, tetoAnthropicAtingido, USO_ZERO, type Uso } from '../_shared/ia-custos.ts'

// Escolhe quem analisa o produto (out/2026) — mesmo esquema do niks-chat:
//   1. `analise_produto_config.provedor = 'openai'` → gpt-5.4-mini (chave SÓ desta função, sem deploy);
//   2. gasto da Anthropic no mês (TODAS as funções) ≥ teto global (ia_config) → gpt-5.4-mini
//      até o dia 1º seguinte;
//   3. senão Claude; erro, recusa, resposta cortada, JSON ilegível ou demora > espera_ms →
//      a MESMA análise vai para o gpt-5.4-mini, sem a usuária perceber.
// Cada chamada vira uma linha em `ia_custos` (registrarCusto, chamado no waitUntil).

// deno-lint-ignore no-explicit-any
type Supabase = any

type Config = {
  provedor: 'anthropic' | 'openai'
  modelo: string
  esforco: string
  cacheTtl: '5m' | '1h'
  esperaMs: number
}

const PADRAO: Config = {
  provedor: 'anthropic',
  modelo: 'claude-sonnet-5-5',
  esforco: 'low',
  cacheTtl: '5m',
  esperaMs: 30_000,
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 0 })

// Leitura guardada por 60 s em cada instância da função: a troca de provedor vale em ≤ 1 min.
const CACHE_MS = 60_000
let configCache: { em: number; valor: Config } | null = null

async function lerConfig(supabase: Supabase): Promise<Config> {
  if (configCache && Date.now() - configCache.em < CACHE_MS) return configCache.valor
  let valor = PADRAO
  try {
    const { data, error } = await supabase.from('analise_produto_config').select('*').eq('id', 1).maybeSingle()
    if (error) throw error
    if (data) {
      valor = {
        provedor: data.provedor === 'openai' ? 'openai' : 'anthropic',
        modelo: data.anthropic_modelo ?? PADRAO.modelo,
        esforco: data.esforco ?? PADRAO.esforco,
        cacheTtl: data.cache_ttl === '1h' ? '1h' : '5m',
        esperaMs: Number(data.espera_ms ?? PADRAO.esperaMs),
      }
    }
  } catch (e) {
    console.error('analisar-produto/roteador: analise_produto_config ilegível, usando o padrão', e)
  }
  configCache = { em: Date.now(), valor }
  return valor
}

// Parse defensivo: localiza o primeiro `{` e o último `}` para tolerar qualquer
// preâmbulo/markdown que o modelo eventualmente adicione.
export function extractJSON(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Nenhum objeto JSON encontrado na resposta do modelo')
  }
  return JSON.parse(text.slice(start, end + 1))
}

// Resposta aproveitável = JSON com `status` conhecido. Qualquer outra coisa → reserva.
function lerResultado(texto: string): any {
  const result = extractJSON(texto)
  if (result?.status !== 'ok' && result?.status !== 'precisa_foto') {
    throw new Error(`status inesperado: ${String(result?.status).slice(0, 40)}`)
  }
  return result
}

type Imagem = { base64: string; mimeType: string }

const TIPOS_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function chamarClaude(cfg: Config, systemPrompt: string, texto: string, imagens: Imagem[]): Promise<{ texto: string; uso: Uso }> {
  const cache = cfg.cacheTtl === '1h'
    ? { type: 'ephemeral' as const, ttl: '1h' as const }
    : { type: 'ephemeral' as const }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.esperaMs)
  try {
    const msg: any = await anthropic.messages.create(
      {
        model: cfg.modelo,
        // Raciocínio adaptativo (padrão do modelo) + esforço da config. O teto cobre
        // raciocínio + resposta (4096 podia cortar com o raciocínio ligado).
        max_tokens: 8000,
        output_config: { effort: cfg.esforco as any },
        // Cache: o prompt de sistema é igual para todas as usuárias.
        system: [{ type: 'text', text: systemPrompt, cache_control: cache }],
        // Mesma ordem do gpt (texto, depois as fotos) — foi a testada em 20/out/2026.
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: texto },
            ...imagens.map((img) => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: TIPOS_IMAGEM.has(img.mimeType) ? img.mimeType : 'image/jpeg',
                data: img.base64,
              },
            })),
          ],
        }],
      } as any,
      { signal: controller.signal },
    )
    const u = msg?.usage ?? {}
    const cc = u.cache_creation
    const uso: Uso = {
      input: u.input_tokens ?? 0,
      cacheWrite: cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0),
      cacheWrite1h: cc ? (cc.ephemeral_1h_input_tokens ?? 0) : 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
    }
    const saida = (msg?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    if (msg?.stop_reason === 'refusal') throw Object.assign(new Error('recusa'), { uso })
    if (msg?.stop_reason === 'max_tokens') throw Object.assign(new Error('cortada'), { uso })
    return { texto: saida, uso }
  } catch (e) {
    if (controller.signal.aborted) throw new Error('demora')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// gpt-5.4-mini exatamente como antes da troca: família GPT-5 (max_completion_tokens, NUNCA
// max_tokens), json_object, retry 3x em HTTP 500/503, sem stream.
async function chamarOpenAI(systemPrompt: string, texto: string, imagens: Imagem[]): Promise<{ texto: string; uso: Uso }> {
  const userContent: any[] = [{ type: 'text', text: texto }]
  for (const img of imagens) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` },
    })
  }

  let data: any = null
  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: MODELO_OPENAI,
        max_completion_tokens: 4096,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    })

    data = await response.json()
    const isUnavailable = !response.ok && (response.status === 503 || response.status === 500)
    if (isUnavailable) {
      lastError = JSON.stringify(data)
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        continue
      }
    }
    break
  }

  // Sem desconto de cache no custo (igual ao chat): `cached_tokens` fica dentro de `input`.
  const uso: Uso = { ...USO_ZERO, input: data?.usage?.prompt_tokens ?? 0, output: data?.usage?.completion_tokens ?? 0 }
  if (!data?.choices || data.choices.length === 0) {
    throw Object.assign(new Error(`OpenAI sem choices: ${JSON.stringify(data).slice(0, 300)} ${lastError.slice(0, 300)}`), { uso })
  }
  return { texto: data.choices[0].message.content ?? '', uso }
}

type Chamada = {
  provedor: 'anthropic' | 'openai'
  modelo: string
  esforco: string | null
  uso: Uso
  duracaoMs: number
  motivo: string | null
}

/**
 * Analisa o produto: Claude primeiro (se a config e o teto deixarem), gpt-5.4-mini como
 * reserva. `result` = JSON da análise, ou null se as duas falharam (a função devolve 500,
 * como antes). `registrarCusto` grava uma linha por chamada em `ia_custos`.
 */
export async function analisar(args: {
  supabase: Supabase
  userId: string
  systemPrompt: string
  texto: string
  imagens: Imagem[]
}): Promise<{ result: any | null; registrarCusto: () => Promise<void> }> {
  const { supabase, userId, systemPrompt, texto, imagens } = args
  const cfg = await lerConfig(supabase)
  const chamadas: Chamada[] = []
  let result: any = null

  let motivo: string | null = null
  if (cfg.provedor === 'openai') motivo = 'config_openai'
  else if (!ANTHROPIC_API_KEY) motivo = 'sem_chave_anthropic'
  else if (await tetoAnthropicAtingido(supabase)) motivo = 'teto_mensal'

  if (!motivo) {
    const inicio = Date.now()
    const chamada: Chamada = {
      provedor: 'anthropic', modelo: cfg.modelo, esforco: cfg.esforco, uso: { ...USO_ZERO },
      duracaoMs: 0, motivo: null,
    }
    chamadas.push(chamada)
    try {
      const c = await chamarClaude(cfg, systemPrompt, texto, imagens)
      chamada.uso = c.uso
      try {
        result = lerResultado(c.texto)
      } catch (e) {
        throw new Error(`json_ilegivel: ${(e as Error)?.message ?? e}`)
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      const status = (e as { status?: number })?.status
      const usoErro = (e as { uso?: Uso })?.uso
      if (usoErro) chamada.uso = usoErro
      motivo = msg === 'demora' || msg === 'recusa' || msg === 'cortada' || msg.startsWith('json_ilegivel')
        ? msg.slice(0, 200)
        : `erro_anthropic${status ? `_${status}` : ''}: ${msg.slice(0, 200)}`
      chamada.motivo = `abandonada: ${motivo}`
      console.warn('analisar-produto/roteador: Claude falhou, indo para o gpt-5.4-mini —', motivo)
    } finally {
      chamada.duracaoMs = Date.now() - inicio
    }
  }

  if (!result) {
    const inicio = Date.now()
    const chamada: Chamada = {
      provedor: 'openai', modelo: MODELO_OPENAI, esforco: null, uso: { ...USO_ZERO },
      duracaoMs: 0, motivo,
    }
    chamadas.push(chamada)
    try {
      const o = await chamarOpenAI(systemPrompt, texto, imagens)
      chamada.uso = o.uso
      result = extractJSON(o.texto) // como antes da troca: sem conferir o `status`
    } catch (e) {
      const usoErro = (e as { uso?: Uso })?.uso
      if (usoErro) chamada.uso = usoErro
      console.error('analisar-produto/roteador: gpt-5.4-mini também falhou', e)
    } finally {
      chamada.duracaoMs = Date.now() - inicio
    }
  }

  const registrarCusto = async () => {
    try {
      const { error } = await supabase.from('ia_custos').insert(chamadas.map((c) => ({
        funcao: 'analisar-produto',
        user_id: userId,
        provedor: c.provedor,
        modelo: c.modelo,
        esforco: c.esforco,
        input_tokens: c.uso.input,
        cache_write_tokens: c.uso.cacheWrite + c.uso.cacheWrite1h,
        cache_read_tokens: c.uso.cacheRead,
        output_tokens: c.uso.output,
        custo_usd: Number(custoUsd(c.modelo, c.uso).toFixed(6)),
        duracao_ms: c.duracaoMs,
        fallback_motivo: c.motivo,
        rodadas: 1,
      })))
      if (error) console.error('analisar-produto/roteador: falha ao gravar ia_custos', error)
    } catch (e) {
      console.error('analisar-produto/roteador: registrarCusto falhou', e)
    }
  }

  return { result, registrarCusto }
}
