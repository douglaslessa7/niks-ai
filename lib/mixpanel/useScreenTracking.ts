import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { useMixpanel } from './MixpanelProvider';

const SCREEN_NAMES: Record<string, string> = {
  // Onboarding flow (numeração do funil em components/onboarding/kit.tsx → OB_STEPS)
  '/': 'Tela Inicial',
  '/concerns': 'Preocupações de Pele',
  '/nome': 'Nome',
  '/prazer': 'Prazer (transição)',
  '/pregnancy': 'Gravidez',
  '/entendi': 'Entendi',
  '/goal-validation': 'Seu Potencial',
  '/skincare-routine': 'Rotina Atual',
  '/horario-rotina': 'Horário da Rotina',
  '/aviso-lembretes': 'Aviso de Lembretes',
  '/permitir-notificacoes': 'Pedido de Notificação',
  '/allergies': 'Alergias',
  '/allergies-detail': 'Detalhe da Alergia',
  '/goal-desire': 'Desejo Real',
  '/compromisso': 'Compromisso',
  '/apresentacao': 'Apresentação',
  '/birthday': 'Data de Nascimento',
  '/skin-type': 'Tipo de Pele',
  '/frequency': 'Frequência de Skincare',
  '/sun-exposure': 'Exposição Solar',
  '/hydration': 'Hidratação',
  '/sleep': 'Sono',
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
