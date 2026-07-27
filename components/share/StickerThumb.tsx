import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import NiksStickerView from '../NiksStickerView';
import { Metricas } from '../../lib/metricDefs';
import { StickerSpec, stickerAspect, stickerBaseUnits, specId } from '../../lib/stickerSpec';
import { haptics } from '../../lib/haptics';

// ── Miniatura de um adesivo na bandeja ────────────────────────────────────────
// ⚠️ NÃO renderiza o adesivo direto no tamanho da miniatura. Renderiza na largura de
// DESENHO canônica (130 no círculo, 312 no card) e reduz com `transform: scale`.
// Dois motivos: (1) o layout de texto acontece em corpo normal, sem arredondamento
// sub-pixel achatando rótulos de 9pt para ~4pt; (2) a miniatura fica pixel-fiel ao
// adesivo que ela vai receber de verdade — o que a usuária vê é o que ela leva.

const CORAL = '#FF9D9D';
const CARD_BD = '#E3E3E6';

type Props = {
  spec: StickerSpec;
  skinScore: number | null;
  metricas: Metricas;
  /** Largura da caixa da miniatura em pontos. A altura sai da proporção do adesivo. */
  boxW: number;
  selected?: boolean;
  /** Ausente = miniatura decorativa (o preview ao vivo da aba "Montar o meu"). */
  onPress?: () => void;
};

function StickerThumb({ spec, skinScore, metricas, boxW, selected = false, onPress }: Props) {
  const refW = stickerBaseUnits(spec);
  const aspect = stickerAspect(spec);
  const scale = boxW / refW;
  const boxH = boxW / aspect;

  const content = (
    <View style={{ width: boxW, height: boxH }}>
      {/* A caixa externa já tem o tamanho final; o conteúdo é desenhado grande e
          encolhido a partir do canto superior esquerdo. */}
      <View
        pointerEvents="none"
        style={{
          width: refW,
          height: refW / aspect,
          transform: [{ scale }],
          transformOrigin: 'top left',
        }}
      >
        <NiksStickerView spec={spec} skinScore={skinScore} metricas={metricas} width={refW} />
      </View>

      {/* Anel de seleção — View absoluta IRMÃ do conteúdo, nunca `overflow: hidden`
          no pai (que já bloqueou toque no New Architecture neste projeto). */}
      {selected && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -6, top: -6, right: -6, bottom: -6,
            borderWidth: 2, borderColor: CORAL, borderRadius: 16,
          }}
        />
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      accessibilityRole="button"
      onPress={() => { haptics.select(); onPress(); }}
      style={{ width: boxW, height: boxH }}
    >
      {content}
    </TouchableOpacity>
  );
}

// A aba "Montar o meu" re-renderiza a cada toque em chip; sem isto a grade inteira
// de 14 miniaturas redesenharia junto.
export default memo(
  StickerThumb,
  (a, b) =>
    specId(a.spec) === specId(b.spec) &&
    a.selected === b.selected &&
    a.boxW === b.boxW &&
    a.skinScore === b.skinScore &&
    a.metricas === b.metricas,
);

export { CORAL, CARD_BD };
