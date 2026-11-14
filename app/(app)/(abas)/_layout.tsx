// As 6 telas principais (10/nov/2026): ABAS, sem animação na troca. A barra de abas do
// sistema fica escondida — a navbar é a `GlobalBottomBar` do layout de `(app)`, por cima.
// As telas secundárias NÃO moram aqui: são telas da pilha nativa de `(app)/_layout.tsx`,
// que dá o "deslizar para voltar" do iOS. Os endereços não mudam (`(abas)` é só um grupo).
//
// Abas pré-carregadas (12/nov/2026, pedido do produto: "a 1ª vez que abro Rotina ou Produtos
// demora"). As abas montam só no 1º toque — e Produtos (estante) e Rotina são telas grandes.
// Depois que a home assenta, cada aba é montada por trás (`router.prefetch` = `preload` do
// React Navigation), UMA de cada vez e com folga entre elas, para não pesar a home. No toque a
// tela já está pronta. Pré-carregada não está focada: o que é pago ou depende de foco (geração
// das recomendações, recortes, tutoriais, `useFocusEffect`) continua esperando a abertura real.
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { Tabs, router } from 'expo-router';

const ORDEM_PRECARGA = ['/recomendacao-produtos', '/protocolo', '/grupos', '/perfil', '/niks-chat'] as const;
const ESPERA_HOME_MS = 2500; // a home monta, carrega e faz a entrada primeiro
const ENTRE_ABAS_MS = 700;

export default function AbasLayout() {
  useEffect(() => {
    let vivo = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const proxima = (i: number) => {
      if (!vivo || i >= ORDEM_PRECARGA.length) return;
      // Só quando a thread estiver livre (sem animação/gesto em andamento).
      InteractionManager.runAfterInteractions(() => {
        if (!vivo) return;
        try { router.prefetch(ORDEM_PRECARGA[i] as any); } catch { /* sem pré-carga: abre como antes */ }
        timers.push(setTimeout(() => proxima(i + 1), ENTRE_ABAS_MS));
      });
    };
    timers.push(setTimeout(() => proxima(0), ESPERA_HOME_MS));
    return () => { vivo = false; timers.forEach(clearTimeout); };
  }, []);

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="recomendacao-produtos" />
      <Tabs.Screen name="protocolo" />
      <Tabs.Screen name="niks-chat" />
      <Tabs.Screen name="perfil" />
      <Tabs.Screen name="grupos" />
    </Tabs>
  );
}
