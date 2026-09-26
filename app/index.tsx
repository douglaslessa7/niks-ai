import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

// Ponto de entrada — SÓ decide o destino da abertura, sem UI própria (a splash de
// abertura, `components/SplashOverlay.tsx`, fica por cima enquanto isso):
//   • com sessão → `/(app)/home` (o guard de assinatura/nome do `(app)/_layout` decide o resto);
//   • sem sessão → `/(onboarding)/nome` — a TELA 2 é a primeira tela do app.
//
// ⚠️ O welcome antigo ("Bem-vinda ao NIKS" com vídeo) SAIU (set/2026). O link
// "Já tem conta? Entrar" mora agora na tela de nome — é o único caminho de login
// de quem já tem conta. Os slides 2–5 seguem no carrossel pós-cadastro
// (`(onboarding)/apresentacao.tsx`), intocados.
//
// Quem avisa a splash que o destino está pronto é o próprio destino:
// `(onboarding)/_layout` (nome), `(app)/_layout` (home/captura de nome) ou `paywall-soft`.
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') return;
      // Usuária logada — delega a verificação de assinatura para (app)/_layout.tsx
      // (evita race condition: loginRevenueCat pode não ter completado ainda).
      router.replace(session ? '/(app)/home' : '/(onboarding)/nome');
    });
    return () => subscription.unsubscribe();
  }, []);

  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
}
