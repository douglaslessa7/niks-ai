import { View, StyleSheet, ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Circle } from 'react-native-svg';
import FotoComMoldura from '../medalhas/FotoComMoldura';

const PINK = '#FF5EA8';

// Anel tracejado de quem ainda não fez hoje (`2px dashed rgba(129,129,129,.45)`).
// Em SVG porque borda `dashed` com raio não é confiável no Fabric.
function DashedRing({ size }: { size: number }) {
  const sw = 2;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const n = Math.round(c / (sw * 3));
  const seg = c / n;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(129,129,129,0.45)" strokeWidth={sw}
        strokeDasharray={[seg * 0.6, seg * 0.4]}
      />
    </Svg>
  );
}

// Avatar de integrante do grupo (designs 74/75): caixa com padding 2 + borda 2 —
// anel rosa (fez hoje) ou tracejado, com a foto apagada e meio cinza
// (`opacity:.5; filter:grayscale(.7)` — o grayscale é uma camada cinza em modo
// "saturation" a 70%, já que o filtro não existe no iOS).
// Com `nivel` (08/nov/2026): a foto ganha a MOLDURA da medalha atual dela (5 molduras, uma
// por material) no lugar do anel; quem ainda não fez hoje continua com a foto apagada e cinza.
// A moldura passa 8 pt da caixa de cada lado (a flor sai para fora), sem mudar o layout.
export default function Avatar({ img, uri, done, size, nivel, nome }: { nome?: string | null; img: ImageSourcePropType | null; uri: string | null; done: boolean; size: number; nivel?: number }) {
  if (nivel != null && !img) {
    const m = size + 16;
    return (
      <View style={{ width: size, height: size }}>
        <FotoComMoldura nivel={nivel} foto={uri} nome={nome} tamanho={m} pequena apagada={!done} vazio="#F6D3E1" style={{ position: 'absolute', left: -8, top: -8 }} />
      </View>
    );
  }
  const inner = size - 8;
  return (
    <View style={{ width: size, height: size, padding: 4, borderRadius: size / 2 }}>
      {done
        ? <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 2, borderColor: PINK }]} />
        : <DashedRing size={size} />}
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden', opacity: done ? 1 : 0.5, isolation: 'isolate', backgroundColor: '#F6D3E1' }}>
        {img ? (
          <ExpoImage source={img} style={{ width: inner, height: inner }} contentFit="cover" />
        ) : uri ? (
          <ExpoImage source={{ uri }} style={{ width: inner, height: inner }} contentFit="cover" />
        ) : null}
        {!done && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#808080', opacity: 0.7, mixBlendMode: 'saturation' }]} />}
      </View>
    </View>
  );
}
