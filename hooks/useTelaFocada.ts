import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

// As abas nunca desmontam (a Home fica viva por baixo de todas as telas, e algumas são
// pré-montadas): animação contínua só pode rodar com a tela à vista. Escondida, cada quadro
// dela reescreve a árvore de views e disputa a rolagem da tela que está aberta.
// Fora de uma tela (overlays da raiz): considera visível.
export function useTelaFocada(): boolean {
  const nav = useContext(NavigationContext);
  const [focada, setFocada] = useState(() => nav?.isFocused() ?? true);
  useEffect(() => {
    if (!nav) return;
    setFocada(nav.isFocused());
    const a = nav.addListener('focus', () => setFocada(true));
    const b = nav.addListener('blur', () => setFocada(false));
    return () => { a(); b(); };
  }, [nav]);
  return focada;
}
