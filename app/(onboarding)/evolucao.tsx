import { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient as SvgGradient, Line, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import BalancedText from '../../components/BalancedText';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObPillButton, OB_BOTAO_H, useObFrame, useObName, obStep, useOnMount,
} from '../../components/onboarding/kit';
import { objetivoPele } from '../../components/onboarding/answers';

// Onboarding — "Sua evolução" (03/nov/2026, pedido do produto: a tela do gráfico do
// Tapfit adaptada à identidade do NIKS). Vem depois do objetivo e antes da idade.
// "<nome>," (leve) / a frase do objetivo (em destaque), "Com uma rotina feita só para
// você.", o gráfico (eixo "Hoje" → "Sua meta", vertical "Evolução") com a linha rosa
// "Com NIKS" subindo até a flor do NIKS e a tracejada "Sem rotina" que sobe um pouco e
// cai, a legenda, "Comparação ilustrativa." e "Quero começar" → idade.
// Sem números, datas nem promessa de resultado: o gráfico é ilustrativo.
//
// Animação (UI thread, Reanimated) com os tempos MEDIDOS no gráfico do Tapfit (30 quadros
// com o tempo marcado, 03/nov/2026) — a tela inteira dura ~1,3 s:
//   0,06–0,38 s  título e subtítulo sobem 10 pt enquanto aparecem
//   0,32–0,56 s  eixos, grade, rótulos, "Comparação ilustrativa." e o anel inicial
//   0,38–0,94 s  linhas + preenchimento revelados por UMA máscara de borda vertical (sem
//                fade): uma janela que desliza, só transform. Curva ajustada à borda medida
//                quadro a quadro: começa devagar, acelera e freia (erro < 0,02)
//   0,85–1,04 s  a flor surge pequena (35%) quando a linha chega nela, passa do tamanho
//                (108%) e volta, com o halo; vibração curta no mesmo quadro
//   1,04–1,36 s  legenda e o anel do fim da tracejada
// "Reduzir movimento": tudo pronto, sem vibração.
const STEP = OB_STEPS.evolucao;
const STEP_NAME = 'Sua evolução';

// Frase da pele escolhida: "sua pele de vidro começa aqui." (`objetivoPele` em
// `answers.ts`). ⚠️ Sem objetivo reconhecido: frase neutra, fora da lista do produto.
const FRASE_NEUTRA = 'sua nova rotina começa aqui.';
function fraseDoObjetivo(goal: string | null | undefined) {
  const o = objetivoPele(goal);
  return o ? `sua ${o.pele} começa aqui.` : FRASE_NEUTRA;
}

// Curvas ilustrativas: x de 0 a 1 (Hoje → Sua meta), y de 0 (base) a 1 (topo).
// Traçadas do quadro final do Tapfit, com as mesmas pequenas ondulações: a "Com NIKS"
// sempre sobe; a "Sem rotina" acompanha (e passa por cima) no começo, depois cai.
const COM_NIKS: [number, number][] = [
  [0, 0.172], [0.06, 0.26], [0.119, 0.318], [0.179, 0.352], [0.239, 0.41], [0.299, 0.46],
  [0.358, 0.492], [0.418, 0.552], [0.478, 0.604], [0.537, 0.636], [0.597, 0.688],
  [0.657, 0.738], [0.716, 0.772], [0.776, 0.812], [0.836, 0.852], [0.896, 0.888],
  [0.955, 0.925], [1, 0.952],
];
const SEM_ROTINA: [number, number][] = [
  [0, 0.172], [0.06, 0.257], [0.119, 0.344], [0.179, 0.398], [0.239, 0.436], [0.299, 0.439],
  [0.358, 0.434], [0.418, 0.444], [0.478, 0.444], [0.537, 0.405], [0.597, 0.38],
  [0.657, 0.372], [0.716, 0.383], [0.776, 0.364], [0.836, 0.33], [0.896, 0.318],
  [0.955, 0.296], [1, 0.272],
];

const EASE_OUT = Easing.out(Easing.quad);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const REVELA = Easing.bezier(0.5, 0.25, 0.5, 0.75);
// Linha do tempo (ms desde a tela pronta) — ver o cabeçalho.
const T = {
  titulo: [60, 320], sub: [90, 260], eixos: [320, 240], revela: [380, 560],
  flor: 850, legenda: [1040, 320],
} as const;

const CINZA = '#5F585B';        // tracejada "Sem rotina" e o anel do fim dela
const GRADE = '#D6CED1';
const BASE = '#C9C1C4';
const PAD_ESQ = 26;   // espaço do rótulo vertical "EVOLUÇÃO"
const PAD_TOPO = 30;  // espaço para a flor acima do fim da linha
const PAD_BASE = 4;
const FLOR = 36;      // círculo rosa da flor
const HALO = 54;      // halo em volta dele
const LOGO_BRANCO = require('../../assets/onboarding/niks-logo-branco-v3.png');

/** Catmull-Rom → cúbicas: curva suave passando pelos pontos. */
function caminho(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export default function Evolucao() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y, buttonBottom } = useObFrame();
  const name = useObName();
  const goal = useAppStore((s) => s.onboarding.goal_desire);
  const reduce = useReducedMotion();
  const [area, setArea] = useState({ w: 0, h: 0 });
  // t = 0 é quando a tela COMEÇA a aparecer (início do deslize do iOS), não a montagem:
  // a montagem vem ~0,2 s antes, e a tela surgiria com o título pronto e a linha andando.
  // Rede de segurança: sem o evento (ex.: tela aberta sem transição), começa em 600 ms.
  const navigation = useNavigation();
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisivel(true), 600);
    const sai = navigation.addListener('transitionStart' as never, () => {
      clearTimeout(t);
      setVisivel(true);
    });
    return () => { clearTimeout(t); sai(); };
  }, [navigation]);

  const titulo = useSharedValue(reduce ? 1 : 0);
  const sub = useSharedValue(reduce ? 1 : 0);
  const eixos = useSharedValue(reduce ? 1 : 0);
  const desenho = useSharedValue(reduce ? 1 : 0);
  const florEscala = useSharedValue(reduce ? 1 : 0);
  const florVisivel = useSharedValue(reduce ? 1 : 0);
  const halo = useSharedValue(reduce ? 1 : 0);
  const legenda = useSharedValue(reduce ? 1 : 0);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));

  const vibrar = () => haptics.tap();

  useEffect(() => {
    if (reduce || area.w === 0 || !visivel) return;
    const entra = ([atraso, ms]: readonly [number, number]) =>
      withDelay(atraso, withTiming(1, { duration: ms, easing: EASE_OUT }));
    titulo.set(entra(T.titulo));
    sub.set(entra(T.sub));
    eixos.set(entra(T.eixos));
    desenho.set(withDelay(T.revela[0], withTiming(1, { duration: T.revela[1], easing: REVELA })));
    // A flor nasce quando a linha chega nela: 35% → 108% → 100%, e a vibração sai no
    // mesmo quadro (o callback de uma espera de 0 ms dispara exatamente em T.flor).
    florVisivel.set(withDelay(T.flor, withTiming(1, { duration: 60 }, (ok) => {
      'worklet';
      if (ok) scheduleOnRN(vibrar);
    })));
    florEscala.set(withDelay(T.flor, withSequence(
      withTiming(0.35, { duration: 0 }),
      withTiming(1.08, { duration: 110, easing: EASE_OUT }),
      withTiming(1, { duration: 80, easing: EASE_IN_OUT }),
    )));
    halo.set(withDelay(T.flor + 30, withTiming(1, { duration: 150, easing: EASE_OUT })));
    legenda.set(entra(T.legenda));
  }, [reduce, area.w, visivel]);

  const sobe = (v: { get(): number }) => {
    'worklet';
    return { opacity: v.get(), transform: [{ translateY: (1 - v.get()) * 10 }] };
  };
  const tituloStyle = useAnimatedStyle(() => sobe(titulo));
  const subStyle = useAnimatedStyle(() => sobe(sub));
  const eixosStyle = useAnimatedStyle(() => ({ opacity: eixos.get() }));

  // Geometria do gráfico (pt), a partir da área medida.
  const plotW = area.w - PAD_ESQ;
  const plotH = area.h - PAD_TOPO - PAD_BASE;
  const px = (t: number) => PAD_ESQ + 10 + t * (plotW - 10 - HALO / 2);
  const py = (v: number) => PAD_TOPO + (1 - v) * plotH;
  const pts = (l: [number, number][]) => l.map(([t, v]) => [px(t), py(v)] as [number, number]);
  const com = pts(COM_NIKS);
  const sem = pts(SEM_ROTINA);
  const fimCom = com[com.length - 1];
  const fimSem = sem[sem.length - 1];
  const base = PAD_TOPO + plotH;
  const dCom = area.w ? caminho(com) : '';
  const dSem = area.w ? caminho(sem) : '';
  const dFill = area.w ? `${dCom} L${fimCom[0]},${base} L${com[0][0]},${base} Z` : '';

  // Máscara de borda vertical: o recorte anda para a direita e o conteúdo volta o mesmo
  // tanto, então o gráfico fica parado. A curva de tempo vale para o trecho VISÍVEL — do
  // centro do anel inicial até a borda do círculo da flor, como foi medido no Tapfit.
  // Antes de começar, a borda fica 9 pt antes do anel (a ponta arredondada e o halo da
  // linha não aparecem antes da hora); no fim, o resto (embaixo da flor) abre de uma vez.
  const xIni = com[0][0];
  const xFim = fimCom[0] - FLOR / 2 - 2.5;
  const borda = (p: number) => {
    'worklet';
    return p <= 0 ? xIni - 9 : xIni + p * (xFim - xIni);
  };
  const janelaStyle = useAnimatedStyle(() => {
    const p = desenho.get();
    return { transform: [{ translateX: p >= 1 ? 0 : borda(p) - area.w }] };
  });
  const conteudoStyle = useAnimatedStyle(() => {
    const p = desenho.get();
    return { transform: [{ translateX: p >= 1 ? 0 : area.w - borda(p) }] };
  });
  const florStyle = useAnimatedStyle(() => ({ opacity: florVisivel.get(), transform: [{ scale: florEscala.get() }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.25 * halo.get() }));
  const legendaStyle = useAnimatedStyle(() => ({ opacity: legenda.get() }));

  // 07/nov/2026 (pedido do produto): título "<nome>, o espelho vai mudar." e, no subtítulo, a
  // frase da pele escolhida ("Sua pele radiante começa aqui."), que antes era o título.
  const destaque = name ? 'o espelho vai mudar.' : 'O espelho vai mudar.';
  const frase = fraseDoObjetivo(goal);
  const subtitulo = frase.charAt(0).toUpperCase() + frase.slice(1);

  const handleContinue = () => {
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/birthday');
  };

  const rotulo = { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.6, color: OB.sub } as const;

  return (
    <ObScreen>
      <ObHeader onBack={() => router.back()} />
      <Text style={{ position: 'absolute', left: 0, right: 0, top: y(74), textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub }}>
        SUA EVOLUÇÃO
      </Text>

      <View style={{ flex: 1, paddingTop: y(136), paddingHorizontal: 24, paddingBottom: buttonBottom + OB_BOTAO_H + 24 }}>
        <Animated.View style={tituloStyle}>
          {name ? (
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 32, lineHeight: 38, fontWeight: '400', letterSpacing: -0.5, color: OB.body }}>
              {`${name},`}
            </Text>
          ) : null}
          {/* Em 2 linhas, quebra perto do meio ("sua confiança / começa aqui."), sem palavra sozinha. */}
          <BalancedText text={destaque} style={{ fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6, color: OB.ink }} />
        </Animated.View>
        <Animated.Text style={[{ marginTop: 10, fontSize: 17, lineHeight: 23, color: OB.sub }, subStyle]}>
          {subtitulo}
        </Animated.Text>

        <Animated.View style={[{ marginTop: 26, flexDirection: 'row', justifyContent: 'space-between' }, eixosStyle]}>
          <Text style={rotulo}>HOJE</Text>
          <Text style={rotulo}>SUA META</Text>
        </Animated.View>

        {/* O gráfico ocupa o espaço que sobra (encolhe em tela baixa). */}
        <View
          style={{ flex: 1, minHeight: 150, maxHeight: 370, marginTop: 6 }}
          onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {area.w > 0 && (
            <>
              {/* Eixos: duas linhas de grade pontilhadas, a base e o rótulo vertical */}
              <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: area.w, height: area.h }, eixosStyle]}>
                <Svg width={area.w} height={area.h}>
                  <Line x1={PAD_ESQ} x2={area.w} y1={py(0.78)} y2={py(0.78)} stroke={GRADE} strokeWidth={1.2} strokeDasharray="1.5 5" strokeLinecap="round" />
                  <Line x1={PAD_ESQ} x2={area.w} y1={py(0.39)} y2={py(0.39)} stroke={GRADE} strokeWidth={1.2} strokeDasharray="1.5 5" strokeLinecap="round" />
                  <Line x1={0} x2={area.w} y1={base} y2={base} stroke={BASE} strokeWidth={1} />
                </Svg>
                <Text style={[rotulo, {
                  position: 'absolute', left: -28, top: py(0.5) - 7, width: 80, textAlign: 'center',
                  transform: [{ rotate: '-90deg' }],
                }]}>EVOLUÇÃO</Text>
              </Animated.View>

              {/* Linhas + preenchimento, revelados juntos pela máscara */}
              <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: area.w, height: area.h, overflow: 'hidden' }, janelaStyle]}>
                <Animated.View style={conteudoStyle}>
                  <Svg width={area.w} height={area.h}>
                    <Defs>
                      <SvgGradient id="preenche" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={OB.pink} stopOpacity={0.3} />
                        <Stop offset="1" stopColor={OB.pink} stopOpacity={0} />
                      </SvgGradient>
                    </Defs>
                    <Path d={dFill} fill="url(#preenche)" />
                    <Path d={dSem} fill="none" stroke={CINZA} strokeWidth={2.5} strokeDasharray="6 6" strokeLinecap="round" />
                    <Path d={dCom} fill="none" stroke={OB.pink} strokeOpacity={0.22} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
                    <Path d={dCom} fill="none" stroke={OB.pink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Animated.View>
              </Animated.View>

              {/* Anel do ponto inicial (entra com os eixos) */}
              <Animated.View style={[{
                position: 'absolute', left: com[0][0] - 9, top: com[0][1] - 9, width: 18, height: 18, borderRadius: 9,
                backgroundColor: '#FFFFFF', borderWidth: 3.5, borderColor: OB.ink,
              }, eixosStyle]} />

              {/* Anel do fim da tracejada (entra com a legenda) */}
              <Animated.View style={[{
                position: 'absolute', left: fimSem[0] - 7, top: fimSem[1] - 7, width: 14, height: 14, borderRadius: 7,
                backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: CINZA,
              }, legendaStyle]} />

              {/* A flor do NIKS no fim da linha rosa: círculo rosa, flor branca e halo */}
              <Animated.View style={[{
                position: 'absolute', left: fimCom[0] - HALO / 2, top: fimCom[1] - HALO / 2, width: HALO, height: HALO,
                alignItems: 'center', justifyContent: 'center',
              }, florStyle]}>
                <Animated.View style={[{
                  position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, backgroundColor: OB.pink,
                }, haloStyle]} />
                <View style={{
                  width: FLOR + 5, height: FLOR + 5, borderRadius: (FLOR + 5) / 2, backgroundColor: '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <View style={{
                    width: FLOR, height: FLOR, borderRadius: FLOR / 2, backgroundColor: OB.pink,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Image source={LOGO_BRANCO} style={{ width: 24, height: 24 }} />
                  </View>
                </View>
              </Animated.View>
            </>
          )}
        </View>

        <Animated.View style={[{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, legendaStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 22, height: 5, borderRadius: 2.5, backgroundColor: OB.pink }} />
            <Text style={[rotulo, { color: OB.ink }]}>COM NIKS</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Svg width={22} height={4}><Line x1={1} x2={21} y1={2} y2={2} stroke={CINZA} strokeWidth={2.5} strokeDasharray="5 5" strokeLinecap="round" /></Svg>
            <Text style={[rotulo, { color: CINZA }]}>SEM ROTINA</Text>
          </View>
        </Animated.View>
        {/* Como no Tapfit, a nota entra com os eixos, antes das linhas. */}
        <Animated.Text style={[{ marginTop: 12, textAlign: 'center', fontSize: 13, lineHeight: 17, color: '#B5AEB1' }, eixosStyle]}>
          Comparação ilustrativa.
        </Animated.Text>
      </View>

      <ObPillButton label="Quero começar" width={220} onPress={handleContinue} bottom={buttonBottom} />
    </ObScreen>
  );
}
