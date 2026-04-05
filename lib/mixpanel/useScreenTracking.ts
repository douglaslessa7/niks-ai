import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useMixpanel } from './MixpanelProvider';

const SCREEN_NAMES: Record<string, string> = {
  // Onboarding flow (steps 1–23)
  '/': 'Tela Inicial',
  '/concerns': 'Preocupações de Pele',
  '/gender': 'Gênero',
  '/birthday': 'Data de Nascimento',
  '/skin-type': 'Tipo de Pele',
  '/frequency': 'Frequência de Skincare',
  '/sun-exposure': 'Exposição Solar',
  '/hydration-sleep': 'Hidratação e Sono',
  '/sunscreen': 'Protetor Solar',
  '/social-proof': 'Social Proof',
  '/food-analysis': 'Alimentação e Pele',
  '/commitment': 'Compromisso',
  '/scan-prep': 'Análise com IA',
  '/camera': 'Scan - Câmera',
  '/loading': 'Analisando Pele',
  '/rate-us': 'Avalie Nos',
  '/results': 'Resultado do Scan',
  '/goal': 'Objetivo Principal',
  '/final-loading': 'Finalizando Protocolo',
  '/protocol-loading': 'Gerando Protocolo',
  '/trust': 'Obrigado por Confiar',
  '/plan-preview': 'Protocolo Pronto',
  '/signup': 'Criar Conta',
  '/paywall-detailed': 'Paywall',
  '/notifications': 'Notificações',
  '/login': 'Login',
  // App principal
  '/home': 'Home',
  '/protocolo': 'Protocolo',
  '/perfil': 'Perfil',
  '/analise': 'Análise',
  '/evolucao': 'Evolução',
  '/set-name': 'Definir Nome',
  '/skin-result': 'Resultado de Pele',
};

export function useScreenTracking() {
  const pathname = usePathname();
  const { track, isReady } = useMixpanel();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || pathname === lastTracked.current) return;
    lastTracked.current = pathname;

    track('Screen Viewed', {
      screen_name: SCREEN_NAMES[pathname] ?? pathname,
      pathname,
    });
  }, [pathname, isReady]);
}
