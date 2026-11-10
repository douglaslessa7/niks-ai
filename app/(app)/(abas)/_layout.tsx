// As 6 telas principais (10/nov/2026): ABAS, sem animação na troca. A barra de abas do
// sistema fica escondida — a navbar é a `GlobalBottomBar` do layout de `(app)`, por cima.
// As telas secundárias NÃO moram aqui: são telas da pilha nativa de `(app)/_layout.tsx`,
// que dá o "deslizar para voltar" do iOS. Os endereços não mudam (`(abas)` é só um grupo).
import { Tabs } from 'expo-router';

export default function AbasLayout() {
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
