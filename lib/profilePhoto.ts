import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { haptics } from './haptics';
import { trackNativePresentation } from './nativePresentation';
import { useAppStore } from '../store/onboarding';

// Trocar a foto de perfil da usuária (a mesma foto da home, do "Seu progresso" e do
// Perfil — `users.foto_home_url`): galeria → tela de ajuste `(foto)/ajustar-foto`,
// onde ela enquadra a foto no círculo. Lógica da home antiga (versão B), agora usada
// pelo "Seu progresso" e pelo Perfil.
//
// `allowsEditing: false` de propósito — com `true` o iOS abre o "Move and scale"
// nativo, que recorta QUADRADO e não mostra o formato circular real. O enquadramento
// é nosso. A foto crua viaja pelo store (regra do projeto: nunca por router params).
export function usePickProfilePhoto() {
  const router = useRouter();
  const setHomePhotoDraft = useAppStore((s) => s.setHomePhotoDraft);
  return useCallback(async () => {
    haptics.tap();
    const result = await trackNativePresentation(() => ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1, // sem perda aqui; a compressão acontece depois do recorte
      exif: false,
    }));
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    setHomePhotoDraft({ uri: a.uri, width: a.width, height: a.height });
    router.push('/(foto)/ajustar-foto');
  }, [router, setHomePhotoDraft]);
}
