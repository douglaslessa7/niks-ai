import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler,
  useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useUserId } from '../../lib/currentUser';
import { useCachedQuery } from '../../lib/cache';
import { useEstadoCartas, PODER_INFO } from '../../lib/cartasServidor';
import { jornadaGrupo, type LinhaJornada } from '../../lib/gruposServidor';
import { nivelDe } from '../../lib/niveis';
import CartaNivel from '../../components/caminhada/CartaNivel';
import {
  CARD_BG, CARD_LEFT, CONTENT_H, EO, ICON_BG, INK, MUTE, NIVEIS_TRILHA, PAD_TOP, PINK,
  cardTop, dotY, fmt, railK, xpY, type Icone, type Limites,
} from '../../components/caminhada/geometria';

// ─────────────────────────────────────────────────────────────────────────────
// Jornada do grupo — réplica de 80i do Claude Design (NiksGrupoV2.dc.html). É a trilha
// da "Sua caminhada" (mesmas cartas, 250 pt por nível) com o nível INDIVIDUAL de cada
// integrante: o grupo não tem nível nem XP. No topo, o seu nível e quanto falta.
//   · Abrir: a trilha já para em você (62% da janela); o trilho rosa sobe até os seus
//     pontos (mola ζ1 .7 s, 150 ms depois); as fotos entram com mola (ζ.6 .42 s, 0,6 → 1)
//     em ordem de pontos, 380 ms + 70 ms cada; os nomes deslizam 6 pt (280 ms, 460 ms + 70).
//   · Passeio: 1,5 s depois a trilha sobe até quem está na frente (900 ms), espera 700 ms
//     e volta (1 s). Só na PRIMEIRA abertura de cada grupo, como na "Sua caminhada";
//     qualquer toque interrompe.
//   · Reduzir movimento: sem passeio nem mola, tudo em fade.
// Frame de 393 × 852, barra de status de 54: Y do design → tela = insets.top + y − 54.
// ─────────────────────────────────────────────────────────────────────────────

const LOGO = require('../../assets/home/score-logo-pink.png');
const eo = Easing.bezier(...EO);
const eio = Easing.bezier(0.65, 0, 0.35, 1);   // easeInOutCubic do design
const PASSEIO_KEY = (gid: string) => `grupo:jornada_passeio:${gid}`;

function Integrante({ m, ord, y, rm }: { m: LinhaJornada; ord: number; y: number; rm: boolean }) {
  const p = useSharedValue(0);
  const t = useSharedValue(0);
  useEffect(() => {
    p.set(0); t.set(0);
    if (rm) {
      p.set(withTiming(1, { duration: 220 }));
      t.set(withTiming(1, { duration: 200 }));
    } else {
      p.set(withDelay(380 + ord * 70, withSpring(1, { duration: 420, dampingRatio: 0.6 })));
      t.set(withDelay(460 + ord * 70, withTiming(1, { duration: 280, easing: eo })));
    }
  }, [p, t, ord, rm]);
  const avSt = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get() * 2),
    transform: rm ? [] : [{ scale: 0.6 + 0.4 * p.get() }],
  }), [rm]);
  const pillSt = useAnimatedStyle(() => ({
    opacity: t.get(),
    transform: rm ? [] : [{ translateX: -6 * (1 - t.get()) }],
  }), [rm]);
  return (
    <>
      <Animated.View style={[styles.av, { top: y - 19, borderColor: m.voce ? PINK : '#fff' }, avSt]}>
        {m.foto ? <Image source={{ uri: m.foto }} style={{ width: '100%', height: '100%' }} /> : null}
      </Animated.View>
      {m.voce ? (
        <Animated.View style={[styles.bubble, { top: y - 18 }, pillSt]}>
          <Text style={styles.bubbleTop}>Você está aqui</Text>
          <Text style={styles.bubbleXp}>{`${fmt(m.pontos)} NIKS Points`}</Text>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.pill, { top: y - 13 }, pillSt]}>
          <Text style={styles.pillName} numberOfLines={1}>{m.nome}</Text>
          <Text style={styles.pillPts}>{`· ${fmt(m.pontos)}`}</Text>
        </Animated.View>
      )}
    </>
  );
}

export default function GrupoJornada() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const rm = useReducedMotion();
  const userId = useUserId();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const gid = typeof id === 'string' ? id : '';
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const { data: estado } = useEstadoCartas();
  const fetcher = useCallback(() => jornadaGrupo(gid), [gid]);
  const { data, refresh } = useCachedQuery(userId && gid ? `grupos:jornada:${userId}:${gid}` : null, fetcher, { staleMs: 0, enabled: Boolean(userId && gid) });

  // Geometria na tela (a mesma da "Sua caminhada").
  const y = useCallback((v: number) => insets.top + v - 54, [insets.top]);
  const ox = (W - 393) / 2;
  const footerH = 94 + Math.max(insets.bottom, 0);
  const vpTop = y(216);
  const vph = Math.max(200, H - vpTop - footerH);

  const tabela = useMemo(() => data?.niveis ?? estado?.niveis ?? [], [data?.niveis, estado?.niveis]);
  const lim: Limites = useMemo(() => tabela.map((l) => l.pontos), [tabela]);
  const ic: Icone = useMemo(() => data?.icone ?? estado?.icone ?? { passo: 945, incremento: 45 }, [data?.icone, estado?.icone]);
  const rot = estado?.faixas?.rotina ?? { min: 15, max: 30 };
  const scan = estado?.faixas?.scan_rosto ?? { min: 40, max: 60 };
  const lista = useMemo(() => data?.lista ?? [], [data?.lista]);
  const voce = lista.find((m) => m.voce) ?? null;
  const pts = voce?.pontos ?? 0;
  const nivel = tabela.length ? nivelDe(pts, tabela, ic) : null;
  const L = nivel?.nivel ?? 1;
  const naTrilha = Math.min(L, NIVEIS_TRILHA);
  const icone = L >= NIVEIS_TRILHA;
  const pronto = Boolean(nivel && voce);
  // Ordem de entrada: de quem tem menos pontos para quem tem mais (design).
  // Onde a trilha abre: você a 62% da janela (design).
  const clampS = useCallback((v: number) => Math.min(CONTENT_H - vph, Math.max(0, v)), [vph]);
  const casa = pronto && voce && lim.length ? clampS(xpY(voce.pontos, lim, ic) - vph * 0.62) : 0;
  const ordem = useMemo(() => [...lista].sort((a, b) => a.pontos - b.pontos).map((m) => m.user_id), [lista]);

  // ── Trilho, rolagem e passeio ─────────────────────────────────────────────
  const rail = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const scrollAnim = useSharedValue(-1);
  const aref = useAnimatedRef<Animated.ScrollView>();
  const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { scrollY.set(e.contentOffset.y); } });
  useAnimatedReaction(() => scrollAnim.get(), (v) => { if (v >= 0) scrollTo(aref, 0, v, false); });
  const touring = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parar = useCallback(() => {
    if (!touring.current) return;
    touring.current = false;
    if (timer.current) clearTimeout(timer.current);
    cancelAnimation(scrollAnim);
    scrollAnim.set(-1);
  }, [scrollAnim]);

  const abriu = useRef('');
  useEffect(() => {
    if (!pronto || !lim.length || !voce || !userId) return;
    const chave = `${gid}:${lista.length}`;
    if (abriu.current === chave) return;
    abriu.current = chave;
    scrollY.set(casa);
    const k = Math.max(0, railK(voce.pontos, lim, ic));
    rail.set(0);
    rail.set(rm
      ? withTiming(k, { duration: 300 })
      : withDelay(150, withSpring(k, { duration: 700, dampingRatio: 1, reduceMotion: ReduceMotion.Never })));
    if (rm) return;
    const lider = lista.reduce((a, b) => (b.pontos > a.pontos ? b : a), lista[0]);
    if (lider.voce) return;
    AsyncStorage.getItem(PASSEIO_KEY(gid)).then((visto) => {
      if (visto) return;
      void AsyncStorage.setItem(PASSEIO_KEY(gid), '1');
      touring.current = true;
      timer.current = setTimeout(() => {
        if (!touring.current) return;
        const frente = clampS(xpY(lider.pontos, lim, ic) - 150);
        scrollAnim.set(casa);
        scrollAnim.set(withSequence(
          withTiming(frente, { duration: 900, easing: eio }),
          withDelay(700, withTiming(casa, { duration: 1000, easing: eio }, () => { scrollAnim.set(-1); })),
        ));
      }, 1500);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, lim, ic, vph, gid, lista, rm]);

  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      void refresh?.();
      return () => {
        parar();
        abriu.current = '';
        setTabBarVisible(true);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gid])
  );

  const railSt = useAnimatedStyle(() => ({ transform: [{ scaleY: rail.get() }] }));
  const barK = nivel ? Math.min(1, Math.max(0, (pts - nivel.piso) / Math.max(1, nivel.teto - nivel.piso))) : 0;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow]} />

      <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.navigate({ pathname: '/grupo', params: { id: gid } } as any); }} style={[styles.back, { top: y(58) }]} accessibilityLabel="Voltar">
        <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </TouchableOpacity>
      <View pointerEvents="none" style={[styles.titleRow, { top: y(58) }]}><Text style={styles.title}>Jornada</Text></View>

      {/* Seu nível (individual) */}
      <View style={[styles.hdr, { top: y(104) }]}>
        <View style={{ opacity: pronto ? 1 : 0 }}>
          <View style={styles.hdrRow}>
            <View style={[styles.thumb, { experimental_backgroundImage: icone ? ICON_BG : CARD_BG, borderColor: icone ? '#E7B67C' : '#FFFFFF' }]}>
              <Image source={LOGO} style={{ width: 24, height: 24 }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hdrLvl}>{`Nível ${L}`}</Text>
              <Text style={styles.hdrName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{nivel?.titulo ?? ' '}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.hdrXp}>{nivel ? `${fmt(pts)} / ${fmt(nivel.teto)}` : ' '}</Text>
              <Text style={styles.hdrFalta}>{nivel ? `faltam ${fmt(Math.max(0, nivel.teto - pts))} NIKS Points` : ' '}</Text>
            </View>
          </View>
          <View style={styles.barTrack}><View style={[styles.barFill, { transform: [{ scaleX: barK }] }]} /></View>
        </View>
      </View>

      {/* Trilha com as integrantes */}
      <View style={[styles.vp, { top: vpTop, height: vph }]}>
        {/* Monta só com os dados: o `contentOffset` inicial já abre em você (um scrollTo
            antes do layout do conteúdo voltava para o topo). */}
        {pronto && (
        <Animated.ScrollView
          ref={aref}
          contentOffset={{ x: 0, y: casa }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={parar}
          onTouchStart={parar}
          contentContainerStyle={{ height: CONTENT_H }}
        >
          <View style={{ position: 'absolute', left: ox, top: 0, width: 393, height: CONTENT_H }}>
            <Image source={LOGO} style={{ position: 'absolute', left: 23, top: 28, width: 22, height: 22 }} />
            <View style={styles.railBase} />
            <Animated.View style={[styles.rail, railSt]} />
            {tabela.slice(0, NIVEIS_TRILHA).map((lv) => {
              const locked = lv.n > L;
              const passou = lv.pontos <= pts;
              return (
                <View key={lv.n} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  <View style={[styles.dot, { top: dotY(lv.n) - 5.5, backgroundColor: passou ? PINK : '#FFFFFF', borderColor: passou ? '#FFFFFF' : 'rgba(255,94,168,0.45)' }]} />
                  <Text style={[styles.dotLabel, { top: dotY(lv.n) - 7, color: passou ? INK : MUTE }]}>{`${fmt(lv.pontos)} NIKS Points`}</Text>
                  <CartaNivel
                    n={lv.n} locked={locked} isCurrent={lv.n === naTrilha} isIcon={lv.n === NIVEIS_TRILHA}
                    left={CARD_LEFT} top={cardTop(lv.n)} scrollY={scrollY} vph={vph}
                    shakeKey={0} breakKey={0} rm={rm}
                  />
                  <View pointerEvents="none" style={[styles.nameBlock, { top: cardTop(lv.n) + 192 }]}>
                    <Text style={[styles.lvName, { color: locked ? MUTE : INK }]}>{lv.titulo}</Text>
                    <Text style={styles.lvSub}>{`Nível ${lv.n} · ${fmt(lv.pontos)} NIKS Points`}</Text>
                  </View>
                </View>
              );
            })}
            {lim.length > 0 && lista.map((m) => (
              <Integrante key={m.user_id} m={m} ord={ordem.indexOf(m.user_id)} y={xpY(m.pontos, lim, ic)} rm={rm} />
            ))}
          </View>
        </Animated.ScrollView>
        )}
      </View>

      {/* Rodapé: como ganhar */}
      <View style={[styles.footer, { height: footerH }]}>
        <Text style={styles.footTitle}>Como ganhar NIKS Points</Text>
        <View style={{ marginTop: 10, gap: 6 }}>
          <View style={styles.footRow}>
            <View style={styles.footIcon}><Svg width={15} height={15} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" /></Svg></View>
            <Text style={styles.footText}><Text style={{ fontWeight: '600' }}>{`+${rot.min} a ${rot.max} NIKS Points`}</Text> por rotina concluída</Text>
          </View>
          <View style={styles.footRow}>
            <View style={styles.footIcon}><Svg width={15} height={15} viewBox="0 0 24 24"><Path d={PODER_INFO.scan_antecipado.icone} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg></View>
            <Text style={styles.footText}><Text style={{ fontWeight: '600' }}>{`+${scan.min} a ${scan.max}`}</Text> por scan de rosto, 1 por semana</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFE6F0' },
  glow: { opacity: 0.45, experimental_backgroundImage: 'radial-gradient(90% 46% at 50% 34%, rgba(255,255,255,0.9), rgba(255,255,255,0))' },
  back: {
    position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19, zIndex: 5,
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { position: 'absolute', left: 0, right: 0, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },

  hdr: {
    position: 'absolute', left: 16, right: 16, height: 102, paddingTop: 14, paddingHorizontal: 14, zIndex: 4,
    borderWidth: 1.5, borderColor: PINK, borderRadius: 20, backgroundColor: '#fff', boxShadow: '0px 6px 18px rgba(255,94,168,0.12)',
  },
  hdrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: {
    width: 40, height: 56, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 10px rgba(200,60,120,0.18)',
  },
  hdrLvl: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: PINK },
  hdrName: { marginTop: 2, fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: INK },
  hdrXp: { fontSize: 14, lineHeight: 18, fontWeight: '600', letterSpacing: -0.2, color: INK, fontVariant: ['tabular-nums'] },
  hdrFalta: { marginTop: 2, fontSize: 12, lineHeight: 16, color: MUTE, fontVariant: ['tabular-nums'] },
  barTrack: { marginTop: 10, height: 8, borderRadius: 100, backgroundColor: '#F0F0F0', overflow: 'hidden' },
  barFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },

  vp: { position: 'absolute', left: 0, right: 0 },
  railBase: { position: 'absolute', left: 32, top: PAD_TOP, width: 3, height: 2750, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.95)' },
  rail: { position: 'absolute', left: 32, top: PAD_TOP, width: 3, height: 2750, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'center bottom' },
  dot: { position: 'absolute', left: 28, width: 11, height: 11, borderRadius: 5.5, borderWidth: 2 },
  dotLabel: { position: 'absolute', left: 46, fontSize: 11, lineHeight: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  nameBlock: { position: 'absolute', left: 116, width: 220, alignItems: 'center' },
  lvName: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  lvSub: { marginTop: 2, fontSize: 13, lineHeight: 17, color: MUTE, textAlign: 'center' },

  av: {
    position: 'absolute', left: 14.5, width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, overflow: 'hidden', zIndex: 5,
    backgroundColor: '#FCE3EE', boxShadow: '0px 4px 12px rgba(200,60,120,0.3)',
  },
  bubble: {
    position: 'absolute', left: 60, zIndex: 6, paddingTop: 5, paddingHorizontal: 10, paddingBottom: 6, borderRadius: 12,
    backgroundColor: PINK, boxShadow: '0px 6px 14px rgba(255,94,168,0.32)',
  },
  bubbleTop: { fontSize: 11, lineHeight: 13, fontWeight: '600', color: '#fff' },
  bubbleXp: { fontSize: 13, lineHeight: 16, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  pill: {
    position: 'absolute', left: 60, zIndex: 6, height: 26, paddingHorizontal: 10, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(255,94,168,0.35)', boxShadow: '0px 4px 10px rgba(200,60,120,0.12)',
  },
  pillName: { maxWidth: 140, fontSize: 13, fontWeight: '600', letterSpacing: -0.2, color: INK },
  pillPts: { fontSize: 12, color: MUTE, fontVariant: ['tabular-nums'] },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, paddingHorizontal: 20, zIndex: 6,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0px -6px 24px rgba(190,70,120,0.10)',
  },
  footTitle: { fontSize: 15, lineHeight: 18, fontWeight: '700', letterSpacing: -0.2, color: INK },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  footText: { fontSize: 14, letterSpacing: -0.2, color: INK },
});
