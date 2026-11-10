// ─────────────────────────────────────────────────────────────────────────────
// "Suas conquistas" — réplica das telas 77a–77e (hub) e 78a–78f (cartas raspadas:
// coleções, deck e detalhe) do Claude Design (projeto "NIKS home redesign",
// NiksConquistas.dc.html). Abre pelo foguinho da home, no lugar do calendário.
//
// Como no design, as telas internas vivem DENTRO desta tela, em camadas:
//   hub → (empurra, 480/320 ms) Suas coleções | Medalhas → (fade 200 ms) deck →
//   (cresce e vira, mola) detalhe da carta.
// Medidas do frame 393×852: o topo da barra é 58 = barra de status (54) + 4 →
// `insets.top + 4`; o conteúdo começa em 112 → `insets.top + 58`. Fonte SF Pro.
//
// Dados: sequência e recorde são REAIS (servidor, com o histórico do celular de reserva);
// o calendário é o de check-ins da aba Grupos (components/grupos/CalendarioCheckins). Cartas e
// medalhas vêm de lib/conquistas: exemplo do design só em __DEV__, zerado em produção.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, withRepeat, cancelAnimation,
  Easing, useReducedMotion, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import {
  getRoutineHistory, routineDayStreak, sessionDate, dateKey, type RoutineHistory,
} from '../../lib/routineProgress';
import {
  MEDALHAS_CONQUISTADAS, MEDALHAS_TRANCADAS, TOTAL_MEDALHAS,
  MEDALHAS_NOVAS, PROXIMAS, recordeDias, metaDias, montarColecao, type DeckKey, type Tile,
} from '../../lib/conquistas';
import {
  useEstadoCartas, useColecao, estadoPoder, diaCurto, horaCurta,
} from '../../lib/cartasServidor';
import SeloProtegida from '../../components/conquistas/SeloProtegida';
import DeckBox, { AMBIENT_MS, spr } from '../../components/conquistas/DeckBox';
import Carta, { visualDe } from '../../components/cartas/Carta';
import CalendarioCheckins from '../../components/grupos/CalendarioCheckins';
import VoltarPelaBorda from '../../components/VoltarPelaBorda';
import { usePuxarParaAtualizar } from '../../hooks/usePuxarParaAtualizar';

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIO = Easing.bezier(0.77, 0, 0.175, 1);
const EDR = Easing.bezier(0.32, 0.72, 0, 1);
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1); // 'ease' do CSS

const LOGO = require('../../assets/home/score-logo-pink.png');
const FLOWER = require('../../assets/home/niks-logo.png');
const BG = 'linear-gradient(180deg, #FCE3EE 0%, #FDD5E6 45%, #FCDFEA 72%, #F9F1F4 100%)';
const HEAD = 'linear-gradient(180deg, #FCE3EE 0%, #FCE3EE 62%, rgba(252,227,238,0) 100%)';
const SHEEN = 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9), rgba(255,255,255,0))';

const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';
const VERSO = { k: 'verso' } as const;
const hojeSessaoKey = () => dateKey(sessionDate(new Date()));

// Detalhe da carta (78c/78d): 262×390, centro no frame em (196,5; 426).
const CW = 262, CH = 390;

function Icon({ d, size, color, sw }: { d: string | string[]; size: number; color: string; sw: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
function Lock({ size, color, sw }: { size: number; color: string; sw: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={11} width={16} height={10} rx={2.5} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Fundo comum às telas (degradê + dois círculos), fixo atrás da rolagem.
function Bg() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', experimental_backgroundImage: BG }]}>
      <View style={styles.bgBlob} />
      <View style={styles.bgCircle} />
    </View>
  );
}

// Barra do topo: degradê de 112 pt + botão redondo (X ou voltar) + título. `top` = deslocamento
// do frame do design (insets.top − 54), então os valores abaixo são os do design.
function TopBar({ top, title, back, onPress, label }: { top: number; title: string; back?: boolean; onPress: () => void; label: string }) {
  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: top + 112, experimental_backgroundImage: HEAD }} />
      <View pointerEvents="box-none" style={[styles.bar, { top: top + 58 }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.roundBtn} accessibilityLabel={label}>
          {back ? <Icon d="M15 5l-7 7 7 7" size={18} color={INK} sw={2.2} /> : <Icon d={['M18 6 6 18', 'm6 6 12 12']} size={18} color={INK} sw={2} />}
        </TouchableOpacity>
        <Text style={styles.barTitle}>{title}</Text>
      </View>
    </>
  );
}

// Brilho que atravessa a carta (translateX −160% → 320%, skewX −18°).
function SheenBar({ w, h, frac, p }: { w: number; h: number; frac: number; p: SharedValue<number> }) {
  const sw = w * frac;
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: (-1.6 + 4.8 * p.get()) * sw }, { skewX: '-18deg' }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: -0.3 * h, width: sw, height: 1.6 * h, experimental_backgroundImage: SHEEN }, st]} />;
}

// Entrada dos widgets (77e): mola ζ0,86 r0,55, 70 ms entre eles; opacidade ×1,4,
// sobe 18 pt e escala .96→1. Reduzir movimento: fade de 220 ms (40 ms entre eles).
function Enter({ i, run, rm, children }: { i: number; run: number; rm: boolean; children: React.ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!run) return;
    p.set(0);
    p.set(rm ? withDelay(i * 40, withTiming(1, { duration: 220, easing: EASE })) : withDelay(i * 70, withSpring(1, spr(0.86, 0.55))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  const st = useAnimatedStyle(() => {
    const v = p.get();
    if (rm) return { opacity: v };
    return { opacity: Math.min(1, Math.max(0, v * 1.4)), transform: [{ translateY: (1 - v) * 18 }, { scale: 0.96 + 0.04 * v }] };
  });
  return <Animated.View style={st}>{children}</Animated.View>;
}

// Número que conta até o valor (mola ζ1 r0,9). Só re-renderiza quando o inteiro muda.
function useCount(to: number, run: number, delay: number, rm: boolean): number {
  const [v, setV] = useState(to);
  const lastRun = useRef(0);
  useEffect(() => {
    if (!run) return;
    // Dado novo no meio da mesma abertura (o estado do servidor chegou depois): só troca.
    if (rm || lastRun.current === run) { setV(to); return; }
    lastRun.current = run;
    setV(0);
    const k = Math.pow((2 * Math.PI) / 0.9, 2), c = (4 * Math.PI) / 0.9;
    let x = 0, vel = 0, last = 0, raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000); last = now;
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) { vel += (-k * (x - to) - c * vel) * h; x += vel * h; }
      if (Math.abs(vel) < 0.02 && Math.abs(x - to) < 0.01) { setV(to); return; }
      const r = Math.round(x);
      setV((prev) => (prev === r ? prev : r));
      raf = requestAnimationFrame(step);
    };
    const t = setTimeout(() => { last = performance.now(); raf = requestAnimationFrame(step); }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [run, to, delay, rm]);
  return v;
}

type Frame = { x: number; y: number; w: number; h: number };
type Screen = 'hub' | 'album' | 'medals';

export default function Conquistas() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const rm = useReducedMotion();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const top = insets.top - 54; // deslocamento do frame do design (barra de status 54)

  const [hist, setHist] = useState<RoutineHistory>({});
  const [now, setNow] = useState(() => new Date());
  const [run, setRun] = useState(0);

  // Camadas
  const [scr, setScr] = useState<Screen>('hub');
  const [last, setLast] = useState<'album' | 'medals'>('album');
  const [deck, setDeck] = useState<DeckKey | null>(null);
  const [dk, setDk] = useState<DeckKey>('colecionavel');
  const [card, setCard] = useState<number | null>(null);
  const [ck, setCk] = useState(0);
  const [spread, setSpread] = useState({ run: 0, ox: 0, oy: 0 });
  const src = useSharedValue<Frame | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pushP = useSharedValue(0);
  const pushO = useSharedValue(0);
  const l2O = useSharedValue(0);
  const dO = useSharedValue(0);
  const flip = useSharedValue(1);
  const bar = useSharedValue(0);
  const streakSheen = useSharedValue(0);
  const sheen = useSharedValue(0);
  const clock = useSharedValue(0);
  const skipEnter = useRef(false);
  const deckScroll = useRef<ScrollView>(null);

  // ── Dados reais: sequência, recorde e proteção vêm do servidor (estado da função
  // `cartas`); sem ele ainda (1ª abertura offline), o histórico do celular. Cartas:
  // a coleção raspada (cartas_usuario), em decks por família.
  const { data: estado, refresh: recarregarEstado } = useEstadoCartas();
  const { data: itens, refresh: recarregarColecao } = useColecao();
  // Puxar para atualizar (10/nov/2026): cartas, coleção e o calendário (consulta própria).
  const [recargaCal, setRecargaCal] = useState(0);
  const puxar = usePuxarParaAtualizar([recarregarEstado, recarregarColecao, () => setRecargaCal((n) => n + 1)], top + 100);
  const col = useMemo(() => montarColecao(itens, diaCurto), [itens]);
  const dias = estado?.sequencia.atual ?? routineDayStreak(hist, now);
  const recorde = Math.max(estado?.sequencia.recorde ?? recordeDias(hist, now), dias);
  const protegida = (estado?.poderes.protecao ?? 0) > 0;
  const hojeSessao = estado?.hoje ?? dateKey(sessionDate(now));
  const meta = metaDias(dias);
  const falta = meta - dias;
  const frac = Math.min(1, dias / meta);

  // Ao focar: tela cheia (sem navbar), histórico fresco e a entrada dos widgets. Voltar
  // do calendário completo não repete a entrada.
  useFocusEffect(useCallback(() => {
    setTabBarVisible(false);
    const fresh = !skipEnter.current;
    skipEnter.current = false;
    if (fresh) {
      setScr('hub'); setDeck(null); setCard(null);
      pushP.set(0); pushO.set(0); l2O.set(0); dO.set(0);
    }
    setNow(new Date());
    getRoutineHistory().then((h) => { setHist(h); if (fresh) setRun((r) => r + 1); });
    // Ambiente: relógio do respirar/reflexo e o brilho que passa a cada 5 s.
    if (!rm) clock.set(withRepeat(withTiming(AMBIENT_MS, { duration: AMBIENT_MS, easing: Easing.linear }), -1, false));
    const shine = setInterval(() => {
      if (rm) return;
      sheen.set(0);
      sheen.set(withTiming(1, { duration: 820, easing: EIO }));
    }, 5000);
    return () => { setTabBarVisible(true); clearInterval(shine); cancelAnimation(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTabBarVisible, rm]));

  // Barra da meta: começa vazia e enche com a mola da home (ζ0,78 r0,6) aos 260 ms;
  // brilho na carta da meta aos 820 ms.
  useEffect(() => {
    if (!run) return;
    if (rm) { bar.set(withTiming(frac, { duration: 240, easing: EASE })); return; }
    bar.set(0);
    bar.set(withDelay(260, withSpring(frac, spr(0.78, 0.6, 0.001))));
    streakSheen.set(0);
    streakSheen.set(withDelay(820, withTiming(1, { duration: 820, easing: EIO })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const n6 = useCount(dias, run, 120, rm);
  const n23 = useCount(col.total, run, 190, rm);

  // ── Navegação entre as camadas ────────────────────────────────────────────
  const push = (which: 'album' | 'medals') => {
    haptics.tap();
    setScr(which); setLast(which);
    if (rm) pushO.set(withTiming(1, { duration: 220, easing: EASE }));
    else { pushO.set(1); pushP.set(withTiming(1, { duration: 480, easing: EDR })); }
  };
  const pop = () => {
    haptics.tap();
    setScr('hub');
    if (rm) pushO.set(withTiming(0, { duration: 220, easing: EASE }));
    else pushP.set(withTiming(0, { duration: 320, easing: EDR }));
  };
  const openDeck = (k: DeckKey, f: Frame) => {
    const show = () => {
      deckScroll.current?.scrollTo({ y: 0, animated: false });
      setDeck(k); setDk(k);
      if (!rm) setSpread((s) => ({ run: s.run + 1, ox: f.x + f.w / 2, oy: f.y + f.h / 2 - 70 }));
      l2O.set(withTiming(1, { duration: 200, easing: EASE }));
    };
    if (rm) show(); else later(360, show);
  };
  const closeDeck = () => {
    haptics.tap();
    setDeck(null);
    l2O.set(withTiming(0, { duration: 240, easing: EASE }));
  };
  const cardTop = top + 231;
  const openCard = (i: number, f: Frame) => {
    haptics.tap();
    src.set(f);
    setCard(i); setCk(i);
    dO.set(withTiming(1, { duration: rm ? 220 : 120, easing: EASE }));
    if (rm) { flip.set(1); return; }
    flip.set(0);
    flip.set(withSpring(1, spr(0.88, 0.6)));
  };
  const finishClose = () => { setCard(null); dO.set(withTiming(0, { duration: rm ? 220 : 160, easing: EASE })); };
  const closeCard = (tapped: boolean) => {
    if (card == null) return;
    if (tapped) haptics.tap();
    if (rm) { finishClose(); return; }
    flip.set(withSpring(0, spr(1, 0.45), (done) => { if (done) scheduleOnRN(finishClose); }));
  };

  // ── Estilos animados das camadas ──────────────────────────────────────────
  const hubSt = useAnimatedStyle(() => ({ transform: [{ translateX: rm ? 0 : -0.28 * W * pushP.get() }] }));
  const dimSt = useAnimatedStyle(() => ({ opacity: 0.12 * (rm ? pushO.get() : pushP.get()) }));
  const pushSt = useAnimatedStyle(() => (rm ? { opacity: pushO.get() } : { opacity: 1, transform: [{ translateX: W * (1 - pushP.get()) }] }));
  const l2St = useAnimatedStyle(() => ({ opacity: l2O.get() }));
  const dSt = useAnimatedStyle(() => ({ opacity: dO.get() }));
  const barSt = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0, bar.get()) }] }));

  const cx0 = W / 2, cy0 = cardTop + CH / 2;
  const flipT = (back: boolean) => {
    'worklet';
    const p = flip.get();
    // Parada (aberta): sem transform 3D — com a perspectiva o iOS rasteriza a borda de 1,5 pt
    // com o dobro da espessura.
    if (p === 1) return back ? [] : [{ rotateY: '180deg' }];
    const s = src.get();
    const dx = s ? s.x + s.w / 2 - cx0 : 0, dy = s ? s.y + s.h / 2 - cy0 : 0;
    const sx = s ? s.w / CW : 0.3, sy = s ? s.h / CH : 0.3;
    const t: object[] = [
      { perspective: 1100 }, { translateX: dx * (1 - p) }, { translateY: dy * (1 - p) },
      { scaleX: sx + (1 - sx) * p }, { scaleY: sy + (1 - sy) * p }, { rotateY: `${180 * p}deg` },
    ];
    if (back) t.push({ rotateY: '180deg' });
    return t;
  };
  // Face pelo cosseno do giro (backfaceVisibility com perspectiva some com a frente no iOS).
  const frontSt = useAnimatedStyle(() => ({ opacity: Math.cos(Math.PI * flip.get()) >= 0 ? 1 : 0, transform: flipT(false) as any }));
  const backSt = useAnimatedStyle(() => ({ opacity: Math.cos(Math.PI * flip.get()) < 0 ? 1 : 0, transform: flipT(true) as any }));

  const deckObj = col.decks.find((d) => d.k === dk) ?? col.decks[0];
  const tiles = col.tiles[dk];
  // Mural "Suas cartas" (nov/2026, no lugar de "Suas coleções"): TODAS as cartas raspadas,
  // de todas as famílias, da mais recente para a mais antiga; colecionáveis repetidas viram
  // uma só com o selo "x2". O detalhe abre a partir daqui.
  const mural = useMemo(
    () => [...col.tiles.colecionavel, ...col.tiles.conhecimento, ...col.tiles.poder]
      .sort((a, b) => (a.item.raspada_em < b.item.raspada_em ? 1 : -1)),
    [col],
  );
  const dt: Tile | undefined = mural[ck];
  const dFam = (dt?.item.carta.familia ?? 'colecionavel') as DeckKey;
  const deckSub = dk === 'colecionavel'
    ? `${tiles.length} ${tiles.length === 1 ? 'carta' : 'cartas'}, repetidas agrupadas com o selo`
    : dk === 'poder'
      ? `${tiles.length} ${tiles.length === 1 ? 'carta de poder' : 'cartas de poder'}, da mais recente para a mais antiga`
      : `${tiles.length} ${tiles.length === 1 ? 'carta' : 'cartas'}, da mais recente para a mais antiga`;
  const gridW = W - 36;
  const cellW = (gridW - 30) / 4;
  const gridTop = insets.top + 58 + 18 + 16;

  return (
    <VoltarPelaBorda onVoltar={() => { if (card != null) closeCard(true); else if (deck != null) closeDeck(); else if (scr !== 'hub') pop(); else router.navigate('/home' as any); }}>
    <View style={{ flex: 1, backgroundColor: '#F9F1F4' }}>
      <StatusBar style="dark" />

      {/* ═══ Hub (77a/77b) ═══════════════════════════════════════════════ */}
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, hubSt]}>
        <Bg />
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={puxar} contentContainerStyle={{ paddingTop: top + 112, paddingBottom: 56 }}>
          {/* w0 · sequência */}
          <Enter i={0} run={run} rm={rm}>
            <View style={styles.streakCard}>
              <View style={{ paddingRight: 96 }}>
                <View style={styles.streakRow}>
                  <Svg width={30} height={30} viewBox="0 0 24 24"><Path d={FLAME} fill={PINK} /></Svg>
                  <Text style={styles.streakNum}>{n6}</Text>
                  <Text style={styles.streakUnit}>{dias === 1 ? 'dia seguido' : 'dias seguidos'}</Text>
                </View>
                {/* 79g: com a Proteção armada, o selo entra embaixo de "N dias seguidos" */}
                {protegida && <SeloProtegida run={run} rm={rm} origem="left" style={{ marginTop: 6 }} />}
                <Text style={[styles.record, protegida && { marginTop: 8 }]}>
                  {`Seu recorde: ${recorde} ${recorde === 1 ? 'dia' : 'dias'}${protegida ? ' · se falhar 1 dia, não zera' : ''}`}
                </Text>
                <View style={styles.goalTrack}>
                  <Animated.View style={[styles.goalFill, barSt]} />
                  <View style={styles.goalLabelWrap}><Text style={styles.goalLabel}>{`${dias} / ${meta}`}</Text></View>
                </View>
                <Text style={styles.goalHint}>{`${falta === 1 ? 'Falta 1 dia' : `Faltam ${falta} dias`} para ${meta} dias seguidos`}</Text>
              </View>
              {/* top:50% do CSS = centro da caixa de padding; no Yoga a % é da caixa de conteúdo,
                  então centralizamos num invólucro de cima a baixo. */}
              <View pointerEvents="none" style={styles.goalWrap}>
              <View style={styles.goalCard}>
                <View style={styles.goalCardShadow}>
                  <View style={styles.goalCardClip}>
                    <Carta v={VERSO} w={78} h={106} semSombra />
                    <SheenBar w={78} h={106} frac={0.46} p={streakSheen} />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(252,236,243,0.55)' }]} />
                  </View>
                </View>
                <View style={styles.goalLock}><Lock size={15} color={PINK} sw={2.2} /></View>
                <View style={styles.metaPill}><Text style={styles.metaPillText}>{`Meta ${meta} dias`}</Text></View>
              </View>
              </View>
            </View>
          </Enter>

          {/* w1 · Cartas raspadas + Medalhas */}
          <Enter i={1} run={run} rm={rm}>
            <View style={styles.pair}>
              {/* Regras novas das cartas (05/nov/2026): o card mostra só quantas ela já raspou e não
                  abre nada (o mural "Suas cartas" e o "x2" saíram do caminho; continuam no código). */}
              <View style={styles.pairCard} accessible accessibilityLabel={`Você já raspou ${col.total} ${col.total === 1 ? 'carta' : 'cartas'}`}>
                <Text style={[styles.pairTitle, { maxWidth: 104 }]}>{`Você já raspou ${n23} ${n23 === 1 ? 'carta' : 'cartas'}`}</Text>
                <View pointerEvents="none" style={styles.miniFan}>
                  {[{ l: 4, t: 18, r: -16 }, { l: 26, t: 8, r: -2 }, { l: 48, t: 2, r: 12, front: true }].map((c, i) => (
                    <View key={i} style={[styles.miniCard, { left: c.l, top: c.t, transform: [{ rotate: `${c.r}deg` }], boxShadow: c.front ? '0px 6px 14px rgba(200,60,120,0.22)' : '0px 4px 10px rgba(200,60,120,0.18)' }]}>
                      <View style={styles.miniClip}>
                        <Carta v={VERSO} w={44} h={62} semSombra />
                        {c.front && <SheenBar w={44} h={62} frac={0.46} p={sheen} />}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
              {/* Medalhas: a função entra na próxima build. Por enquanto o card não abre a
                  tela de medalhas (que continua no código) e só mostra "Em breve". */}
              <View style={[styles.pairCard, styles.pairCardOff]} accessible accessibilityLabel="Medalhas, em breve" accessibilityState={{ disabled: true }}>
                <Text style={[styles.pairTitle, { color: MUTE }]}>Medalhas</Text>
                {/* Medalha "trancada" (as cores da 77d), apagada */}
                <View pointerEvents="none" style={[styles.medalDecor, { opacity: 0.7 }]}>
                  <View style={[styles.ribbon, { left: 20, width: 16, height: 40, backgroundColor: '#E9E9EB', transform: [{ rotate: '-16deg' }] }]} />
                  <View style={[styles.ribbon, { left: 44, width: 16, height: 40, backgroundColor: '#E0E0E3', transform: [{ rotate: '16deg' }] }]} />
                  <View style={[styles.medalDisc, { left: 8, top: 30, backgroundColor: '#F0F0F0', boxShadow: '0px 1px 3px rgba(0,0,0,0.08)' }]}>
                    <Image source={LOGO} style={{ width: 30, height: 30, opacity: 0.3 }} />
                  </View>
                </View>
                {/* "Em breve" em destaque, no centro do card */}
                <View pointerEvents="none" style={styles.emBreveWrap}>
                  <View style={styles.emBreve}>
                    <Icon d={['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'M12 6v6l4 2']} size={14} color="#FFFFFF" sw={2.4} />
                    <Text style={styles.emBreveText}>Em breve</Text>
                  </View>
                </View>
              </View>
            </View>
          </Enter>

          {/* w2 · Próximas conquistas */}
          <Enter i={2} run={run} rm={rm}>
            <Text style={styles.sectionTitle}>Próximas conquistas</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 6 }}>
              {PROXIMAS.map((m) => (
                <View key={m.name} style={styles.nextCard}>
                  <View style={{ width: 44, height: 44 }}>
                    <View style={styles.nextIcon}><Image source={LOGO} style={{ width: 22, height: 22, opacity: 0.35 }} /></View>
                    <View style={styles.nextLock}><Lock size={11} color={MUTE} sw={2.4} /></View>
                  </View>
                  <Text style={styles.nextName} numberOfLines={2} lineBreakStrategyIOS="standard">{m.name}</Text>
                  <View style={styles.nextTrack}><View style={[styles.nextFill, { transform: [{ scaleX: m.c / m.t }] }]} /></View>
                  <Text style={styles.nextLabel}>{`${m.c}/${m.t}`}</Text>
                </View>
              ))}
            </ScrollView>
          </Enter>

          {/* w3 · calendário de check-ins do mês — o MESMO da aba Grupos (81a) */}
          <Enter i={3} run={run} rm={rm}>
            <CalendarioCheckins abertura={run} rm={rm} entrada={false} style={styles.calCard} atualizar={recargaCal} />
          </Enter>

          {/* w4 · Ver todos os check-ins → calendário completo */}
          <Enter i={4} run={run} rm={rm}>
            <View style={{ marginTop: 16, alignItems: 'center' }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { haptics.tap(); skipEnter.current = true; router.push('/calendario?de=conquistas' as any); }}
                style={styles.allBtn}
              >
                <Text style={styles.allBtnText}>Ver todos os check-ins</Text>
                <Icon d="M9 6l6 6-6 6" size={14} color={PINK} sw={2.6} />
              </TouchableOpacity>
            </View>
          </Enter>
        </ScrollView>
        <TopBar top={top} title="Suas conquistas" onPress={() => { haptics.tap(); router.navigate('/home' as any); }} label="Fechar" />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: INK }, dimSt]} />
      </Animated.View>

      {/* ═══ Suas coleções (77c/78a) · Medalhas (77d) ═════════════════════ */}
      <Animated.View pointerEvents={scr !== 'hub' ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.pushLayer, pushSt]}>
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <Bg />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: top + 112, paddingHorizontal: 18, paddingBottom: 56 }}>
          {last === 'album' ? (
            <>
              {/* "Suas cartas": o mural com todas as cartas, no visual da grade do deck (78b/79e).
                  As caixas de baralho (DeckBox) e a tela do deck ficaram fora do fluxo. */}
              <Text style={styles.lead}>{`${col.total} ${col.total === 1 ? 'carta colecionada' : 'cartas colecionadas'}`}</Text>
              <View style={{ marginTop: 16, gap: 10 }}>
                {Array.from({ length: Math.ceil(mural.length / 4) }, (_, r) => (
                  <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                    {mural.slice(r * 4, r * 4 + 4).map((t, j) => {
                      const i = r * 4 + j;
                      return (
                        <GridCard
                          key={`mural-${t.key}`} t={t} fam={t.item.carta.familia as DeckKey} i={i} w={cellW}
                          cx={0} cy={0} spread={SEM_SPREAD} rm={rm} hidden={card === i} sheen={sheen}
                          onOpen={(f) => openCard(i, f)}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.lead}>{`${MEDALHAS_CONQUISTADAS.length} de ${TOTAL_MEDALHAS} conquistadas. As trancadas mostram o que falta.`}</Text>
              {MEDALHAS_CONQUISTADAS.length > 0 && (
                <>
                  <Text style={[styles.medTitle, { marginTop: 22 }]}>Conquistadas</Text>
                  <MedalGrid
                    items={MEDALHAS_CONQUISTADAS}
                    render={(m) => (
                      <>
                        <Medal on />
                        <Text style={styles.medName} numberOfLines={2} lineBreakStrategyIOS="standard">{m.name}</Text>
                        <Text style={styles.medDate}>{m.date}</Text>
                      </>
                    )}
                  />
                </>
              )}
              <Text style={[styles.medTitle, { marginTop: MEDALHAS_CONQUISTADAS.length ? 26 : 22 }]}>Trancadas</Text>
              <MedalGrid
                items={MEDALHAS_TRANCADAS}
                render={(m) => (
                  <>
                    <Medal on={false} />
                    <Text style={[styles.medName, { color: '#515151' }]} numberOfLines={2} lineBreakStrategyIOS="standard">{m.name}</Text>
                    <View style={styles.medTrack}><View style={[styles.medFill, { transform: [{ scaleX: m.c / m.t }] }]} /></View>
                    <Text style={styles.medLabel}>{`${m.c}/${m.t}`}</Text>
                  </>
                )}
              />
            </>
          )}
        </ScrollView>
        <TopBar top={top} title={last === 'album' ? 'Suas cartas' : 'Medalhas'} back onPress={pop} label="Voltar" />
        </View>
      </Animated.View>

      {/* ═══ Dentro do deck (78b) ══════════════════════════════════════════ */}
      <Animated.View pointerEvents={deck ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.pushLayer, l2St]}>
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <Bg />
        <ScrollView ref={deckScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: top + 112, paddingHorizontal: 18, paddingBottom: 56 }}>
          <Text style={styles.lead}>{deckSub}</Text>
          <View style={{ marginTop: 16, gap: 10 }}>
            {Array.from({ length: Math.ceil(tiles.length / 4) }, (_, r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                {tiles.slice(r * 4, r * 4 + 4).map((t, j) => {
                  const i = r * 4 + j;
                  return (
                    <GridCard
                      key={`${dk}-${t.key}`} t={t} fam={dk} i={i} w={cellW}
                      cx={18 + (i % 4) * (cellW + 10) + cellW / 2} cy={gridTop + Math.floor(i / 4) * 121 + 55.5}
                      spread={spread} rm={rm} hidden={card === i} sheen={sheen}
                      onOpen={(f) => openCard(i, f)}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
        <TopBar top={top} title={deckObj.titulo} back onPress={closeDeck} label="Voltar" />
        </View>
      </Animated.View>

      {/* ═══ Detalhe da carta (78c/78d) ═══════════════════════════════════ */}
      <Animated.View pointerEvents={card != null ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: 20 }, dSt]}>
        <Pressable onPress={() => closeCard(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(252,228,238,0.78)' }]} accessibilityLabel="Fechar carta" />
        <TouchableOpacity activeOpacity={0.7} onPress={() => closeCard(true)} style={[styles.roundBtn, { top: top + 58, left: W - 16 - 38, zIndex: 2 }]} accessibilityLabel="Fechar">
          <Icon d={['M18 6 6 18', 'm6 6 12 12']} size={18} color={INK} sw={2} />
        </TouchableOpacity>
        {dt && (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: (W - CW) / 2, top: cardTop, width: CW, height: CH, zIndex: 1 }}>
            {/* Frente: o verso da rodada 84a */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, frontSt]}>
              <Carta v={VERSO} w={CW} h={CH} />
            </Animated.View>
            {/* Verso raspado: a carta da rodada 84; embaixo, quando foi raspada (ou quantas ela tem) */}
            <Animated.View style={[StyleSheet.absoluteFill, backSt]}>
              <Carta
                v={visualDe(dt.item, dFam === 'poder' ? estadoPoder(dt.item.poder, dt.item.carta.subtipo ?? '', hojeSessao) : null)}
                w={CW} h={CH} pontos={dt.item.pontos ? dt.item.pontos : null}
              />
              <View pointerEvents="none" style={styles.dInfo}>
                {dFam === 'colecionavel' && !dt.rara ? (
                  <View style={styles.cDup}>
                    <Icon d={COPY} size={16} color={PINK} sw={2} />
                    <Text style={styles.cDupMain}>{`Você tem ${dt.vezes}`}</Text>
                    <Text style={styles.cDupLast}>{dt.vezes > 1 ? `· última em ${diaCurto(dt.item.raspada_em)}` : `· raspada em ${diaCurto(dt.item.raspada_em)}`}</Text>
                  </View>
                ) : (
                  <Text style={styles.dWhenInfo}>{quando(dt.item.raspada_em)}</Text>
                )}
                <Text style={[styles.dFoot, { marginTop: 10 }]}>Toque fora para fechar</Text>
              </View>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </View>
    </VoltarPelaBorda>
  );
}

// Grade de 3 colunas em linhas explícitas (flexWrap com folga zero quebra no Fabric —
// README #29). Espaço 14 entre linhas, 10 entre colunas.
function MedalGrid<T>({ items, render }: { items: T[]; render: (m: T) => React.ReactNode }) {
  const rows = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
  return (
    <View style={{ marginTop: 12, gap: 14 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1, 2].map((j) => (
            <View key={j} style={{ flex: 1, alignItems: 'center' }}>{row[j] != null && render(row[j])}</View>
          ))}
        </View>
      ))}
    </View>
  );
}

// Medalha 74×86: duas fitas inclinadas e o disco. Conquistada = rosa com a flor
// branca; trancada = cinza, logo apagada e cadeado.
function Medal({ on }: { on: boolean }) {
  return (
    <View style={{ width: 74, height: 86 }}>
      <View style={[styles.ribbon, { left: 19, width: 14, height: 34, backgroundColor: on ? '#FFB3D4' : '#E9E9EB', transform: [{ rotate: '-16deg' }] }]} />
      <View style={[styles.ribbon, { left: 41, width: 14, height: 34, backgroundColor: on ? '#FF8CC0' : '#E0E0E3', transform: [{ rotate: '16deg' }] }]} />
      {on ? (
        <View style={[styles.medalDisc, { left: 5, top: 22 }]}>
          <Image source={FLOWER} style={{ width: 34, height: 34, tintColor: '#FFFFFF' }} resizeMode="contain" />
        </View>
      ) : (
        <View style={[styles.medalDisc, { left: 5, top: 22, backgroundColor: '#F0F0F0', boxShadow: '0px 1px 3px rgba(0,0,0,0.08)' }]}>
          <Image source={LOGO} style={{ width: 30, height: 30, opacity: 0.3 }} />
        </View>
      )}
      {!on && <View style={styles.medalLock}><Lock size={12} color={MUTE} sw={2.4} /></View>}
    </View>
  );
}

const SEM_SPREAD = { run: 0, ox: 0, oy: 0 };
const COPY = ['M5.5 6h8A2.5 2.5 0 0 1 16 8.5v11a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 19.5v-11A2.5 2.5 0 0 1 5.5 6z', 'M8 3h11a2 2 0 0 1 2 2v13'];
const quando = (iso: string) => `Raspada em ${diaCurto(iso).replace(' ', ' de ')} · ${horaCurta(iso)}`;

// Carta da grade do deck. Ao abrir o deck, sai do monte (no lugar da caixa tocada) até
// a célula dela com mola (ζ0,9 r0,55), 28 ms entre as cartas, girando ±8° e de .92→1.
// Colecionáveis (79e): sem data, "Carta colecionável" embaixo e o selo "x2" no canto.
// Raras (só colecionáveis podem ser — motor de cartas): reflexo mais forte, brilho que
// passa e a sombra rosa. O selo "Rara" não aparece (embaixo fica "Carta colecionável").
function GridCard({
  t, fam, i, w, cx, cy, spread, rm, hidden, sheen, onOpen,
}: {
  t: Tile; fam: DeckKey; i: number; w: number; cx: number; cy: number; spread: { run: number; ox: number; oy: number };
  rm: boolean; hidden: boolean; sheen: SharedValue<number>; onOpen: (f: Frame) => void;
}) {
  const animate = spread.run > 0 && !rm && i < 16;
  const p = useSharedValue(animate ? 0 : 1);
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!animate) { p.set(1); return; }
    p.set(0);
    p.set(withDelay(i * 28, withSpring(1, spr(0.9, 0.55))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread.run]);
  const dx = spread.ox - cx, dy = spread.oy - cy, rot = ((i % 3) - 1) * 8;
  const st = useAnimatedStyle(() => {
    const v = p.get();
    return { transform: [{ translateX: dx * (1 - v) }, { translateY: dy * (1 - v) }, { rotate: `${rot * (1 - v)}deg` }, { scale: 0.92 + 0.08 * v }] };
  });
  const coll = fam === 'colecionavel' && !t.rara;
  const date = diaCurto(t.item.raspada_em);
  const visual = useMemo(() => visualDe(t.item, t.item.carta.familia === 'poder' ? estadoPoder(t.item.poder, t.item.carta.subtipo ?? '', hojeSessaoKey()) : null), [t.item]);
  return (
    <Animated.View style={[{ width: w, height: 111, opacity: hidden ? 0 : 1 }, st]}>
      <TouchableOpacity
        ref={ref as any}
        activeOpacity={0.85}
        onPress={() => ref.current?.measureInWindow((x, y, ww, hh) => onOpen({ x, y, w: ww, h: hh }))}
        style={styles.gridCard}
        accessibilityLabel={coll ? `Carta colecionável${t.vezes > 1 ? `, x${t.vezes}` : ''}` : `${t.item.carta.nome}, ${date}`}
      >
        {/* A carta da rodada 84 em miniatura (parada: o mural tem muitas). O "x2" das repetidas fica. */}
        <Carta v={visual} w={w} h={111} parado faiscasFora={false} />
        {coll && t.vezes > 1 && (
          <View style={styles.dupBadge}><Text style={styles.dupBadgeText}>{`x${t.vezes}`}</Text></View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}




const styles = StyleSheet.create({
  bgBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280, left: 190, top: -90,
    experimental_backgroundImage: 'radial-gradient(circle at 30% 75%, rgba(255,170,205,0.34), rgba(255,255,255,0.2))',
  },
  bgCircle: { position: 'absolute', width: 620, height: 620, borderRadius: 310, left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)' },
  bar: { position: 'absolute', left: 0, right: 0, height: 38, alignItems: 'center', justifyContent: 'center' },
  roundBtn: {
    position: 'absolute', left: 16, top: 0, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  barTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },
  pushLayer: { backgroundColor: '#F9F1F4', boxShadow: '-12px 0px 30px rgba(120,40,70,0.14)' },

  // w0
  streakCard: {
    marginHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.8)',
    boxShadow: '0px 8px 22px rgba(255,94,168,0.12)', padding: 16,
  },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 48 },
  streakNum: { fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1.4, color: INK, fontVariant: ['tabular-nums'] },
  streakUnit: { fontSize: 20, fontWeight: '600', letterSpacing: -0.5, marginLeft: 2, paddingTop: 6, color: INK },
  record: { marginTop: 2, fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1 },
  goalTrack: { marginTop: 14, height: 12, borderRadius: 100, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  goalFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  goalLabelWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  goalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2, color: '#FFFFFF' },
  goalHint: { marginTop: 8, fontSize: 13, lineHeight: 17, color: MUTE, letterSpacing: -0.1 },
  goalWrap: { position: 'absolute', right: -10, top: 0, bottom: 0, width: 78, justifyContent: 'center' },
  goalCard: { width: 78, height: 106, transform: [{ rotate: '8deg' }] },
  goalCardShadow: { ...StyleSheet.absoluteFillObject, borderRadius: 22 * (78 / 220), boxShadow: '0px 6px 14px rgba(200,60,120,0.22)' },
  goalCardClip: { flex: 1, borderRadius: 22 * (78 / 220), overflow: 'hidden' },
  goalLock: {
    position: 'absolute', left: '50%', top: '50%', width: 30, height: 30, marginLeft: -15, marginTop: -15, borderRadius: 15,
    backgroundColor: '#FFFFFF', boxShadow: '0px 4px 10px rgba(200,60,120,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  metaPill: {
    position: 'absolute', bottom: -12, alignSelf: 'center', height: 20, paddingHorizontal: 8, borderRadius: 100,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(255,94,168,0.35)', justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  metaPillText: { fontSize: 10, fontWeight: '700', color: PINK, letterSpacing: 0.1 },

  // w1
  pair: { marginTop: 12, marginHorizontal: 18, flexDirection: 'row', gap: 10 },
  pairCard: {
    flex: 1, height: 150, borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.78)',
    paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12,
  },
  // Card desativado (Medalhas até a próxima build): borda e fundo cinza, sem toque.
  pairCardOff: { borderColor: '#E3E3E6', backgroundColor: 'rgba(255,255,255,0.55)' },
  emBreveWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  emBreve: {
    height: 30, paddingLeft: 11, paddingRight: 14, borderRadius: 100, backgroundColor: PINK,
    flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: '0px 6px 12px rgba(255,94,168,0.35)',
  },
  emBreveText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1, color: '#FFFFFF' },
  pairTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, lineHeight: 18, color: INK },
  pairOf: { fontSize: 15, fontWeight: '500', color: MUTE, letterSpacing: -0.2 },
  pill: {
    position: 'absolute', left: 14, bottom: 14, height: 22, paddingHorizontal: 9, borderRadius: 100, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(255,94,168,0.35)', flexDirection: 'row', alignItems: 'center',
  },
  pillText: { fontSize: 11, fontWeight: '700', color: PINK, letterSpacing: 0.1 },
  miniFan: { position: 'absolute', right: -14, bottom: -10, width: 96, height: 84 },
  miniCard: { position: 'absolute', width: 44, height: 62, borderRadius: 22 * (44 / 220) },
  miniClip: { flex: 1, borderRadius: 22 * (44 / 220), overflow: 'hidden' },
  medalDecor: { position: 'absolute', right: -12, bottom: -10, width: 84, height: 96 },
  ribbon: { position: 'absolute', top: 0, borderRadius: 3 },
  medalDisc: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32, backgroundColor: PINK, borderWidth: 3, borderColor: '#FFFFFF',
    boxShadow: '0px 10px 22px rgba(255,94,168,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  medalLock: {
    position: 'absolute', right: 2, bottom: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 6px rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center',
  },

  // w2
  sectionTitle: { marginTop: 26, marginHorizontal: 18, fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },
  nextCard: { width: 132, borderRadius: 16, borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.78)', padding: 12 },
  nextIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  nextLock: {
    position: 'absolute', right: -4, bottom: -3, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
    boxShadow: '0px 2px 6px rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  nextName: { marginTop: 10, height: 34, fontSize: 14, lineHeight: 17, fontWeight: '600', letterSpacing: -0.2, color: INK },
  nextTrack: { marginTop: 8, height: 6, borderRadius: 100, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  nextFill: { width: '100%', height: '100%', borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  nextLabel: { marginTop: 6, fontSize: 12, color: MUTE, letterSpacing: -0.1, fontVariant: ['tabular-nums'] },

  // w3 · só o encaixe na coluna do hub (18 das bordas); o card é o CalendarioCheckins.
  calCard: { marginTop: 18, marginHorizontal: 18 },

  // w4
  allBtn: {
    height: 48, paddingLeft: 24, paddingRight: 22, borderRadius: 100, backgroundColor: '#FFFFFF', borderWidth: 1,
    borderColor: 'rgba(255,94,168,0.35)', flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  allBtnText: { color: PINK, fontSize: 16, fontWeight: '600', letterSpacing: -0.3 },

  // Coleções / medalhas / deck
  lead: { fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1 },
  medTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },
  medName: { marginTop: 8, fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: -0.2, height: 32, textAlign: 'center', color: INK },
  medDate: { marginTop: 2, fontSize: 11, color: MUTE, letterSpacing: -0.1 },
  medTrack: { marginTop: 6, width: 64, height: 4, borderRadius: 100, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  medFill: { width: '100%', height: '100%', borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  medLabel: { marginTop: 4, fontSize: 11, color: MUTE, letterSpacing: -0.1, fontVariant: ['tabular-nums'] },

  gridCard: { flex: 1, borderRadius: 12 },
  dupBadge: {
    position: 'absolute', right: 5, top: 5, height: 17, minWidth: 22, paddingHorizontal: 5, borderRadius: 100, backgroundColor: PINK,
    borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(200,60,120,0.25)',
  },
  dupBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0 },

  // Verso de poder (79a–79d)

  // Verso da colecionável (79f)
  cDup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#FFF0F7' },
  cDupMain: { fontSize: 13, fontWeight: '600', letterSpacing: -0.2, color: INK },
  cDupLast: { fontSize: 13, color: MUTE, letterSpacing: -0.1 },

  // Detalhe
  dLevel: { marginTop: 8, alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: 100, backgroundColor: PINK, justifyContent: 'center' },
  dLevelText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', letterSpacing: -0.1 },
  dCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  dRecT: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: -0.2, color: INK },
  dRecD: { marginTop: 1, fontSize: 12, lineHeight: 15, color: MUTE, letterSpacing: -0.1 },
  dFoot: { fontSize: 12, color: MUTE, textAlign: 'center', letterSpacing: -0.1 },
  dInfo: { position: 'absolute', left: -20, right: -20, top: CH + 22, alignItems: 'center' },
  dWhenInfo: { fontSize: 14, fontWeight: '600', color: PINK, letterSpacing: -0.1 },
});
