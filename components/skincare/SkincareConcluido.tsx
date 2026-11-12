import { memo, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions, type StyleProp, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path, Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  Easing, interpolate, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { BG_NIGHT, BG_STOPS } from '../../lib/homeTheme';
import { fracaoNivel, nivelDe, TABELA_NIVEIS } from '../../lib/niveis';
import type { PassoSessao } from '../../lib/sessaoSkincare';
import Medalha from '../medalhas/Medalha';
import StepIcon from '../rotina/StepIcon';

// ─────────────────────────────────────────────────────────────────────────────
// "Skincare concluído" — réplica da tela 90a do Claude Design (projeto "NIKS home redesign —
// rotina skincare", `NiksSessaoSkincare.dc.html`, rodada 90 "Na identidade da home e da tela 6";
// 12/nov/2026, build 1.62). Abre logo depois de "Concluir" na sessão (`skincare-sessao.tsx`,
// por cima dela) e o "Continuar" segue o fim de sempre (pop-up do grupo → … → carta).
//   · Fundo rosa claro da home (degradê 180° #FCE3EE → #F9F1F4 + luz branca à esquerda); à
//     noite, o degradê noturno da home (BG_NIGHT), como o timer.
//   · Título (top 98, 26/32 800), "Tempo do skincare" e o tempo grande em rosa (96/100 800,
//     sombra rosa), "N passos · N produtos".
//   · Card dos NIKS Points (top 346), SEMPRE de pontos (pontos diretos, 20261204): a MEDALHA do
//     nível (a mesma da "Sua caminhada"), "+N NIKS Points" contando de 0, "Nível N · Título" +
//     "total / próximo" contando e a barra do nível subindo. Sem pontos na resposta (sem rede):
//     "+0" com o nível atual.
//   · "Sua rotina de hoje" (top 492): lista compacta num card só, com ✓ rosa em cada passo.
//   · "Continuar" (pílula rosa de 50, a 34 do fim).
// Entrada (a do design, em sequência): faíscas caem devagar (26 estrelas e bolinhas, 3,2–4,6 s);
// título 150 ms; tempo 420 ms contando de 0 (1,3 s); passos/produtos contam; card 1,5 s; a
// medalha aparece com um leve giro (1,7 s); os pontos sobem contando (1,75 s); a barra avança
// (2,05 s); a rotina entra 2,5 s, linha a linha; "Continuar" por último (2,95 s). Os números
// contam na thread da interface (TextInput animado), sem redesenhar a tela a cada quadro.
// "Reduzir movimento": sem faíscas e sem contagem — tudo aparece esmaecendo, já no valor final.
// Medidas do frame 393×852 (barra de status de 54 pt → `insets.top − 54`).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const BODY = '#515151';
const MUTE = '#818181';
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const DIA = ['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4'] as const;
const DIA_PARADAS = [0, 0.45, 0.72, 1] as const;

/** Os NIKS Points deste skincare: quanto ganhou e o total antes/depois (barra do nível). */
export type PontosConcluido = { ganhos: number; totalAntes: number; total: number } | null;

type Props = {
  periodo: 'am' | 'pm';
  duracaoMs: number;
  passos: PassoSessao[];
  pontos: PontosConcluido;
  onContinuar: () => void;
};

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type Formato = 'tempo' | 'num' | 'mais';
function formatar(v: number, f: Formato): string {
  'worklet';
  const n = Math.max(0, Math.round(v));
  if (f === 'tempo') {
    const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
    const dois = (x: number) => (x < 10 ? '0' + x : '' + x);
    return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
  }
  return f === 'mais' ? `+${n}` : `${n}`;
}

// Um número que conta de `de` até `para` na thread da interface (não redesenha a tela).
function Contador({ de, para, atraso, duracao, formato, style, rm, sufixo = '' }: {
  de: number; para: number; atraso: number; duracao: number; formato: Formato; style: StyleProp<TextStyle>; rm: boolean; sufixo?: string;
}) {
  const v = useSharedValue(rm ? para : de);
  useEffect(() => {
    if (rm) { v.set(para); return; }
    v.set(de);
    v.set(withDelay(atraso, withTiming(para, { duration: duracao, easing: Easing.out(Easing.cubic) })));
  }, [de, para, atraso, duracao, rm]); // eslint-disable-line react-hooks/exhaustive-deps
  const props = useAnimatedProps(() => {
    const t = formatar(v.get(), formato) + sufixo;
    return { text: t, defaultValue: t } as any;
  });
  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={formatar(rm ? para : de, formato) + sufixo}
      animatedProps={props}
      style={[{ padding: 0, margin: 0 }, style]}
    />
  );
}

// Entrada de um bloco: aparece subindo `dy` (e crescendo de `escala`), com o ease-out do design.
function useEntrada(atraso: number, duracao: number, dy: number, rm: boolean, escala = 1) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(rm ? withDelay(Math.round(atraso / 3), withTiming(1, { duration: 200 })) : withDelay(atraso, withTiming(1, { duration: duracao, easing: EASE })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: rm ? [] : [{ translateY: (1 - p.get()) * dy }, { scale: escala + (1 - escala) * p.get() }],
  }));
}

// ── Faíscas (26: metade estrelas de 4 pontas, metade bolinhas) ─────────────────────────────
const CORES_FAISCA = ['#FF5EA8', '#C9B6FF', '#F5B44A', '#FF9ACB'];
type Faisca = { x: number; top: number; tam: number; estrela: boolean; cor: string; sway: number; y: number; r: number; dur: number; atraso: number };
const T_FAISCAS = 5400;

function Faiscas({ W }: { W: number }) {
  const lista = useMemo<Faisca[]>(() => Array.from({ length: 26 }, (_, i) => {
    const estrela = i % 2 === 0;
    return {
      x: (0.06 + Math.random() * 0.88) * W, top: -20 - Math.random() * 60,
      tam: estrela ? 9 + Math.random() * 9 : 5 + Math.random() * 3, estrela, cor: CORES_FAISCA[i % CORES_FAISCA.length],
      sway: (Math.random() - 0.5) * 50, y: 380 + Math.random() * 380, r: (Math.random() - 0.5) * 160,
      dur: 3200 + Math.random() * 1400, atraso: Math.random() * 700,
    };
  }), [W]);
  const t = useSharedValue(0);
  useEffect(() => { t.set(withTiming(T_FAISCAS, { duration: T_FAISCAS, easing: Easing.linear })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lista.map((f, i) => <UmaFaisca key={i} f={f} t={t} />)}
    </View>
  );
}

// `bezierFn` (função pronta para worklet), não `bezier` (fábrica que só o withTiming usa).
const CURVA_QUEDA = Easing.bezierFn(0.33, 0, 0.4, 1);
const UmaFaisca = memo(function UmaFaisca({ f, t }: { f: Faisca; t: { get: () => number } }) {
  const st = useAnimatedStyle(() => {
    const bruto = Math.min(1, Math.max(0, (t.get() - f.atraso) / f.dur));
    const p = CURVA_QUEDA(bruto);
    const op = interpolate(p, [0, 0.18, 0.65, 1], [0, 0.95, 0.85, 0]);
    const x = interpolate(p, [0, 0.18, 0.65, 1], [0, f.sway * 0.5, -f.sway * 0.4, f.sway]);
    const y = interpolate(p, [0, 0.18, 0.65, 1], [0, f.y * 0.25, f.y * 0.65, f.y]);
    const r = interpolate(p, [0, 0.18, 0.65, 1], [0, f.r * 0.3, f.r * 0.7, f.r]);
    const s = interpolate(p, [0, 0.18, 0.65, 1], [0.6, 1, 1, 0.9]);
    return { opacity: op, transform: [{ translateX: x }, { translateY: y }, { rotate: `${r}deg` }, { scale: s }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: f.x, top: f.top, width: f.tam, height: f.tam }, st]}>
      {f.estrela ? (
        <Svg width={f.tam} height={f.tam} viewBox="0 0 24 24">
          <Path d="M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z" fill={f.cor} />
        </Svg>
      ) : (
        <View style={{ flex: 1, borderRadius: f.tam / 2, backgroundColor: f.cor }} />
      )}
    </Animated.View>
  );
});

// ── Tela ────────────────────────────────────────────────────────────────────────
function SkincareConcluido({ periodo, duracaoMs, passos, pontos, onContinuar }: Props) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const rm = useReducedMotion();
  const y = (v: number) => insets.top + v - 54;
  const noite = periodo === 'pm';
  const segundos = Math.max(0, Math.round(duracaoMs / 1000));
  const nProdutos = passos.filter((p) => p.marca || p.produto).length;

  // O nível pelo total de pontos (a mesma curva da "Sua caminhada").
  const total = pontos ? pontos.total : 0;
  const nivel = nivelDe(total, TABELA_NIVEIS);
  const antes = pontos ? pontos.totalAntes : total;
  const nivelAntes = nivelDe(antes, TABELA_NIVEIS);
  const fracDe = nivelAntes.nivel === nivel.nivel ? fracaoNivel(antes, nivel.piso, nivel.teto) : 0;
  const fracPara = fracaoNivel(total, nivel.piso, nivel.teto);

  // Entradas (os tempos do design).
  const tituloSt = useEntrada(150, 560, 14, rm);
  const rotuloTempoSt = useEntrada(380, 500, 10, rm);
  const tempoSt = useEntrada(420, 700, 18, rm, 0.96);
  const statsSt = useEntrada(1100, 500, 10, rm);
  const cardSt = useEntrada(1500, 620, 20, rm, 0.98);
  const pontosSt = useEntrada(1750, 900, 16, rm);
  const rotuloRotSt = useEntrada(2500, 460, 10, rm);
  const rotinaSt = useEntrada(2560, 520, 12, rm);
  const ctaSt = useEntrada(2950, 480, 12, rm);

  // A medalha aparece com um leve giro: 0,6 e −12° → 1,06 → 1.
  const m = useSharedValue(rm ? 1 : 0);
  useEffect(() => {
    if (rm) return;
    m.set(withDelay(1700, withSequence(
      withTiming(0.7, { duration: 434, easing: EASE }),
      withTiming(1, { duration: 186, easing: EASE }),
    )));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const medalhaSt = useAnimatedStyle(() => {
    const v = m.get();
    const s = v <= 0.7 ? 0.6 + (1.06 - 0.6) * (v / 0.7) : 1.06 - 0.06 * ((v - 0.7) / 0.3);
    return { opacity: Math.min(1, v / 0.7), transform: [{ scale: rm ? 1 : s }, { rotate: `${rm ? 0 : -12 + 12 * Math.min(1, v / 0.7)}deg` }] };
  });

  // A barra do nível avança (2,05 s).
  const barra = useSharedValue(rm ? fracPara : fracDe);
  useEffect(() => {
    if (rm) return;
    barra.set(withDelay(2050, withTiming(fracPara, { duration: 900, easing: EASE })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const barraSt = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.0001, barra.get()) }] }));

  // As linhas da rotina esmaecem em sequência (2,64 s + 70 ms por linha).
  const linhas = useSharedValue(0);
  useEffect(() => {
    linhas.set(rm ? withTiming(1, { duration: 200 }) : withDelay(2640, withTiming(1, { duration: 360 + 70 * passos.length, easing: Easing.linear })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const continuar = () => { haptics.action(); onContinuar(); };
  const titulo = periodo === 'am' ? 'Skincare matinal concluído!' : 'Skincare noturno concluído!';

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Fundo: o rosa claro da home (de dia) ou o degradê noturno da home, e a luz à esquerda. */}
      {noite
        ? <LinearGradient colors={BG_NIGHT} locations={BG_STOPS} style={StyleSheet.absoluteFill} />
        : <LinearGradient colors={DIA} locations={DIA_PARADAS} style={StyleSheet.absoluteFill} />}
      <Svg width={620} height={620} style={{ position: 'absolute', left: -114, top: y(20) }} pointerEvents="none">
        <Defs>
          <RadialGradient id="luz90" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
            <Stop offset="0.55" stopColor="#FFC8E1" stopOpacity={0.4} />
            <Stop offset="1" stopColor="#FFC8E1" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={310} cy={310} r={310} fill="url(#luz90)" />
      </Svg>

      <Animated.Text style={[styles.titulo, { top: y(98) }, tituloSt]}>{titulo}</Animated.Text>

      {/* Tempo do skincare, o número grande em rosa, passos e produtos. */}
      <View style={[styles.blocoTempo, { top: y(166) }]} pointerEvents="none">
        <Animated.Text style={[styles.rotuloTempo, rotuloTempoSt]}>Tempo do skincare</Animated.Text>
        <Animated.View style={tempoSt}>
          <Contador de={0} para={segundos} atraso={480} duracao={1300} formato="tempo" rm={rm} style={styles.tempo} />
        </Animated.View>
        <Animated.View style={[styles.stats, statsSt]}>
          <Contador de={0} para={passos.length} atraso={1150} duracao={600} formato="num" rm={rm} style={styles.statsN} />
          <Text style={styles.statsT}>{passos.length === 1 ? 'passo' : 'passos'}</Text>
          <View style={styles.statsPonto} />
          <Contador de={0} para={nProdutos} atraso={1250} duracao={600} formato="num" rm={rm} style={styles.statsN} />
          <Text style={styles.statsT}>{nProdutos === 1 ? 'produto' : 'produtos'}</Text>
        </Animated.View>
      </View>

      {/* NIKS Points: a medalha do nível, os pontos e a barra. */}
      {!!pontos && (
        <Animated.View style={[styles.card, { top: y(346) }, cardSt]}>
          <Animated.View style={[styles.medalha, medalhaSt]}>
            <Medalha nivel={nivel.nivel} tamanho={70} />
          </Animated.View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Quantos NIKS Points ganhou: conta de 0 junto com a entrada do card. */}
            <Animated.View style={[styles.pontosLinha, pontosSt]}>
              <Contador de={0} para={pontos.ganhos} atraso={1750} duracao={900} formato="mais" rm={rm} style={styles.pontosN} />
              <Text style={styles.pontosT}>NIKS Points</Text>
            </Animated.View>
            <View style={styles.nivelLinha}>
              <Text style={styles.nivelT} numberOfLines={1}>Nível {nivel.nivel} · {nivel.titulo}</Text>
              {nivel.teto > nivel.piso
                ? <Contador de={pontos.totalAntes} para={total} atraso={2050} duracao={900} formato="num" rm={rm} sufixo={` / ${nivel.teto}`} style={styles.nivelT} />
                : <Text style={styles.nivelT}>{total}</Text>}
            </View>
            <View style={styles.barraFundo}>
              <Animated.View style={[styles.barra, barraSt]} />
            </View>
          </View>
        </Animated.View>
      )}

      {/* Sua rotina de hoje: lista compacta num card só (rola se não couber). */}
      <View style={[styles.rotinaCaixa, { top: y(492), bottom: 34 + 50 + 14 + Math.max(0, insets.bottom - 34) }]}>
        <Animated.Text style={[styles.rotinaRotulo, rotuloRotSt]}>Sua rotina de hoje</Animated.Text>
        <Animated.View style={[styles.rotinaCard, rotinaSt]}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {passos.map((p, i) => <LinhaRotina key={String(p.id)} p={p} i={i} linhas={linhas} total={passos.length} />)}
          </ScrollView>
        </Animated.View>
      </View>

      <Animated.View style={[styles.ctaCaixa, { bottom: 34 + Math.max(0, insets.bottom - 34) }, ctaSt]}>
        <TouchableOpacity activeOpacity={0.85} onPress={continuar} style={styles.cta} accessibilityRole="button" accessibilityLabel="Continuar">
          <Text style={styles.ctaT}>Continuar</Text>
        </TouchableOpacity>
      </Animated.View>

      {!rm && <Faiscas W={W} />}
    </View>
  );
}

function LinhaRotina({ p, i, linhas, total }: { p: PassoSessao; i: number; linhas: { get: () => number }; total: number }) {
  const prod = [p.marca, p.produto].filter(Boolean).join(' · ');
  const nome = p.nome?.trim() || '';
  // Cada linha esmaece na sua vez (70 ms depois da anterior, 360 ms cada).
  const st = useAnimatedStyle(() => {
    const dur = 360 + 70 * total;
    const t = linhas.get() * dur;
    return { opacity: Math.min(1, Math.max(0, (t - i * 70) / 360)) };
  });
  return (
    <Animated.View style={[styles.linha, i > 0 && styles.linhaBorda, st]}>
      <Text style={styles.linhaN}>{i + 1}</Text>
      <View style={styles.linhaFoto}>
        {p.img
          ? <ExpoImage source={{ uri: p.img }} cachePolicy="memory-disk" contentFit="contain" style={{ width: 36, height: 36 }} />
          : <StepIcon tipo={p.tipo} size={22} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {prod ? (
          <>
            {!!nome && <Text style={styles.linhaPasso} numberOfLines={1}>{nome}</Text>}
            <Text style={styles.linhaProd} numberOfLines={1}>{prod}</Text>
          </>
        ) : (
          <Text style={styles.linhaProd} numberOfLines={1}>{nome || 'Passo'}</Text>
        )}
      </View>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={PINK} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

export default memo(SkincareConcluido);

const styles = StyleSheet.create({
  titulo: { position: 'absolute', left: 24, right: 24, textAlign: 'center', fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.9, color: INK },
  blocoTempo: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  rotuloTempo: { fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.2, color: BODY },
  tempo: {
    marginTop: 2, textAlign: 'center', fontSize: 96, lineHeight: 100, fontWeight: '800', letterSpacing: -4, color: PINK,
    fontVariant: ['tabular-nums'], textShadowColor: 'rgba(255,94,168,0.25)', textShadowOffset: { width: 0, height: 8 }, textShadowRadius: 20,
  },
  stats: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statsN: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  statsT: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: BODY },
  statsPonto: { width: 4, height: 4, borderRadius: 2, backgroundColor: PINK, marginHorizontal: 6 },
  card: {
    position: 'absolute', left: 16, right: 16, paddingVertical: 18, paddingLeft: 16, paddingRight: 18, borderRadius: 24,
    backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 18,
    boxShadow: '0px 10px 30px rgba(192,32,106,0.10)',
  },
  medalha: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  pontosLinha: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  pontosN: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1.4, color: PINK, fontVariant: ['tabular-nums'] },
  pontosT: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: INK },
  nivelLinha: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nivelT: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: BODY, fontVariant: ['tabular-nums'] },
  barraFundo: { marginTop: 7, height: 8, borderRadius: 100, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  barra: { height: '100%', width: '100%', borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  rotinaCaixa: { position: 'absolute', left: 16, right: 16 },
  rotinaRotulo: { paddingHorizontal: 4, fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2, color: INK },
  rotinaCard: {
    marginTop: 10, flexShrink: 1, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    paddingVertical: 4, paddingHorizontal: 14,
  },
  // Linhas maiores que as da 90a (46 pt, foto 32) — pedido do produto em 12/nov/2026: no
  // aparelho ficavam pequenas demais para a tela.
  linha: { height: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  linhaBorda: { borderTopWidth: 1, borderTopColor: 'rgba(18,18,18,0.06)' },
  linhaN: { width: 16, fontSize: 14, fontWeight: '700', color: MUTE, fontVariant: ['tabular-nums'] },
  linhaFoto: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  linhaPasso: { fontSize: 12, lineHeight: 15, fontWeight: '500', color: MUTE },
  linhaProd: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3, color: INK },
  ctaCaixa: { position: 'absolute', left: 18, right: 18 },
  cta: {
    height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 6px 16px rgba(255,94,168,0.28)',
  },
  ctaT: { color: '#FFFFFF', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
});
