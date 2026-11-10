// Liga/desliga o "deslizar para voltar" NATIVO da tela da pilha (10/nov/2026).
// Use quando a tela abre algo por cima dela mesma (folha, carta, camada interna): com isso
// aberto, o gesto não pode tirar a tela inteira de baixo. Ver lib/navegar.ts.
import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

export function useGestoVoltar(ativo: boolean) {
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: ativo });
  }, [navigation, ativo]);
}
