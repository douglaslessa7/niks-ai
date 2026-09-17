import { View } from 'react-native';
import { CollageGrid, cellRects } from '../../lib/collageGrid';

// ── Glifo de uma grade de colagem ─────────────────────────────────────────────
// Retângulo arredondado com as divisórias internas, como os ícones da bandeja de
// layout do Instagram. Desenhado com Views (não é um asset nem um ícone do lucide)
// porque o conjunto de grades é NOSSO: qualquer grade nova em `COLLAGE_GRIDS` ganha
// o ícone certo de graça, sem ninguém ter de exportar um SVG novo.
//
// As divisórias saem do MESMO `cellRects` que a tela de captura e a colagem usam —
// o ícone não pode desenhar uma grade diferente da que a grade realmente produz.

type Props = {
  grid: CollageGrid;
  /** Largura do glifo. A altura vem da proporção 9:16 da colagem. */
  width: number;
  color: string;
  /** Espessura do traço (contorno e divisórias). */
  stroke?: number;
};

export default function GridIcon({ grid, width, color, stroke = 1.5 }: Props) {
  const height = (width * 16) / 9;
  // Caixa INTERNA: o contorno é `borderWidth`, então as divisórias vivem no espaço
  // que sobra dentro dele. A goteira do glifo é a própria espessura do traço.
  const w = width - stroke * 2;
  const h = height - stroke * 2;
  const rects = cellRects(grid, w, h, stroke);

  return (
    <View
      style={{
        width, height,
        borderWidth: stroke, borderColor: color,
        borderRadius: Math.max(2, width * 0.16),
      }}
    >
      {rects.map((r, i) => (
        <View key={i}>
          {/* Divisória VERTICAL à esquerda da célula (só quando ela não encosta na
              borda) — alta só o quanto a linha dela ocupa, como no Instagram. */}
          {r.left > 0 && (
            <View
              style={{
                position: 'absolute',
                left: r.left - stroke, top: r.top,
                width: stroke, height: r.height,
                backgroundColor: color,
              }}
            />
          )}
          {/* Divisória HORIZONTAL acima da célula. Células da mesma linha desenham a
              mesma linha duas vezes — sobreposição exata, sem efeito visual. */}
          {r.top > 0 && (
            <View
              style={{
                position: 'absolute',
                left: 0, top: r.top - stroke,
                width: w, height: stroke,
                backgroundColor: color,
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}
