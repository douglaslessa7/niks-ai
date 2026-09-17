// Quantos controladores NATIVOS apresentados pelo app estão abertos agora
// (seletor de fotos, câmera do ImagePicker). O JS não consegue perguntar isso ao
// iOS nem fechá-los (o expo-image-picker não expõe "dismiss"), então quem abre
// registra aqui.
//
// Consumido pelo "Compartilhar com o NIKS": o (app)/_layout espera o seletor
// fechar antes de empilhar a share-product-loading. Com o seletor por cima, a tela
// abria escondida atrás dele e o consentimento de IA não conseguia aparecer.

let openCount = 0;
const listeners = new Set<() => void>();

export function isNativePresentationOpen(): boolean {
  return openCount > 0;
}

/** Envolve a chamada que abre o controlador nativo (ex.: `launchImageLibraryAsync`). */
export async function trackNativePresentation<T>(open: () => Promise<T>): Promise<T> {
  openCount += 1;
  try {
    return await open();
  } finally {
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) listeners.forEach((listener) => listener());
  }
}

/** Resolve quando nenhum controlador nativo registrado estiver aberto. */
export function waitForNativePresentationToClose(): Promise<void> {
  if (openCount === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const listener = () => {
      listeners.delete(listener);
      resolve();
    };
    listeners.add(listener);
  });
}
