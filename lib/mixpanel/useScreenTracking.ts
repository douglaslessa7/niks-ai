import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useGlobalSearchParams, usePathname } from 'expo-router';
import { useMixpanel } from './MixpanelProvider';

// `Screen Viewed`: nome legível de cada rota (o `pathname` do Expo Router, sem os grupos).
// Rota fora da lista vai com o próprio pathname. Mantenha a lista igual às telas de app/ —
// rota nova entra aqui; rota apagada sai. Nomes antigos de rotas que continuam existindo
// NÃO mudaram (o histórico do Mixpanel agrupa por `screen_name`).
const SCREEN_NAMES: Record<string, string> = {
  // Entrada
  '/': 'Tela Inicial',
  '/atualize': 'Atualize o App',

  // Onboarding — caminho atual (numeração em components/onboarding/kit.tsx → OB_STEPS)
  '/abertura': 'Abertura',
  '/nome': 'Nome',
  '/goal-desire': 'Desejo Real',
  '/transformacao': 'Transformação Real',
  '/evolucao': 'Sua Evolução (onboarding)',
  '/birthday': 'Data de Nascimento',
  '/concerns': 'Preocupações de Pele',
  '/mapa-rosto': 'Mapa do Rosto',
  '/scan-prep': 'Análise com IA',
  '/camera': 'Scan - Câmera',
  '/analisando-foto': 'Analisando Foto',
  '/carta': 'Carta',
  '/solucao': 'Calma (solução)',
  '/seu-caminho': 'Seu Caminho',
  '/personalizar': 'Personalizar (transição)',
  '/pergunta': 'Pergunta da Personalização',
  '/demo-transicao': 'Demo Produto (transição)',
  '/demo-scan': 'Demo Scan de Produto',
  '/horario': 'Horário da Rotina (manhã → noite)',
  '/notifications': 'Notificações',
  '/comunidade': 'Comunidade',
  '/rotina-pronta-v2': 'Rotina Pronta v2',
  '/paywall-soft': 'Paywall',
  '/promo-cupom': 'Cupom',
  '/signup': 'Criar Conta',
  '/login': 'Login',
  '/loading-rotina': 'Criando Rotina (espera)',
  '/codigo-grupo': 'Código do Grupo',
  '/conta-sem-onboarding': 'Conta sem Onboarding',
  '/sem-grupo': 'Sem Grupo',
  '/bv-entrou': 'Boas-vindas 1 · Entrou',
  '/bv-rotina': 'Boas-vindas 2 · Rotina',
  '/bv-foto': 'Boas-vindas 3 · Foto',
  '/bv-projecao': 'Boas-vindas 4 · Projeção',
  '/bv-pacto': 'Boas-vindas 5 · Pacto',
  '/bv-recompensa': 'Boas-vindas 6 · Recompensa',
  '/bv-sequencia': 'Boas-vindas 7 · Sequência',
  '/bv-nivel': 'Boas-vindas 8 · Nível',
  // Pós-compra v2 (26/nov/2026; números do `bv_tela_vista`, components/boasVindas/kit.tsx).
  // Câmera e "gerando" não usam a BvScreen: só aparecem aqui, no `Screen Viewed`.
  '/pc-boas-vindas': 'Pós-compra 101 · Boas-vindas',
  '/pc-criar-rotina': 'Pós-compra 102 · Criar rotina',
  '/pc-camera': 'Pós-compra 103 · Câmera dos produtos',
  '/pc-gerando': 'Pós-compra 104 · Gerando',
  '/pc-rotina-pronta': 'Pós-compra 105 · Rotina pronta',
  '/pc-foto': 'Pós-compra 106 · Foto',
  '/pc-projecao': 'Pós-compra 107 · Projeção',
  '/pc-recompensa': 'Pós-compra 109 · Recompensa',
  '/pc-sequencia': 'Pós-compra 110 · Sequência',
  '/pc-tudo-pronto': 'Pós-compra 111 · Tudo pronto',
  '/pc-exclusivos': 'Pós-compra 112 · Exclusivos',

  // Onboarding — telas fora do caminho (arquivos no repo)
  '/ola': 'Olá',
  '/seus-dados': 'Seus Dados',
  '/prazer': 'Prazer (transição)',
  '/entendi': 'Entendi',
  '/pregnancy': 'Gravidez',
  '/allergies': 'Alergias',
  '/allergies-detail': 'Detalhe da Alergia',
  '/skin-type': 'Tipo de Pele',
  '/sun-exposure': 'Exposição Solar',
  '/hydration': 'Hidratação',
  '/sleep': 'Sono',
  '/hydration-sleep': 'Hidratação e Sono',
  '/skincare-routine': 'Rotina Atual',
  '/skincare-routine-detail': 'Detalhe da Rotina Atual',
  '/goal-validation': 'Seu Potencial',
  '/social-proof': 'Social Proof',
  '/empatia': 'Empatia',
  '/idade-pele': 'Idade da Pele',
  '/transicao-rotina': 'Transição para a Rotina',
  '/horario-rotina': 'Horário da Rotina',
  '/aviso-lembretes': 'Aviso de Lembretes',
  '/permitir-notificacoes': 'Pedido de Notificação',
  '/plan-preview': 'Protocolo Pronto',
  '/rotina-pronta': 'Rotina Pronta',
  '/compromisso': 'Compromisso',
  '/apresentacao': 'Apresentação',
  '/loading': 'Analisando Pele',
  '/results': 'Resultado do Scan',
  '/rate-us': 'Avalie Nos',

  // Abas (disparam no FOCO da aba — `useAbaVista` — e não por aqui)
  '/home': 'Home',
  '/protocolo': 'Protocolo',
  '/recomendacao-produtos': 'Produtos',
  '/niks-chat': 'NIKS Chat',
  '/grupos': 'Grupos',
  '/perfil': 'Perfil',

  // App — telas da pilha
  '/skincare': 'Skincare (lista)',
  '/skincare-sessao': 'Skincare (sessão)',
  '/alarme': 'Alarme',
  '/progresso': 'Seu Progresso',
  '/calendario': 'Calendário',
  '/conquistas': 'Suas Conquistas',
  '/caminhada': 'Sua Caminhada',
  '/dica-do-dia': 'Dica do Dia',
  '/set-name': 'Definir Nome',
  '/skin-result': 'Resultado de Pele',
  '/seus-grupos': 'Seus Grupos',
  '/grupo': 'Grupo',
  '/grupo-ranking': 'Ranking do Grupo',
  '/grupo-jornada': 'Jornada do Grupo',
  '/checkin': 'Check-in',
  '/checkin-detalhe': 'Detalhe do Check-in',
  '/convidar-grupo': 'Convidar para o Grupo',
  '/produto-amiga': 'Produto da Amiga',
  '/revisao-denuncias': 'Revisão de Denúncias',
  '/ajustar-foto': 'Ajustar Foto',

  // Scans
  '/scan-prep-app': 'Tutorial do Scan (app)',
  '/camera-multi': 'Scan - Câmera (6 fotos)',
  '/loading-dentro-app': 'Analisando Pele (app)',
  '/resultado-scan': 'Resultado do Scan (relatório)',
  '/product-camera': 'Scan de Produto - Câmera',
  '/product-loading': 'Analisando Produto',
  '/product-result': 'Resultado do Produto',
  '/share-product-loading': 'Compartilhar com o NIKS',
  '/food-camera': 'Refeição - Câmera',
  '/food-report': 'Resultado da Refeição',
  '/lote-camera': 'Montar Rotina - Câmera',
  '/lote-revisao': 'Montar Rotina - Revisão',
  '/lote-montando': 'Montar Rotina - Montando',
  '/lote-resultado': 'Montar Rotina - Resultado',
  '/sos-camera': 'SOS Espinha - Câmera',
  '/sos-loading': 'SOS Espinha - Analisando',
  '/sos-resultado': 'SOS Espinha - Resultado',

  // Compartilhar o Niks score (Story)
  '/share-capture': 'Story - Colagem',
  '/share-preview': 'Story - Adesivo',
};

const ABAS = new Set(['/home', '/protocolo', '/recomendacao-produtos', '/niks-chat', '/grupos', '/perfil']);

// Parâmetros que mudam o que a tela é (o pathname sozinho não diferencia): `modo` (ex.:
// resultado-scan e câmera no app × onboarding, carta do onboarding × do dia) e `q` (a
// pergunta da personalização). Só valores curtos de código — nunca texto livre.
function paramsRelevantes(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['modo', 'q'] as const) {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string' && s.length > 0 && s.length <= 40) out[k] = s;
  }
  return out;
}

/**
 * `Screen Viewed` pelas mudanças de rota (montado uma vez, no `AppShell`). Abas ficam de fora:
 * elas montam por trás (pré-carregadas) e disparam no foco, pelo `useAbaVista`.
 * Telas vistas antes de o Mixpanel iniciar não se perdem: o `track` do provider enfileira.
 */
export function useScreenTracking() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const { track } = useMixpanel();
  const lastTracked = useRef<string | null>(null);
  const extras = paramsRelevantes(params);
  const chave = `${pathname}?${extras.modo ?? ''}&${extras.q ?? ''}`;

  useEffect(() => {
    if (chave === lastTracked.current) return;
    lastTracked.current = chave; // aba também atualiza (senão progresso → home → progresso não contaria)
    if (ABAS.has(pathname)) return;
    track('Screen Viewed', {
      screen_name: SCREEN_NAMES[pathname] ?? pathname,
      pathname,
      ...extras,
    });
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** `Screen Viewed` de uma ABA, a cada vez que ela ganha o foco (não na montagem). */
export function useAbaVista(pathname: string) {
  const { track } = useMixpanel();
  useFocusEffect(
    useCallback(() => {
      track('Screen Viewed', { screen_name: SCREEN_NAMES[pathname] ?? pathname, pathname, aba: true });
    }, [pathname]), // eslint-disable-line react-hooks/exhaustive-deps
  );
}
