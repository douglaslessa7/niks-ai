// ─────────────────────────────────────────────────────────────────────────────
// "Palco" do Claude Design: as telas desenhadas num quadro de 393×852 são montadas
// com as coordenadas literais do design dentro de uma View desse tamanho, escalada
// por igual para caber na tela (min(W/393, H/852)) e centralizada. Usado pelas telas
// do fluxo do lote (55a–55j) e pelo tutorial da Rotina (54a/54b).
// ─────────────────────────────────────────────────────────────────────────────
import { useWindowDimensions } from 'react-native';

export const DESIGN_W = 393;
export const DESIGN_H = 852;

export function usePalco() {
  const { width: W, height: H } = useWindowDimensions();
  const s = Math.min(W / DESIGN_W, H / DESIGN_H);
  const ox = (W - DESIGN_W * s) / 2;   // canto do palco na tela
  const oy = (H - DESIGN_H * s) / 2;
  const style = {
    position: 'absolute' as const,
    left: (W - DESIGN_W) / 2, top: (H - DESIGN_H) / 2, width: DESIGN_W, height: DESIGN_H,
    transform: [{ scale: s }],
  };
  /** Retângulo do design → coordenadas da tela. */
  const naTela = (x: number, y: number, w: number, h: number) => ({ x: ox + x * s, y: oy + y * s, w: w * s, h: h * s });
  return { W, H, s, ox, oy, style, naTela };
}
