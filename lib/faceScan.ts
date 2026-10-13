// Leitura dos quadros do rastreador de rosto (`modules/niks-face-tracker`) para o scan
// do onboarding (`app/(scan)/camera.tsx`). Lógica PURA: recebe o quadro e o oval da
// tela, devolve "está bom para a foto?", "para onde a cabeça está apontando"
// e o nível do medidor de luz. (A forma do rosto para a malha fica em `lib/faceGrid.ts`.)
//
// ⚠️ Os limiares abaixo são o ponto de partida. Calibrar no iPhone com a linha de
// `__DEV__` da câmera (mostra estado, nariz, yaw, pitch e cima/baixo ao vivo).
import type { FaceFrame } from '../modules/niks-face-tracker';

const DEG = Math.PI / 180;

// ── Foto de frente ──────────────────────────────────────────────────────────
/** Distância elíptica máxima do centro do rosto ao centro do oval (1 = na borda). */
const FRONT_MAX_OFFSET = 0.35;
/** Largura da caixa do rosto ÷ largura do oval: abaixo = longe, acima = perto. */
const FRONT_MIN_SIZE = 0.5;
const FRONT_MAX_SIZE = 1.05;
/** Olhando para a câmera: nariz centrado e cabeça reta. */
const FRONT_MAX_NOSE = 0.07;
const FRONT_MAX_YAW = 12 * DEG;
const FRONT_MAX_PITCH = 15 * DEG;
const FRONT_MAX_ROLL = 15 * DEG;

// ── Giro da cabeça ──────────────────────────────────────────────────────────
/** No giro o rosto desloca: tolerância bem maior que na foto. */
const SIDE_MAX_OFFSET = 0.6;
/** Deslocamento do nariz que conta como "apontando todo para o lado". */
const NOSE_FULL = 0.14;
/** Inclinação (pitch do Vision) que conta como "apontando todo para cima/baixo". */
const PITCH_FULL = 18 * DEG;
/**
 * Sentido do pitch do Vision na tela: +1 = pitch positivo é cabeça para BAIXO.
 * ⚠️ Conferir no iPhone pela linha de `__DEV__` (mostra "cima"/"baixo"): se olhar
 * para cima aparecer "baixo", trocar para -1.
 */
const PITCH_SIGN = 1;

export type Oval = { cx: number; cy: number; rx: number; ry: number };
export type FrontState = 'none' | 'out' | 'far' | 'near' | 'look' | 'ok';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Caixa do rosto em pontos de tela. A prévia ocupa a tela inteira em "cover"
 * (`resizeAspectFill` no expo-camera): o quadro é ampliado até cobrir e o excesso
 * é cortado igualmente dos dois lados.
 */
export function toScreen(f: FaceFrame, width: number, height: number) {
  const scale = Math.max(width / f.imgW, height / f.imgH);
  const offX = (width - f.imgW * scale) / 2;
  const offY = (height - f.imgH * scale) / 2;
  const x = f.x ?? 0, y = f.y ?? 0, w = f.w ?? 0, h = f.h ?? 0;
  return {
    cx: offX + (x + w / 2) * f.imgW * scale,
    cy: offY + (y + h / 2) * f.imgH * scale,
    w: w * f.imgW * scale,
  };
}

function ovalOffset(f: FaceFrame, oval: Oval, width: number, height: number) {
  const s = toScreen(f, width, height);
  const d = Math.hypot((s.cx - oval.cx) / oval.rx, (s.cy - oval.cy) / oval.ry);
  return { d, size: s.w / (2 * oval.rx) };
}

/** A foto de frente pode sair? Se não, por quê (vira a instrução do card). */
export function frontState(f: FaceFrame | null, oval: Oval, width: number, height: number): FrontState {
  if (!f || !f.detected) return 'none';
  const { d, size } = ovalOffset(f, oval, width, height);
  if (d > FRONT_MAX_OFFSET) return 'out';
  if (size < FRONT_MIN_SIZE) return 'far';
  if (size > FRONT_MAX_SIZE) return 'near';
  const turned = f.nose != null ? Math.abs(f.nose) > FRONT_MAX_NOSE : Math.abs(f.yaw ?? 0) > FRONT_MAX_YAW;
  if (turned) return 'look';
  if (Math.abs(f.pitch ?? 0) > FRONT_MAX_PITCH || Math.abs(f.roll ?? 0) > FRONT_MAX_ROLL) return 'look';
  return 'ok';
}

/** Rosto presente e ainda dentro do oval (com a folga do giro)? */
export function inOvalForTurn(f: FaceFrame | null, oval: Oval, width: number, height: number) {
  if (!f || !f.detected) return false;
  return ovalOffset(f, oval, width, height).d <= SIDE_MAX_OFFSET;
}

/** Giro com sinal (-1 esquerda da tela … +1 direita), para a malha acompanhar a cabeça. */
export function signedTurn(f: FaceFrame | null): number {
  if (!f || !f.detected || f.nose == null) return 0;
  return Math.max(-1, Math.min(1, f.nose / NOSE_FULL));
}

/** Pose de referência: a da foto de frente (média do "segure"). O giro é medido a partir dela. */
export type HeadBase = { nose: number; pitch: number };

/**
 * Para onde a cabeça aponta, na tela, a partir da pose de referência: `dx` (-1
 * esquerda … +1 direita, pelo nariz) e `dy` (-1 cima … +1 baixo, pelo pitch). Sem
 * rosto ou sem nariz, `null`.
 */
export function headDirection(f: FaceFrame | null, base: HeadBase): { dx: number; dy: number } | null {
  if (!f || !f.detected || f.nose == null) return null;
  const dx = (f.nose - base.nose) / NOSE_FULL;
  const dy = f.pitch != null ? (PITCH_SIGN * (f.pitch - base.pitch)) / PITCH_FULL : 0;
  return { dx: Math.max(-1.5, Math.min(1.5, dx)), dy: Math.max(-1.5, Math.min(1.5, dy)) };
}

// ── Medidor de luz ──────────────────────────────────────────────────────────
// `light` = BrightnessValue (APEX) do EXIF de cada quadro: mede a luz da CENA. Quarto à
// noite com uma lâmpada ≈ -1…1; sala bem iluminada ≈ 2…4; perto de janela de dia ≈ 5+.
// ⚠️ Pontos de partida — calibrar no iPhone. Só AVISA: não trava a foto.
const LIGHT_DARK = 0;        // abaixo disto: "Escuro demais"
const LIGHT_PERFECT = 2.5;   // a partir disto: "Perfeito"
const LIGHT_HYST = 0.3;      // folga para o rótulo não ficar piscando na divisa

export type LightLevel = 'dark' | 'ok' | 'perfect';

/** Nível do medidor, com histerese a partir do nível anterior. */
export function lightLevel(bv: number, prev: LightLevel | null): LightLevel {
  const up = (limit: number, was: boolean) => bv >= limit - (was ? LIGHT_HYST : -LIGHT_HYST);
  if (up(LIGHT_PERFECT, prev === 'perfect')) return 'perfect';
  if (up(LIGHT_DARK, prev === 'ok' || prev === 'perfect')) return 'ok';
  return 'dark';
}

/** Quanto da pílula fica preenchida (0…1), contínuo com o brilho. */
export function lightFill(bv: number): number {
  return Math.max(0.28, Math.min(0.9, 0.28 + ((bv - (LIGHT_DARK - 1.5)) / (LIGHT_PERFECT + 2 - (LIGHT_DARK - 1.5))) * 0.62));
}
