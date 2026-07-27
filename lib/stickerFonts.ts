// ── Fontes dos adesivos ───────────────────────────────────────────────────────
// UM mapa de fontes para os dois componentes de adesivo (círculo e card) e para as
// miniaturas da bandeja. Antes cada um chamava `useFonts` com sua própria lista, e
// as listas já estavam divergindo (o card precisa de Lato, o círculo não).
//
// PERFORMANCE — a bandeja monta ~14 adesivos, logo 14 chamadas deste hook. Não é
// problema: o `useFonts` do expo-font inicializa o state com `isMapLoaded(map)` de
// forma SÍNCRONA. Como a tela que hospeda a bandeja chama este mesmo hook no topo,
// todas as miniaturas já nascem com as fontes carregadas no primeiro render — sem
// flash de fonte de sistema e sem precisar de provider ou prop drilling.

import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { Exo2_700Bold } from '@expo-google-fonts/exo-2';
import { Lato_400Regular } from '@expo-google-fonts/lato';

export const STICKER_FONT_MAP = {
  Nunito_800ExtraBold,
  Nunito_600SemiBold,
  Exo2_700Bold,
  Lato_400Regular,
};

export type StickerFonts = {
  /** Nunito ExtraBold — "NIKS", "Niks score" */
  fXBold?: string;
  /** Nunito SemiBold — rótulos das métricas no círculo */
  fSemi?: string;
  /** Exo 2 Bold — todos os números */
  fExo?: string;
  /** Lato Regular — rótulos das métricas no card (igual à home) */
  fLato?: string;
};

/** `undefined` (não `''`) enquanto carrega: o RN cai na fonte do sistema sem piscar. */
export function useStickerFonts(): StickerFonts {
  const [loaded] = useFonts(STICKER_FONT_MAP);
  return {
    fXBold: loaded ? 'Nunito_800ExtraBold' : undefined,
    fSemi: loaded ? 'Nunito_600SemiBold' : undefined,
    fExo: loaded ? 'Exo2_700Bold' : undefined,
    fLato: loaded ? 'Lato_400Regular' : undefined,
  };
}
