const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export interface ChatModel {
  stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>
  ): Promise<ReadableStream<Uint8Array>>
}

export class OpenAIModel implements ChatModel {
  async stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>
  ): Promise<ReadableStream<Uint8Array>> {
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
      model: 'gpt-4.1-mini',
      max_tokens: 2048,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
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

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = openaiResponse!.body!.getReader()
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
                  const text = parsed?.choices?.[0]?.delta?.content ?? ''
                  if (text) controller.enqueue(encoder.encode(text))
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
                const text = parsed?.choices?.[0]?.delta?.content ?? ''
                if (text) controller.enqueue(encoder.encode(text))
              } catch {
                // chunk SSE malformado, ignora
              }
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        } finally {
          reader.releaseLock()
        }
      },
    })
  }
}

export const geminiModel = new OpenAIModel()
