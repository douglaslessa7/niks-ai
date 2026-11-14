// ─────────────────────────────────────────────────────────────────────────────
// Abertura do app (08/nov/2026): logo depois da home, traz o que as telas principais mostram.
// Só dados, sem montar telas escondidas.
// As telas caem em cima do mesmo cache; ao focar, cada uma confere o servidor em silêncio.
// ─────────────────────────────────────────────────────────────────────────────
import { Image as ExpoImage } from 'expo-image';
import { preaquecerFotos } from './fotosRapidas';
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
    // A foto de perfil (a mesma da home e do Perfil) vai para o cache do expo-image já aqui:
    // na 1ª entrada da aba Grupos ela sai do disco, sem esperar a rede (12/nov/2026).
    perfilGrupos(mes).then((d) => {
      if (d?.foto) void ExpoImage.prefetch(d.foto, 'memory-disk').catch(() => false);
      // E as fotos do calendário do mês (aba Grupos), pela chave estável (lib/fotosRapidas):
      // na entrada na aba elas já saem do cache (12/nov/2026).
      void preaquecerFotos((d?.dias ?? []).map((x) => x.foto_url), 8000);
      return writeCache(chavePerfilGrupos(uid, mes), d);
    }),
  ]);
}
