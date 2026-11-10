import { useEffect, useState } from 'react';
import { BackHandler, Image, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ListChecks, ScanFace, ShoppingBag } from 'lucide-react-native';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import BalancedText from '../../components/BalancedText';
import { OB, ObPillButton, ObScreen, useObFrame } from '../../components/onboarding/kit';
import { caminhoDaCarta, cartaDoOnboarding } from '../../lib/cartaOnboarding';
import { useObPassoVisto } from '../../components/onboarding/passo';
import { OB_STEPS } from '../../components/onboarding/kit';

// Onboarding — "Seu caminho" (04/nov/2026): depois da carta revelada ("Quero resolver
// isso") e da "Calma, <nome>.", antes do resultado do scan. Réplica da trilha do Tapfit ("Como funciona")
// na identidade do NIKS: "SEU CAMINHO" · título em 2 linhas (a 1ª leve, a 2ª em destaque) ·
// "Montamos cada passo." · trilha sinuosa com 3 pontos (ícone em círculo + texto, alternando
// de lado) terminando na flor do NIKS com halo · "Meta estimada…" · "Quero chegar lá".
// O texto vem da MESMA carta que ela viu (`lib/cartaOnboarding.ts`): nunca um número fixo.
//
// Animação: partiu da MEDIDA no vídeo de 60 fps do Tapfit (04/nov/2026) e, a pedido do
// produto no mesmo dia, ficou ~40% mais devagar e mais fluida. t = 0 no início da transição
// (a tela entra esmaecendo — `animation: 'fade'` no `(scan)/_layout`):
//    162–350 ms  título (esmaece e sobe 8 pt)        256–372 ms  subtítulo
//    396–774 ms  1º ponto e o texto (esmaecem e sobem 6 pt)
//    496–1056 ms a linha desce do 1º ponto até a flor (máscara de borda horizontal, só
//                transform). Curva `bezier(0.5, 0.25, 0.55, 1)`: sai mais suave que a do
//                Tapfit e pousa sem tranco (velocidade zero no fim).
//    671 ms      2º ponto + texto: esmaecem (140 ms) e crescem do centro do ícone,
//                0,5 → 1,05 → 1 (220 ms ease-out cúbico + 180 ms assentando)
//    804 ms      3º ponto + texto, idem — quando a linha chega nele. ⚠️ No Tapfit o 3º ponto
//                só surge depois do troféu; aqui segue o pedido do produto.
//    966 ms      flor: 0,55 → 1,08 → 1, halo e vibração leve no mesmo quadro
//    1430 ms     DESTAQUE da semana 3: uma piscada rápida (onda rosa saindo da flor, halo e
//                flor crescem e voltam, ~380 ms) e a flor FICA em destaque — halo maior e
//                mais forte, brilho rosa em volta e a flor 4% maior.
// Cada ponto (e a flor) surge quando a ponta da linha chega no mesmo ponto do percurso em
// que surgia no Tapfit (27%, 65% e 96% da descida) — os tempos acima foram calculados a
// partir da curva nova para manter isso; trocou a curva ou a duração da linha, recalcule.
// "Reduzir movimento": a tela já pronta (com a flor já em destaque), sem vibração.
const T = {
  titulo: [162, 188], sub: [256, 116], p1: [396, 378],
  linha: { atraso: 496, ms: 560, curva: Easing.bezier(0.5, 0.25, 0.55, 1) },
  p2: 671, p3: 804, flor: 966,
  destaque: 1430,
} as const;
const SOBE = Easing.bezier(0.23, 1, 0.32, 1);  // ease-out forte (título, subtítulo, 1º ponto)
// O "pulo" dos pontos e da flor: ease-out cúbico (era quártico, medido no Tapfit — mais
// seco; o cúbico deixa o crescimento mais macio).
const CRESCE = Easing.out(Easing.cubic);
const ASSENTA = Easing.inOut(Easing.quad);

// A trilha do Tapfit (quadro final, centro da linha a cada ~34 px), normalizada:
// (0, 0) = 1º ponto, (1, 1) = flor. Os pontos 2 e 3 são nós da curva, no mesmo lugar de lá.
const TRILHA: [number, number][] = [
  [0, 0], [0.026, 0.07], [0.09, 0.129], [0.226, 0.187], [0.344, 0.245], [0.397, 0.304],
  [0.411, 0.377], [0.454, 0.479], [0.523, 0.537], [0.591, 0.595], [0.634, 0.714],
  [0.739, 0.828], [0.895, 0.887], [1, 1],
];
const I_P2 = 6;
const I_P3 = 10;
// Na tela, o 1º ponto fica a 17,4% da largura e a flor a 80% (no Tapfit, 75,8%: aqui um
// pouco mais à direita para os textos do lado esquerdo caberem).
const X_P1 = 0.174;
const X_FLOR = 0.8;

const R = 18;           // raio do círculo dos pontos
const FLOR = 36;        // círculo rosa da flor
const HALO = 62;
const FIM_BAIXO = 46;   // da flor até o fim da área (o texto final desce um pouco)
const GAP_TXT = 12;
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

const tituloTxt = { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2, color: OB.ink } as const;
const subTxt = { fontSize: 14, lineHeight: 18, color: OB.sub } as const;

function Ponto({ Icone }: { Icone: typeof ScanFace }) {
  return (
    <View style={{
      width: 2 * R, height: 2 * R, borderRadius: R, backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: OB.pink,
      alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(255,94,168,0.25)',
    }}>
      <Icone size={17} color={OB.pink} strokeWidth={2.2} />
    </View>
  );
}

export default function SeuCaminho() {
  useObPassoVisto(OB_STEPS.seuCaminho, 'Seu caminho');
  const router = useRouter();
  const { y, buttonBottom } = useObFrame();
  const { width: telaW } = useWindowDimensions();
  const reduce = useReducedMotion();
  // A MESMA carta que ela viu: análise rápida + problemas marcados (06/nov/2026).
  const carta = cartaDoOnboarding(useAppStore((s) => s.analiseRapida), {
    concerns: useAppStore((s) => s.onboarding.concerns),
    birthday: useAppStore((s) => s.onboarding.birthday),
  });
  const cam = carta ? caminhoDaCarta(carta) : null;
  const [area, setArea] = useState({ w: 0, h: 0 });
  // Altura medida dos textos dos pontos 2 e 3: texto mais alto que o ícone fica centrado
  // nele (e não alinhado pelo topo, como no Tapfit) — com 4 linhas, a última encostava na
  // trilha, que naquela altura já desceu para o lado do texto (visto no iPhone SE).
  const [altTxt, setAltTxt] = useState<[number, number]>([0, 0]);
  const topoTxt = (cy: number, h: number) => cy - Math.max(R, h / 2);

  // t = 0 é o início da transição (o esmaecimento), não a montagem — como na "Sua
  // evolução". Rede de segurança: sem o evento, começa em 600 ms.
  const navigation = useNavigation();
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisivel(true), 600);
    const sai = navigation.addListener('transitionStart' as never, () => { clearTimeout(t); setVisivel(true); });
    return () => { clearTimeout(t); sai(); };
  }, [navigation]);

  // Sem voltar (como a carta): o voltar do Android não faz nada; o gesto está desligado
  // no `(scan)/_layout`.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const v0 = reduce ? 1 : 0;
  const titulo = useSharedValue(v0);
  const sub = useSharedValue(v0);
  const p1 = useSharedValue(v0);
  const desenho = useSharedValue(v0);
  const p2 = useSharedValue(reduce ? 1 : 0.5);
  const p2Vis = useSharedValue(v0);
  const p3 = useSharedValue(reduce ? 1 : 0.5);
  const p3Vis = useSharedValue(v0);
  const flor = useSharedValue(reduce ? 1 : 0.55);
  const florVis = useSharedValue(v0);
  // Destaque da semana 3: `destaque` 0 → 1 (passa por 1,7 na piscada) leva halo, brilho e
  // flor ao estado final; `onda` 0 → 1 é o anel que sai da flor e some (só na piscada).
  const destaque = useSharedValue(v0);
  const onda = useSharedValue(0);

  const vibrar = () => haptics.tap();

  useEffect(() => {
    if (reduce || area.w === 0 || !visivel) return;
    const entra = ([atraso, ms]: readonly [number, number]) =>
      withDelay(atraso, withTiming(1, { duration: ms, easing: SOBE }));
    titulo.set(entra(T.titulo));
    sub.set(entra(T.sub));
    p1.set(entra(T.p1));
    desenho.set(withDelay(T.linha.atraso, withTiming(1, { duration: T.linha.ms, easing: T.linha.curva })));
    // Os pontos 2 e 3 (com o texto) esmaecem e crescem do centro do ícone, passam um pouco
    // do tamanho e assentam.
    const aparece = () => withTiming(1, { duration: 140, easing: SOBE });
    const pula = (pico: number, [sobe, volta]: number[]) => withSequence(
      withTiming(pico, { duration: sobe, easing: CRESCE }),
      withTiming(1, { duration: volta, easing: ASSENTA }),
    );
    p2Vis.set(withDelay(T.p2, aparece()));
    p2.set(withDelay(T.p2, pula(1.05, [220, 180])));
    p3Vis.set(withDelay(T.p3, aparece()));
    p3.set(withDelay(T.p3, pula(1.05, [220, 180])));
    // A flor: pulo + halo, e a vibração leve no mesmo quadro em que ela começa a surgir.
    florVis.set(withDelay(T.flor, withSequence(
      withTiming(0, { duration: 0 }, (ok) => {
        'worklet';
        if (ok) scheduleOnRN(vibrar);
      }),
      aparece(),
    )));
    flor.set(withDelay(T.flor, pula(1.08, [220, 160])));
    // Fim da animação: a piscada rápida e o destaque que fica.
    destaque.set(withDelay(T.destaque, withSequence(
      withTiming(1.7, { duration: 150, easing: CRESCE }),
      withTiming(1, { duration: 230, easing: ASSENTA }),
    )));
    onda.set(withDelay(T.destaque, withTiming(1, { duration: 420, easing: CRESCE })));
  }, [reduce, area.w, visivel]);

  // ── Geometria da trilha (pt, dentro da área medida) ─────────────────────────
  const A = area.w;
  const x1 = X_P1 * telaW - 24;           // 24 = margem da tela
  const xF = X_FLOR * telaW - 24;
  const y1 = R + 2;
  const yF = area.h - FIM_BAIXO;
  const pts = TRILHA.map(([u, v]) => [x1 + u * (xF - x1), y1 + v * (yF - y1)] as [number, number]);
  const [c2x, c2y] = pts[I_P2];
  const [c3x, c3y] = pts[I_P3];
  const d = A ? caminho(pts) : '';

  // Máscara de borda horizontal: o recorte desce e o conteúdo sobe o mesmo tanto (a
  // trilha fica parada). Vai do centro do 1º ponto (escondido pelo ícone) até a borda de
  // cima da flor, que é onde a ponta parou no Tapfit.
  const yFim = yF - (FLOR + 5) / 2 - 2;
  // ⚠️ A opacidade 0 antes de o desenho começar NÃO é enfeite: o valor inicial deste estilo é
  // calculado no 1º render, quando a área ainda tem altura 0, e a janela montava com esse
  // valor velho — a linha aparecia INTEIRA por ~100 ms durante a entrada (visto na gravação
  // a 60 fps, 04/nov/2026). Com o desenho em 0 ela fica invisível, seja qual for a janela.
  const janelaStyle = useAnimatedStyle(() => {
    const p = desenho.get();
    return {
      opacity: p > 0 ? 1 : 0,
      transform: [{ translateY: p >= 1 ? 0 : y1 + p * (yFim - y1) - area.h }],
    };
  });
  const conteudoStyle = useAnimatedStyle(() => {
    const p = desenho.get();
    return { transform: [{ translateY: p >= 1 ? 0 : area.h - (y1 + p * (yFim - y1)) }] };
  });
  const entraStyle = (v: { get(): number }, sobe: number) => useAnimatedStyle(() => ({
    opacity: v.get(), transform: [{ translateY: (1 - v.get()) * sobe }],
  }));
  const tituloStyle = entraStyle(titulo, 8);
  const subStyle = entraStyle(sub, 0);
  const p1Style = entraStyle(p1, 6);
  // Ponto + texto num grupo do tamanho da área, escalado em volta do centro do ícone.
  const p2Style = useAnimatedStyle(() => ({ opacity: p2Vis.get(), transform: [{ scale: p2.get() }] }));
  const p3Style = useAnimatedStyle(() => ({ opacity: p3Vis.get(), transform: [{ scale: p3.get() }] }));
  const florStyle = useAnimatedStyle(() => ({ opacity: florVis.get(), transform: [{ scale: flor.get() }] }));
  // Destaque: halo 0,22 → 0,32 de opacidade e 12% maior; flor 4% maior; brilho rosa (camada
  // com sombra já pronta, só a opacidade anima). Na piscada (destaque 1,7) tudo passa um
  // pouco disso e volta.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + 0.1 * destaque.get(), transform: [{ scale: 1 + 0.12 * destaque.get() }],
  }));
  const florIconeStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * destaque.get() }] }));
  const brilhoStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, destaque.get()) }));
  const ondaStyle = useAnimatedStyle(() => {
    const p = onda.get();
    return { opacity: p > 0 ? 0.5 * (1 - p) : 0, transform: [{ scale: 1 + 0.9 * p }] };
  });

  // Título: as 2 linhas no MESMO tamanho, o maior que couber em 1 linha cada (28 → 20).
  const larguraTexto = telaW - 48;
  const maiorLinha = cam ? Math.max(cam.titulo[0].length * 0.5, cam.titulo[1].length * 0.56) : 1;
  const fs = Math.max(20, Math.min(28, Math.floor(larguraTexto / maiorLinha)));

  const continuar = () => {
    haptics.action();
    // Depois do "Seu caminho" vêm as perguntas da personalização (04/nov/2026), que seguem
    // para o resultado do scan.
    router.replace('/(scan)/personalizar' as any);
  };

  // Sem carta (não deveria acontecer: sempre há um problema para a carta) → segue adiante.
  useEffect(() => { if (!cam) router.replace('/(scan)/personalizar' as any); }, [cam == null]);
  if (!cam) return <ObScreen>{null}</ObScreen>;

  const grupo = (cx: number, cy: number) => ({
    position: 'absolute' as const, left: 0, top: 0, width: A, height: area.h, transformOrigin: [cx, cy, 0],
  });

  return (
    <ObScreen>
      <Text style={{ position: 'absolute', left: 0, right: 0, top: y(74), textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub }}>
        SEU CAMINHO
      </Text>

      <View style={{ flex: 1, paddingTop: y(126), paddingHorizontal: 24, paddingBottom: buttonBottom + 56 + 48 }}>
        <Animated.View style={tituloStyle}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
            style={{ fontSize: fs, lineHeight: Math.round(fs * 1.22), fontWeight: '400', letterSpacing: -0.4, color: OB.body }}>
            {cam.titulo[0]}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
            style={{ fontSize: fs, lineHeight: Math.round(fs * 1.22), fontWeight: '700', letterSpacing: -0.6, color: OB.ink }}>
            {cam.titulo[1]}
          </Text>
        </Animated.View>
        <Animated.Text style={[{ marginTop: 10, fontSize: 17, lineHeight: 23, color: OB.sub }, subStyle]}>
          Montamos cada passo.
        </Animated.Text>

        {/* A trilha ocupa o espaço que sobra (encolhe em tela baixa, sem rolagem). */}
        <View
          accessible
          accessibilityLabel={`${cam.pontos.map((p) => `${p.titulo}, ${p.sub}`).join('. ')}. ${cam.final.titulo}, ${cam.final.sub}.`}
          style={{ flex: 1, marginTop: 26, maxHeight: 420 }}
          onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {A > 0 && (
            <>
              {/* A linha (contorno claro + traço rosa), revelada de cima para baixo */}
              <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: A, height: area.h, overflow: 'hidden' }, janelaStyle]}>
                <Animated.View style={conteudoStyle}>
                  <Svg width={A} height={area.h}>
                    <Path d={d} fill="none" stroke={OB.pink} strokeOpacity={0.18} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
                    <Path d={d} fill="none" stroke={OB.pink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Animated.View>
              </Animated.View>

              {/* 1º ponto: texto à direita */}
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: A, height: area.h }, p1Style]}>
                <View style={{ position: 'absolute', left: x1 - R, top: y1 - R }}><Ponto Icone={ScanFace} /></View>
                <View style={{ position: 'absolute', left: x1 + R + GAP_TXT, right: 0, top: y1 - R }}>
                  <BalancedText style={tituloTxt} text={cam.pontos[0].titulo} />
                  <BalancedText style={subTxt} text={cam.pontos[0].sub} />
                </View>
              </Animated.View>

              {/* 2º ponto: texto à direita */}
              <Animated.View pointerEvents="none" style={[grupo(c2x, c2y), p2Style]}>
                <View style={{ position: 'absolute', left: c2x - R, top: c2y - R }}><Ponto Icone={ListChecks} /></View>
                <View onLayout={(e) => { const h = e.nativeEvent.layout.height; setAltTxt((v) => (v[0] === h ? v : [h, v[1]])); }} style={{ position: 'absolute', left: c2x + R + GAP_TXT, right: 0, top: topoTxt(c2y, altTxt[0]) }}>
                  <BalancedText style={tituloTxt} text={cam.pontos[1].titulo} />
                  <BalancedText style={subTxt} text={cam.pontos[1].sub} />
                </View>
              </Animated.View>

              {/* 3º ponto: texto à esquerda */}
              <Animated.View pointerEvents="none" style={[grupo(c3x, c3y), p3Style]}>
                <View style={{ position: 'absolute', left: c3x - R, top: c3y - R }}><Ponto Icone={ShoppingBag} /></View>
                <View onLayout={(e) => { const h = e.nativeEvent.layout.height; setAltTxt((v) => (v[1] === h ? v : [v[0], h])); }} style={{ position: 'absolute', left: 0, width: c3x - R - GAP_TXT, top: topoTxt(c3y, altTxt[1]) }}>
                  <BalancedText style={[tituloTxt, { textAlign: 'right' }]} text={cam.pontos[2].titulo} />
                  <BalancedText style={[subTxt, { textAlign: 'right' }]} text={cam.pontos[2].sub} />
                </View>
              </Animated.View>

              {/* A flor do NIKS no fim, com halo; o texto final à esquerda dela */}
              <Animated.View pointerEvents="none" style={[grupo(xF, yF), florStyle]}>
                <View style={{
                  position: 'absolute', left: xF - HALO / 2, top: yF - HALO / 2, width: HALO, height: HALO,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Animated.View style={[{ position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2, backgroundColor: OB.pink }, haloStyle]} />
                  {/* A onda da piscada: anel rosa que sai da flor e some */}
                  <Animated.View style={[{
                    position: 'absolute', width: FLOR + 5, height: FLOR + 5, borderRadius: (FLOR + 5) / 2,
                    borderWidth: 2, borderColor: OB.pink,
                  }, ondaStyle]} />
                  <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, florIconeStyle]}>
                    {/* Brilho rosa do destaque: a sombra fica pronta, só a opacidade anima */}
                    <Animated.View style={[{
                      position: 'absolute', width: FLOR + 5, height: FLOR + 5, borderRadius: (FLOR + 5) / 2,
                      backgroundColor: OB.pink, boxShadow: '0px 0px 16px 3px rgba(255,94,168,0.55)',
                    }, brilhoStyle]} />
                    <View style={{ width: FLOR + 5, height: FLOR + 5, borderRadius: (FLOR + 5) / 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: FLOR, height: FLOR, borderRadius: FLOR / 2, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
                        <Image source={LOGO_BRANCO} style={{ width: 24, height: 24 }} />
                      </View>
                    </View>
                  </Animated.View>
                </View>
                <View style={{ position: 'absolute', left: 0, width: xF - HALO / 2 - 6, top: yF - 12 }}>
                  <BalancedText style={[tituloTxt, { textAlign: 'right' }]} text={cam.final.titulo} />
                  <BalancedText style={[subTxt, { textAlign: 'right', color: OB.pink, fontWeight: '600' }]} text={cam.final.sub} />
                </View>
              </Animated.View>
            </>
          )}
        </View>
      </View>

      <Text style={{ position: 'absolute', left: 24, right: 24, bottom: buttonBottom + 56 + 14, textAlign: 'center', fontSize: 13, lineHeight: 17, color: '#B5AEB1' }}>
        Meta estimada. Os resultados podem variar.
      </Text>
      <ObPillButton label="Quero chegar lá" width={telaW - 48} onPress={continuar} bottom={buttonBottom}
        style={{ height: 56, borderRadius: 28 }} />
    </ObScreen>
  );
}
