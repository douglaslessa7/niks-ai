import { memo, useEffect, type ReactNode } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { haptics } from '../../lib/haptics';
import BalancedText from '../BalancedText';
import type { CartaGanha, EstadoPoder } from '../../lib/cartasServidor';

// ─────────────────────────────────────────────────────────────────────────────
// A carta do NIKS — réplica da rodada 84 do Claude Design ("NIKS home redesign",
// NiksCartaFlo.dc.html): todas partem do verso (borda branca de 3, fio branco por
// dentro a 9, degradê perolado).
//   84a · verso (para raspar), colecionável (a flor + "Carta colecionável") e rara
//         (moldura dourada, holográfico que corre em 3,6 s, faíscas que piscam em
//         2,2 s, "Carta rara" e o título: "Campeã da semana" / "N dias seguidos").
//   84b · os 5 poderes (mesma moldura, muda o ícone, a cor e o estado embaixo — Ativo
//         até …, Armado, Usado em …) e a "Carta misteriosa" (Sequência em dobro de volta).
//   84c · as 3 cartas da convidada (produto, idade da pele, rotina) — só o visual; o
//         fluxo entra na Parte B.
// Medidas do design numa carta de 220 × 308; em outro tamanho tudo escala (x pela
// largura, y pela altura, fontes pela largura). "Reduzir movimento": sem holográfico
// correndo e sem faíscas piscando (ficam paradas).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const LOGO = require('../../assets/home/score-logo-pink.png');
const BW = 220;
const BH = 308;
const STAR = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';
const BG_BASE = 'linear-gradient(165deg, #FFE6F1 0%, #FCD6E8 48%, #EFDDFB 100%)';
const BG_RARA = 'linear-gradient(165deg, #FFE9DC 0%, #FFD0E4 45%, #E9D6FF 100%)';
const HOLO = 'linear-gradient(115deg, rgba(255,255,255,0) 10%, rgba(255,214,170,0.95) 26%, rgba(255,160,210,0.95) 38%, rgba(255,255,255,1) 48%, rgba(195,175,255,0.95) 58%, rgba(160,225,255,0.85) 70%, rgba(255,255,255,0) 86%)';
const SOMBRA_BASE = '0px 16px 34px rgba(255,94,168,0.20), 0px 2px 6px rgba(255,94,168,0.10)';
const SOMBRA_PODER = '0px 16px 34px rgba(255,94,168,0.18), 0px 2px 6px rgba(255,94,168,0.10)';
const SOMBRA_RARA = '0px 0px 0px 1px rgba(245,180,74,0.45), 0px 0px 34px rgba(255,170,130,0.45), 0px 16px 36px rgba(240,140,100,0.28)';

const IC = {
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
  shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12l2 2 4-4',
  extra: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z M15 12v6 M12 15h6 M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  coins: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z M18.09 10.37A6 6 0 1 1 10.34 18 M7 6h1v4 M16.71 13.88l.7.71-2.82 2.82',
};
const SHIELD_FILL = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';
const LOCK = ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'];

type Poder = { icone: string; cor: string; brilho: string; bg: string; titulo: string; texto: string; selo?: boolean };
const PODERES: Record<string, Poder> = {
  sequencia_dobro: { icone: IC.flame, cor: '#F7833A', brilho: 'rgba(247,131,58,0.30)', bg: 'linear-gradient(165deg, #FFE9DD 0%, #FFDCCF 45%, #F6DDF5 100%)', titulo: 'Sequência em dobro', texto: 'Nos próximos 2 dias, cada dia vale +2' },
  protecao_sequencia: { icone: IC.shield, cor: '#8E6CEB', brilho: 'rgba(142,108,235,0.30)', bg: 'linear-gradient(165deg, #F3E9FF 0%, #E6DAFF 50%, #FCE0EF 100%)', titulo: 'Proteção de sequência', texto: 'Se você falhar 1 dia, sua sequência não zera', selo: true },
  carta_extra: { icone: IC.extra, cor: '#FF5EA8', brilho: 'rgba(255,94,168,0.30)', bg: 'linear-gradient(165deg, #FFE6F1 0%, #FFD1E5 50%, #F3DDF8 100%)', titulo: 'Carta extra', texto: 'Amanhã você ganha uma carta a mais' },
  scan_antecipado: { icone: IC.scan, cor: '#F2577A', brilho: 'rgba(242,87,122,0.28)', bg: 'linear-gradient(165deg, #FFE8EA 0%, #FFD8DE 50%, #F6DEF3 100%)', titulo: 'Scan antecipado', texto: 'Seu próximo scan de rosto já está liberado' },
  pontos_dobro: { icone: IC.coins, cor: '#E39A12', brilho: 'rgba(233,162,30,0.30)', bg: 'linear-gradient(165deg, #FFF3DA 0%, #FFE5C4 45%, #FFDCEB 100%)', titulo: 'Pontos em dobro', texto: 'Por 2 dias, suas cartas valem o dobro de NIKS Points' },
};
const MISTERIOSA: Poder = { ...PODERES.sequencia_dobro, icone: IC.help, brilho: 'rgba(169,121,240,0.32)', bg: 'linear-gradient(165deg, #FFE6F1 0%, #F1DAFA 50%, #E3D6FF 100%)' };

export type PassoPrevia = { nome: string; sub: string; foto?: string | null };
export type VisualCarta =
  | { k: 'verso' }
  | { k: 'colecionavel' }
  /** `faiscas`: o desenho das faíscas (0 = campeã, 1 = dias seguidos — o design muda as posições). */
  | { k: 'rara'; titulo: string; faiscas?: 0 | 1 }
  | { k: 'poder'; subtipo: string; misteriosa: boolean; estado: EstadoPoder | null }
  | { k: 'conhecimento'; titulo: string; texto: string | null }
  | { k: 'convidada'; tipo: 'produto'; foto?: any }
  | { k: 'convidada'; tipo: 'idade'; foto?: any }
  | { k: 'convidada'; tipo: 'rotina'; passos: PassoPrevia[] };

/** O visual de uma carta do servidor (família, subtipo, rara, origem e o estado do poder). */
export function visualDe(c: Pick<CartaGanha, 'origem' | 'conteudo'> & { carta: CartaGanha['carta'] }, estado?: EstadoPoder | null): VisualCarta {
  const cat = c.carta;
  if (cat?.familia === 'poder') {
    return { k: 'poder', subtipo: cat.subtipo ?? 'sequencia_dobro', misteriosa: c.origem === 'volta' && cat.subtipo === 'sequencia_dobro', estado: estado ?? null };
  }
  if (cat?.familia === 'conhecimento') {
    return { k: 'conhecimento', titulo: String((c.conteudo as any)?.titulo ?? cat.nome), texto: ((c.conteudo as any)?.texto ?? cat.texto ?? null) as string | null };
  }
  if (c.origem === 'campea') return { k: 'rara', titulo: 'Campeã da semana' };
  if (c.origem === 'marco') {
    const n = Number((c.conteudo as any)?.marco);
    return { k: 'rara', titulo: Number.isFinite(n) && n > 0 ? `${n} dias seguidos` : 'Carta rara', faiscas: 1 };
  }
  if (cat?.raridade === 'rara') return { k: 'rara', titulo: cat.nome };
  return { k: 'colecionavel' };
}

function Faisca({ size, color, style, i, parado }: { size: number; color: string; style: ViewStyle; i: number; parado: boolean }) {
  const p = useSharedValue(parado ? 1 : 0);
  useEffect(() => {
    if (parado) { cancelAnimation(p); p.set(1); return; }
    p.set(0);
    p.set(withDelay(i * 260, withRepeat(withSequence(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
    ), -1, false)));
    return () => cancelAnimation(p);
  }, [parado, i, p]);
  const st = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * p.get(), transform: [{ scale: 0.7 + 0.3 * p.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style, st]}>
      <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={STAR} fill={color} /></Svg>
    </Animated.View>
  );
}

// Holográfico da rara: camada de 260% que corre de 0% a 100% (background-position) e volta, 3,6 s.
function Holo({ w, h, parado }: { w: number; h: number; parado: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (parado) { cancelAnimation(p); p.set(0); return; }
    p.set(withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(p);
  }, [parado, p]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -1.6 * w * p.get() }, { translateY: -0.8 * h }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: w * 2.6, height: h * 2.6, mixBlendMode: 'overlay', opacity: 0.95, experimental_backgroundImage: HOLO }, st]}
    />
  );
}

function Pilula({ s, children, style }: { s: number; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ height: 26 * s, paddingLeft: 9 * s, paddingRight: 11 * s, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.9)', flexDirection: 'row', alignItems: 'center', gap: 5 * s }, style]}>
      {children}
    </View>
  );
}

type Props = {
  v: VisualCarta;
  w: number;
  h?: number;
  /** NIKS Points da carta (pílula branca embaixo). Ignorado se `selo` vier. */
  pontos?: number | null;
  /** Selo próprio no lugar da pílula de pontos (ex.: o que conta na revelação). */
  selo?: ReactNode;
  /** Sem sombra (quando quem chama desenha a sombra por fora). */
  semSombra?: boolean;
  /** Faíscas de fora da carta (a rara, como no design). */
  faiscasFora?: boolean;
  parado?: boolean;
  /** Botão da carta da convidada (abre o paywall — Parte B). */
  onBotao?: () => void;
  /** Só as faíscas de fora (para quem recorta a carta e desenha as faíscas por cima). */
  apenasFaiscas?: boolean;
};

/** Sombra da carta (para quem recorta a carta e desenha a sombra por fora). */
export function sombraCarta(v: VisualCarta): string {
  return v.k === 'rara' ? SOMBRA_RARA : v.k === 'poder' ? SOMBRA_PODER : SOMBRA_BASE;
}

function CartaBase({ v, w, h: hProp, pontos, selo, semSombra, faiscasFora = true, parado: paradoProp, onBotao, apenasFaiscas }: Props) {
  const rmSys = useReducedMotion();
  const parado = Boolean(paradoProp || rmSys);
  const h = hProp ?? (w * BH) / BW;
  const sx = w / BW;
  const sy = h / BH;
  const s = sx;
  const X = (n: number) => n * sx;
  const Y = (n: number) => n * sy;
  const rara = v.k === 'rara';
  const poder = v.k === 'poder' ? (v.misteriosa ? MISTERIOSA : PODERES[v.subtipo] ?? PODERES.sequencia_dobro) : null;
  const bg = rara ? BG_RARA : poder ? poder.bg : BG_BASE;
  const sombra = semSombra ? undefined : rara ? SOMBRA_RARA : poder ? SOMBRA_PODER : SOMBRA_BASE;
  const borda = Math.max(1.5, 3 * s);
  // Como no CSS do design, as camadas se posicionam DENTRO da borda (padding box).
  const wi = w - 2 * borda;
  const hi = h - 2 * borda;
  const inset = 9 * s;
  const fio = rara ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.85)';
  const usado = v.k === 'poder' && v.estado?.st === 'used';

  const pilulaPontos = (cor: string) => (selo ?? (pontos != null ? (
    <View style={{ height: 30 * s, paddingHorizontal: 13 * s, borderRadius: 100, backgroundColor: '#fff', boxShadow: `0px ${4 * s}px ${10 * s}px ${cor}`, flexDirection: 'row', alignItems: 'center', gap: 4 * s }}>
      <Text style={{ fontSize: 13 * s, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] }}>{`+${pontos}`}</Text>
      <Text style={{ fontSize: 13 * s, color: INK }}>NIKS Points</Text>
    </View>
  ) : null));
  const temRodape = Boolean(selo) || pontos != null;

  const logo = (top: number, lw: number, lh: number, glow: string) => (
    <Image source={LOGO} style={{ position: 'absolute', left: (wi - lw * s) / 2, top: top - (lh * s) / 2, width: lw * s, height: lh * s, filter: [{ dropShadow: { offsetX: 0, offsetY: 6 * s, standardDeviation: 6 * s, color: glow } }] } as any} />
  );

  let corpo: ReactNode = null;
  if (v.k === 'verso') {
    corpo = (
      <>
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'radial-gradient(55% 40% at 50% 46%, rgba(255,255,255,0.85), rgba(255,255,255,0))' }]} />
        {logo(hi * 0.46, 78, 79, 'rgba(255,94,168,0.35)')}
      </>
    );
  } else if (v.k === 'colecionavel') {
    corpo = (
      <>
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'radial-gradient(55% 38% at 50% 40%, rgba(255,255,255,0.9), rgba(255,255,255,0))' }]} />
        {logo(hi * 0.4, 84, 85, 'rgba(255,94,168,0.35)')}
        {/* Com pontos, a pílula fica embaixo (20) e o título sobe para cima dela. */}
        <Text style={[styles.centro, { bottom: Y(temRodape ? 62 : 30), fontSize: 17 * s, lineHeight: 22 * s, fontWeight: '700', letterSpacing: -0.3 * s }]}>Carta colecionável</Text>
        {temRodape && <View style={[styles.rodape, { bottom: Y(20) }]}>{pilulaPontos('rgba(255,94,168,0.22)')}</View>}
      </>
    );
  } else if (v.k === 'conhecimento') {
    // O design 84 não tem a de conhecimento: a moldura do verso com o título e o texto.
    corpo = (
      <>
        <View style={{ position: 'absolute', left: X(20), right: X(20), top: Y(26), bottom: Y(temRodape ? 62 : 26), justifyContent: 'center' }}>
          <Text style={{ textAlign: 'center', fontSize: 18 * s, lineHeight: 23 * s, fontWeight: '700', letterSpacing: -0.4 * s, color: INK }}>{v.titulo}</Text>
          {!!v.texto && <Text style={{ marginTop: 8 * s, textAlign: 'center', fontSize: 13 * s, lineHeight: 18 * s, color: '#3d3d3d' }}>{v.texto}</Text>}
        </View>
        {temRodape && <View style={[styles.rodape, { bottom: Y(20) }]}>{pilulaPontos('rgba(255,94,168,0.22)')}</View>}
      </>
    );
  } else if (rara) {
    corpo = (
      <>
        <Holo w={wi} h={hi} parado={parado} />
        {(v as { faiscas?: number }).faiscas === 1 ? (
          <>
            <Faisca i={3} parado={parado} size={12 * s} color="#FFFFFF" style={{ right: X(34), top: Y(70) }} />
            <Faisca i={4} parado={parado} size={9 * s} color="#FFFFFF" style={{ left: X(34), top: Y(160) }} />
          </>
        ) : (
          <>
            <Faisca i={4} parado={parado} size={10 * s} color="#FFFFFF" style={{ left: X(30), top: Y(64) }} />
            <Faisca i={5} parado={parado} size={13 * s} color="#FFFFFF" style={{ right: X(30), top: Y(150) }} />
          </>
        )}
        <View style={[styles.rodape, { top: Y(20) }]}>
          <Pilula s={s}>
            <Svg width={12 * s} height={12 * s} viewBox="0 0 24 24"><Path d={STAR} fill="#F5B44A" /></Svg>
            <Text style={{ fontSize: 12 * s, fontWeight: '600', color: INK }}>Carta rara</Text>
          </Pilula>
        </View>
        <View style={{ position: 'absolute', left: (wi - 150 * s) / 2, top: hi * 0.42 - 75 * s, width: 150 * s, height: 150 * s, borderRadius: 75 * s, experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,250,240,0.95), rgba(255,200,150,0.35) 60%, rgba(255,200,150,0))' }} />
        {logo(hi * 0.42, 84, 85, 'rgba(240,140,100,0.5)')}
        <BalancedText text={(v as { titulo: string }).titulo} numberOfLines={2} style={[styles.centro, { top: Y(204), fontSize: 18 * s, lineHeight: 22 * s, fontWeight: '700', letterSpacing: -0.4 * s }]} />
        {temRodape && <View style={[styles.rodape, { bottom: Y(20) }]}>{pilulaPontos('rgba(240,140,100,0.22)')}</View>}
      </>
    );
  } else if (poder && v.k === 'poder') {
    const est = v.estado;
    corpo = (
      <>
        <View style={{ position: 'absolute', left: (wi - 170 * s) / 2, top: Y(104) - 85 * s, width: 170 * s, height: 170 * s, borderRadius: 85 * s, experimental_backgroundImage: `radial-gradient(closest-side, ${poder.brilho}, rgba(255,255,255,0))` }} />
        <View style={[styles.rodape, { top: Y(20) }]}>
          <Pilula s={s} style={{ gap: 6 * s }}>
            <View style={{ width: 7 * s, height: 7 * s, borderRadius: 3.5 * s, backgroundColor: poder.cor }} />
            <Text style={{ fontSize: 12 * s, fontWeight: '600', color: INK }}>{v.misteriosa ? 'Carta misteriosa' : 'Carta de poder'}</Text>
          </Pilula>
        </View>
        <View style={{ position: 'absolute', left: (wi - 84 * s) / 2, top: Y(104) - 42 * s, width: 84 * s, height: 84 * s, borderRadius: 42 * s, backgroundColor: '#fff', boxShadow: `0px ${8 * s}px ${20 * s}px ${poder.brilho}`, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={40 * s} height={40 * s} viewBox="0 0 24 24"><Path d={poder.icone} fill="none" stroke={poder.cor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </View>
        {poder.selo && (
          <View style={{ position: 'absolute', left: wi / 2 + 18 * s, top: Y(130), width: 30 * s, height: 30 * s, borderRadius: 15 * s, borderWidth: 2.5 * s, borderColor: '#fff', backgroundColor: poder.cor, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={14 * s} height={14 * s} viewBox="0 0 24 24"><Path d={SHIELD_FILL} fill="#fff" /></Svg>
          </View>
        )}
        <View style={{ position: 'absolute', left: X(14), right: X(14), top: Y(160) }}>
          <BalancedText text={poder.titulo} style={{ textAlign: 'center', fontSize: 17 * s, lineHeight: 21 * s, fontWeight: '700', letterSpacing: -0.4 * s, color: INK }} />
          <BalancedText text={poder.texto} style={{ marginTop: 4 * s, textAlign: 'center', fontSize: 13 * s, lineHeight: 17 * s, color: '#3d3d3d' }} />
        </View>
        {usado && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: 0.38 }]} />}
        {temRodape && <View style={[styles.rodape, { bottom: Y(est ? 54 : 18) }]}>{pilulaPontos('rgba(200,60,120,0.18)')}</View>}
        {est && (
          <View style={[styles.rodape, { bottom: Y(18) }]}>
            <View style={{ height: 28 * s, paddingLeft: 10 * s, paddingRight: 12 * s, borderRadius: 100, backgroundColor: usado ? 'rgba(255,255,255,0.6)' : '#fff', boxShadow: `0px ${3 * s}px ${8 * s}px rgba(200,60,120,0.10)`, flexDirection: 'row', alignItems: 'center', gap: 6 * s }}>
              <View style={{ width: 7 * s, height: 7 * s, borderRadius: 3.5 * s, backgroundColor: usado ? '#B5B5B5' : poder.cor }} />
              <Text style={{ fontSize: 12 * s, fontWeight: '600', color: usado ? MUTE : INK }}>{est.texto}</Text>
            </View>
          </View>
        )}
      </>
    );
  } else if (v.k === 'convidada') {
    const botao = (rotulo: string, st: ViewStyle, fs: number) => (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!onBotao}
        onPress={() => { haptics.action(); onBotao?.(); }}
        style={[{ height: 44 * s, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center', boxShadow: `0px ${8 * s}px ${18 * s}px rgba(255,94,168,0.35)` }, st]}
      >
        <Text style={{ color: '#fff', fontSize: fs * s, fontWeight: '600', letterSpacing: -0.3 * s }}>{rotulo}</Text>
      </TouchableOpacity>
    );
    if (v.tipo === 'produto') {
      corpo = (
        <>
          <BalancedText text="Achamos o produto perfeito para sua pele" style={[styles.centro, { left: X(20), right: X(20), top: Y(26), fontSize: 17 * s, lineHeight: 21 * s, fontWeight: '700', letterSpacing: -0.4 * s }]} />
          {v.foto && (
            <Image source={v.foto} resizeMode="contain" style={{ position: 'absolute', left: wi / 2 - 70 * s, top: Y(184) - 90 * s, width: 140 * s, height: 180 * s, opacity: 0.2, tintColor: '#000', transform: [{ rotate: '-4deg' }] }} />
          )}
          {botao('Ver produto', { position: 'absolute', alignSelf: 'center', top: Y(184) - 23 * s, height: 46 * s, paddingHorizontal: 24 * s, boxShadow: `0px ${8 * s}px ${20 * s}px rgba(255,94,168,0.4)` }, 16)}
        </>
      );
    } else if (v.tipo === 'idade') {
      corpo = (
        <>
          <BalancedText text="Descubra a idade da sua pele" style={[styles.centro, { left: X(20), right: X(20), top: Y(26), fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '700', letterSpacing: -0.3 * s }]} />
          <View style={{ position: 'absolute', left: wi / 2 - 54 * s, top: Y(150) - 54 * s, width: 108 * s, height: 108 * s, borderRadius: 54 * s, borderWidth: 3 * s, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#FCE3EE', boxShadow: `0px ${8 * s}px ${20 * s}px rgba(255,94,168,0.22)` }}>
            {v.foto && <Image source={v.foto} blurRadius={10} style={{ width: '100%', height: '100%', transform: [{ scale: 1.12 }] }} />}
          </View>
          <View style={[styles.rodape, { top: Y(196) }]}>
            <View style={{ height: 30 * s, paddingHorizontal: 14 * s, borderRadius: 100, backgroundColor: '#fff', boxShadow: `0px ${4 * s}px ${10 * s}px rgba(255,94,168,0.18)`, flexDirection: 'row', alignItems: 'center', gap: 4 * s }}>
              <Text style={{ fontSize: 13 * s, fontWeight: '700', color: PINK }}>??</Text>
              <Text style={{ fontSize: 13 * s, color: INK }}>anos</Text>
            </View>
          </View>
          {botao('Descobrir', { position: 'absolute', left: X(18), right: X(18), bottom: Y(20) }, 15)}
        </>
      );
    } else {
      corpo = (
        <>
          <View style={{ position: 'absolute', left: X(18), right: X(18), top: Y(24) }}>
            <BalancedText text="Já temos sua rotina completa de skincare." style={{ textAlign: 'center', fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '700', letterSpacing: -0.3 * s, color: INK }} />
            <Text style={{ marginTop: 3 * s, textAlign: 'center', fontSize: 13 * s, lineHeight: 17 * s, color: '#3d3d3d' }}>Toque para ver</Text>
          </View>
          <View style={{ position: 'absolute', left: X(26), right: X(26), top: Y(106), paddingVertical: 8 * s, paddingHorizontal: 10 * s, borderRadius: 14 * s, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', gap: 4 * s }}>
            {v.passos.slice(0, 3).map((p, i) => (
              <View key={i} style={{ height: 30 * s, flexDirection: 'row', alignItems: 'center', gap: 8 * s }}>
                <View style={{ width: 26 * s, height: 26 * s, borderRadius: 8 * s, backgroundColor: '#F4F4F4', overflow: 'hidden', padding: 3 * s }}>
                  {p.foto ? <Image source={{ uri: p.foto }} blurRadius={1.5} resizeMode="contain" style={{ width: '100%', height: '100%' }} /> : null}
                </View>
                {/* Nome e passo borrados (só a forma): o desfoque de 3,5 do design é um BlurView por cima. */}
                <View style={{ flex: 1, minWidth: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Text numberOfLines={1} style={{ fontSize: 11 * s, lineHeight: 14 * s, fontWeight: '600', color: INK }}>{p.nome}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 9 * s, lineHeight: 12 * s, color: MUTE }}>{p.sub}</Text>
                  <BlurView intensity={14} tint="light" style={[StyleSheet.absoluteFill, { margin: -4 * s }]} />
                </View>
              </View>
            ))}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <View style={{ width: 34 * s, height: 34 * s, borderRadius: 17 * s, backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(255,94,168,0.35)', boxShadow: `0px ${6 * s}px ${16 * s}px rgba(255,94,168,0.30)`, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={15 * s} height={15 * s} viewBox="0 0 24 24">{LOCK.map((d) => <Path key={d} d={d} fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />)}</Svg>
              </View>
            </View>
          </View>
          {botao('Ver minha rotina', { position: 'absolute', left: X(18), right: X(18), bottom: Y(20) }, 15)}
        </>
      );
    }
  }

  const fora = rara && faiscasFora;
  return (
    <View pointerEvents={apenasFaiscas ? 'none' : 'auto'} style={{ width: w, height: h }}>
      {fora && (v as { faiscas?: number }).faiscas === 1 && (
        <>
          <Faisca i={0} parado={parado} size={16 * s} color="#F5B44A" style={{ left: -18 * s, top: Y(30) }} />
          <Faisca i={1} parado={parado} size={12 * s} color={PINK} style={{ right: -16 * s, top: Y(110) }} />
          <Faisca i={2} parado={parado} size={14 * s} color="#C9B6FF" style={{ left: -12 * s, bottom: Y(56) }} />
        </>
      )}
      {fora && (v as { faiscas?: number }).faiscas !== 1 && (
        <>
          <Faisca i={0} parado={parado} size={18 * s} color="#F5B44A" style={{ right: -18 * s, top: Y(18) }} />
          <Faisca i={1} parado={parado} size={12 * s} color={PINK} style={{ left: -16 * s, top: Y(96) }} />
          <Faisca i={2} parado={parado} size={14 * s} color="#C9B6FF" style={{ right: -14 * s, bottom: Y(60) }} />
          <Faisca i={3} parado={parado} size={10 * s} color="#F5B44A" style={{ left: -10 * s, bottom: Y(24) }} />
        </>
      )}
      {!apenasFaiscas && <View style={[StyleSheet.absoluteFill, { borderRadius: 22 * s, boxShadow: sombra }]}>
        <View style={{ flex: 1, borderRadius: 22 * s, borderWidth: borda, borderColor: '#fff', overflow: 'hidden', experimental_backgroundImage: bg }}>
          <View style={StyleSheet.absoluteFill}>
            {corpo}
            <View pointerEvents="none" style={{ position: 'absolute', left: inset, top: inset, right: inset, bottom: inset, borderRadius: 15 * s, borderWidth: Math.max(1, 1.5 * s), borderColor: fio }} />
          </View>
        </View>
      </View>}
    </View>
  );
}

const Carta = memo(CartaBase);
export default Carta;

const styles = StyleSheet.create({
  centro: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: INK },
  rodape: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
