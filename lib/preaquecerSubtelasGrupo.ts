// ─────────────────────────────────────────────────────────────────────────────
// Ranking e Jornada do grupo prontos ANTES do toque (12/nov/2026, pedido do produto: "a
// primeira vez que abro o Ranking ou a Jornada depois de abrir o app, os primeiros segundos
// travam"). Na 1ª vez a tela abria sem dado: a lista chegava no meio da transição e tudo
// montava de uma vez, e as 13 medalhas (720 px) e as molduras eram decodificadas ali.
// Chamado ao abrir o grupo, uma vez por grupo por sessão (as telas revalidam ao abrir).
// ─────────────────────────────────────────────────────────────────────────────
import { Image as RNImage } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { writeCache, peekCache } from './cache';
import { getUserId } from './currentUser';
import { jornadaGrupo } from './gruposServidor';
import { IMAGENS_MEDALHA } from '../components/medalhas/Medalha';
import { IMAGENS_MOLDURA } from '../components/medalhas/FotoComMoldura';
import { carregar as carregarRanking } from '../app/(app)/grupo-ranking';

const feitos = new Set<string>();
let imagensProntas = false;

export function preaquecerSubtelasGrupo(gid: string) {
  if (!imagensProntas) {
    imagensProntas = true;
    const uris = [...IMAGENS_MEDALHA, ...IMAGENS_MOLDURA]
      .map((r) => RNImage.resolveAssetSource(r)?.uri)
      .filter((u): u is string => !!u);
    void ExpoImage.prefetch(uris, 'memory').catch(() => false);
  }
  if (!gid || feitos.has(gid)) return;
  feitos.add(gid);
  void (async () => {
    const uid = await getUserId();
    if (!uid) { feitos.delete(gid); return; }
    const kR = `grupos:ranking:${uid}:${gid}`;
    const kJ = `grupos:jornada:${uid}:${gid}`;
    await Promise.all([
      peekCache(kR) ? null : carregarRanking(gid).then((d) => writeCache(kR, d)),
      peekCache(kJ) ? null : jornadaGrupo(gid).then((d) => writeCache(kJ, d)),
    ]);
  })().catch(() => { feitos.delete(gid); });
}
