import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { Skia, ImageFormat } from '@shopify/react-native-skia';
import type { PendingShare } from '../store/onboarding';

// Helpers da feature "Compartilhar com o NIKS" (Share Extension iOS).

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

type ShareIntentLike = {
  text?: string | null;
  webUrl?: string | null;
  files?: Array<{ path: string | null; mimeType: string | null }> | null;
  meta?: Record<string, string | undefined> | null;
};

/**
 * Foto que o preprocessor da extensão leu no Safari. `niks:image` é a nossa
 * (JSON-LD Product → og:image → imagem principal da Amazon, já absoluta);
 * as metatags cruas ficam de reserva. Só https (ATS do app bloqueia http).
 */
function pageImageFromMeta(meta: ShareIntentLike['meta'], pageUrl: string): string | null {
  const raw = meta?.['niks:image'] ?? meta?.['og:image:secure_url'] ?? meta?.['og:image'] ?? meta?.['twitter:image'];
  if (!raw) return null;
  try {
    const url = new URL(raw, pageUrl);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * O link compartilhado JÁ É uma imagem? Acontece quando a usuária compartilha a
 * foto (toque longo → "Compartilhar imagem") ou quando o Safari está exibindo o
 * arquivo em si — a galeria do Shopify, por exemplo, abre a imagem numa URL
 * própria. Nesse caso não há página para raspar: baixa e analisa.
 */
export function isDirectImageUrl(url: string): boolean {
  try {
    return /\.(jpe?g|png|webp)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function firstUrlFromText(text: string | null | undefined): string | null {
  const match = text?.match(/https?:\/\/[^\s<>"']+/i);
  // Remove pontuação colada no fim ("…confira: https://x.com/p." → sem o ponto).
  return match ? match[0].replace(/[).,;!?]+$/, '') : null;
}

/**
 * Converte o conteúdo cru do `expo-share-intent` no formato do store.
 * Imagem tem precedência sobre link (a foto já está pronta, sem scraping);
 * `webUrl` tem precedência sobre URL achada no texto.
 */
export function normalizeShareIntent(intent: ShareIntentLike): PendingShare | null {
  const id = `share_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const image = intent.files?.find((f) => f.path && (f.mimeType ?? '').startsWith('image/'));
  if (image?.path) {
    return { id, kind: 'image', imageUri: image.path, mimeType: image.mimeType };
  }
  const url = intent.webUrl ?? firstUrlFromText(intent.text);
  if (url && isDirectImageUrl(url)) {
    return { id, kind: 'image_url', imageUrl: url, title: intent.meta?.title?.trim() || null };
  }
  if (url) {
    return {
      id,
      kind: 'url',
      sourceUrl: url,
      title: intent.meta?.title?.trim() || null,
      pageImageUrl: pageImageFromMeta(intent.meta, url),
    };
  }
  return null;
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const SQUARE_SIZE = 512;
const SQUARE_MARGIN = 0.08; // 8% de respiro em volta do produto

/**
 * Normaliza a foto do share para um QUADRADO 512×512 com fundo branco, com o
 * produto inteiro centralizado e ~8% de margem.
 *
 * Por que existe: as fotos de loja costumam ser bem verticais (a do Mercado Livre
 * veio 316×1200). O círculo da tela de resultado usa `cover`, então uma vertical
 * sai cortada no meio do frasco. Quadrado + fundo branco entra inteiro no círculo,
 * e como a `analisar-produto` salva a `images[0]` no bucket, o histórico fica igual.
 *
 * ⚠️ Feito com Skia fora da tela, e NÃO com o `extent` do ImageManipulator — esse
 * action é `@platform web` e não faz nada no iOS.
 *
 * Só o fluxo do share usa. A câmera continua com o tratamento dela (já é quadrada,
 * enquadrada pela usuária).
 */
async function toSquareWhiteJpegBase64(uri: string): Promise<string | null> {
  try {
    const data = await Skia.Data.fromURI(uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) return null;

    const surface = Skia.Surface.MakeOffscreen(SQUARE_SIZE, SQUARE_SIZE);
    if (!surface) return null;

    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('white'));

    const srcW = image.width();
    const srcH = image.height();
    const maxSide = SQUARE_SIZE * (1 - 2 * SQUARE_MARGIN);
    const scale = Math.min(maxSide / srcW, maxSide / srcH);
    const destW = srcW * scale;
    const destH = srcH * scale;

    canvas.drawImageRect(
      image,
      Skia.XYWHRect(0, 0, srcW, srcH),
      Skia.XYWHRect((SQUARE_SIZE - destW) / 2, (SQUARE_SIZE - destH) / 2, destW, destH),
      Skia.Paint(),
    );

    const snapshot = surface.makeImageSnapshot();
    return snapshot.encodeToBase64(ImageFormat.JPEG, 80);
  } catch (err) {
    console.warn('[share] normalização para quadrado falhou, usando a foto original:', err);
    return null;
  }
}

/**
 * Trata a foto do share: normaliza para quadrado 512×512 com fundo branco. Se o
 * Skia falhar, cai no mesmo tratamento da câmera (512px, JPEG 0.5) — melhor uma
 * foto que corta no círculo do que nenhuma análise.
 */
export async function prepareProductImage(uri: string): Promise<string> {
  const square = await toSquareWhiteJpegBase64(uri);
  if (square) return square;

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: SQUARE_SIZE } }],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!result.base64) throw new Error('Não foi possível processar a imagem');
  return result.base64;
}

/** A imagem vinda do link chega em base64: grava em cache e passa pelo mesmo downscale. */
export async function prepareProductImageFromBase64(base64: string, mimeType: string): Promise<string> {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const file = new File(Paths.cache, `share-product-${Date.now()}.${ext}`);
  try {
    file.write(base64, { encoding: 'base64' });
    return await prepareProductImage(file.uri);
  } finally {
    try { file.delete(); } catch { /* arquivo temporário — ignora */ }
  }
}

/**
 * Baixa a foto lida no Safari e aplica o mesmo downscale da câmera. Lança em
 * qualquer falha (rede, não é imagem) — quem chama cai para a Edge Function.
 */
export async function prepareProductImageFromUrl(url: string): Promise<string> {
  const file = await File.downloadFileAsync(url, new File(Paths.cache, `share-page-${Date.now()}`));
  try {
    return await prepareProductImage(file.uri);
  } finally {
    try { file.delete(); } catch { /* arquivo temporário — ignora */ }
  }
}

export type ExtractResult =
  | { status: 'ok'; imageBase64: string; mimeType: string; titulo: string | null }
  | { status: 'sem_imagem'; titulo: string | null; motivo?: string };

/** Chama a Edge Function `extrair-imagem-produto` (fetch direto, nunca `functions.invoke`). */
export async function extractProductImage(sourceUrl: string, accessToken: string): Promise<ExtractResult> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/extrair-imagem-produto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sourceUrl }),
  });
  // URL que a função recusou (ex.: não é http/https) → mesmo desfecho de "sem imagem".
  if (response.status === 400) return { status: 'sem_imagem', titulo: null, motivo: 'url_invalida' };
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`extrair-imagem-produto HTTP ${response.status} ${body.slice(0, 120)}`);
  }
  return response.json();
}
