import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

// Ponto de entrada — SÓ decide o destino da abertura, sem UI própria. A splash de
// abertura (tela 0 do design "NIKS Onboarding - fluxo completo": logo #FF5EA8 no
// centro, `components/SplashOverlay.tsx`) fica por cima enquanto isso:
//   • com sessão → `/(app)/home` (o guard de assinatura/nome do `(app)/_layout` decide o resto);
//   • sem sessão → `/(onboarding)/ola` — a apresentação "Olá, eu sou a NIKS" (tela 0.1),
//     que segue sozinha para o nome.
//
// Quem avisa a splash que o destino está pronto é o próprio destino:
// `(onboarding)/_layout` (ola), `(app)/_layout` (home/captura de nome) ou `paywall-soft`.
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') return;
      // Usuária logada — delega a verificação de assinatura para (app)/_layout.tsx
      // (evita race condition: loginRevenueCat pode não ter completado ainda).
      router.replace(session ? '/(app)/home' : '/(onboarding)/ola');
    });
    return () => subscription.unsubscribe();
  }, []);

  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
}
