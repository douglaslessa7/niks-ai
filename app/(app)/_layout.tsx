import { Tabs, usePathname, useRouter, useSegments } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { getCustomerInfo, isSubscribed, loginRevenueCat } from '../../lib/revenuecat';
import { useAppStore } from '../../store/onboarding';
import NameCapture from '../../components/onboarding/NameCapture';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { isNativePresentationOpen, waitForNativePresentationToClose } from '../../lib/nativePresentation';
import { useCoachStageReady } from '../../lib/coachMarks';
import HomeCoachMarks from '../../components/coach/HomeCoachMarks';
import ProdutosCoachMarks from '../../components/coach/ProdutosCoachMarks';
import { finishProdutosTutorial, useProdutosTutorialPending } from '../../lib/produtosTutorial';
import AvisoLote from '../../components/rotina/AvisoLote';
import { markHomeTutorialSeenOnServer } from '../../lib/homeTutorial';

// ── Bottom navbar — réplica da `nav` "splitHouse" da tela 57d do Claude Design
// (projeto "NIKS home redesign", `NiksHomeFlo.dc.html`). Flutua a 26 pt da base:
//   • à esquerda, círculo branco Ø64 com a CASA (Home) — sombra 0 8 22 rgba(192,32,106,.16);
//   • ao lado (gap 14), pílula branca de 60 pt com borda de 1,5 pt em degradê
//     #FFC2DB → #FF5EA8 → #F86B79 (100°), padding 0 10, três ícones line 27 pt em
//     caixas de 60 × 46 (gap 4): rosto (Rotina) · frasco (Produtos) · pessoa (Perfil).
//   • atrás, véu de 130 pt rgba(249,242,245,0) → .85 (70%).
// O NIKS Chat SAIU da navbar (out/2026). Ícones inativos #7A7076; a aba ativa fica
// rosa #FF5EA8 com o ponto rosa embaixo (como antes); a casa ativa é a casa rosa do
// design e, fora da Home, fica cinza como os outros.
const NAV_INACTIVE = '#7A7076';
const NAV_ACTIVE = '#FF5EA8';
// Modo noturno da tab bar (sincronizado com o tema da tela — ex.: protocolo à noite)
const NAV_ACTIVE_DARK = '#FF9D9D';
const NAV_INACTIVE_DARK = '#8B93A8';
const NAV_BG_DARK = '#1A1F2E';
const NAV_ICON = 27;

type NavKey = 'rotina' | 'produtos' | 'perfil';

function NavGlyph({ name, color, active }: { name: NavKey; color: string; active: boolean }) {
  const c = {
    stroke: color,
    strokeWidth: active ? 1.7 : 1.6,
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
      {name === 'perfil' && (
        <>
          <Circle cx={12} cy={8} r={4} {...c} />
          <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...c} />
        </>
      )}
    </Svg>
  );
}

// Casa do design (32 pt): chaminé, telhado em traço 2,5 e corpo preenchido.
function HouseGlyph({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24">
      <Rect x={16} y={4} width={2.7} height={5} rx={0.6} fill={color} />
      <Path d="M2.4 11.4 12 3.4l9.6 8" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path fill={color} d="M5 11.6 12 5.8l7 5.8v8a1.6 1.6 0 0 1-1.6 1.6h-3.1v-5a1 1 0 0 0-1-1h-2.6a1 1 0 0 0-1 1v5H6.6A1.6 1.6 0 0 1 5 19.6z" />
    </Svg>
  );
}

// Ordem da pílula, esquerda→direita: rosto (Rotina) · frasco (Produtos) · pessoa (Perfil).
const NAV_ITEMS: { key: NavKey; route: string }[] = [
  { key: 'rotina',   route: '/protocolo' },
  { key: 'produtos', route: '/recomendacao-produtos' },
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
  // é o topo da aba Produtos.) "Seu nome" (set-name) abre pelo Perfil e o mantém ativo.
  const isActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`)
    || (route === '/protocolo' && (pathname === '/alarme' || pathname === '/progresso'))
    || (route === '/perfil' && pathname === '/set-name');

  const activeColor = isDark ? NAV_ACTIVE_DARK : NAV_ACTIVE;
  const inactiveColor = isDark ? NAV_INACTIVE_DARK : NAV_INACTIVE;
  const surface = isDark ? NAV_BG_DARK : '#FFFFFF';
  const homeActive = isActive('/home');
  // 26 pt da base no frame de 852 (home indicator de 34 → 8 dentro dele).
  const bottom = Math.max(16, insets.bottom - 8);

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
          <HouseGlyph color={homeActive ? activeColor : inactiveColor} />
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
            {NAV_ITEMS.map((it) => {
              const active = isActive(it.route);
              return (
                <TouchableOpacity
                  key={it.key}
                  activeOpacity={0.85}
                  onPress={() => { haptics.tap(); router.push(it.route as any); }}
                  style={styles.item}
                >
                  <NavGlyph name={it.key} color={active ? activeColor : inactiveColor} active={active} />
                  {active && <View style={[styles.dot, { backgroundColor: activeColor }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </LinearGradient>
      </View>
    </>
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
  const coachStageReady = useCoachStageReady('home');
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
    pathname === '/recomendacao-produtos' &&
    produtosTutorialPending &&
    produtosStageReady;

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
        <Tabs.Screen name="dica-do-dia" options={{ href: null }} />
      </Tabs>
      {tabBarVisible && <GlobalBottomBar />}
      {/* ⚠️ DEPOIS da navbar e IRMÃO dela, de propósito: o tutorial precisa
          escurecer a tela inteira, navbar inclusive (designs 58/59). Dentro da
          `home.tsx` ele ficaria ABAIXO da navbar por mais zIndex que levasse
          (zIndex só vale entre irmãos; a navbar é do layout, a home é filha do
          <Tabs>). Ver "Feature: Tutorial de primeiro acesso" no README. */}
      {showCoachMarks && <HomeCoachMarks onFinish={handleCoachFinish} />}
      {showProdutosCoachMarks && <ProdutosCoachMarks onFinish={() => { void finishProdutosTutorial(); }} />}
      {/* Aviso "Sua rotina está pronta" do lote "Montar minha rotina" (Fase 6) + toque
          no push dele. Irmão da navbar pelo mesmo motivo: fica por cima de qualquer aba. */}
      {!showCoachMarks && !showProdutosCoachMarks && <AvisoLote />}
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
  // Ponto da aba ativa, logo abaixo do ícone (como na navbar anterior).
  dot: {
    position: 'absolute',
    bottom: 1,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
