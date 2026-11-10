import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import Animated, {
  useAnimatedRef, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, scrollTo, useAnimatedReaction,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useUserId } from '../../lib/currentUser';
import { useCachedQuery } from '../../lib/cache';
import { useEstadoCartas } from '../../lib/cartasServidor';
import { jornadaGrupo, type LinhaJornada } from '../../lib/gruposServidor';
import { nivelDe, NIVEL_MAXIMO } from '../../lib/niveis';
import Medalha from '../../components/medalhas/Medalha';
import { usePulsoMedalha } from '../../components/medalhas/usePulsoMedalha';
import FotoComMoldura from '../../components/medalhas/FotoComMoldura';
import VoltarPelaBorda from '../../components/VoltarPelaBorda';

// ─────────────────────────────────────────────────────────────────────────────
// Jornada do grupo — réplica de 81o do Claude Design ("NIKS home redesign",
// NiksGrupoFlo.dc.html, rodada 81: linguagem do Flo). A mesma caminhada (linha à
// esquerda, cartas dos níveis à direita) com o nível INDIVIDUAL de cada amiga marcado na
// linha pelos NIKS Points — o grupo não tem nível nem XP. Card do seu nível no topo e
// "Como ganhar" embaixo, nos componentes do Flo.
//   · Geometria do design: trilha a partir de 40, 250 por nível (o 1 embaixo, o NIKS no
//     topo), cartas de 132 × 184 em x = 214, ponto e "N NIKS Points" na linha.
//   · Ao abrir: a trilha para com você 240 pt abaixo do topo; a linha enche até você com
//     mola (ζ1 .8 s, 150 ms depois) e as fotos e os nomes saltam (ζ.72 .5 s, 0,6 → 1),
//     70 ms entre as amigas. Reduzir movimento: a linha já cheia, só fade.
//   · As bordas da trilha somem em 20 pt (no design é uma máscara; aqui, degradês da cor
//     do fundo por cima — o fundo é liso).
// Frame de 393 × 852 com barra de status de 54: Y do design → insets.top + y − 54.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const BG = '#FFF1F7';
const LOGO = require('../../assets/home/score-logo-pink.png');
const PAD = 40;
const AV = 62;   // moldura do avatar na trilha (a foto fica com ~36 pt, como antes)
const ROW = 250;
// 13 níveis-medalha (Bronze 1 … NIKS) desde 08/nov/2026; o design desenhava 11.
const N = NIVEL_MAXIMO;
const CONTENT_H = PAD + N * ROW + 60;

const rowTop = (L: number) => PAD + (N - L) * ROW;
const dotY = (L: number) => rowTop(L) + ROW;
const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const mola = (z: number, r: number) => ({ stiffness: (2 * Math.PI / r) ** 2, damping: (4 * Math.PI * z) / r, mass: 1 });

/** Y de um total de pontos na trilha (do último nível em diante, no ponto dele). */
function yDe(p: number, lim: number[]): number {
  let L = 1;
  lim.forEach((t, i) => { if (p >= t) L = i + 1; });
  if (L >= N || lim.length <= L) return dotY(Math.min(L, N));
  return dotY(L) - ((p - lim[L - 1]) / (lim[L] - lim[L - 1])) * ROW;
}

// Só a medalha, sem carta em volta (como na Sua caminhada). Trancada: apagada e com cadeado.
function MedalhaNivel({ n, reached, atual }: { n: number; reached: boolean; atual: boolean }) {
  const pulsoSt = usePulsoMedalha(atual, useReducedMotion());
  return (
    <View style={{ width: 132, height: 184 }}>
      <View style={[styles.medalha, { opacity: reached ? 1 : 0.4 }]}>
        <Animated.View style={pulsoSt}><Medalha nivel={n} tamanho={150} /></Animated.View>
      </View>
      {!reached && (
        <View style={styles.cadeado}>
          <Svg width={15} height={15} viewBox="0 0 24 24">
            <Rect x={4} y={11} width={16} height={10} rx={2} fill="none" stroke={PINK} strokeWidth={2.4} />
            <Path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke={PINK} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </View>
      )}
    </View>
  );
}

function Integrante({ m, ordem, y, rm, run }: { m: LinhaJornada; ordem: number; y: number; rm: boolean; run: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(0);
    p.set(rm ? withTiming(1, { duration: 200 }) : withDelay(420 + ordem * 70, withSpring(1, mola(0.72, 0.5))));
  }, [p, ordem, rm, run]);
  const st = useAnimatedStyle(() => (rm ? { opacity: p.get() } : { opacity: Math.min(1, p.get() * 1.6), transform: [{ scale: 0.6 + 0.4 * p.get() }] }), [rm]);
  return (
    <>
      {/* A foto com a moldura da medalha atual dela (5 molduras, uma por material). */}
      <Animated.View style={[styles.av, { top: y - AV / 2 }, st]}>
        <FotoComMoldura nivel={m.nivel} foto={m.foto} nome={m.nome} tamanho={AV} pequena vazio="#FCE3EE" />
      </Animated.View>
      <Animated.View style={[styles.pill, { top: y - 14, backgroundColor: m.voce ? PINK : '#fff' }, st]}>
        <Text style={[styles.pillNome, { color: m.voce ? '#fff' : INK }]} numberOfLines={1}>{m.voce ? 'Você' : m.nome}</Text>
        <Text style={[styles.pillPts, { color: m.voce ? '#fff' : INK }]}>{fmt(m.pontos)}</Text>
      </Animated.View>
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

  const y = (v: number) => insets.top + v - 54;
  const footerH = 124 + Math.max(0, insets.bottom - 34);
  const vpTop = y(222);
  const vph = Math.max(200, H - vpTop - footerH);
  const ox = (W - 393) / 2;

  const tabela = useMemo(() => data?.niveis ?? estado?.niveis ?? [], [data?.niveis, estado?.niveis]);
  const lim = useMemo(() => tabela.map((l) => l.pontos), [tabela]);
  const ic = data?.icone ?? estado?.icone ?? { passo: 945, incremento: 45 };
  const rot = estado?.faixas?.rotina ?? { min: 15, max: 30 };
  const scan = estado?.faixas?.scan_rosto ?? { min: 40, max: 60 };
  const lista = useMemo(() => data?.lista ?? [], [data?.lista]);
  const voce = lista.find((m) => m.voce) ?? null;
  const pts = voce?.pontos ?? 0;
  const nivel = tabela.length ? nivelDe(pts, tabela, ic) : null;
  const L = nivel?.nivel ?? 1;
  const pronto = Boolean(nivel && voce && lim.length);
  const ordem = useMemo(() => [...lista].sort((a, b) => a.pontos - b.pontos).map((m) => m.user_id), [lista]);
  const casa = pronto ? Math.min(CONTENT_H - vph, Math.max(0, yDe(pts, lim) - 240)) : 0;

  // ── A linha enche até você (mola ζ1 .8 s, 150 ms depois) ──────────────────
  const [run, setRun] = useState(0);
  const linha = useSharedValue(0);
  const rolar = useSharedValue(-1);
  const aref = useAnimatedRef<Animated.ScrollView>();
  useAnimatedReaction(() => rolar.get(), (v) => { if (v >= 0) scrollTo(aref, 0, v, false); });
  const abriu = useRef('');
  useEffect(() => {
    if (!pronto) return;
    const chave = `${gid}:${run}`;
    if (abriu.current === chave) return;
    abriu.current = chave;
    const k = Math.max(0, (dotY(1) - yDe(pts, lim)) / (N * ROW));
    linha.set(0);
    linha.set(rm ? k : withDelay(150, withSpring(k, mola(1, 0.8))));
    // A cada abertura (a tela fica montada), a trilha volta para você.
    rolar.set(casa);
    rolar.set(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, run, gid, pts, lim, rm]);
  const linhaSt = useAnimatedStyle(() => ({ transform: [{ scaleY: linha.get() }] }));

  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      setRun((n) => n + 1);
      void refresh?.();
      return () => setTabBarVisible(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gid])
  );

  const barK = nivel ? (nivel.teto <= nivel.piso ? 1 : Math.min(1, Math.max(0, (pts - nivel.piso) / Math.max(1, nivel.teto - nivel.piso)))) : 0;

  return (
    <VoltarPelaBorda onVoltar={() => router.navigate({ pathname: '/grupo', params: { id: gid } } as any)}>
    <View style={styles.root}>
      <StatusBar style="dark" />
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => { haptics.tap(); router.navigate({ pathname: '/grupo', params: { id: gid } } as any); }}
        style={[styles.back, { top: y(54) }]}
        accessibilityLabel="Voltar"
      >
        <Svg width={26} height={26} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </TouchableOpacity>
      <View pointerEvents="none" style={[styles.titleRow, { top: y(54) }]}><Text style={styles.title}>Jornada</Text></View>

      {/* Seu nível (individual) */}
      <View style={[styles.hdr, { top: y(104), opacity: pronto ? 1 : 0 }]}>
        <View style={styles.hdrRow}>
          <View style={styles.thumb}>
            <Medalha nivel={L} tamanho={56} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.hdrLvl}>{`Nível ${L}`}</Text>
            <Text style={styles.hdrName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{nivel?.titulo ?? ' '}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.hdrXp}>{nivel ? (nivel.teto <= nivel.piso ? fmt(pts) : `${fmt(pts)} / ${fmt(nivel.teto)}`) : ' '}</Text>
            <Text style={styles.hdrFalta}>{nivel ? (nivel.teto <= nivel.piso ? 'Nível máximo' : `faltam ${fmt(Math.max(0, nivel.teto - pts))} NIKS Points`) : ' '}</Text>
          </View>
        </View>
        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${barK * 100}%` }]} /></View>
      </View>

      {/* Trilha */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: vpTop, height: vph }}>
        {pronto && (
          <Animated.ScrollView ref={aref} contentOffset={{ x: 0, y: casa }} showsVerticalScrollIndicator={false} contentContainerStyle={{ height: CONTENT_H }}>
            <View style={{ position: 'absolute', left: ox, top: 0, width: 393, height: CONTENT_H }}>
              <Image source={LOGO} style={{ position: 'absolute', left: 23, top: 12, width: 22, height: 22 }} />
              <View style={styles.linhaBase} />
              <Animated.View style={[styles.linha, linhaSt]} />
              {tabela.slice(0, N).map((lv) => {
                const reached = lv.n <= L;
                const passou = lv.pontos <= pts;
                return (
                  <View key={lv.n} pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={[styles.ponto, { top: dotY(lv.n) - 5.5, backgroundColor: passou ? PINK : '#fff', borderColor: passou ? '#fff' : 'rgba(255,94,168,0.45)' }]} />
                    <Text style={[styles.pontoT, { top: dotY(lv.n) - 7, color: passou ? INK : MUTE }]}>{`${fmt(lv.pontos)} NIKS Points`}</Text>
                    <View style={{ position: 'absolute', left: 214, top: rowTop(lv.n) + 14 }}>
                      <MedalhaNivel n={lv.n} reached={reached} atual={lv.n === Math.min(L, N)} />
                    </View>
                    <View style={[styles.nomeBloco, { top: rowTop(lv.n) + 206 }]}>
                      <Text style={[styles.nomeNivel, { color: reached ? INK : MUTE }]}>{lv.titulo}</Text>
                      <Text style={styles.nomeSub}>{`Nível ${lv.n}`}</Text>
                    </View>
                  </View>
                );
              })}
              {lista.map((m) => (
                <Integrante key={m.user_id} m={m} ordem={ordem.indexOf(m.user_id)} y={yDe(m.pontos, lim)} rm={rm} run={run} />
              ))}
            </View>
          </Animated.ScrollView>
        )}
        <LinearGradient pointerEvents="none" colors={[BG, `${BG}00`]} style={[styles.fade, { top: 0 }]} />
        <LinearGradient pointerEvents="none" colors={[`${BG}00`, BG]} style={[styles.fade, { bottom: 0 }]} />
      </View>

      {/* Como ganhar */}
      <View style={[styles.footer, { height: footerH }]}>
        <Text style={styles.footT}>Como ganhar NIKS Points</Text>
        <View style={{ marginTop: 8, gap: 4 }}>
          <Text style={styles.footL}><Text style={styles.footB}>{`+${rot.min} a ${rot.max}`}</Text> por rotina concluída</Text>
          <Text style={styles.footL}><Text style={styles.footB}>{`+${scan.min} a ${scan.max}`}</Text> por scan de rosto, 1 por semana</Text>
        </View>
      </View>
    </View>
    </VoltarPelaBorda>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  back: { position: 'absolute', left: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  titleRow: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },

  hdr: {
    position: 'absolute', left: 16, right: 16, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, borderRadius: 16,
    backgroundColor: '#fff', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)', zIndex: 4,
  },
  hdrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, marginHorizontal: -4, alignItems: 'center', justifyContent: 'center' },
  hdrLvl: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: PINK },
  hdrName: { marginTop: 1, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.45, color: INK },
  hdrXp: { fontSize: 15, lineHeight: 19, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  hdrFalta: { marginTop: 1, fontSize: 12, lineHeight: 16, color: MUTE },
  barTrack: { marginTop: 12, height: 8, borderRadius: 100, backgroundColor: '#F4EFF2', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 100, backgroundColor: PINK },

  fade: { position: 'absolute', left: 0, right: 0, height: 20 },
  linhaBase: { position: 'absolute', left: 32.5, top: PAD, width: 3, height: N * ROW, borderRadius: 100, backgroundColor: '#fff' },
  linha: { position: 'absolute', left: 32.5, top: PAD, width: 3, height: N * ROW, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'center bottom' },
  ponto: { position: 'absolute', left: 28.5, width: 11, height: 11, borderRadius: 5.5, borderWidth: 2 },
  pontoT: { position: 'absolute', left: 48, fontSize: 11, lineHeight: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  medalha: { position: 'absolute', left: 66 - 75, top: 92 - 75, width: 150, height: 150 },
  cadeado: {
    position: 'absolute', left: 66 - 17, top: 92 - 17, width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', borderWidth: 1.5, borderColor: PINK,
    alignItems: 'center', justifyContent: 'center',
  },
  nomeBloco: { position: 'absolute', left: 180, width: 200, alignItems: 'center' },
  nomeNivel: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  nomeSub: { fontSize: 13, lineHeight: 17, color: MUTE },
  av: { position: 'absolute', left: 34 - AV / 2, width: AV, height: AV, zIndex: 5 },
  pill: {
    position: 'absolute', left: 60, height: 28, paddingHorizontal: 10, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 6,
    boxShadow: '0px 4px 10px rgba(200,60,120,0.14)',
  },
  pillNome: { maxWidth: 120, fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  pillPts: { fontSize: 12, opacity: 0.8, fontVariant: ['tabular-nums'] },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, paddingHorizontal: 16, zIndex: 6,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0px -6px 24px rgba(190,70,120,0.08)',
  },
  footT: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.4, color: INK },
  footL: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: '#3d3d3d' },
  footB: { fontWeight: '600', color: INK },
});
