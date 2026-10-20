import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { USO_ZERO, type ChamadaFerramenta, type RespostaModelo, type Uso } from './model.ts'

// NIKS Chat no Claude Sonnet 5.5 (out/2026). Mesma interface do OpenAIModel (model.ts):
// devolve o TEXTO em pedaços (o app recebe exatamente o mesmo formato de antes), as
// chamadas de ferramenta como { name, arguments } e o uso de tokens.
// Além disso, `primeiro` resolve no primeiro texto (ou início de ferramenta) e REJEITA se
// a Anthropic falhar/recusar antes disso — é o que o roteador espera para decidir se manda
// a mesma mensagem para o gpt-5.4-mini sem a usuária perceber.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

export const temChaveAnthropic = () => ANTHROPIC_API_KEY.length > 0

export type ConfigClaude = { modelo: string; esforco: string; cacheTtl: '5m' | '1h' }

export type RespostaClaude = RespostaModelo & {
  primeiro: Promise<void>
  abortar: () => void
}

// Ferramenta no formato OpenAI ({ type:'function', function:{ name, description, parameters } })
// → formato Anthropic. proposta.ts continua sendo a fonte única dos textos e do schema.
function converterFerramenta(t: any) {
  const f = t?.function ?? t
  return {
    name: f.name,
    description: f.description,
    input_schema: f.parameters,
    eager_input_streaming: true,
  }
}

export class ClaudeModel {
  private client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 0 })

  constructor(private cfg: ConfigClaude) {}

  stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>,
    tools?: unknown[],
  ): RespostaClaude {
    const cache = this.cfg.cacheTtl === '1h'
      ? { type: 'ephemeral' as const, ttl: '1h' as const }
      : { type: 'ephemeral' as const }

    // Cache: ferramenta + prompt de sistema (iguais para todas as usuárias). A ordem do
    // cache é tools → system → messages; o contexto de cada usuária vem depois.
    const ferramentasDef = (tools ?? []).map(converterFerramenta)
    if (ferramentasDef.length) {
      ferramentasDef[ferramentasDef.length - 1] = { ...ferramentasDef[ferramentasDef.length - 1], cache_control: cache } as any
    }

    const content: any[] = [
      ...(images ?? []).map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      })),
      { type: 'text', text: userMessage },
    ]

    const controller = new AbortController()
    const sdkStream = this.client.messages.stream(
      {
        model: this.cfg.modelo,
        // Raciocínio adaptativo (padrão do modelo) + esforço da chat_config. O teto cobre
        // raciocínio + resposta visível.
        max_tokens: 8000,
        output_config: { effort: this.cfg.esforco as any },
        system: [{ type: 'text', text: systemPrompt, cache_control: cache }],
        ...(ferramentasDef.length
          ? { tools: ferramentasDef as any, tool_choice: { type: 'auto', disable_parallel_tool_use: true } }
          : {}),
        messages: [{ role: 'user', content }],
      },
      { signal: controller.signal },
    )

    const encoder = new TextEncoder()
    const chamadas: { name: string; arguments: string }[] = []
    let uso: Uso = { ...USO_ZERO }
    let algoSaiu = false

    let resolverPrimeiro!: () => void
    let rejeitarPrimeiro!: (e: unknown) => void
    const primeiro = new Promise<void>((res, rej) => { resolverPrimeiro = res; rejeitarPrimeiro = rej })
    primeiro.catch(() => {}) // quem decide é o roteador; sem "unhandled rejection"
    const marcarSaida = () => { if (!algoSaiu) { algoSaiu = true; resolverPrimeiro() } }

    let resolverFerramentas!: (c: ChamadaFerramenta[]) => void
    const ferramentas = new Promise<ChamadaFerramenta[]>((r) => { resolverFerramentas = r })
    let resolverUso!: (u: Uso) => void
    const usoPromise = new Promise<Uso>((r) => { resolverUso = r })

    const lerUso = (u: any) => {
      if (!u) return
      const cc = u.cache_creation
      uso = {
        input: u.input_tokens ?? uso.input,
        cacheWrite: cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? uso.cacheWrite),
        cacheWrite1h: cc ? (cc.ephemeral_1h_input_tokens ?? 0) : uso.cacheWrite1h,
        cacheRead: u.cache_read_input_tokens ?? uso.cacheRead,
        output: u.output_tokens ?? uso.output,
      }
      // Sem o detalhamento: atribui a gravação ao TTL configurado.
      if (!cc && this.cfg.cacheTtl === '1h') { uso.cacheWrite1h = uso.cacheWrite; uso.cacheWrite = 0 }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        // Argumentos da ferramenta, juntados por índice do bloco.
        const blocos = new Map<number, { name: string; arguments: string }>()
        try {
          for await (const ev of sdkStream as AsyncIterable<any>) {
            switch (ev.type) {
              case 'message_start':
                lerUso(ev.message?.usage)
                break
              case 'content_block_start':
                if (ev.content_block?.type === 'tool_use') {
                  blocos.set(ev.index, { name: ev.content_block.name, arguments: '' })
                  marcarSaida()
                }
                break
              case 'content_block_delta':
                if (ev.delta?.type === 'text_delta' && ev.delta.text) {
                  marcarSaida()
                  ctrl.enqueue(encoder.encode(ev.delta.text))
                } else if (ev.delta?.type === 'input_json_delta') {
                  const b = blocos.get(ev.index)
                  if (b) b.arguments += ev.delta.partial_json ?? ''
                }
                break
              case 'content_block_stop': {
                const b = blocos.get(ev.index)
                if (b) { chamadas.push(b); blocos.delete(ev.index) }
                break
              }
              case 'message_delta':
                lerUso(ev.usage)
                if (ev.delta?.stop_reason === 'refusal') {
                  // Recusa antes de qualquer texto → o roteador manda para o gpt-5.4-mini.
                  // Depois de texto, só termina com o que já saiu.
                  if (!algoSaiu) rejeitarPrimeiro(new Error(`refusal:${ev.delta?.stop_details?.category ?? ''}`))
                  chamadas.length = 0 // ferramenta de uma resposta recusada nunca é usada
                }
                break
            }
          }
          if (!algoSaiu) rejeitarPrimeiro(new Error('resposta-vazia'))
          ctrl.close()
        } catch (err) {
          // Antes do primeiro texto: o roteador troca de modelo. Depois: a resposta termina
          // com o que já foi enviado (não dá para trocar sem repetir texto na tela).
          if (!algoSaiu) rejeitarPrimeiro(err)
          else console.warn('niks-chat/claude: erro depois do primeiro texto', (err as Error)?.message ?? err)
          try { ctrl.close() } catch { /* já fechado/cancelado */ }
        } finally {
          resolverFerramentas(chamadas)
          resolverUso(uso)
        }
      },
      cancel() {
        controller.abort()
      },
    })

    return {
      stream,
      ferramentas,
      uso: usoPromise,
      primeiro,
      abortar: () => controller.abort(),
    }
  }
}
