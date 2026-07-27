import { View, Image, Text } from 'react-native';

/**
 * Colagem do scan de pele multi-foto.
 *
 * FONTE ÚNICA DE LAYOUT — este componente é renderizado DUAS vezes com larguras
 * diferentes: pequeno na tela de revisão e grande (2048px) na view offscreen que o
 * `captureRef` exporta. É o que garante que a imagem enviada à IA seja exatamente o
 * que a usuária viu. Duas implementações separadas divergiriam em silêncio
 * (corolário da decisão 28 do README).
 *
 * Por isso TODA medida vem de `width` — nada em pontos fixos.
 *
 * - Layout A: grid 2×2, 1:1 → photos[0..3] (neutra, sorrindo, surpresa, brava)
 * - Layout B: 2 células lado a lado, 2:1 → photos[4..5] (perfil esq., perfil dir.)
 *
 * ⚠️ As linhas são explícitas com `flex: 1`, NUNCA `flexWrap` — um grid de proporção
 * fixa com folga zero quebra a linha por um sub-pixel no Fabric (decisão 29).
 */

export type ScanLayout = 'A' | 'B';

/** Índices de `photos` que cada layout consome, na ordem de leitura da colagem. */
export const LAYOUT_CELLS: Record<ScanLayout, number[]> = {
  A: [0, 1, 2, 3],
  B: [4, 5],
};

type Props = {
  layout: ScanLayout;
  /** Sempre o array completo de 6 — o componente fatia o que lhe interessa. */
  photos: (string | null)[];
  /** Largura em PONTOS. A altura é derivada (A = 1:1, B = 2:1). */
  width: number;
  /** Separador entre células, em pontos. Quem chama converte por fração. */
  gap: number;
  /** Disparado no `onLoad` de cada célula — usado para saber quando dá para capturar. */
  onCellLoad?: () => void;
  /** Rótulo curto sob cada célula (só na revisão; no export fica `undefined`). */
  cellLabels?: string[];
  /** Envolve cada célula — usado na revisão para tornar a célula tocável. */
  renderCellWrapper?: (cellIndex: number, children: React.ReactNode) => React.ReactNode;
};

export function scanCollageHeight(layout: ScanLayout, width: number) {
  return layout === 'A' ? width : width / 2;
}

export function ScanCollage({
  layout,
  photos,
  width,
  gap,
  onCellLoad,
  cellLabels,
  renderCellWrapper,
}: Props) {
  const height = scanCollageHeight(layout, width);
  // A: duas linhas de duas células · B: uma linha de duas células.
  const rows: number[][] = layout === 'A' ? [[0, 1], [2, 3]] : [[4, 5]];

  const cell = (index: number, col: number) => {
    const uri = photos[index] ?? null;
    const body = (
      <View style={{ flex: 1, backgroundColor: '#F3F3F4', overflow: 'hidden' }}>
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onLoad={onCellLoad}
          />
        ) : null}
        {cellLabels?.[index] ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingVertical: 4,
              paddingHorizontal: 6,
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: '#FFFFFF', fontSize: 10, textAlign: 'center' }}
            >
              {cellLabels[index]}
            </Text>
          </View>
        ) : null}
      </View>
    );

    return (
      <View key={index} style={{ flex: 1, marginLeft: col > 0 ? gap : 0 }}>
        {renderCellWrapper ? renderCellWrapper(index, body) : body}
      </View>
    );
  };

  return (
    // Fundo branco: é o que aparece nos gaps entre as células.
    <View style={{ width, height, backgroundColor: '#FFFFFF' }}>
      {rows.map((row, r) => (
        <View
          key={r}
          style={{ flex: 1, flexDirection: 'row', marginTop: r > 0 ? gap : 0 }}
        >
          {row.map((index, col) => cell(index, col))}
        </View>
      ))}
    </View>
  );
}
