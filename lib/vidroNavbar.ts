// Liquid Glass (iOS 26+) na navbar flutuante (10/nov/2026).
// O vidro só liga com as três condições juntas; em qualquer outro caso a navbar é a de antes:
//   • iOS com o Liquid Glass do sistema (iOS 26+) e a API do vidro presente no aparelho
//     (alguns betas do iOS 26 não têm — o `isGlassEffectAPIAvailable` evita o crash);
//   • "Reduzir transparência" DESLIGADO (Ajustes › Acessibilidade › Tela e tamanho do texto);
//   • a resposta dessa leitura já chegou (até lá, a navbar de antes — nunca pisca vidro).
// Desfazer: `VIDRO_NAVBAR = false` volta a navbar de antes em todo lugar.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

export const VIDRO_NAVBAR = true;

let disponivel: boolean | null = null;
function vidroNoAparelho(): boolean {
  if (!VIDRO_NAVBAR || Platform.OS !== 'ios') return false;
  if (disponivel === null) {
    // Lança se o binário não tiver o módulo nativo (build antigo + JS novo): então, sem vidro.
    try { disponivel = isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { disponivel = false; }
  }
  return disponivel;
}

/** `true` = desenhar a navbar de vidro. Acompanha o "Reduzir transparência" ao vivo. */
export function useVidroNavbar(): boolean {
  const [reduzir, setReduzir] = useState<boolean | null>(null);
  useEffect(() => {
    if (!vidroNoAparelho()) return;
    let vivo = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((v) => { if (vivo) setReduzir(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (v) => setReduzir(v));
    return () => { vivo = false; sub.remove(); };
  }, []);
  return vidroNoAparelho() && reduzir === false;
}
