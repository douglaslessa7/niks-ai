import { Stack } from 'expo-router';

// Grupo próprio, aberto como modal transparente pelo layout raiz: a carta de raspar fica
// por cima do app (que aparece desfocado atrás) e a própria tela faz a animação de entrada.
export default function CartaLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'none', gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } }} />;
}
