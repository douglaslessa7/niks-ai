// ─────────────────────────────────────────────────────────────────────────────
// Fotos que já aparecem prontas (12/nov/2026, pedido do produto: "a usuária tem que entrar na
// tela e já ver tudo carregado").
//  • `fonteEstavel(url)`: as fotos privadas (check-in, banner, produto) vêm com link ASSINADO,
//    que muda a cada leitura (outro `token`). Com o link como chave, o cache do expo-image nunca
//    reaproveitava a foto e baixava de novo a cada abertura. A chave passa a ser o caminho do
//    arquivo (o link sem a parte `?token=…`): baixou uma vez, aparece na hora nas próximas.
//  • `lembrarFotoLocal` / `fotoLocal`: a foto do check-in que ela ACABOU de publicar já está no
//    celular — o mural e o detalhe mostram o arquivo local, sem esperar o download.
//  • `preaquecerFotos`: baixa as fotos para o cache (com a mesma chave estável) antes da tela.
// ─────────────────────────────────────────────────────────────────────────────
import { Image as ExpoImage, type ImageSource } from 'expo-image';

/** O link sem a assinatura (`?token=…`): a chave do cache que não muda entre leituras. */
export function chaveEstavel(url: string): string {
  return url.split('?')[0];
}

export function fonteEstavel(url: string | null | undefined): ImageSource | undefined {
  if (!url) return undefined;
  return { uri: url, cacheKey: chaveEstavel(url) };
}

const locais = new Map<string, string>();

/** A foto local do check-in recém-publicado (por id do check-in). */
export function lembrarFotoLocal(checkinId: string, uri: string) {
  locais.set(checkinId, uri);
  if (locais.size > 30) locais.delete(locais.keys().next().value as string);
}

/** Fonte da foto de um check-in: o arquivo local, se ela acabou de publicar; senão o link estável. */
export function fonteDoCheckin(checkinId: string | null | undefined, url: string | null | undefined): ImageSource | undefined {
  const local = checkinId ? locais.get(checkinId) : undefined;
  return local ? { uri: local } : fonteEstavel(url);
}

/** Baixa para o cache (disco) com a chave estável, sem esperar mais que `limiteMs`. */
export function preaquecerFotos(urls: (string | null | undefined)[], limiteMs = 1500): Promise<void> {
  const lista = [...new Set(urls.filter((u): u is string => !!u))];
  if (!lista.length) return Promise.resolve();
  const todas = Promise.all(lista.map((u) => ExpoImage.loadAsync({ uri: u, cacheKey: chaveEstavel(u) }).catch(() => null)));
  return Promise.race([todas.then(() => undefined), new Promise<void>((r) => setTimeout(r, limiteMs))]);
}
