import { AppState } from 'react-native';
import BalaoEspinha from '../../components/espinha/BalaoEspinha';
import { buscarConvite } from '../../lib/espinhaAcompanhamento';
import { Tabs, usePathname, useRouter, useSegments } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, Defs, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { GlassView } from 'expo-glass-effect';
import { useVidroNavbar } from '../../lib/vidroNavbar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { loginRevenueCat } from '../../lib/revenuecat';
import { comTetoRc, confirmPremium } from '../../lib/subscriptionGate';
import { convidadaLigada, meusGrupos, statusApp } from '../../lib/gruposServidor';
import Constants from 'expo-constants';
import { carregarAcesso, definirAcesso, reconferirAcesso, useAcesso, useEhConvidada } from '../../lib/acesso';
import { abrirTrava } from '../../lib/trava';
import AvisoCadeado from '../../components/trava/AvisoCadeado';
import { Lock } from 'lucide-react-native';
import { vincularAssinatura } from '../../lib/assinaturaServidor';
import { PULAR_PAYWALL } from '../../lib/devPaywall';
import { useAppStore } from '../../store/onboarding';
import NameCapture from '../../components/onboarding/NameCapture';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { isNativePresentationOpen, waitForNativePresentationToClose } from '../../lib/nativePresentation';
import { useCoachStageReady } from '../../lib/coachMarks';
import { preaquecerApp } from '../../lib/preaquecer';
import { getUserId } from '../../lib/currentUser';
import HomeCoachMarks from '../../components/coach/HomeCoachMarks';
import ProdutosCoachMarks from '../../components/coach/ProdutosCoachMarks';
import { finishProdutosTutorial, useProdutosTutorialPending } from '../../lib/produtosTutorial';
import AvisoLote from '../../components/rotina/AvisoLote';
import ConvitePendente from '../../components/grupos/ConvitePendente';
import ToquePush from '../../components/ToquePush';
import { markHomeTutorialSeenOnServer } from '../../lib/homeTutorial';
import AlvoGuia from '../../components/coach/AlvoGuia';
import { useGuia } from '../../lib/guia';
import { comecarDesafios } from '../../lib/missoes';
import TutorialOverlay, { PreaquecerVeu } from '../../components/coach/TutorialOverlay';
import {
  avancarTutorialGrupos, registrarParada, retomarTutorialGrupos, useEtapaTutorialGrupos,
} from '../../lib/gruposTutorial';

// ── Bottom navbar — réplica da `nav` "splitHouse" da tela 57d do Claude Design
// (projeto "NIKS home redesign", `NiksHomeFlo.dc.html`). Flutua a 26 pt da base:
//   • à esquerda, círculo branco Ø64 com a CASA (Home) — sombra 0 8 22 rgba(192,32,106,.16);
//   • ao lado (gap 14), pílula branca de 60 pt com borda de 1,5 pt em degradê
//     #FFC2DB → #FF5EA8 → #F86B79 (100°), padding 0 10, três ícones line 27 pt em
//     caixas de 60 × 46 (gap 4): rosto (Rotina) · frasco (Produtos) · Grupos (abre o Perfil).
//   • atrás, véu de 130 pt rgba(249,242,245,0) → .85 (70%).
// O NIKS Chat SAIU da navbar (out/2026). Ícones inativos #7A7076; a aba ativa fica
// rosa #FF5EA8 com o ponto rosa embaixo (como antes); a casa ativa é a casa rosa do
// design e, fora da Home, fica cinza como os outros.
// Telas de tela cheia: a navbar NUNCA aparece nelas, decidido pela rota (10/nov/2026).
// Antes dependia só do `tabBarVisible`, que cada tela liga no blur e desliga no foco — e
// "quem escreve por último vence": indo de uma tela cheia para OUTRA já montada (ex.:
// lista do skincare → câmera do check-in), o foco da nova vinha ANTES do blur da antiga,
// e o `setTabBarVisible(true)` do blur deixava a navbar por cima da câmera.
const TELA_CHEIA = new Set([
  '/checkin', '/skincare', '/checkin-detalhe', '/calendario', '/conquistas',
  '/dica-do-dia', '/grupo-jornada', '/grupo-ranking', '/niks-chat',
]);
const NAV_INACTIVE = '#7A7076';
const NAV_ACTIVE = '#FF5EA8';
// Modo noturno da tab bar (sincronizado com o tema da tela — ex.: protocolo à noite)
const NAV_ACTIVE_DARK = '#FF9D9D';
const NAV_INACTIVE_DARK = '#8B93A8';
const NAV_BG_DARK = '#1A1F2E';
const NAV_ICON = 27;
// Liquid Glass (10/nov/2026, iOS 26+ — quando liga: `lib/vidroNavbar.ts`):
//   • estilo `regular` do sistema na casa e na pílula;
//   • SEM o véu de baixo: o véu (85% de branco-rosado) apagava o que passa por trás e o vidro
//     ficava igual à navbar branca de antes (comparação com `clear` e com véu: 10/nov/2026);
//   • a borda em degradê da pílula vira um CONTORNO desenhado por cima (o degradê de hoje é um
//     preenchimento atrás da pílula branca; atrás de um vidro pintaria a pílula inteira de rosa).
const BORDA_NO_VIDRO = true;
const PILL_W = 10 + 60 * 3 + 4 * 2 + 10; // padding + 3 itens de 60 + 2 gaps de 4 = 208

type NavKey = 'rotina' | 'produtos' | 'grupos' | 'perfil';

function NavGlyph({ name, color, active }: { name: NavKey; color: string; active: boolean }) {
  const c = {
    stroke: color,
    strokeWidth: active ? 1.9 : 1.6, // ativo = traço 1,9 (design 75)
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={NAV_ICON} height={NAV_ICON} viewBox="0 0 24 24">
      {name === 'rotina' && (
        <>
          <Path d="M5.5 12.5C5.5 7.5 8.3 4 12 4s6.5 3.5 6.5 8.5c0 4.2-2.9 7.5-6.5 7.5s-6.5-3.3-6.5-7.5z" {...c} />
          <Path d="M6 10.5c2.8 0 5-1.6 6-4 1 2.4 3.2 4 6 4" {...c} />
          <Path d="M9.3 12.8c.5.4 1.1.4 1.6 0M13.1 12.8c.5.4 1.1.4 1.6 0M10.5 16.2c.9.5 2.1.5 3 0" {...c} />
          <Path d="M20.5 3v3M19 4.5h3" {...c} />
        </>
      )}
      {name === 'produtos' && (
        <>
          <Path d="M10 2h4M11 2v2.5M13 2v2.5M9.5 8.5h5" {...c} />
          <Rect x={7.5} y={8.5} width={9} height={13.5} rx={2.5} {...c} />
          <Path d="M12 5.5V8.5M8 15.5h4" {...c} />
        </>
      )}
      {name === 'grupos' && (
        <>
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...c} />
          <Circle cx={9} cy={7} r={4} {...c} />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87" {...c} />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...c} />
        </>
      )}
      {name === 'perfil' && (
        <>
          <Circle cx={12} cy={8} r={4} {...c} />
          <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...c} />
        </>
      )}
    </Svg>
  );
}

// Casa do design: ativa (32 pt) = chaminé, telhado em traço 2,5 e corpo preenchido;
// inativa (30 pt, design 75) = só o contorno, traço 1,6.
function HouseGlyph({ color, active }: { color: string; active: boolean }) {
  if (!active) {
    return (
      <Svg width={30} height={30} viewBox="0 0 24 24">
        <Path d="M2.4 11.4 12 3.4l9.6 8" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M16.3 5.6V4.2h2.4v3.4" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M5 11.6v8a1.6 1.6 0 0 0 1.6 1.6h3.1v-5a1 1 0 0 1 1-1h2.6a1 1 0 0 1 1 1v5h3.1a1.6 1.6 0 0 0 1.6-1.6v-8" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24">
      <Rect x={16} y={4} width={2.7} height={5} rx={0.6} fill={color} />
      <Path d="M2.4 11.4 12 3.4l9.6 8" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path fill={color} d="M5 11.6 12 5.8l7 5.8v8a1.6 1.6 0 0 1-1.6 1.6h-3.1v-5a1 1 0 0 0-1-1h-2.6a1 1 0 0 0-1 1v5H6.6A1.6 1.6 0 0 1 5 19.6z" />
    </Svg>
  );
}

// Ordem da pílula, esquerda→direita: rosto (Rotina) · frasco (Produtos) · duas pessoas
// (Grupos — aba Grupos, 80q: perfil + calendário de check-ins). O Perfil abre pela foto
// ao lado de "Olá, Nome" na home e pela engrenagem da aba Grupos (fase 3, grupos reais).
const NAV_ITEMS: { key: NavKey; route: string }[] = [
  { key: 'rotina',   route: '/protocolo' },
  { key: 'produtos', route: '/recomendacao-produtos' },
  { key: 'grupos',   route: '/grupos' },
];

function GlobalBottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // Tema da tab bar — escurece junto com telas em modo noturno (protocolo)
  const isDark = useAppStore((s) => s.tabBarTheme) === 'dark';
  const convidada = useEhConvidada();

  // O alarme é parte da rotina: no design 44a a aba Rotina aparece ativa nele. No
  // progresso (43d) a Rotina também aparece ativa. (A estante deixou de ser tela própria:
  // é o topo da aba Produtos.) "Seu nome" (set-name) abre pelo Perfil e o mantém ativo.
  const isActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`)
    || (route === '/protocolo' && (pathname === '/alarme' || pathname === '/progresso'))
    || (route === '/perfil' && pathname === '/set-name')
    || (route === '/grupos' && ['/seus-grupos', '/grupo', '/grupo-ranking', '/grupo-jornada'].includes(pathname));

  const activeColor = isDark ? NAV_ACTIVE_DARK : NAV_ACTIVE;
  const inactiveColor = isDark ? NAV_INACTIVE_DARK : NAV_INACTIVE;
  const surface = isDark ? NAV_BG_DARK : '#FFFFFF';
  const homeActive = isActive('/home');
  // 26 pt da base no frame de 852 (home indicator de 34 → 8 dentro dele).
  const bottom = Math.max(16, insets.bottom - 8);
  const vidro = useVidroNavbar();

  const itens = NAV_ITEMS.map((it) => {
    const active = isActive(it.route);
    // Alvo do tour e das dicas (06/nov/2026): o item inteiro (60 × 46).
    return (
      <AlvoGuia key={it.key} chave={`nav-${it.key}` as 'nav-rotina' | 'nav-produtos' | 'nav-grupos'} style={styles.item}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            haptics.tap();
            if (convidada && it.key !== 'grupos') { abrirTrava(it.key === 'rotina' ? 'rotina' : 'produtos'); return; }
            router.push(it.route as any);
          }}
          style={styles.item}
        >
          {/* Sem o ponto embaixo da aba ativa: no design 75 a aba ativa é só o ícone rosa. */}
          <View style={{ opacity: convidada && it.key !== 'grupos' ? 0.25 : 1 }}>
            <NavGlyph name={it.key} color={active ? activeColor : inactiveColor} active={active} />
          </View>
          {convidada && it.key !== 'grupos' && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <Lock size={16} color="#E0447F" strokeWidth={2.6} />
            </View>
          )}
        </TouchableOpacity>
      </AlvoGuia>
    );
  });

  if (vidro) {
    // ⚠️ Nada com opacidade < 1 POR FORA dos GlassView (quebra o vidro); por dentro, pode.
    const esquema = isDark ? 'dark' : 'light';
    return (
      <>
        <View pointerEvents="box-none" style={[styles.navbar, { bottom }]}>
          <GlassView glassEffectStyle="regular" colorScheme={esquema} isInteractive style={styles.homeVidro}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { haptics.tap(); router.push('/home' as any); }}
              style={styles.homeToque}
              accessibilityLabel="Início"
            >
              <HouseGlyph color={homeActive ? activeColor : inactiveColor} active={homeActive} />
            </TouchableOpacity>
          </GlassView>
          <GlassView glassEffectStyle="regular" colorScheme={esquema} isInteractive style={styles.pillVidro}>
            {itens}
            {BORDA_NO_VIDRO && (
              <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox={`0 0 ${PILL_W} 60`}>
                <Defs>
                  <SvgLinearGradient id="bordaNav" x1="0" y1="0.41" x2="1" y2="0.59">
                    <Stop offset="0" stopColor="#FFC2DB" />
                    <Stop offset="0.55" stopColor="#FF5EA8" />
                    <Stop offset="1" stopColor="#F86B79" />
                  </SvgLinearGradient>
                </Defs>
                <Rect x={0.75} y={0.75} width={PILL_W - 1.5} height={58.5} rx={29.25} fill="none" stroke="url(#bordaNav)" strokeWidth={1.5} />
              </Svg>
            )}
          </GlassView>
        </View>
      </>
    );
  }

  return (
    <>
      {/* Véu atrás da barra */}
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['rgba(26,31,46,0)', 'rgba(26,31,46,0.85)'] : ['rgba(249,242,245,0)', 'rgba(249,242,245,0.85)']}
        locations={[0, 0.7]}
        style={[styles.fade, { height: 130 + Math.max(0, bottom - 26) }]}
      />
      <View pointerEvents="box-none" style={[styles.navbar, { bottom }]}>
        {/* Casa (Home) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { haptics.tap(); router.push('/home' as any); }}
          style={[styles.homeBtn, { backgroundColor: surface }]}
          accessibilityLabel="Início"
        >
          <HouseGlyph color={homeActive ? activeColor : inactiveColor} active={homeActive} />
        </TouchableOpacity>

        {/* Pílula com borda em degradê */}
        <LinearGradient
          colors={['#FFC2DB', '#FF5EA8', '#F86B79']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0.41 }}
          end={{ x: 1, y: 0.59 }}
          style={styles.pillBorder}
        >
          <View style={[styles.pill, { backgroundColor: surface }]}>
            {itens}
          </View>
        </LinearGradient>
      </View>
    </>
  );
}

// Id da conta em memória desde já: as telas montam com o cache dela no primeiro render.
void getUserId();

function versaoMenor(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

export default function AppLayout() {
  const router = useRouter();
  // Depois que a home assentou: traz os dados das telas principais (sem montar nenhuma).
  useEffect(() => {
    const t = setTimeout(() => {
      void preaquecerApp();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [ready, setReady] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const tabBarVisible = useAppStore((s) => s.tabBarVisible);
  const subscriptionVerified = useAppStore((s) => s.subscriptionVerified);
  const setSubscriptionVerified = useAppStore((s) => s.setSubscriptionVerified);
  const tabBarTheme = useAppStore((s) => s.tabBarTheme);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/');
        return;
      }

      // Parte B, Fase 8: versão abaixo da mínima não entra. Sem resposta, segue.
      const app = PULAR_PAYWALL ? null : await statusApp();
      if (app?.versao_minima && versaoMenor(Constants.expoConfig?.version ?? '', app.versao_minima)) {
        router.replace('/atualize' as any);
        return;
      }

      // Guard de nome — APENAS marca o estado; NUNCA navega. Um router.replace
      // para o grupo (onboarding) aqui criava um loop: o (onboarding)/_layout via
      // sessão + assinante e mandava de volta para /home, e assim sem parar (a
      // tela "entrava e saía" e a usuária não conseguia digitar). Agora o guard só
      // decide se a captura de nome deve ser RENDERIZADA no lugar do app (ver render
      // abaixo). O efeito NÃO pode parar aqui: precisa seguir até verificar a
      // assinatura e setar `ready`, senão `if (!ready) return null` deixaria a tela
      // branca para sempre. `needsName` é um estado paralelo ao `ready`.
      // Espaço em branco conta como vazio (mesma regra da validação do input).
      try {
        const { data: userData, error: erroNome } = await supabase
          .from('users')
          .select('nome')
          .eq('id', session.user.id)
          .single();
        // Só pede o nome com a resposta em mãos: falha de leitura não é "sem nome".
        // PGRST116 = a conta ainda não tem linha em `users`, aí falta mesmo.
        if (!erroNome || erroNome.code === 'PGRST116') setNeedsName(!(userData?.nome ?? '').trim());
        else console.warn('[app] leitura do nome falhou:', erroNome);
      } catch {
        // Em caso de erro não bloqueamos o nome check
      }

      // Pula o check de assinatura se já foi verificado nesta sessão (evita tela branca no remount)
      if (PULAR_PAYWALL || subscriptionVerified) {
        // Servidor: liga as compras anônimas do RevenueCat à conta (uma vez; não bloqueia).
        void vincularAssinatura(session.user.id);
        setReady(true);
        return;
      }

      // Garante que o RC está logado com o usuário correto antes de verificar a assinatura
      // (corrige race condition: _layout.tsx faz loginRevenueCat de forma assíncrona)
      await comTetoRc(loginRevenueCat(session.user.id));

      // Guard de assinatura — fail closed: resposta negativa ou nenhuma confirmação vai para o
      // paywall. Se o RevenueCat falhar ou não responder, `confirmPremium` confere no Superwall
      // e no servidor antes de negar.
      if (!(await confirmPremium({ label: 'portao' }))) {
        // Parte B: convidada abre sempre no grupo; sem resposta e sem histórico, paywall.
        const estado = await carregarAcesso(session.user.id);
        if (estado === 'convidada') {
          const grupos = await comTetoRc(meusGrupos());
          void vincularAssinatura(session.user.id);
          setReady(true);
          if (grupos?.[0]) router.replace({ pathname: '/grupo', params: { id: grupos[0].id } } as any);
          return;
        }
        router.replace(await convidadaLigada() ? '/(onboarding)/sem-grupo' as any : '/(onboarding)/paywall-soft');
        return;
      }
      definirAcesso('assinante', session.user.id);

      setSubscriptionVerified(true);
      // Servidor: liga as compras à conta (não bloqueia).
      void vincularAssinatura(session.user.id);
      setReady(true);
    });
  }, []);

  // Guard liberou (home OU captura de nome): destino da abertura pronto → a splash
  // pode revelar. (Não-assinante vai para o paywall-soft, que avisa ao montar.)
  const markSplashDestinationReady = useAppStore((st) => st.markSplashDestinationReady);
  useEffect(() => {
    if (ready) markSplashDestinationReady();
  }, [ready]);

  // Parte B, Fase 7: com a convidada ligada, reconfere ao voltar ao app. Assinatura vencida
  // vira convidada sem aviso; quem ficou sem grupo vai para a tela sem grupo.
  useEffect(() => {
    if (!ready || PULAR_PAYWALL) return;
    const sub = AppState.addEventListener('change', (e) => {
      if (e !== 'active') return;
      void (async () => {
        if (!(await convidadaLigada())) return;
        const uid = await getUserId();
        if (uid && (await reconferirAcesso(uid)) === 'sem_acesso') router.replace('/(onboarding)/sem-grupo' as any);
      })();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Convite de retorno da espinha (12 h / 24 h): o servidor decide, ao abrir o app.
  useEffect(() => {
    if (!ready || needsName || useAcesso.getState().estado === 'convidada') return;
    void buscarConvite();
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') void buscarConvite(); });
    return () => sub.remove();
  }, [ready, needsName]);

  // "Compartilhar com o NIKS": ÚNICO ponto que abre a análise de um produto
  // compartilhado. Só roda com `ready` (sessão + assinatura já verificadas pelo
  // guard acima) e sem captura de nome pendente — então o share nunca pula o
  // paywall. Cobre cold start, app em background e retomada depois de
  // login/paywall (todos terminam montando este layout). O ref impede abrir duas
  // vezes o mesmo share (StrictMode / re-render).
  const pendingShare = useAppStore((s) => s.pendingShare);
  const consumedShareIdRef = useRef<string | null>(null);
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const { track } = useMixpanel();
  useEffect(() => {
    if (!ready || needsName || !pendingShare) return;
    if (consumedShareIdRef.current === pendingShare.id) return;
    consumedShareIdRef.current = pendingShare.id;

    let cancelled = false;
    (async () => {
      // 1. Seletor nativo aberto (ex.: galeria da foto da home): o JS não consegue
      //    fechá-lo, então espera a usuária fechar. Empilhar por baixo dele deixava a
      //    tela escondida e o consentimento sem conseguir aparecer.
      if (isNativePresentationOpen()) {
        console.warn('[share] share recebido com seletor nativo aberto — aguardando fechar');
        track('product_share_blocked_by_modal', { tipo: 'seletor_nativo' });
        await waitForNativePresentationToClose();
        if (cancelled) return;
        console.log('[share] seletor nativo fechado — seguindo para a análise');
      }

      // 2. Telas do Stack por cima do (app) (câmera, resultado, ajustar-foto…):
      //    volta para o (app) antes de empilhar, para nada ficar por cima.
      const topGroup = segmentsRef.current[0];
      if (topGroup !== '(app)' && router.canDismiss()) {
        console.warn(`[share] share recebido com ${topGroup} por cima — dismissAll antes do push`);
        track('product_share_blocked_by_modal', { tipo: 'tela_empilhada', grupo: topGroup ?? null });
        router.dismissAll();
      }

      router.push('/(scan)/share-product-loading' as any);
    })();
    return () => { cancelled = true; };
  }, [ready, needsName, pendingShare]);

  // ── Tutorial de primeiro acesso da home (coach marks) ─────────────────────
  // Só para usuária NOVA (armado no fim do onboarding — ver `notifications.tsx`)
  // e uma vez na vida. As condições extras não são zelo: cada uma cobre um jeito
  // conhecido de o tutorial aparecer na hora errada.
  //   • `ready && !needsName` — depois dos guards de assinatura e de nome, senão
  //     o overlay escureceria a captura de nome ou uma tela a caminho do paywall;
  //   • `pathname === '/home'` — os alvos só existem na home (e a navbar muda de
  //     aba sozinha se a usuária sair);
  //   • `!pendingShare` — o "Compartilhar com o NIKS" empilha `(scan)` por cima
  //     do (app); os dois disputando a tela deixariam o tutorial escondido atrás;
  //   • `stageReady` — a home abre com SKELETON no cold start; destacar um card
  //     ainda pulsando explicaria a coisa errada.
  const homeTutorialPending = useAppStore((s) => s.homeTutorialPending);
  const homeTutorialSeen = useAppStore((s) => s.homeTutorialSeen);
  const finishHomeTutorial = useAppStore((s) => s.finishHomeTutorial);
  // Concluir tranca nos DOIS lugares: o flag local corta o tutorial na hora (sem
  // esperar a rede) e o servidor guarda o "esta CONTA já viu", que é o que
  // sobrevive a logout, reinstalação e troca de aparelho. A escrita é
  // fire-and-forget — ver `lib/homeTutorial.ts`.
  // Depois do tour (só conta nova), os desafios — começando pelo scan de produto
  // (`lib/missoes.ts`). "Pular" também leva a eles (o "Pular" pula o TOUR).
  const handleCoachFinish = useCallback(() => {
    finishHomeTutorial();
    void markHomeTutorialSeenOnServer();
    void comecarDesafios();
  }, [finishHomeTutorial]);
  const guiaAtiva = useGuia() != null;
  const coachStageReady = useCoachStageReady('home');
  const pathname = usePathname();
  const navbarVisivel = tabBarVisible && !TELA_CHEIA.has(pathname);
  // O tutorial só começa depois que a splash de abertura terminou o fade — senão
  // ele mediria/desenharia por baixo da logo.
  const splashDone = useAppStore((s) => s.splashDone);
  const showCoachMarks =
    splashDone &&
    ready &&
    !needsName &&
    !pendingShare &&
    pathname === '/home' &&
    homeTutorialPending &&
    !homeTutorialSeen &&
    coachStageReady;

  // Tutorial de primeira entrada de Produtos (59a–59d): uma vez por conta, armado
  // pela própria tela ao ganhar foco (lib/produtosTutorial.ts). O palco só fica
  // pronto com a estante carregada e "Recomendados pra você" na tela (pronto ou
  // "Montando sua recomendação…") — sem a seção, o tutorial espera a próxima visita.
  const produtosTutorialPending = useProdutosTutorialPending();
  const produtosStageReady = useCoachStageReady('produtos');
  const showProdutosCoachMarks =
    splashDone &&
    ready &&
    !needsName &&
    !pendingShare &&
    !showCoachMarks &&
    !guiaAtiva && // durante um desafio o tutorial da aba espera (ela está seguindo a dica)
    pathname === '/recomendacao-produtos' &&
    produtosTutorialPending &&
    produtosStageReady;

  // ── Tutorial dos Grupos: obrigatório, um de cada vez, atravessa até 3 telas ────────
  const etapaGrupos = useEtapaTutorialGrupos();
  const convidadaNoApp = useEhConvidada();
  const gruposLiberado = splashDone && ready && !needsName && !pendingShare && !showCoachMarks && !guiaAtiva && !convidadaNoApp;
  const gruposStageReady = useCoachStageReady(etapaGrupos?.stage ?? 'grupos');
  const showGruposTutorial = gruposLiberado && !!etapaGrupos && pathname === etapaGrupos.rota && gruposStageReady;
  const tutorialGruposAtivo = !!etapaGrupos;
  // Reabriu com o tutorial pela metade: ele volta sozinho.
  useEffect(() => {
    if (gruposLiberado) retomarTutorialGrupos();
  }, [gruposLiberado]);
  // Leva à tela de cada trecho, uma vez por trecho (um push no meio não é arrastado de volta).
  const etapaLevada = useRef<string | null>(null);
  const [trocandoDeTela, setTrocandoDeTela] = useState(false);
  useEffect(() => {
    if (!etapaGrupos) { etapaLevada.current = null; setTrocandoDeTela(false); return; }
    if (!gruposLiberado || etapaLevada.current === etapaGrupos.chave) return;
    etapaLevada.current = etapaGrupos.chave;
    if (etapaGrupos.rota === '/grupo') router.navigate({ pathname: '/grupo', params: { id: etapaGrupos.grupoId ?? '' } } as any);
    else if (pathname !== etapaGrupos.rota) router.navigate(etapaGrupos.rota as any);
    // Barra toques entre uma tela e outra; sem rede, solta e o tutorial espera a tela carregar.
    setTrocandoDeTela(true);
    const t = setTimeout(() => setTrocandoDeTela(false), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapaGrupos?.chave, gruposLiberado]);

  // Aquece o Skia antes do 1º tutorial/dica: conta nova logo na entrada (o tour vem em
  // seguida); as demais, depois que a home assentou. Sai depois de desenhar.
  const [aquecer, setAquecer] = useState(false);
  const tourArmado = homeTutorialPending && !homeTutorialSeen;
  const jaAqueceu = useRef(false);
  useEffect(() => {
    if (!ready || jaAqueceu.current) return;
    jaAqueceu.current = true;
    const liga = setTimeout(() => setAquecer(true), tourArmado ? 0 : 1200);
    const desliga = setTimeout(() => setAquecer(false), (tourArmado ? 0 : 1200) + 800);
    return () => { clearTimeout(liga); clearTimeout(desliga); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  // Nome vazio → renderiza a captura no lugar do app (mesma fonte da etapa do
  // onboarding). Só chega aqui com `ready` true, ou seja, assinatura já verificada
  // (o guard de assinatura continua fail closed e intocado). Ao salvar, `onSaved`
  // apenas libera a renderização — sem navegação, sem remontar layout, sem loop.
  if (needsName) return <NameCapture onSaved={() => setNeedsName(false)} />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="recomendacao-produtos" />
        <Tabs.Screen name="protocolo" />
        <Tabs.Screen name="niks-chat" />
        <Tabs.Screen name="perfil" />
        <Tabs.Screen name="grupos" />
        <Tabs.Screen name="set-name" options={{ href: null }} />
        <Tabs.Screen name="skin-result" options={{ href: null }} />
        <Tabs.Screen name="calendario" options={{ href: null }} />
        <Tabs.Screen name="conquistas" options={{ href: null }} />
        <Tabs.Screen name="alarme" options={{ href: null }} />
        <Tabs.Screen name="progresso" options={{ href: null }} />
        <Tabs.Screen name="dica-do-dia" options={{ href: null }} />
        <Tabs.Screen name="caminhada" options={{ href: null }} />
        <Tabs.Screen name="seus-grupos" options={{ href: null }} />
        <Tabs.Screen name="grupo" options={{ href: null }} />
        <Tabs.Screen name="grupo-ranking" options={{ href: null }} />
        <Tabs.Screen name="grupo-jornada" options={{ href: null }} />
        <Tabs.Screen name="checkin" options={{ href: null }} />
        <Tabs.Screen name="skincare" options={{ href: null }} />
        <Tabs.Screen name="revisao-denuncias" options={{ href: null }} />
        <Tabs.Screen name="produto-amiga" options={{ href: null }} />
        <Tabs.Screen name="checkin-detalhe" options={{ href: null }} />
      </Tabs>
      {navbarVisivel && <GlobalBottomBar />}
      {aquecer && <PreaquecerVeu />}
      {navbarVisivel && !showCoachMarks && !showProdutosCoachMarks && !guiaAtiva && !tutorialGruposAtivo && !convidadaNoApp && <BalaoEspinha />}
      {/* ⚠️ DEPOIS da navbar e IRMÃO dela, de propósito: o tutorial precisa
          escurecer a tela inteira, navbar inclusive (designs 58/59). Dentro da
          `home.tsx` ele ficaria ABAIXO da navbar por mais zIndex que levasse
          (zIndex só vale entre irmãos; a navbar é do layout, a home é filha do
          <Tabs>). Ver "Feature: Tutorial de primeiro acesso" no README. */}
      {showCoachMarks && <HomeCoachMarks onFinish={handleCoachFinish} />}
      {showProdutosCoachMarks && <ProdutosCoachMarks onFinish={() => { void finishProdutosTutorial(); }} />}
      {showGruposTutorial && etapaGrupos && (
        <TutorialOverlay
          key={etapaGrupos.chave}
          stops={etapaGrupos.stops}
          semPular
          antes={etapaGrupos.antes}
          total={etapaGrupos.total}
          onParada={registrarParada}
          onFinish={() => { void avancarTutorialGrupos(); }}
        />
      )}
      {tutorialGruposAtivo && trocandoDeTela && !showGruposTutorial && <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]} />}
      {/* Aviso "Sua rotina está pronta" do lote "Montar minha rotina" (Fase 6) + toque
          no push dele. Irmão da navbar pelo mesmo motivo: fica por cima de qualquer aba. */}
      {!showCoachMarks && !showProdutosCoachMarks && !guiaAtiva && !tutorialGruposAtivo && <AvisoLote />}
      {/* Convite de grupo aberto pelo link (lib/convitePendente.ts): só depois do guard. */}
      {!showCoachMarks && !showProdutosCoachMarks && !guiaAtiva && !tutorialGruposAtivo && <ConvitePendente />}
      {/* Toque em qualquer push (inclusive o que abriu o app) → lib/pushToque.ts. Fora do
          tutorial também: o toque do lote espera o aviso montar. */}
      <ToquePush />
      <AvisoCadeado />
    </View>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
  },
  // Barra flutuante (nav "splitHouse" da 57d): casa + pílula, centralizadas, gap 14.
  navbar: {
    position: 'absolute',
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  homeBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgb(192,32,106)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 11,
    elevation: 8,
  },
  // Borda de 1,5 pt em degradê = o degradê por fora + a pílula branca por dentro.
  pillBorder: {
    height: 60,
    borderRadius: 30,
    padding: 1.5,
    shadowColor: 'rgb(192,32,106)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 11,
    elevation: 8,
  },
  pill: {
    flex: 1,
    borderRadius: 28.5,
    paddingHorizontal: 10 - 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  item: {
    width: 60,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Liquid Glass (TESTE): mesmas medidas da casa e da pílula, sem fundo nem sombra rosa
  // (o vidro do sistema tem sombra e brilho próprios).
  homeVidro: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  homeToque: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillVidro: {
    width: PILL_W,
    height: 60,
    borderRadius: 30,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
