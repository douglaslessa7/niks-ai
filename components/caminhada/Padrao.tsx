// Padrão de logos das cartas da caminhada — o `background-image: url(score-logo-pink)`
// com `background-size: 16px; background-repeat: space` do design (68). "space" = o
// máximo de logos inteiros, com a sobra distribuída entre eles (sem cortar nas bordas).
import { useMemo } from 'react';
import { Canvas, Image as SkImage, useImage } from '@shopify/react-native-skia';

const LOGO = require('../../assets/home/score-logo-pink.png');

export default function Padrao({ w, h, tile, opacity }: { w: number; h: number; tile: number; opacity: number }) {
  const img = useImage(LOGO);
  const pos = useMemo(() => {
    const cols = Math.max(1, Math.floor(w / tile));
    const rows = Math.max(1, Math.floor(h / tile));
    const gx = cols > 1 ? (w - cols * tile) / (cols - 1) : 0;
    const gy = rows > 1 ? (h - rows * tile) / (rows - 1) : 0;
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: c * (tile + gx), y: r * (tile + gy) });
    return out;
  }, [w, h, tile]);
  if (!img) return null;
  return (
    <Canvas style={{ width: w, height: h, opacity }} pointerEvents="none">
      {pos.map((p, i) => (
        <SkImage key={i} image={img} x={p.x} y={p.y} width={tile} height={tile} fit="contain" />
      ))}
    </Canvas>
  );
}
