import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Platform, ViewProps } from 'react-native';

// ── Espelho da câmera (iOS) ───────────────────────────────────────────────────
// Fundo AO VIVO, ampliado e borrado, da MESMA câmera que o `<CameraView>` da tela já
// está exibindo. Usado pelas células vazias da grade em `app/(share)/share-capture.tsx`.
// O porquê de ser nativo está no cabeçalho de `ios/NiksCameraMirrorView.swift`.
//
// ⚠️ `cameraMirrorAvailable` NÃO é preciosismo. O módulo é NATIVO: ele só existe depois
// de um `pod install` + build novo. Sem esta checagem, o app QUEBRARIA para quem
// estivesse rodando o binário antigo com o JS novo. Com ela, a tela simplesmente cai no
// visual anterior (células escuras) até o build sair.

const nativeModule =
  Platform.OS === 'ios' ? requireOptionalNativeModule('NiksCameraMirror') : null;

/** `true` só quando o módulo nativo está de fato dentro do binário em execução. */
export const cameraMirrorAvailable = nativeModule != null;

export type CameraMirrorProps = ViewProps & {
  /** Escurecimento por cima do blur (0…1). Calibrável sem build novo. */
  dim?: number;
};

const NativeCameraMirror = cameraMirrorAvailable
  ? requireNativeView<CameraMirrorProps>('NiksCameraMirror')
  : null;

export default function CameraMirror(props: CameraMirrorProps) {
  if (!NativeCameraMirror) return null;
  return <NativeCameraMirror {...props} />;
}
