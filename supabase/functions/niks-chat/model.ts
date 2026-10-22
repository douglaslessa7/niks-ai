const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

// Ferramenta que a NIKS chama para PROPOR uma mudança de rotina (out/2026). Substitui o
// bloco escondido [[PROTOCOL_PATCH]] no texto, que o gpt-5.4-mini parou de emitir
// ("phrase-without-block"). Os argumentos chegam em pedaços no stream e são juntados.
export type ChamadaFerramenta = { name: string; arguments: string }

// Tokens que a API devolveu (para o custo em `ia_custos`). `input` = entrada SEM cache.
// `estimado`: a chamada foi cortada antes de a API informar o uso — os números são um piso.
export type Uso = { input: number; cacheWrite: number; cacheWrite1h: number; cacheRead: number; output: number; estimado?: boolean }
export const USO_ZERO: Uso = { input: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 }

export type RespostaModelo = {
  stream: ReadableStream<Uint8Array>
  ferramentas: Promise<ChamadaFerramenta[]>
  uso: Promise<Uso>
}

export interface ChatModel {
  stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>,
    tools?: unknown[],
  ): Promise<RespostaModelo>
}

// Resposta que ninguém lê termina em segundo plano até este limite (ver claude.ts).
const LIMITE_ABANDONADA_MS = 60_000

export class OpenAIModel implements ChatModel {
  async stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>,
    tools?: unknown[],
  ): Promise<RespostaModelo> {
    let userContent: unknown
    if (images && images.length > 0) {
      userContent = [
        { type: 'text', text: userMessage },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
      ]
    } else {
      userContent = userMessage
    }

    const openaiBody = JSON.stringify({
      // gpt-5.4-mini (out/2026, era gpt-4.1-mini). Família GPT-5: `max_completion_tokens`
      // (o `max_tokens` dá erro 400) e o teto inclui o raciocínio, que não aparece no
      // stream — 2048 de resposta visível + folga para pensar.
      model: 'gpt-5.4-mini',
      max_completion_tokens: 6000,
      stream: true,
      // O último chunk traz o `usage` (choices vazio) — vai para `ia_custos`.
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      ...(tools && tools.length ? { tools, tool_choice: 'auto', parallel_tool_calls: false } : {}),
    })

    let openaiResponse: Response | null = null
    let lastError: string | null = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: openaiBody,
      })

      if (!resp.ok) {
        const errBody = await resp.text()
        const isRetryable = resp.status === 503 || resp.status === 429
        if (isRetryable && attempt < 3) {
          console.warn(`OpenAI ${resp.status} (tentativa ${attempt}/3), aguardando 3s...`)
          await new Promise(r => setTimeout(r, 3000))
          continue
        }
        lastError = `OpenAI error ${resp.status}: ${errBody}`
        break
      }

      openaiResponse = resp
      break
    }

    if (!openaiResponse) {
      throw new Error(lastError ?? 'OpenAI indisponível após 3 tentativas')
    }

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    // Chamadas de ferramenta, juntadas por `index` (nome + argumentos em pedaços).
    const chamadas: { name: string; arguments: string }[] = []
    let resolverFerramentas!: (c: ChamadaFerramenta[]) => void
    const ferramentas = new Promise<ChamadaFerramenta[]>((r) => { resolverFerramentas = r })
    let uso: Uso = { ...USO_ZERO }
    let usoLido = false
    let resolverUso!: (u: Uso) => void
    const usoPromise = new Promise<Uso>((r) => { resolverUso = r })
    const lerDelta = (parsed: any) => {
      const u = parsed?.usage
      if (u) {
        // Sem desconto de cache no custo (preço do cache não confirmado): `cached_tokens`
        // fica dentro de `input`, para o custo nunca sair subestimado.
        uso = { ...USO_ZERO, input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0 }
        usoLido = true
      }
      const tcs = parsed?.choices?.[0]?.delta?.tool_calls
      if (!Array.isArray(tcs)) return
      for (const tc of tcs) {
        const i = typeof tc?.index === 'number' ? tc.index : 0
        chamadas[i] = chamadas[i] ?? { name: '', arguments: '' }
        if (tc?.function?.name) chamadas[i].name += tc.function.name
        if (tc?.function?.arguments) chamadas[i].arguments += tc.function.arguments
      }
    }

    // A usuária fechou o chat: a leitura continua até o último chunk (é nele que vem o
    // `usage`), sem enviar nada. Passou de LIMITE_ABANDONADA_MS, corta e o uso fica estimado.
    const reader = openaiResponse!.body!.getReader()
    let abandonada = false
    let timerAbandono: ReturnType<typeof setTimeout> | undefined
    const abandonar = () => {
      if (abandonada) return
      abandonada = true
      timerAbandono = setTimeout(() => { reader.cancel().catch(() => {}) }, LIMITE_ABANDONADA_MS)
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enviar = (text: string) => {
          if (abandonada) return
          try { controller.enqueue(encoder.encode(text)) } catch { abandonar() /* stream fechado */ }
        }
        let sseBuffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              sseBuffer += decoder.decode()
              const remainingLines = sseBuffer.split('\n')
              for (const line of remainingLines) {
                if (!line.startsWith('data: ')) continue
                const payload = line.slice(6).trim()
                if (!payload || payload === '[DONE]') continue
                try {
                  const parsed = JSON.parse(payload)
                  lerDelta(parsed)
                  const text = parsed?.choices?.[0]?.delta?.content ?? ''
                  if (text) enviar(text)
                } catch { /* chunk malformado */ }
              }
              break
            }

            sseBuffer += decoder.decode(value, { stream: true })
            const lines = sseBuffer.split('\n')
            sseBuffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const payload = line.slice(6).trim()
              if (!payload || payload === '[DONE]') continue

              try {
                const parsed = JSON.parse(payload)
                lerDelta(parsed)
                const text = parsed?.choices?.[0]?.delta?.content ?? ''
                if (text) enviar(text)
              } catch {
                // chunk SSE malformado, ignora
              }
            }
          }
          try { controller.close() } catch { /* a usuária já fechou o chat */ }
        } catch (err) {
          try { controller.error(err) } catch { /* já fechado */ }
        } finally {
          clearTimeout(timerAbandono)
          reader.releaseLock()
          resolverFerramentas(chamadas.filter(Boolean))
          resolverUso(usoLido ? uso : { ...uso, estimado: true })
        }
      },
      cancel() {
        abandonar()
      },
    })
    return { stream, ferramentas, uso: usoPromise }
  }
}

export const geminiModel = new OpenAIModel()
