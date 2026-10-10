import { Tabs, usePathname, useRouter, useSegments } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { getCustomerInfo, isSubscribed, loginRevenueCat } from '../../lib/revenuecat';
import { useAppStore } from '../../store/onboarding';
import NameCapture from '../../components/onboarding/NameCapture';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { isNativePresentationOpen, waitForNativePresentationToClose } from '../../lib/nativePresentation';
import { useCoachMark, useCoachStageReady } from '../../lib/coachMarks';
import HomeCoachMarks from '../../components/coach/HomeCoachMarks';
import AvisoLote from '../../components/rotina/AvisoLote';
import { markHomeTutorialSeenOnServer } from '../../lib/homeTutorial';

// ── Bottom navbar — réplica da `nav` do design 38e (Claude Design, NiksHomeFlo
// base=7). Barra branca 87pt no frame de 852 (53 + home indicator), padding 12/18,
// borda superior #F2E6E6, sombra --shadow-nav (0 -6 24 rgba(0,0,0,.10)), 5 colunas.
// Ícones line 28pt #8A8A93 (paths copiados do design); no centro a logo
// `score-logo-pink.png` 46pt com o ponto #FF9D9D da aba ativa (Home).
// Aba ativa (design 41d, Rotina): ícone rosa #FF5EA8 com traço 1.7 e ponto rosa
// logo abaixo (`margin-top: -3px` após a caixa de 44 → topo do ponto em 41).
// Na Home o ponto é o #FF9D9D sob a logo (design 38e).
const NAV_INACTIVE = '#8A8A93';
const NAV_ACTIVE = '#FF5EA8';
const NAV_HOME_DOT = '#FF9D9D';
const NAV_BORDER = '#F2E6E6';
const NAV_BADGE = '#E8452F';      // ponto de notificação do chat (design)
// Modo noturno da tab bar (sincronizado com o tema da tela — ex.: protocolo à noite)
const NAV_ACTIVE_DARK = '#FF9D9D';
const NAV_INACTIVE_DARK = '#8B93A8';
const NAV_BG_DARK = '#1A1F2E';
const NAV_ICON = 28;
const NAV_DOT_TOP = 41; // ícone: caixa de 44 − 3

type NavKey = 'rotina' | 'produtos' | 'home' | 'chat' | 'perfil';

function NavGlyph({ name, color, active }: { name: Exclude<NavKey, 'home'>; color: string; active: boolean }) {
  const c = {
    stroke: color,
    strokeWidth: active ? 1.7 : name === 'rotina' ? 1.55 : 1.6,
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
      {name === 'chat' && (
        <>
          <Path d="M21 12a8 8 0 0 1-11.4 7.2L4 20l1-4.6A8 8 0 1 1 21 12z" {...c} />
          <Path d="M8.5 11h7M8.5 14h4.5" {...c} />
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

// Ordem esquerda→direita do design: rosto (Rotina) · frasco (Produtos) · logo (Home)
// · balão (Chat) · pessoa (Perfil).
const NAV_ITEMS: { key: NavKey; route: string; badge?: boolean }[] = [
  { key: 'rotina',   route: '/protocolo' },
  { key: 'produtos', route: '/recomendacao-produtos' },
  { key: 'home',     route: '/home' },
  { key: 'chat',     route: '/niks-chat', badge: true },
  { key: 'perfil',   route: '/perfil' },
];

function GlobalBottomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // Tema da tab bar — escurece junto com telas em modo noturno (protocolo)
  const isDark = useAppStore((s) => s.tabBarTheme) === 'dark';

  // O alarme é parte da rotina: no design 44a a aba Rotina aparece ativa nele. No
  // progresso (43d) a Rotina também aparece ativa. (A estante deixou de ser tela própria:
  // é o topo da aba Produtos.)
  const isActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`)
    || (route === '/protocolo' && (pathname === '/alarme' || pathname === '/progresso'));

  const activeColor = isDark ? NAV_ACTIVE_DARK : NAV_ACTIVE;
  const inactiveColor = isDark ? NAV_INACTIVE_DARK : NAV_INACTIVE;

  // ── Alvos do tutorial de primeiro acesso (coach marks) ────────────────────
  // A medida sai da View do glifo (28×28), não do TouchableOpacity (`flex: 1`,
  // uma coluna inteira da barra). Hooks chamados um a um (ordem fixa).
  const rotinaMark = useCoachMark('nav-rotina', 'circle');
  const produtosMark = useCoachMark('nav-produtos', 'circle');
  const chatMark = useCoachMark('nav-chat', 'circle');
  const marks: Partial<Record<NavKey, ReturnType<typeof useCoachMark>>> = {
    rotina: rotinaMark,
    produtos: produtosMark,
    chat: chatMark,
  };

  return (
    <View style={[
      styles.navbar,
      {
        height: 53 + insets.bottom,
        backgroundColor: isDark ? NAV_BG_DARK : '#FFFFFF',
        borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : NAV_BORDER,
      },
    ]}>
      {NAV_ITEMS.map((it) => {
        const active = isActive(it.route);

        if (it.key === 'home') {
          return (
            <TouchableOpacity
              key={it.key}
              activeOpacity={0.7}
              onPress={() => { haptics.tap(); router.push(it.route as any); }}
              style={styles.centerItem}
            >
              <Image source={require('../../assets/home/score-logo-pink.png')} style={styles.centerLogo} />
              <View style={[styles.dot, { backgroundColor: NAV_HOME_DOT }, !active && { opacity: 0 }]} />
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={it.key}
            activeOpacity={0.7}
            onPress={() => { haptics.tap(); router.push(it.route as any); }}
            style={styles.item}
          >
            <View ref={marks[it.key]?.ref} onLayout={marks[it.key]?.onLayout}>
              <NavGlyph name={it.key} color={active ? activeColor : inactiveColor} active={active} />
              {it.badge && <View style={[styles.badge, isDark && { borderColor: NAV_BG_DARK }]} />}
            </View>
            {active && <View style={[styles.dot, styles.dotAbs, isDark && { backgroundColor: NAV_ACTIVE_DARK }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AppLayout() {
  const router = useRouter();
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
        const { data: userData } = await supabase
          .from('users')
          .select('nome')
          .eq('id', session.user.id)
          .single();
        setNeedsName(!(userData?.nome ?? '').trim());
      } catch {
        // Em caso de erro não bloqueamos o nome check
      }

      // Pula o check de assinatura se já foi verificado nesta sessão (evita tela branca no remount)
      if (__DEV__ || subscriptionVerified) {
        setReady(true);
        return;
      }

      // Garante que o RC está logado com o usuário correto antes de verificar a assinatura
      // (corrige race condition: _layout.tsx faz loginRevenueCat de forma assíncrona)
      try {
        await loginRevenueCat(session.user.id);
      } catch {
        // ignora — prossegue para o check de assinatura
      }

      // Guard de assinatura — fail closed: qualquer dúvida vai para o paywall
      try {
        const infoPromise = getCustomerInfo();
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 8000)
        );
        const info = await Promise.race([infoPromise, timeoutPromise]);

        if (!info || !isSubscribed(info)) {
          router.replace('/(onboarding)/paywall-soft');
          return;
        }
      } catch {
        router.replace('/(onboarding)/paywall-soft');
        return;
      }

      setSubscriptionVerified(true);
      setReady(true);
    });
  }, []);

  // Guard liberou (home OU captura de nome): destino da abertura pronto → a splash
  // pode revelar. (Não-assinante vai para o paywall-soft, que avisa ao montar.)
  const markSplashDestinationReady = useAppStore((st) => st.markSplashDestinationReady);
  useEffect(() => {
    if (ready) markSplashDestinationReady();
  }, [ready]);

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
  const handleCoachFinish = useCallback(() => {
    finishHomeTutorial();
    void markHomeTutorialSeenOnServer();
  }, [finishHomeTutorial]);
  const coachStageReady = useCoachStageReady();
  const pathname = usePathname();
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
        <Tabs.Screen name="set-name" options={{ href: null }} />
        <Tabs.Screen name="skin-result" options={{ href: null }} />
        <Tabs.Screen name="calendario" options={{ href: null }} />
        <Tabs.Screen name="alarme" options={{ href: null }} />
        <Tabs.Screen name="progresso" options={{ href: null }} />
      </Tabs>
      {tabBarVisible && <GlobalBottomBar />}
      {/* ⚠️ DEPOIS da navbar e IRMÃO dela, de propósito: o tutorial precisa
          escurecer a tela inteira e iluminar os ícones da barra. Dentro da
          `home.tsx` ele ficaria ABAIXO da navbar por mais zIndex que levasse
          (zIndex só vale entre irmãos; a navbar é do layout, a home é filha do
          <Tabs>). Ver "Feature: Tutorial de primeiro acesso" no README. */}
      {showCoachMarks && <HomeCoachMarks onFinish={handleCoachFinish} />}
      {/* Aviso "Sua rotina está pronta" do lote "Montar minha rotina" (Fase 6) + toque
          no push dele. Irmão da navbar pelo mesmo motivo: fica por cima de qualquer aba. */}
      {!showCoachMarks && <AvisoLote />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Flush na borda inferior, full-width (nav do design 38e).
  navbar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  item: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    marginTop: -6,
  },
  centerLogo: {
    width: 46,
    height: 46,
    resizeMode: 'contain',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: NAV_ACTIVE,
  },
  // Nas abas de ícone o ponto fica na mesma altura do ponto da logo.
  dotAbs: {
    position: 'absolute',
    top: NAV_DOT_TOP,
  },
  // Ponto de notificação no ícone do chat (canto superior direito). No design o
  // span é content-box: 8px + borda de 2px de cada lado = 12px no total.
  badge: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: NAV_BADGE,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
