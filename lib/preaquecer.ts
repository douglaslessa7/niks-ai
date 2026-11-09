// ─────────────────────────────────────────────────────────────────────────────
// Abertura do app (08/nov/2026): logo depois da home, traz o que as telas principais mostram.
// Só dados, sem montar telas escondidas.
// As telas caem em cima do mesmo cache; ao focar, cada uma confere o servidor em silêncio.
// ─────────────────────────────────────────────────────────────────────────────
import { writeCache } from './cache';
import { getUserId } from './currentUser';
import { preaquecerProdutos } from './produtosTela';
import { buscarColecao, chaveColecao, chaveEstado, estadoCartas } from './cartasServidor';
import { chaveMeusGrupos, chavePerfilGrupos, meusGrupos, perfilGrupos } from './gruposServidor';
import { mesKey } from '../components/grupos/CalendarioCheckins';
import { sessionDate } from './routineProgress';

export async function preaquecerApp(): Promise<void> {
  const uid = await getUserId();
  if (!uid) return;
  const mes = mesKey(sessionDate());
  await Promise.allSettled([
    preaquecerProdutos(),
    estadoCartas().then((d) => writeCache(chaveEstado(uid), d)),
    buscarColecao().then((d) => writeCache(chaveColecao(uid), d)),
    meusGrupos().then((d) => writeCache(chaveMeusGrupos(uid), d)),
    perfilGrupos(mes).then((d) => writeCache(chavePerfilGrupos(uid, mes), d)),
  ]);
}
