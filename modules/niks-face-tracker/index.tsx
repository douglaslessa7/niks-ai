import { forwardRef, type Ref } from 'react';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Platform, ViewProps } from 'react-native';

// ── Rastreador de rosto (iOS) ─────────────────────────────────────────────────
// Detecção de rosto AO VIVO (Apple Vision) na MESMA câmera que o `<CameraView>` da
// tela já está exibindo — e o fundo desfocado ao vivo, com o furo do oval. Usado
// pelo scan do onboarding, `app/(scan)/camera.tsx`; a lógica de "está no oval / para
// onde a cabeça aponta / encaixe da malha / luz" fica em `lib/faceScan.ts`. O porquê de
// ser nativo está no cabeçalho de `ios/NiksFaceTrackerView.swift`.
//
// ⚠️ `faceTrackerAvailable`: o módulo só existe depois de `pod install` + build novo.
// Sem ele (binário antigo, Android, OTA para versão antiga) a câmera cai no fluxo
// antigo, guiado por tempo — nunca quebra.

const nativeModule =
  Platform.OS === 'ios' ? requireOptionalNativeModule<{
    detectFaceInImage(uri: string): Promise<boolean>;
    faceLandmarksInImage?(uri: string): Promise<FacePhotoLandmarks | null>;
    detectAccessoryInImage?(uri: string, minConfidence: number): Promise<FaceAccessory | null>;
  }>('NiksFaceTracker') : null;

/** `true` só quando o módulo nativo está de fato dentro do binário em execução. */
export const faceTrackerAvailable = nativeModule != null;

/**
 * Um quadro analisado. Coordenadas de 0 a 1 no quadro da câmera, origem no topo à
 * esquerda, JÁ no sentido da tela (espelhado na frontal). Ângulos em radianos.
 * `nose`: centro do nariz menos o centro da caixa, em larguras da caixa — negativo =
 * virou para a esquerda da tela.
 */
export type FaceFrame = {
  detected: boolean;
  x?: number; y?: number; w?: number; h?: number;
  imgW: number; imgH: number;
  yaw?: number; pitch?: number; roll?: number;
  nose?: number;
  /** Pontos do rosto, em frações do quadro (origem no topo, sentido da tela). */
  eyes?: [number, number, number, number];   // os dois olhos, sem ordem de lado
  noseTip?: [number, number];
  mouth?: [number, number];
  chin?: [number, number];
  /** Linhas inteiras, achatadas `[x0, y0, x1, y1, …]` (mesmas frações). Vêm só no build
   *  com o módulo novo; sem elas a malha usa a caixa do rosto como contorno aproximado. */
  contour?: number[];        // bochecha → queixo → bochecha
  brow1?: number[];          // sobrancelhas, sem ordem de lado
  brow2?: number[];
  noseCrest?: number[];      // do alto do nariz até a ponta
  /** Brilho da cena (APEX `BrightnessValue` do EXIF). Vem mesmo sem rosto. */
  light?: number;
};

export type FaceTrackerProps = ViewProps & {
  onFace?: (e: { nativeEvent: FaceFrame }) => void;
  /** Furo do oval no fundo desfocado: `[x, y, largura, altura]` em pontos da tela. */
  hole?: number[];
  /** Escurecimento por cima do desfoque (0…1). */
  dim?: number;
};

/** Métodos da view (via `ref`). */
export type FaceTrackerHandle = {
  /** Foto do último quadro ao vivo: em pé, sem espelhar e SEM som de obturador. */
  takePhoto(): Promise<{ uri: string; width: number; height: number }>;
};

const NativeFaceTracker = faceTrackerAvailable
  ? requireNativeView<FaceTrackerProps & { ref?: Ref<FaceTrackerHandle> }>('NiksFaceTracker')
  : null;

/** Fundo desfocado da tela inteira (com o furo `hole`): monte por cima da `<CameraView>`. */
const FaceTracker = forwardRef<FaceTrackerHandle, FaceTrackerProps>(function FaceTracker(props, ref) {
  if (!NativeFaceTracker) return null;
  return <NativeFaceTracker {...props} ref={ref} />;
});
export default FaceTracker;

/** Pontos do rosto NA FOTO (frações, origem no topo à esquerda) — mesmo formato dos
 *  `face_landmarks` da `analyze-skin`. `eye_left` = olho mais à esquerda da imagem. */
export type FacePhotoLandmarks = Record<
  'eye_left' | 'eye_right' | 'nose_tip' | 'mouth_center' | 'chin' | 'forehead',
  { x: number; y: number }
>;

/** Pontos do rosto na foto, pela detecção do próprio iPhone (Vision). `null` sem rosto, sem
 *  o módulo ou em build anterior à função (out/2026) — aí vale o que a IA estimou. */
export async function faceLandmarksInImage(uri: string): Promise<FacePhotoLandmarks | null> {
  if (!nativeModule || typeof nativeModule.faceLandmarksInImage !== 'function') return null;
  try { return (await nativeModule.faceLandmarksInImage(uri)) ?? null; } catch { return null; }
}

/** Acessório que atrapalha o scan: óculos (grau ou sol), chapéu/boné/gorro/capacete, máscara. */
export type FaceAccessory = 'glasses' | 'hat' | 'mask';

/** Acessório no rosto da foto (classificador da Apple, no aparelho). `null` sem acessório,
 *  sem o módulo ou em build anterior à função (out/2026) — aí a foto segue normalmente. */
export async function detectAccessoryInImage(uri: string, minConfidence = 0.45): Promise<FaceAccessory | null> {
  if (!nativeModule || typeof nativeModule.detectAccessoryInImage !== 'function') return null;
  try { return (await nativeModule.detectAccessoryInImage(uri, minConfidence)) ?? null; } catch { return null; }
}

/** A foto já tirada tem rosto? Sem o módulo, `true` (não há como conferir). */
export async function detectFaceInImage(uri: string): Promise<boolean> {
  if (!nativeModule) return true;
  return nativeModule.detectFaceInImage(uri);
}

// ── Scan com o MediaPipe Face Landmarker ─────────────────────────────────────────
// A câmera do scan usa esta view no lugar de `<CameraView>` + `<FaceTracker>`: ela mesma
// mostra a câmera (comum — SEM ARKit e sem câmera de profundidade), desenha a MALHA 3D do
// rosto (molde do Lovi) pelos 478 pontos do Face Landmarker (Google), o fundo desfocado
// com o furo do oval, manda `onFace` no formato `FaceFrame` (coordenadas já em pontos da
// tela) e tira a foto (`takePhoto`). O porquê está em `ios/NiksFaceMPView.swift`.
// ⚠️ Só existe depois de `pod install` + build novo; sem ele (ou no Android)
// `faceMPAvailable` é `false` e a tela usa o Vision.

const mpModule =
  Platform.OS === 'ios' ? requireOptionalNativeModule<{ isSupported(): boolean }>('NiksFaceMP') : null;

/** `true` com o módulo no binário, câmera frontal e o modelo embarcado. */
export const faceMPAvailable = (() => {
  try { return !!mpModule?.isSupported(); } catch { return false; }
})();

export type FaceMPProps = ViewProps & {
  onFace?: (e: { nativeEvent: FaceFrame }) => void;
  /** A câmera começou a mandar quadros. */
  onReady?: () => void;
  /** Furo do oval no fundo desfocado: `[x, y, largura, altura]` em pontos da tela. */
  hole?: number[];
  /** Escurecimento por cima do desfoque (0…1). */
  dim?: number;
  /** Intensidade da malha em repouso / logo atrás da linha de scan (0…1). */
  meshBase?: number;
  meshPeak?: number;
};

/** Métodos da view (via `ref`). */
export type FaceMPHandle = {
  /** Foto de frente do quadro ao vivo: sem som, em pé, sem espelhar. */
  takePhoto(): Promise<{ uri: string; width: number; height: number }>;
};

const NativeFaceMP = faceMPAvailable
  ? requireNativeView<FaceMPProps & { ref?: Ref<FaceMPHandle> }>('NiksFaceMP')
  : null;

export const FaceMP = forwardRef<FaceMPHandle, FaceMPProps>(function FaceMP(props, ref) {
  if (!NativeFaceMP) return null;
  return <NativeFaceMP {...props} ref={ref} />;
});
