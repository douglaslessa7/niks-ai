// Ícone da categoria do passo SEM produto (no lugar do quadrado tracejado com "+"):
// um desenho em traço próprio e reconhecível por categoria (lib/tipoPasso).
import Svg, { Path } from 'react-native-svg';
import type { TipoPasso } from '../../lib/tipoPasso';

const PINK_TEXT = '#E8468F';

const ICONE_TIPO: Record<TipoPasso | 'generico', string> = {
  // Frasco com válvula pump.
  limpeza: 'M10 3h4M12 3v3M13 4.5h3M8.5 9a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z',
  // Garrafinha com tampa reta e ombro.
  tonico: 'M10 2.5h4v3h-4zM9.5 5.5h5L16 8.5V19a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8.5zM8 12h8',
  // Frasco conta-gotas: bulbo de borracha, anel e vidro com uma gota.
  serum: 'M10.5 5.5V4a1.5 1.5 0 0 1 3 0v1.5M9.5 5.5h5V8h-5zM10 8h4a2.5 2.5 0 0 1 2.5 2.5V19a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-8.5A2.5 2.5 0 0 1 10 8zM12 13.2c-.9 1.2-1.4 2-1.4 2.6a1.4 1.4 0 0 0 2.8 0c0-.6-.5-1.4-1.4-2.6z',
  // Pote de creme aberto, com o creme em cúpula por cima.
  hidratante: 'M7 9.5c0-2.8 2.2-5 5-5s5 2.2 5 5M10.5 6.5c.5-.4 1-.6 1.5-.6M4 9.5h16V12H4zM5 12h14v5.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5z',
  // Sol.
  protetor: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  // Olho.
  olhos: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  // Brilho (passo sem categoria).
  generico: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
};

export default function StepIcon({ tipo, size, color = PINK_TEXT }: { tipo: TipoPasso | null; size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={ICONE_TIPO[tipo ?? 'generico']} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
