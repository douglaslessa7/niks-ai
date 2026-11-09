// Filtro automático das fotos dos grupos (Parte B, Fase 2): OpenAI `omni-moderation-latest`,
// gratuito. Em imagens, a OpenAI avalia sexual, violência e automutilação; `sexual/minors` é
// só para texto, então uma imagem com menor é pega pela categoria `sexual`.
// Se a OpenAI falhar, a foto NÃO é publicada.

const CATEGORIAS_BLOQUEADAS = ['sexual', 'violence/graphic', 'self-harm', 'self-harm/intent', 'self-harm/instructions']
const TETO_MS = 15000

export type ResultadoFiltro =
  | { liberada: true }
  | { liberada: false; motivo: 'filtro'; categoria: string }
  | { liberada: false; motivo: 'filtro_indisponivel'; categoria?: undefined }

const indisponivel: ResultadoFiltro = { liberada: false, motivo: 'filtro_indisponivel' }

/** `url`: endereço assinado ou `data:image/jpeg;base64,…`. Nunca lança. */
export async function moderarImagem(url: string): Promise<ResultadoFiltro> {
  try {
    const r = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY') ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: [{ type: 'image_url', image_url: { url } }] }),
      signal: AbortSignal.timeout(TETO_MS),
    })
    if (!r.ok) {
      console.error('[moderacao] OpenAI', r.status)
      return indisponivel
    }
    const categorias = (await r.json())?.results?.[0]?.categories
    if (!categorias || typeof categorias !== 'object') return indisponivel
    const categoria = CATEGORIAS_BLOQUEADAS.find((c) => categorias[c] === true)
    return categoria ? { liberada: false, motivo: 'filtro', categoria } : { liberada: true }
  } catch (e) {
    console.error('[moderacao]', (e as Error).message)
    return indisponivel
  }
}
