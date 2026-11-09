import { Stack } from 'expo-router';

export default function ScanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* "Seu caminho" (depois da carta do onboarding) entra esmaecendo, como a tela do
          Tapfit em que ela se baseia, e não tem voltar (a carta também não tem). */}
      {/* "Calma, <nome>." (entre a carta e o "Seu caminho"): entra SEM animação — a carta já
          cobriu o próprio conteúdo com o mesmo rosa, então a troca não aparece. Sem voltar. */}
      <Stack.Screen name="solucao" options={{ animation: 'none', gestureEnabled: false }} />
      <Stack.Screen name="seu-caminho" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      {/* Transição da personalização (depois do "Seu caminho"): esmaece e não tem voltar. As
          perguntas (`pergunta`) usam o padrão do Stack, como as telas antigas de pergunta (a 1ª
          desliga o próprio gesto de voltar). */}
      <Stack.Screen name="personalizar" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      {/* Demonstração do scan de produto (depois da água): a transição rosa entra esmaecendo e
          não tem voltar; o scan entra SEM animação — a transição termina com o fundo dele. */}
      <Stack.Screen name="demo-transicao" options={{ animation: 'fade', animationDuration: 220, gestureEnabled: false }} />
      <Stack.Screen name="demo-scan" options={{ animation: 'none' }} />
    </Stack>
  );
}
