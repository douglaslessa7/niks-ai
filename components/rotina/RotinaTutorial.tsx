// ─────────────────────────────────────────────────────────────────────────────
// Tutorial de primeiro acesso da aba Rotina — réplica do Claude Design
// (`NiksRoutineTutorial`, telas 54a/54b). Aparece UMA vez por conta
// (`users.rotina_intro_status` null); quem grava a escolha é a Rotina (`escolherIntro`).
//
//   · Momento 1 — "Últimos detalhes da sua rotina ideal": passos GENÉRICOS (iguais para
//     todas, com produtos genéricos sem marca) em cards; a
//     cada 3,2 s alternam sozinhos entre manhã e noite (como o 54a). "Continuar".
//   · Momento 2 — os cards saem e os produtos se juntam numa moldura de scan:
//     "Quer usar o que já tem em casa?" + Escanear meus produtos / Não tenho
//     produtos / Fazer isso depois.
//
// Geometria: tudo em coordenadas do quadro do design (393×852), num "palco" escalado
// por igual para caber na tela (min(W/393, H/852)) e centralizado — as posições ficam
// literalmente as do design. O fundo (degradê + véu) ocupa a tela inteira.
// Dados: fixos (16/nov/2026) — o tutorial não mostra a rotina nem os produtos dela.
// Nada é clicável além dos botões (o overlay engole o resto dos toques).
// Animação (18/nov/2026): tudo em shared values do Reanimated, na thread de UI — a troca
// manhã ↔ noite é uma sequência repetida (sem setInterval/setState), as duas listas ficam
// montadas e só trocam de opacidade, e o "Continuar" dispara o momento 2 de uma vez. Antes
// a troca dependia de relógios do JS e o card ficava vazio quando o JS estava ocupado.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Reanimated, {
  Easing, cancelAnimation, interpolateColor, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Circle, Defs, FeGaussianBlur, Filter, G, Line, Path, Rect } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { t } from '../../lib/i18n';
import type { Periodo } from '../../lib/minhaRotina';
import { ROTULO_TIPO, type TipoPasso } from '../../lib/tipoPasso';

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
// 16/nov/2026 (pedido do produto): hidratante, protetor e olhos viraram tubos GENÉRICOS, sem
// marca (desenhados em SVG e exportados em PNG) — antes eram fotos da La Roche-Posay.
const IMG_HIDRATANTE = require('../../assets/rotina-tutorial/hidratante_generico.png');
const IMG_PROTETOR = require('../../assets/rotina-tutorial/protetor_generico.png');
const IMG_OLHOS = require('../../assets/rotina-tutorial/olhos_generico.png');
const ILUSTRACAO: Record<TipoPasso, any> = {
  limpeza: IMG_BOMBA, tonico: IMG_SERUM, serum: IMG_SERUM, hidratante: IMG_HIDRATANTE, protetor: IMG_PROTETOR, olhos: IMG_OLHOS,
};
const ilustracao = (t: TipoPasso | null) => (t ? ILUSTRACAO[t] : IMG_SERUM);

// `pline` null = passo sem produto: o card mostra só a categoria e o nome do passo.
type Card = { cat: string; name: string; pline: string | null; tint: string; img: any; h: number };

// 16/nov/2026 (pedido do produto): os passos do tutorial são FIXOS e iguais para todas — só
// ilustram que agora ela vai montar a rotina (escolher os produtos). Nada da rotina dela aqui.
const PASSOS_GENERICOS: Record<Periodo, { tipo: TipoPasso; nome: string }[]> = {
  am: [
    { tipo: 'limpeza', nome: 'Gel de limpeza' },
    { tipo: 'serum', nome: 'Sérum' },
    { tipo: 'hidratante', nome: 'Hidratante' },
    { tipo: 'protetor', nome: 'Protetor solar' },
  ],
  pm: [
    { tipo: 'limpeza', nome: 'Gel de limpeza' },
    { tipo: 'serum', nome: 'Sérum de tratamento' },
    { tipo: 'olhos', nome: 'Creme para olhos' },
    { tipo: 'hidratante', nome: 'Hidratante' },
  ],
};

function cardsDe(per: Periodo): Card[] {
  return PASSOS_GENERICOS[per].map((p, i) => ({
    cat: t(ROTULO_TIPO[p.tipo]),
    name: t(p.nome),
    pline: null,
    tint: TINT[per][i],
    img: ilustracao(p.tipo),
    h: ALTURA[per][i],
  }));
}

const T = (to: number, duration: number, easing = EASE) => withTiming(to, { duration, easing });
const D = (delay: number, a: number) => withDelay(delay, a);
const JA = (to: number) => withTiming(to, { duration: 0 });

// Troca manhã ↔ noite do momento 1 (o design faz a cada 3,2 s): tudo na thread de UI.
// As DUAS listas ficam montadas, uma por cima da outra (`camada`); entre elas, os cards
// esmaecem (300 ms, cascata de 40 ms), a camada troca escondida (460 ms) e voltam (520 ms).
const CICLO = 3200;
const visCiclo = () => withRepeat(withSequence(T(0, 300), D(220, T(1, 300)), D(CICLO - 820, JA(1))), -1);

type SV = SharedValue<number>;
type Valores = {
  per: SV; vis: SV; cardOp: SV[]; cardVis: SV[]; cardY: SV[]; cardS: SV[]; numOp: SV[];
  bx: SV[]; by: SV[]; bs: SV[]; br: SV[]; bOp: SV[];
};

type Props = { onEscolha: (e: EscolhaIntro) => void };

export default function RotinaTutorial({ onEscolha }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const s = Math.min(W / DW, H / DH);
  const palcoBase = { position: 'absolute' as const, left: (W - DW) / 2, top: (H - DH) / 2, width: DW, height: DH };
  const palco = { ...palcoBase, transform: [{ scale: s }] };

  // Só muda UMA vez (Continuar): o resto da animação não passa pelo React.
  const [m, setM] = useState<1 | 2>(1);
  const one = m === 1;
  const cardsAm = useMemo(() => cardsDe('am'), []);
  const cardsPm = useMemo(() => cardsDe('pm'), []);
  const n = cardsAm.length;
  const idx = useMemo(() => cardsAm.map((_, i) => i), [cardsAm]);

  // ── Valores animados (thread de UI) ─────────────────────────────────────────
  const entrada = useSharedValue(0);
  const t1Op = useSharedValue(0), t1Y = useSharedValue(10);
  const t2Op = useSharedValue(0), t2Y = useSharedValue(8);
  const plateH = useSharedValue(474);
  const m2Op = useSharedValue(0), m1Op = useSharedValue(1);
  const pillOp = useSharedValue(0);
  const per = useSharedValue(0);      // camada visível: 0 = manhã · 1 = noite (troca escondida)
  const bgPer = useSharedValue(0);    // fundo e moldura (.6 s)
  const vis = useSharedValue(1);      // selo e produtos na troca
  const tagOp = useSharedValue(0), tagY = useSharedValue(6);
  const dotsTop = useSharedValue(736);
  const d = useSharedValue(0);        // 0 = momento 1 · 1 = momento 2
  const actOp = useSharedValue(0), actY = useSharedValue(14);
  const scan = useSharedValue(0);
  // Por posição (até 5, como o design).
  const cardOp = [useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const cardVis = [useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1)];
  const cardY = [useSharedValue(16), useSharedValue(16), useSharedValue(16), useSharedValue(16), useSharedValue(16)];
  const cardS = [useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1)];
  const numOp = [useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const bx = [useSharedValue(68), useSharedValue(68), useSharedValue(68), useSharedValue(68), useSharedValue(68)];
  const by = [useSharedValue(272), useSharedValue(356), useSharedValue(440), useSharedValue(524), useSharedValue(608)];
  const bs = [useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1), useSharedValue(1)];
  const br = [useSharedValue(GIRO[0]), useSharedValue(GIRO[1]), useSharedValue(GIRO[2]), useSharedValue(GIRO[3]), useSharedValue(GIRO[4])];
  const bOp = [useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const v: Valores = { per, vis, cardOp, cardVis, cardY, cardS, numOp, bx, by, bs, br, bOp };

  // Entrada (16/nov/2026, pedido do produto): o fundo nasce sólido e o conteúdo sobe em
  // cascata (título → selo → passos). Depois, a troca manhã ↔ noite começa sozinha.
  useEffect(() => {
    entrada.set(T(1, 380, EASE_OUT));
    t1Op.set(D(90, T(1, 420))); t1Y.set(D(90, T(0, 560, EASE_OUT)));
    pillOp.set(D(180, T(1, 380)));
    for (let i = 0; i < 5; i++) {
      const dl = 230 + i * 70;
      cardOp[i].set(D(dl, T(1, 380))); cardY[i].set(D(dl, T(0, 600, EASE_OUT)));
      bOp[i].set(D(dl, T(1, 380))); numOp[i].set(D(dl, T(1, 380)));
      cardVis[i].set(D(CICLO + i * 40, visCiclo()));
    }
    vis.set(D(CICLO, visCiclo()));
    per.set(D(CICLO + 460, withRepeat(withSequence(JA(1), D(CICLO, JA(0)), D(CICLO, JA(0))), -1)));
    bgPer.set(D(CICLO + 460, withRepeat(withSequence(T(1, 600), D(CICLO - 600, T(0, 600)), D(CICLO - 600, JA(0))), -1)));
    scan.set(withRepeat(withTiming(300, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => { [entrada, per, bgPer, vis, scan, ...cardVis].forEach((x) => cancelAnimation(x)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Momento 1 → 2: um disparo só; tudo roda na thread de UI.
  const continuar = () => {
    if (!one) return;
    haptics.tap();
    [vis, per, ...cardVis].forEach((x) => cancelAnimation(x));
    cancelAnimation(bgPer);
    bgPer.set(T(per.get(), 300));
    vis.set(T(1, 200));
    cardVis.forEach((x) => x.set(T(1, 200)));
    t1Op.set(T(0, 350)); t1Y.set(T(-8, 500, EASE_OUT));
    t2Op.set(D(150, T(1, 400))); t2Y.set(D(150, T(0, 550, EASE_OUT)));
    plateH.set(T(386, 700, EASE_OUT));
    m2Op.set(D(350, T(1, 400)));
    pillOp.set(T(0, 300)); m1Op.set(T(0, 300));
    for (let i = 0; i < 5; i++) {
      const c = CL[i];
      numOp[i].set(D(i * 30, T(0, 300)));
      cardOp[i].set(D(i * 40, T(0, 300)));
      cardY[i].set(D(i * 40, T(14, 450, EASE_OUT)));
      cardS[i].set(D(i * 40, T(0.96, 450, EASE_OUT)));
      const dl = i * 50;
      bx[i].set(D(dl, T(c.cx - 26, 800, EASE_OUT)));
      by[i].set(D(dl, T(c.base - 52, 800, EASE_OUT)));
      bs[i].set(D(dl, T(c.s, 800, EASE_OUT)));
      br[i].set(D(dl, T(c.r, 800, EASE_OUT)));
      bOp[i].set(T(1, 300));
    }
    tagOp.set(D(750, T(1, 350))); tagY.set(D(750, T(0, 450, EASE_OUT)));
    dotsTop.set(T(640, 700, EASE_OUT));
    d.set(T(1, 300));
    actOp.set(D(450, T(1, 350))); actY.set(D(450, T(0, 500, EASE_OUT)));
    setM(2);
  };
  const escolher = (e: EscolhaIntro) => { haptics.select(); onEscolha(e); };

  // ── Estilos animados ─────────────────────────────────────────────────────────
  const conteudoSt = useAnimatedStyle(() => ({
    opacity: entrada.get(), transform: [{ translateY: (1 - entrada.get()) * 18 }, { scale: s }],
  }));
  const bgPmSt = useAnimatedStyle(() => ({ opacity: bgPer.get() }));
  const t1St = useAnimatedStyle(() => ({ opacity: t1Op.get(), transform: [{ translateY: t1Y.get() }] }));
  const t2St = useAnimatedStyle(() => ({ opacity: t2Op.get(), transform: [{ translateY: t2Y.get() }] }));
  const plateSt = useAnimatedStyle(() => ({
    height: plateH.get(), backgroundColor: interpolateColor(bgPer.get(), [0, 1], ['#FFD0E3', '#EBD3F0']),
  }));
  const m2St = useAnimatedStyle(() => ({ opacity: m2Op.get() }));
  const m1St = useAnimatedStyle(() => ({ opacity: m1Op.get() }));
  const scanSt = useAnimatedStyle(() => ({ transform: [{ translateY: scan.get() }] }));
  const pillAmSt = useAnimatedStyle(() => ({ opacity: pillOp.get() * vis.get() * (1 - per.get()) }));
  const pillPmSt = useAnimatedStyle(() => ({ opacity: pillOp.get() * vis.get() * per.get() }));
  const tagSt = useAnimatedStyle(() => ({ opacity: tagOp.get(), transform: [{ translateY: tagY.get() }] }));
  const dotsSt = useAnimatedStyle(() => ({ top: dotsTop.get() }));
  const dot1St = useAnimatedStyle(() => ({
    width: 18 - 12 * d.get(), backgroundColor: interpolateColor(d.get(), [0, 1], [PINK, '#E9B9CE']),
  }));
  const dot2St = useAnimatedStyle(() => ({
    width: 6 + 12 * d.get(), backgroundColor: interpolateColor(d.get(), [0, 1], ['#E9B9CE', PINK]),
  }));
  const actSt = useAnimatedStyle(() => ({ opacity: actOp.get(), transform: [{ translateY: actY.get() }] }));

  const linhaH = (n - 1) * 84 - 32;

  return (
    // O fundo nasce SÓLIDO (nada da Rotina aparece por trás); só o conteúdo entra animado.
    <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} accessibilityViewIsModal>
      <StatusBar style="dark" />
      {/* Fundo da tela inteira: degradê do período (troca em .6s) */}
      <LinearGradient colors={BG.am as any} locations={BG_STOPS as any} style={StyleSheet.absoluteFill} />
      <Reanimated.View style={[StyleSheet.absoluteFill, bgPmSt]} pointerEvents="none">
        <LinearGradient colors={BG.pm as any} locations={BG_STOPS as any} style={StyleSheet.absoluteFill} />
      </Reanimated.View>

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

      <Reanimated.View style={[palcoBase, conteudoSt]} pointerEvents="box-none">
        {/* Textos dos dois momentos */}
        <Reanimated.View style={[st.textos, t1St]} pointerEvents="none">
          <Text style={st.titulo}>{t('Últimos detalhes da\nsua rotina ideal')}</Text>
          <Text style={st.sub}>{t('Falta só escolher os produtos de cada passo, de manhã e de noite.')}</Text>
        </Reanimated.View>
        <Reanimated.View style={[st.textos, t2St]} pointerEvents="none">
          <Text style={st.titulo}>{t('Quer usar o que\njá tem em casa?')}</Text>
          <Text style={st.sub}>{t('Escaneie seus produtos e eu encaixo cada um no passo certo da sua rotina.')}</Text>
        </Reanimated.View>

        {/* Moldura (no momento 2 vira a moldura de scan) */}
        <Reanimated.View style={[st.plate, plateSt]} pointerEvents="none">
          <View style={st.plateInner}>
            <LinearGradient colors={['#FFF6FA', '#FDEAF2', '#FBF0F5']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
            <Reanimated.View style={[StyleSheet.absoluteFill, m2St]}>
              <View style={[st.canto, { left: 16, top: 16, borderLeftWidth: 3.5, borderTopWidth: 3.5, borderTopLeftRadius: 14 }]} />
              <View style={[st.canto, { right: 16, top: 16, borderRightWidth: 3.5, borderTopWidth: 3.5, borderTopRightRadius: 14 }]} />
              <View style={[st.canto, { left: 16, bottom: 16, borderLeftWidth: 3.5, borderBottomWidth: 3.5, borderBottomLeftRadius: 14 }]} />
              <View style={[st.canto, { right: 16, bottom: 16, borderRightWidth: 3.5, borderBottomWidth: 3.5, borderBottomRightRadius: 14 }]} />
              <Reanimated.View style={[st.scan, scanSt]} />
            </Reanimated.View>
          </View>
        </Reanimated.View>

        {/* Selo do período (as duas camadas; a troca é só opacidade) */}
        <Reanimated.View style={[st.pillWrap, pillAmSt]} pointerEvents="none"><Selo am n={n} /></Reanimated.View>
        <Reanimated.View style={[st.pillWrap, pillPmSt]} pointerEvents="none"><Selo am={false} n={n} /></Reanimated.View>

        {/* Linha pontilhada que liga os números */}
        {linhaH > 0 && (
          <Reanimated.View style={[{ position: 'absolute', left: 31, top: 314, zIndex: 3 }, m1St]} pointerEvents="none">
            <Svg width={2} height={linhaH}>
              <Line x1={1} y1={0} x2={1} y2={linhaH} stroke="rgba(192,32,106,0.35)" strokeWidth={2} strokeDasharray="2 2" />
            </Svg>
          </Reanimated.View>
        )}
        {idx.map((i) => <Numero key={`n${i}`} i={i} op={numOp[i]} />)}

        {/* Cards dos passos: manhã e noite montados, um por cima do outro */}
        {cardsAm.map((c, i) => <CardPasso key={`ca${i}`} c={c} i={i} camada={0} v={v} />)}
        {cardsPm.map((c, i) => <CardPasso key={`cp${i}`} c={c} i={i} camada={1} v={v} />)}

        {/* Produtos: no quadradinho do card (momento 1) → juntos na moldura (momento 2) */}
        {cardsAm.map((c, i) => <Garrafa key={`ba${i}`} c={c} i={i} camada={0} v={v} z={one ? 4 : CL[i].z} />)}
        {cardsPm.map((c, i) => <Garrafa key={`bp${i}`} c={c} i={i} camada={1} v={v} z={one ? 4 : CL[i].z} />)}

        {/* Etiquetas do momento 2 */}
        <Reanimated.View style={[st.tag, { left: 74, top: 374 }, tagSt]} pointerEvents="none">
          <TagCheck /><Text style={st.tagTxt}>{t('Limpeza')}</Text>
        </Reanimated.View>
        <Reanimated.View style={[st.tag, { left: 226, top: 474 }, tagSt]} pointerEvents="none">
          <TagCheck /><Text style={st.tagTxt}>{t('Hidratação')}</Text>
        </Reanimated.View>

        {/* Pontinhos de progresso */}
        <Reanimated.View style={[st.dots, dotsSt]} pointerEvents="none">
          <Reanimated.View style={[st.dot, dot1St]} />
          <Reanimated.View style={[st.dot, dot2St]} />
        </Reanimated.View>

        {/* Momento 1: Continuar */}
        <Reanimated.View style={[st.continuarWrap, m1St]} pointerEvents={one ? 'auto' : 'none'}>
          <TouchableOpacity activeOpacity={0.85} onPress={continuar} style={st.continuar}>
            <Text style={st.btnTxt}>{t('Continuar')}</Text>
          </TouchableOpacity>
        </Reanimated.View>

        {/* Momento 2: as três opções */}
        <Reanimated.View style={[st.acoes, actSt]} pointerEvents={one ? 'none' : 'auto'}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => escolher('escanear')} style={st.escanear}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={st.btnTxt}>{t('Escanear meus produtos')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => escolher('sem_produtos')} style={st.semProdutos}>
            <Text style={[st.btnTxt, { color: INK }]}>{t('Não tenho produtos')}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => escolher('depois')} style={st.depois}>
            <Text style={st.depoisTxt}>{t('Fazer isso depois')}</Text>
          </TouchableOpacity>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

function Selo({ am, n }: { am: boolean; n: number }) {
  return (
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
      <Text style={st.pillTxt}>{am ? t('Manhã') : t('Noite')}</Text>
      <Text style={st.pillN}>{t('· {{n}} passos', { n })}</Text>
    </View>
  );
}

function Numero({ i, op }: { i: number; op: SV }) {
  const sty = useAnimatedStyle(() => ({ opacity: op.get() }));
  return (
    <Reanimated.View style={[st.num, i === 0 ? st.numOn : st.numOff, { top: 282 + i * 84 }, sty]} pointerEvents="none">
      <Text style={st.numTxt}>{i + 1}</Text>
    </Reanimated.View>
  );
}

function CardPasso({ c, i, camada, v }: { c: Card; i: number; camada: 0 | 1; v: Valores }) {
  const sty = useAnimatedStyle(() => {
    const cam = camada === 1 ? v.per.get() : 1 - v.per.get();
    const vis = v.cardVis[i].get();
    return {
      opacity: v.cardOp[i].get() * vis * cam,
      transform: [{ translateY: v.cardY[i].get() + (1 - vis) * 6 }, { scale: v.cardS[i].get() }],
    };
  });
  return (
    <Reanimated.View pointerEvents="none" style={[st.card, { top: 262 + i * 84 }, sty]}>
      <View style={[st.tile, { backgroundColor: c.tint }]} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={st.cat}>{c.cat}</Text>
        <Text style={st.nome} numberOfLines={1}>{c.name}</Text>
        {c.pline !== null && <Text style={st.pline} numberOfLines={1}>{c.pline}</Text>}
      </View>
    </Reanimated.View>
  );
}

function Garrafa({ c, i, camada, v, z }: { c: Card; i: number; camada: 0 | 1; v: Valores; z: number }) {
  const sty = useAnimatedStyle(() => {
    const cam = camada === 1 ? v.per.get() : 1 - v.per.get();
    return {
      opacity: v.bOp[i].get() * v.vis.get() * cam,
      transform: [{ translateX: v.bx[i].get() }, { translateY: v.by[i].get() }, { scale: v.bs[i].get() }, { rotate: `${v.br[i].get()}deg` }],
    };
  });
  return (
    <Reanimated.View pointerEvents="none" style={[st.garrafa, { zIndex: z }, sty]}>
      <View style={[st.sombra, { height: c.h }]}>
        <ExpoImage source={c.img} style={{ width: 50, height: c.h }} contentFit="contain" contentPosition="bottom" />
      </View>
    </Reanimated.View>
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
