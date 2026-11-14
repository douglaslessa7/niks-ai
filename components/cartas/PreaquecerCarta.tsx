// Aquece a carta do onboarding ANTES de ela abrir (12/nov/2026, "travamento ao entrar na
// carta"). O 1º desenho do Skia no app trava ~1 s (README, `PreaquecerVeu` do tutorial), e a
// carta do onboarding é o 1º lugar com Skia: a camada de raspar (Picture + traço com
// `blendMode="clear"` dentro de uma camada com desfoque) e as partículas. Montada escondida
// (2 × 2 pt, opacidade 0,01) na tela "Analisando", que já espera alguns segundos: quando a
// carta abre, o Skia e as imagens da carta já estão prontos.
import { StyleSheet, View } from 'react-native';
import { Blur, Canvas, Circle, Group, Paint, Path, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import Carta from './Carta';

const PIC = createPicture((cv) => {
  const p = Skia.Paint();
  p.setColor(Skia.Color('#FF5EA8'));
  cv.drawCircle(1, 1, 1, p);
}, Skia.XYWHRect(0, 0, 2, 2));
const TRACO = Skia.Path.Make();
TRACO.moveTo(0, 0); TRACO.lineTo(2, 2);

export default function PreaquecerCarta() {
  return (
    <View style={styles.aquecer} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Group layer={<Paint opacity={1}><Blur blur={1} /></Paint>}>
          <Picture picture={PIC} />
          <Path path={TRACO} style="stroke" strokeWidth={2} color="black" blendMode="clear" />
        </Group>
        <Circle cx={1} cy={1} r={1} color="#FFFFFF" />
      </Canvas>
      {/* As faces da carta (imagens, degradês e textos) já decodificadas. */}
      <View style={styles.carta}>
        <Carta v={{ k: 'verso' }} w={252} h={360} semSombra parado />
        <Carta v={{ k: 'pontoForte', numero: 30, problema: 'manchas' }} w={252} h={360} semSombra faiscasFora={false} parado />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aquecer: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, opacity: 0.01, overflow: 'hidden' },
  carta: { position: 'absolute', left: 0, top: 0 },
});
