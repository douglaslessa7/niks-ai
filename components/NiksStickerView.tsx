import NiksSticker from './NiksSticker';
import NiksStickerCard from './NiksStickerCard';
import { Metricas } from '../lib/metricDefs';
import { StickerSpec, stickerShape, resolveMetrics } from '../lib/stickerSpec';

// ── Despachante do adesivo ────────────────────────────────────────────────────
// A partir daqui NENHUMA tela importa `NiksSticker`/`NiksStickerCard` direto: elas
// entregam um `StickerSpec` + os dados, e este componente escolhe a forma pela regra
// única (`stickerShape`). É o que mantém a forma desenhada em sincronia com a
// proporção que o `clampPose` de share-preview usou para prender o adesivo.
//
// A altura NÃO é prop: sai de `width / stickerAspect(spec)` dentro de cada forma.

type Props = {
  spec: StickerSpec;
  skinScore: number | null;
  metricas: Metricas;
  /** Largura em pontos. Para o círculo é o diâmetro. */
  width: number;
};

export default function NiksStickerView({ spec, skinScore, metricas, width }: Props) {
  if (stickerShape(spec) === 'circle') {
    // Métrica ISOLADA (sem score, 1 métrica): rótulo COMPLETO ("Qualidade da pele"),
    // como o "Niks score" — o rótulo-manchete é largo e centrado, cabe o nome inteiro.
    // Nos demais círculos o rótulo é CURTO: a corda estreita reticencia nomes longos.
    const solo = !spec.showScore && spec.keys.length === 1;
    return (
      <NiksSticker
        skinScore={skinScore}
        metrics={resolveMetrics(spec, metricas, !solo)}
        showScore={spec.showScore}
        size={width}
      />
    );
  }
  return (
    <NiksStickerCard
      skinScore={skinScore}
      // Rótulos da HOME: o card é a réplica dela, tem largura para os nomes completos.
      metrics={resolveMetrics(spec, metricas, false)}
      showScore={spec.showScore}
      width={width}
    />
  );
}
