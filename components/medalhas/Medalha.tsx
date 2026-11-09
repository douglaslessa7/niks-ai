// ─────────────────────────────────────────────────────────────────────────────
// A MEDALHA de um nível (design NiksMolduras, seção 3a "A rosa dentro da medalha"). `tamanho` =
// lado do quadrado (a medalha ocupa ~75% dele e as pétalas saem para os lados).
//
// São imagens de 720 px geradas do desenho de `lib/medalhas.ts`, não o SVG ao vivo: cada medalha
// em SVG criava centenas de elementos nativos e a rolagem da "Sua caminhada" sofria.
// ⚠️ Mudou o desenho em `lib/medalhas.ts`? Gere de novo as imagens de `assets/medalhas/`.
// ─────────────────────────────────────────────────────────────────────────────
import { memo } from 'react';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import type { StyleProp, ImageStyle } from 'react-native';
import { medalhaDoNivel } from '../../lib/niveis';

const IMAGENS: Record<string, number> = {
  'bronze:1': require('../../assets/medalhas/bronze-1.webp'),
  'bronze:2': require('../../assets/medalhas/bronze-2.webp'),
  'bronze:3': require('../../assets/medalhas/bronze-3.webp'),
  'prata:1': require('../../assets/medalhas/prata-1.webp'),
  'prata:2': require('../../assets/medalhas/prata-2.webp'),
  'prata:3': require('../../assets/medalhas/prata-3.webp'),
  'ouro:1': require('../../assets/medalhas/ouro-1.webp'),
  'ouro:2': require('../../assets/medalhas/ouro-2.webp'),
  'ouro:3': require('../../assets/medalhas/ouro-3.webp'),
  'diamante:1': require('../../assets/medalhas/diamante-1.webp'),
  'diamante:2': require('../../assets/medalhas/diamante-2.webp'),
  'diamante:3': require('../../assets/medalhas/diamante-3.webp'),
  'rosa:0': require('../../assets/medalhas/rosa-0.webp'),
};

const ImagemAnimada = Animated.createAnimatedComponent(Image);

// `estilo`: animação (opacidade, pulso) na própria imagem, sem camada em volta. Opacidade numa
// View com filhos faz o iOS redesenhar o grupo à parte em todo quadro da rolagem.
function Medalha({ nivel, tamanho, estilo }: { nivel: number; tamanho: number; estilo?: StyleProp<any> }) {
  const { material, etapa, nome } = medalhaDoNivel(nivel);
  return (
    <ImagemAnimada
      source={IMAGENS[`${material}:${etapa}`]}
      style={[{ width: tamanho, height: tamanho }, estilo] as StyleProp<ImageStyle>}
      contentFit="contain"
      transition={0}
      cachePolicy="memory"
      accessibilityLabel={`Medalha ${nome}`}
    />
  );
}

export default memo(Medalha);
