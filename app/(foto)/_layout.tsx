import { Stack } from 'expo-router';

// Grupo próprio (fora de `(app)`) de propósito: o `(app)/_layout.tsx` renderiza a
// GlobalBottomBar absoluta em todas as suas telas, e a navbar cobriria a tela de ajuste.
export default function FotoLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
