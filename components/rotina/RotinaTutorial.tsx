// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeiro acesso da aba Rotina — réplica do Claude Design
// (`NiksRoutineTutorial`, telas 54a/54b). Aparece UMA vez por conta
// (`users.rotina_intro_status` null); quem grava a escolha é a Rotina (`escolherIntro`).
//
//   · Momento 1 — "Essa é a rotina ideal pra sua pele": os passos dela em cards; a
//     cada 3,2 s alternam sozinhos entre manhã e noite (como o 54a). "Continuar".
//   · Momento 2 — os cards saem e os produtos se juntam numa moldura de scan:
//     "Quer usar o que já tem em casa?" + Escanear meus produtos / Não tenho
//     produtos / Fazer isso depois.
//
// Geometria: tudo em coordenadas do quadro do design (393×852), num "palco" escalado
// por igual para caber na tela (min(W/393, H/852)) e centralizado — as posições ficam
// literalmente as do design. O fundo (degradê + véu) ocupa a tela inteira.
// Dados: os passos e produtos são os DELA (Minha rotina). Passo sem produto usa a
// imagem ilustrativa do design para aquele tipo de passo.
// Nada é clicável além dos botões (o overlay engole o resto dos toques).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, G, Line, Path, Rect } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import type { MinhaRotina, PassoRotina, Periodo } from '../../lib/minhaRotina';
import { ROTULO_TIPO, tipoDoPasso, type TipoPasso } from '../../lib/tipoPasso';

export type EscolhaIntro = 'escanear' | 'sem_produtos' | 'depois';

const DW = 393;
const DH = 852;
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const MUTED = '#8A8387';
const SOFT = '#6E6468';
const INK = '#121212';

// Curvas do design: cubic-bezier(.2,.8,.2,1) e "ease".
const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

const BG: Record<Periodo, string[]> = {
  am: ['#FFE3EF', '#FFD3E5', '#FFC6DC', '#FDDFEB', '#FBEEF3', '#F9F2F5'],
  pm: ['#EADCF4', '#F0D9EE', '#F6D3E5', '#F9E3EE', '#FBEFF4', '#F9F3F6'],
};
const BG_STOPS = [0, 0.28, 0.5, 0.64, 0.8, 1];

// Por posição, como no design: fundo do quadradinho, altura e giro do produto.
const TINT: Record<Periodo, string[]> = {
  am: ['#FDE4EE', '#E2F1EF', '#FFEFD9', '#E3EEF8', '#FFF1D6'],
  pm: ['#FFEFD9', '#FDE4EE', '#EEE5F6', '#E2F1EF', '#E3EEF8'],
};
const ALTURA: Record<Periodo, number[]> = { am: [66, 62, 62, 56, 64], pm: [66, 66, 62, 64, 56] };
const GIRO = [-5, 4, -4, 4, -5];
// Onde cada produto pousa na moldura (momento 2).
const CL = [
  { cx: 126, base: 562, s: 2.3, r: -8, z: 4 },
  { cx: 198, base: 548, s: 2.05, r: 4, z: 4 },
  { cx: 160, base: 604, s: 1.9, r: -3, z: 6 },
  { cx: 236, base: 606, s: 2.0, r: 5, z: 6 },
  { cx: 268, base: 566, s: 2.15, r: 9, z: 5 },
];

// Passo SEM produto: uma imagem por categoria, para TODO passo ter foto. Nunca
// mostra marca/nome no card (só categoria + nome do passo).
//   · limpeza (gel, óleo, sabonete) → frasco de bomba do Claude Design (cut-pump)
//   · tônico e sérum              → conta-gotas do Claude Design (cut-serum)
//   · hidratante / protetor / olhos → foto sem fundo de um produto do catálogo
//     `produtos` (La Roche-Posay Toleriane Sensitive, Anthelios XL FPS 60 e
//     Hyalu B5 Olhos) — o design não tem imagem dessas categorias
//   · passo que o app não reconhece → conta-gotas
const IMG_BOMBA = require('../../assets/rotina-tutorial/cut-pump.png');
const IMG_SERUM = require('../../assets/rotina-tutorial/cut-serum.png');
const IMG_HIDRATANTE = require('../../assets/rotina-tutorial/hidratante.png');
const IMG_PROTETOR = require('../../assets/rotina-tutorial/protetor.png');
const IMG_OLHOS = require('../../assets/rotina-tutorial/olhos.png');
const ILUSTRACAO: Record<TipoPasso, any> = {
  limpeza: IMG_BOMBA, tonico: IMG_SERUM, serum: IMG_SERUM, hidratante: IMG_HIDRATANTE, protetor: IMG_PROTETOR, olhos: IMG_OLHOS,
};
const ilustracao = (t: TipoPasso | null) => (t ? ILUSTRACAO[t] : IMG_SERUM);

// `pline` null = passo sem produto: o card mostra só a categoria e o nome do passo.
type Card = { cat: string; name: string; pline: string | null; tint: string; img: any; h: number };

function cardsDe(passos: PassoRotina[], per: Periodo): Card[] {
  return passos.slice(0, 5).map((p, i) => {
    const tipo = tipoDoPasso(p.nome ?? '', p.ingrediente ?? '');
    const prod = p.produto;
    const uri = prod?.recorteUrl ?? prod?.imagemUrl ?? null;
    const linhaProduto = prod ? [prod.marca, prod.nome].filter(Boolean).join(' · ') : '';
    return {
      cat: tipo ? ROTULO_TIPO[tipo] : 'Passo',
      name: p.nome || linhaProduto || 'Passo',
      pline: uri ? linhaProduto : null,
      tint: TINT[per][i],
      img: uri ? { uri } : ilustracao(tipo),
      h: ALTURA[per][i],
    };
  });
}

const anim = (v: Animated.Value, toValue: number, duration: number, easing = EASE, delay = 0, native = true) =>
  Animated.timing(v, { toValue, duration, easing, delay, useNativeDriver: native });

type Props = { minha: MinhaRotina; onEscolha: (e: EscolhaIntro) => void };

export default function RotinaTutorial({ minha, onEscolha }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const s = Math.min(W / DW, H / DH);
  const palco = { position: 'absolute' as const, left: (W - DW) / 2, top: (H - DH) / 2, width: DW, height: DH, transform: [{ scale: s }] };

  const [m, setM] = useState<1 | 2>(1);
  const [per, setPer] = useState<Periodo>(minha.am.length ? 'am' : 'pm');
  const [swap, setSwap] = useState(false);
  const one = m === 1;

  // Só alterna se os dois períodos tiverem passos.
  const temOutro = minha.am.length > 0 && minha.pm.length > 0;
  const cards = useMemo(() => cardsDe(minha[per], per), [minha, per]);
  const n = cards.length;

  // ── Momento 1: alterna manhã ↔ noite (o design faz em 3,2 s) ───────────────
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    if (m !== 1 || !temOutro) return;
    const iv = setInterval(() => {
      setSwap(true);
      timers.current.push(setTimeout(() => setPer((p) => (p === 'am' ? 'pm' : 'am')), 460));
      timers.current.push(setTimeout(() => setSwap(false), 520));
    }, 3200);
    return () => clearInterval(iv);
  }, [m, temOutro]);

  // ── Valores animados ────────────────────────────────────────────────────────
  const cinco = [0, 1, 2, 3, 4];
  const perV = useRef(new Animated.Value(per === 'pm' ? 1 : 0)).current; // fundo e moldura
  const t1Op = useRef(new Animated.Value(1)).current;
  const t1Y = useRef(new Animated.Value(0)).current;
  const t2Op = useRef(new Animated.Value(0)).current;
  const t2Y = useRef(new Animated.Value(8)).current;
  const plateH = useRef(new Animated.Value(474)).current;
  const m2Op = useRef(new Animated.Value(0)).current;
  const pillOp = useRef(new Animated.Value(1)).current;
  const m1Op = useRef(new Animated.Value(1)).current;
  const numOp = useRef(cinco.map(() => new Animated.Value(1))).current;
  const cardOp = useRef(cinco.map(() => new Animated.Value(1))).current;
  const cardY = useRef(cinco.map(() => new Animated.Value(0))).current;
  const cardS = useRef(cinco.map(() => new Animated.Value(1))).current;
  const bx = useRef(cinco.map(() => new Animated.Value(68))).current;
  const by = useRef(cinco.map((i) => new Animated.Value(272 + i * 84))).current;
  const bs = useRef(cinco.map(() => new Animated.Value(1))).current;
  const br = useRef(GIRO.map((r) => new Animated.Value(r))).current;
  const bOp = useRef(cinco.map(() => new Animated.Value(1))).current;
  const tagOp = useRef(new Animated.Value(0)).current;
  const tagY = useRef(new Animated.Value(6)).current;
  const dotsTop = useRef(new Animated.Value(736)).current;
  const d = useRef(new Animated.Value(0)).current; // 0 = momento 1 · 1 = momento 2
  const actOp = useRef(new Animated.Value(0)).current;
  const actY = useRef(new Animated.Value(14)).current;
  const scan = useRef(new Animated.Value(0)).current;

  // Fundo e moldura acompanham o período (.6s ease).
  useEffect(() => { anim(perV, per === 'pm' ? 1 : 0, 600, EASE, 0, false).start(); }, [per, perV]);

  // Troca de período no momento 1: cards, produtos e o selo somem e voltam.
  useEffect(() => {
    if (!one) return;
    const vis = swap ? 0 : 1;
    anim(pillOp, vis, 300).start();
    cardOp.forEach((v, i) => anim(v, vis, 300, EASE, i * 40).start());
    cardY.forEach((v, i) => anim(v, swap ? 6 : 0, 450, EASE_OUT, i * 40).start());
    bOp.forEach((v) => anim(v, vis, 300).start());
  }, [swap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Passagem entre os momentos.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; } // já nasce no momento 1
    const um = m === 1;
    Animated.parallel([
      anim(t1Op, um ? 1 : 0, 350), anim(t1Y, um ? 0 : -8, 500, EASE_OUT),
      anim(t2Op, um ? 0 : 1, 400, EASE, 150), anim(t2Y, um ? 8 : 0, 550, EASE_OUT, 150),
      anim(plateH, um ? 474 : 386, 700, EASE_OUT, 0, false),
      anim(m2Op, um ? 0 : 1, 400, EASE, 350),
      anim(pillOp, um ? 1 : 0, 300),
      anim(m1Op, um ? 1 : 0, 300),
      ...numOp.map((v, i) => anim(v, um ? 1 : 0, 300, EASE, i * 30)),
      ...cardOp.map((v, i) => anim(v, um ? 1 : 0, 300, EASE, i * 40)),
      ...cardY.map((v, i) => anim(v, um ? 0 : 14, 450, EASE_OUT, i * 40)),
      ...cardS.map((v, i) => anim(v, um ? 1 : 0.96, 450, EASE_OUT, i * 40)),
      ...cinco.flatMap((i) => {
        const c = CL[i];
        const dl = um ? (4 - i) * 30 : i * 50;
        return [
          anim(bx[i], um ? 68 : c.cx - 26, 800, EASE_OUT, dl),
          anim(by[i], um ? 272 + i * 84 : c.base - 52, 800, EASE_OUT, dl),
          anim(bs[i], um ? 1 : c.s, 800, EASE_OUT, dl),
          anim(br[i], um ? GIRO[i] : c.r, 800, EASE_OUT, dl),
          anim(bOp[i], 1, 300),
        ];
      }),
      anim(tagOp, um ? 0 : 1, 350, EASE, 750),
      anim(tagY, um ? 6 : 0, 450, EASE_OUT, 750),
      anim(dotsTop, um ? 736 : 640, 700, EASE_OUT, 0, false),
      anim(d, um ? 0 : 1, 300, EASE, 0, false),
      anim(actOp, um ? 0 : 1, 350, EASE, 450),
      anim(actY, um ? 14 : 0, 500, EASE_OUT, 450),
    ]).start();
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps

  // Linha de scan: desce e sobe sem parar (2,6 s, ease-in-out, alternate).
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scan, { toValue: 300, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scan, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scan]);

  const continuar = () => { haptics.tap(); setSwap(false); setM(2); };
  const escolher = (e: EscolhaIntro) => { haptics.select(); onEscolha(e); };

  const plateBg = perV.interpolate({ inputRange: [0, 1], outputRange: ['#FFD0E3', '#EBD3F0'] });
  const am = per === 'am';
  const linhaH = (n - 1) * 84 - 32;

  return (
    <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} accessibilityViewIsModal>
      <StatusBar style="dark" />
      {/* Fundo da tela inteira: degradê do período (troca em .6s) */}
      <LinearGradient colors={BG.am as any} locations={BG_STOPS as any} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: perV }]} pointerEvents="none">
        <LinearGradient colors={BG.pm as any} locations={BG_STOPS as any} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {/* A Rotina desfocada ao fundo (blur 9px do design) */}
      <View style={palco} pointerEvents="none">
        <Svg width={DW} height={DH}>
          <Defs>
            <Filter id="nt-blur" x={-60} y={-60} width={DW + 120} height={DH + 120} filterUnits="userSpaceOnUse">
              <FeGaussianBlur stdDeviation={9} />
            </Filter>
          </Defs>
          <G filter="url(#nt-blur)">
            <Circle cx={-20} cy={560} r={310} fill="rgba(255,255,255,0.42)" />
            <Circle cx={470} cy={190} r={280} fill="rgba(255,226,236,0.40)" />
            <Circle cx={36} cy={85} r={16} fill="#B79AA6" />
            <Rect x={62} y={76} width={86} height={16} rx={8} fill="rgba(18,18,18,0.55)" />
            <Circle cx={355} cy={87} r={18} fill="#FFFFFF" />
            <Rect x={98.5} y={123} width={196} height={42} rx={21} fill="rgba(255,255,255,0.7)" />
            <Rect x={101.5} y={209} width={190} height={16} rx={8} fill="rgba(18,18,18,0.5)" />
            <Rect x={111.5} y={238} width={170} height={44} rx={12} fill="rgba(18,18,18,0.75)" />
            <Rect x={96.5} y={342} width={200} height={48} rx={24} fill={PINK} />
            <Rect x={18} y={434} width={170} height={18} rx={9} fill="rgba(18,18,18,0.6)" />
            <Rect x={58} y={472} width={317} height={76} rx={13} fill="#FFFFFF" />
            <Rect x={58} y={558} width={317} height={76} rx={13} fill="#FFFFFF" />
            <Rect x={58} y={644} width={317} height={76} rx={13} fill="#FFFFFF" />
            <Rect x={0} y={DH - 87} width={DW} height={87} fill="#FFFFFF" />
          </G>
        </Svg>
      </View>
      {/* Véu claro por cima da rotina desfocada */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,246,250,0.5)' }]} pointerEvents="none" />

      <View style={palco} pointerEvents="box-none">
        {/* Textos dos dois momentos */}
        <Animated.View style={[st.textos, { opacity: t1Op, transform: [{ translateY: t1Y }] }]} pointerEvents="none">
          <Text style={st.titulo}>{'Essa é a rotina\nideal pra sua pele'}</Text>
          <Text style={st.sub}>Montei seus passos de manhã e de noite a partir do seu scan.</Text>
        </Animated.View>
        <Animated.View style={[st.textos, { opacity: t2Op, transform: [{ translateY: t2Y }] }]} pointerEvents="none">
          <Text style={st.titulo}>{'Quer usar o que\njá tem em casa?'}</Text>
          <Text style={st.sub}>Escaneie seus produtos e eu encaixo cada um no passo certo da sua rotina.</Text>
        </Animated.View>

        {/* Moldura (no momento 2 vira a moldura de scan) */}
        <Animated.View style={[st.plate, { height: plateH, backgroundColor: plateBg }]} pointerEvents="none">
          <View style={st.plateInner}>
            <LinearGradient colors={['#FFF6FA', '#FDEAF2', '#FBF0F5']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: m2Op }]}>
              <View style={[st.canto, { left: 16, top: 16, borderLeftWidth: 3.5, borderTopWidth: 3.5, borderTopLeftRadius: 14 }]} />
              <View style={[st.canto, { right: 16, top: 16, borderRightWidth: 3.5, borderTopWidth: 3.5, borderTopRightRadius: 14 }]} />
              <View style={[st.canto, { left: 16, bottom: 16, borderLeftWidth: 3.5, borderBottomWidth: 3.5, borderBottomLeftRadius: 14 }]} />
              <View style={[st.canto, { right: 16, bottom: 16, borderRightWidth: 3.5, borderBottomWidth: 3.5, borderBottomRightRadius: 14 }]} />
              <Animated.View style={[st.scan, { transform: [{ translateY: scan }] }]} />
            </Animated.View>
          </View>
        </Animated.View>

        {/* Selo do período */}
        <Animated.View style={[st.pillWrap, { opacity: pillOp }]} pointerEvents="none">
          <View style={st.pill}>
            {am ? (
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Circle cx={12} cy={12} r={4} fill="none" stroke={PINK_TEXT} strokeWidth={2} strokeLinecap="round" />
                <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" fill="none" stroke={PINK_TEXT} strokeWidth={2} strokeLinecap="round" />
              </Svg>
            ) : (
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="#9A5BC0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            )}
            <Text style={st.pillTxt}>{am ? 'Manhã' : 'Noite'}</Text>
            <Text style={st.pillN}>· {n} passos</Text>
          </View>
        </Animated.View>

        {/* Linha pontilhada que liga os números */}
        {linhaH > 0 && (
          <Animated.View style={{ position: 'absolute', left: 31, top: 314, zIndex: 3, opacity: m1Op }} pointerEvents="none">
            <Svg width={2} height={linhaH}>
              <Line x1={1} y1={0} x2={1} y2={linhaH} stroke="rgba(192,32,106,0.35)" strokeWidth={2} strokeDasharray="2 2" />
            </Svg>
          </Animated.View>
        )}
        {cards.map((_, i) => (
          <Animated.View key={`n${i}`} style={[st.num, i === 0 ? st.numOn : st.numOff, { top: 282 + i * 84, opacity: numOp[i] }]} pointerEvents="none">
            <Text style={st.numTxt}>{i + 1}</Text>
          </Animated.View>
        ))}

        {/* Cards dos passos */}
        {cards.map((c, i) => (
          <Animated.View
            key={`c${i}`}
            pointerEvents="none"
            style={[st.card, { top: 262 + i * 84, opacity: cardOp[i], transform: [{ translateY: cardY[i] }, { scale: cardS[i] }] }]}
          >
            <View style={[st.tile, { backgroundColor: c.tint }]} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={st.cat}>{c.cat}</Text>
              <Text style={st.nome} numberOfLines={1}>{c.name}</Text>
              {c.pline !== null && <Text style={st.pline} numberOfLines={1}>{c.pline}</Text>}
            </View>
          </Animated.View>
        ))}

        {/* Produtos: no quadradinho do card (momento 1) → juntos na moldura (momento 2) */}
        {cards.map((c, i) => (
          <Animated.View
            key={`b${i}`}
            pointerEvents="none"
            style={[st.garrafa, {
              zIndex: one ? 4 : CL[i].z,
              opacity: bOp[i],
              transform: [{ translateX: bx[i] }, { translateY: by[i] }, { scale: bs[i] },
                { rotate: br[i].interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) }],
            }]}
          >
            <View style={[st.sombra, { height: c.h }]}>
              <ExpoImage source={c.img} style={{ width: 50, height: c.h }} contentFit="contain" contentPosition="bottom" />
            </View>
          </Animated.View>
        ))}

        {/* Etiquetas do momento 2 */}
        <Animated.View style={[st.tag, { left: 74, top: 374, opacity: tagOp, transform: [{ translateY: tagY }] }]} pointerEvents="none">
          <TagCheck /><Text style={st.tagTxt}>Limpeza</Text>
        </Animated.View>
        <Animated.View style={[st.tag, { left: 226, top: 474, opacity: tagOp, transform: [{ translateY: tagY }] }]} pointerEvents="none">
          <TagCheck /><Text style={st.tagTxt}>Hidratação</Text>
        </Animated.View>

        {/* Pontinhos de progresso */}
        <Animated.View style={[st.dots, { top: dotsTop }]} pointerEvents="none">
          <Animated.View style={[st.dot, {
            width: d.interpolate({ inputRange: [0, 1], outputRange: [18, 6] }),
            backgroundColor: d.interpolate({ inputRange: [0, 1], outputRange: [PINK, '#E9B9CE'] }),
          }]} />
          <Animated.View style={[st.dot, {
            width: d.interpolate({ inputRange: [0, 1], outputRange: [6, 18] }),
            backgroundColor: d.interpolate({ inputRange: [0, 1], outputRange: ['#E9B9CE', PINK] }),
          }]} />
        </Animated.View>

        {/* Momento 1: Continuar */}
        <Animated.View style={[st.continuarWrap, { opacity: m1Op }]} pointerEvents={one ? 'auto' : 'none'}>
          <TouchableOpacity activeOpacity={0.85} onPress={continuar} style={st.continuar}>
            <Text style={st.btnTxt}>Continuar</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Momento 2: as três opções */}
        <Animated.View style={[st.acoes, { opacity: actOp, transform: [{ translateY: actY }] }]} pointerEvents={one ? 'none' : 'auto'}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => escolher('escanear')} style={st.escanear}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={st.btnTxt}>Escanear meus produtos</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => escolher('sem_produtos')} style={st.semProdutos}>
            <Text style={[st.btnTxt, { color: INK }]}>Não tenho produtos</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => escolher('depois')} style={st.depois}>
            <Text style={st.depoisTxt}>Fazer isso depois</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

function TagCheck() {
  return (
    <View style={st.tagCheck}>
      <Svg width={10} height={10} viewBox="0 0 24 24">
        <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#FFFFFF" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const st = StyleSheet.create({
  textos: { position: 'absolute', left: 24, right: 24, top: 84, alignItems: 'center', gap: 8, zIndex: 6 },
  titulo: { fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.8, color: INK, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: SOFT, textAlign: 'center' },

  plate: {
    position: 'absolute', left: 56, width: 281, top: 236, padding: 10, borderRadius: 40, zIndex: 2,
    shadowColor: '#C0206A', shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.14, shadowRadius: 25,
  },
  plateInner: { flex: 1, borderRadius: 30, overflow: 'hidden' },
  canto: { position: 'absolute', width: 34, height: 34, borderColor: PINK },
  scan: {
    position: 'absolute', left: 18, right: 18, top: 34, height: 3, borderRadius: 3, backgroundColor: PINK,
    shadowColor: PINK, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 11,
  },

  pillWrap: { position: 'absolute', left: 0, right: 0, top: 220, alignItems: 'center', zIndex: 7 },
  pill: {
    height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#FFFFFF',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 8,
  },
  pillTxt: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: INK },
  pillN: { fontSize: 14, fontWeight: '500', letterSpacing: -0.2, color: MUTED },

  num: {
    position: 'absolute', left: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', zIndex: 3,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#C0206A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 7,
  },
  numOn: { borderWidth: 2, borderColor: PINK },
  numOff: { borderWidth: 1.5, borderColor: '#F4C2D7' },
  numTxt: { fontSize: 15, fontWeight: '600', color: PINK_TEXT },

  card: {
    position: 'absolute', left: 58, width: 319, height: 72, paddingLeft: 10, paddingRight: 14, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16,
    shadowColor: '#781E46', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.13, shadowRadius: 14,
  },
  tile: { width: 52, height: 52, borderRadius: 12 },
  cat: { fontSize: 12, fontWeight: '500', color: MUTED },
  nome: { fontSize: 16, fontWeight: '600', lineHeight: 20, letterSpacing: -0.4, color: INK },
  pline: { fontSize: 13, lineHeight: 17, letterSpacing: -0.2, color: MUTED },

  garrafa: { position: 'absolute', left: 0, top: 0, width: 52, height: 52, transformOrigin: '50% 100%' },
  sombra: {
    position: 'absolute', left: 1, bottom: 5, width: 50,
    shadowColor: '#501E32', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 4,
  },

  tag: {
    position: 'absolute', height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 6, paddingRight: 11,
    borderRadius: 100, backgroundColor: '#FFFFFF', zIndex: 9,
    shadowColor: '#781E46', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 9,
  },
  tagCheck: { width: 18, height: 18, borderRadius: 9, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  tagTxt: { fontSize: 13, fontWeight: '600', letterSpacing: -0.15, color: INK },

  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6, zIndex: 6 },
  dot: { height: 6, borderRadius: 3 },

  continuarWrap: { position: 'absolute', left: (DW - 220) / 2, top: 756, width: 220, height: 50, zIndex: 8 },
  continuar: {
    flex: 1, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  btnTxt: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' },

  acoes: { position: 'absolute', left: 24, right: 24, top: 660, gap: 8, zIndex: 8 },
  escanear: {
    height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 100, backgroundColor: PINK,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  semProdutos: {
    height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 100, backgroundColor: '#FFFFFF',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  depois: { height: 44, alignItems: 'center', justifyContent: 'center' },
  depoisTxt: { fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: PINK_TEXT },
});
