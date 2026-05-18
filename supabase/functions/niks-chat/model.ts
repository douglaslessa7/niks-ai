const GEMINI_MODEL = 'gemini-3-flash-preview'
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!

export interface ChatModel {
  stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>
  ): Promise<ReadableStream<Uint8Array>>
}

export class GeminiModel implements ChatModel {
  async stream(
    systemPrompt: string,
    userMessage: string,
    images?: Array<{ base64: string; mimeType: string }>
  ): Promise<ReadableStream<Uint8Array>> {
    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`

    const parts: any[] = []
    if (images && images.length > 0) {
      for (const img of images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } })
      }
    }
    parts.push({ text: userMessage })
    const userParts = parts

    const geminiBody = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: {
        maxOutputTokens: 2048,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    })

    let geminiResponse: Response | null = null
    let lastError: string | null = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      const resp = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      })

      if (!resp.ok) {
        const errBody = await resp.text()
        const is503 = resp.status === 503 || errBody.includes('UNAVAILABLE')
        if (is503 && attempt < 3) {
          console.warn(`Gemini 503 (tentativa ${attempt}/3), aguardando 3s...`)
          await new Promise(r => setTimeout(r, 3000))
          continue
        }
        lastError = `Gemini error ${resp.status}: ${errBody}`
        break
      }

      geminiResponse = resp
      break
    }

    if (!geminiResponse) {
      throw new Error(lastError ?? 'Gemini indisponível após 3 tentativas')
    }

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = geminiResponse!.body!.getReader()
        let sseBuffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              // Flush quaisquer bytes ainda no decoder e processa linhas restantes no buffer
              sseBuffer += decoder.decode()
              const remainingLines = sseBuffer.split('\n')
              for (const line of remainingLines) {
                if (!line.startsWith('data: ')) continue
                const payload = line.slice(6).trim()
                if (!payload || payload === '[DONE]') continue
                try {
                  const parsed = JSON.parse(payload)
                  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
                  if (text != null) controller.enqueue(encoder.encode(text))
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
                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
                if (text != null) controller.enqueue(encoder.encode(text))
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

export const geminiModel = new GeminiModel()
