import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, AccessibilityInfo, BackHandler, useWindowDimensions } from 'react-native';
import { Stack, useNavigation, useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import BalancedText from '../../components/BalancedText';
import {
  OB, OB_STEPS, ObScreen, ObHeader, ObPillButton, OB_BOTAO_H, obTitleStyle, obSubtitleStyle, useObFrame, obStep, useOnMount,
} from '../../components/onboarding/kit';
import {
  RostoBase, RegiaoCamada, ROSTO_RATIO, ORDEM, focoNome, focoSub, type Regiao,
} from '../../components/onboarding/RostoRegioes';

// Telas "NF 5 Mapa do rosto" e "NF 6 Reação · foco" do Claude Design ("NIKS
// Onboarding - novo fluxo.dc.html") numa tela SÓ, logo depois de "o que te incomoda"
// (03/nov/2026, pedido do produto: a 6 é a continuação da 5, não uma tela nova).
//
// Mapa: tocar no rosto acende a região (fade de 250 ms + brilho rosa); tocar de novo
// apaga. Sem limite de regiões e sem o botão "Rosto todo" do design. Antes do 1º toque,
// as regiões tocáveis piscam em rosa suave (0 → 45% → 0, 1,6 s) para mostrar onde dá
// para tocar; no 1º toque a piscada sai e não volta (pedido do produto, 03/nov/2026).
// Com "Reduzir movimento", em vez de piscar ficam paradas a 25%.
// Continuar: o título e o botão saem, o rosto ENCOLHE e sobe até o lugar da NF 6
// (480 → 230 pt) e, quando ele chega, entram o brilho rosa atrás, "Seu foco: …", o
// subtítulo e "Quero ver minha pele"; as regiões escolhidas pulsam 2 vezes
// (1 → 0,35 → 1, 2 × 900 ms) e tocar no rosto repete o pulso.
// Voltar (seta ou botão do Android) na fase do foco faz o caminho inverso.
// A escolha não vai para o store nem para a IA.
const STEP_MAPA = OB_STEPS.mapaRosto;
const STEP_FOCO = OB_STEPS.focoRosto;

// Áreas de toque em % da imagem (nota do design). O nariz vem POR ÚLTIMO: fica por
// cima e ganha nas sobreposições com as bochechas ("prioridade"). Sem a área dos olhos:
// tocar no olho não faz nada.
const AREAS: { regiao: Regiao; left: number; top: number; width: number; height: number }[] = [
  { regiao: 'testa', left: 25, top: 15, width: 50, height: 16 },
  { regiao: 'bochechas', left: 22, top: 45, width: 20, height: 17 },
  { regiao: 'bochechas', left: 58, top: 45, width: 20, height: 17 },
  { regiao: 'queixo', left: 34, top: 63, width: 32, height: 11 },
  { regiao: 'nariz', left: 42, top: 34, width: 16, height: 20 },
];

// Geometria (espaçamento refeito em 03/nov/2026, pedido do produto: o título encostava
// na cabeça; e a tela passou a se ajustar à altura do aparelho — num iPhone SE o botão
// caía fora da tela). Título a 106 do frame; a cabeça começa 28 pt abaixo dele (o alto da
// cabeça fica a 4,3% do topo da imagem e o corte do pescoço, ~94%); o botão fica a 757 do
// frame ou, se não couber, a 13 pt da base; o pescoço é cortado 26 pt acima do botão. O
// rosto tem 440 pt de largura ou menos — o que couber entre o título e o botão. Foco: 230 pt
// com topo a 104. Um rosto só, que muda por escala + deslocamento.
const FACE_W_MAX = 440;
const CABECA_TOPO = 0.043;   // fração da altura da imagem
const CORTE_VISIVEL = 0.9;   // do alto da cabeça até o corte que ainda mostra o pescoço
const TITULO_TOP = 106;
const TITULO_H = 66;         // 2 linhas de 33
const RESPIRO_CABECA = 28;
const RESPIRO_BOTAO = 26;
const FOCO_W = 230;
const FOCO_TOP = 104;

// Tempos da transição (ms).
const SAI_MS = 200;       // título e botão do mapa saem
const ROSTO_MS = 650;     // o rosto encolhe e sobe (começa junto com a saída)
const ENTRA_MS = 320;     // o que é do foco entra, depois que o rosto chegou
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

// Piscada de dica (antes do 1º toque).
const DICA_PICO = 0.45;
const DICA_MEIO_MS = 800;
const DICA_PARADA = 0.25; // "Reduzir movimento"

type Fase = 'mapa' | 'foco';

export default function MapaRosto() {
  const router = useRouter();
  const navigation = useNavigation();
  const { track } = useMixpanel();
  const { y, buttonBottom } = useObFrame();
  const { width: W, height: H } = useWindowDimensions();
  const btnTop = Math.min(y(757), H - buttonBottom - OB_BOTAO_H);
  const corte = btnTop - RESPIRO_BOTAO;
  const cabeca = y(TITULO_TOP) + TITULO_H + RESPIRO_CABECA;
  const FACE_H = Math.min(FACE_W_MAX / ROSTO_RATIO, (corte - cabeca) / CORTE_VISIVEL);
  const FACE_W = FACE_H * ROSTO_RATIO;
  const mapaTop = cabeca - CABECA_TOPO * FACE_H;
  const ESCALA = FOCO_W / FACE_W;
  const SOBE = (y(FOCO_TOP) + (FACE_H * ESCALA) / 2) - (mapaTop + FACE_H / 2);
  const [sel, setSel] = useState<Regiao[]>([]);
  const [fase, setFase] = useState<Fase>('mapa');
  const [reduce, setReduce] = useState(false);
  const animando = useRef(false);

  // 0 = mapa, 1 = foco. `rosto` move o rosto; `mapaUi` e `focoUi`, os textos e botões.
  const rosto = useSharedValue(0);
  const mapaUi = useSharedValue(1);
  const focoUi = useSharedValue(0);
  const pulso = useSharedValue(1);
  const dica = useSharedValue(0);
  const jaTocou = useRef(false);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP_MAPA, 'Mapa do rosto')));
  // O rosto (base + regiões) só aparece INTEIRO, quando a imagem-base carregou, esmaecendo em
  // 220 ms; e a piscada só começa quando a tela TERMINOU de entrar E o rosto já está lá
  // (08/nov/2026: no iPhone a base chegava depois das regiões e a piscada surgia sozinha; e a
  // piscada começava aos 400 ms, no meio do deslize). Redes de segurança: 700 ms para o fim da
  // transição e 6 s para a imagem.
  const aparece = useSharedValue(0);
  const prontos = useRef({ transicao: false, base: false });
  const comecarRef = useRef<() => void>(() => {});
  const basePronta = () => {
    if (prontos.current.base) return;
    prontos.current.base = true;
    aparece.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    comecarRef.current();
  };
  // Rede só para o caso de a imagem nunca responder. 08/nov/2026: era 1,5 s e, no iPhone em
  // desenvolvimento (imagem vindo do Mac pelo Wi-Fi, ~3,5 s), ela disparava antes do rosto e
  // as regiões apareciam sozinhas. O rosto e as regiões aparecem JUNTOS, sempre.
  useEffect(() => {
    const t = setTimeout(basePronta, 6000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let foi = false;
    const comecar = () => {
      if (foi || !prontos.current.transicao || !prontos.current.base) return;
      foi = true;
      AccessibilityInfo.isReduceMotionEnabled().then((v) => {
        setReduce(v);
        if (jaTocou.current) return;
        if (v) { dica.value = DICA_PARADA; return; }
        const meio = { duration: DICA_MEIO_MS, easing: Easing.inOut(Easing.sin) };
        dica.value = withDelay(150, withRepeat(withSequence(withTiming(DICA_PICO, meio), withTiming(0, meio)), -1, false));
      });
    };
    comecarRef.current = comecar;
    const fimTransicao = () => { prontos.current.transicao = true; comecar(); };
    const t = setTimeout(fimTransicao, 700);
    const sai = navigation.addListener('transitionEnd' as never, () => { clearTimeout(t); fimTransicao(); });
    return () => { clearTimeout(t); sai(); };
  }, []);

  const escolha: Regiao[] = ORDEM.filter((r) => sel.includes(r));

  const tocarRegiao = (r: Regiao) => {
    haptics.select();
    if (!jaTocou.current) {
      jaTocou.current = true;
      cancelAnimation(dica);
      dica.value = withTiming(0, { duration: 200 });
    }
    setSel((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  };

  const pulsar = () => {
    cancelAnimation(pulso);
    pulso.value = 1;
    if (reduce) return;
    const meio = { duration: 450, easing: Easing.inOut(Easing.sin) };
    pulso.value = withRepeat(withSequence(withTiming(0.35, meio), withTiming(1, meio)), 2, false);
  };

  const fim = () => { animando.current = false; };

  const irParaFoco = () => {
    if (!escolha.length || animando.current) return;
    animando.current = true;
    haptics.action();
    track('onboarding_step_completed', { ...obStep(STEP_MAPA, 'Mapa do rosto'), regioes: escolha.join(',') });
    track('onboarding_step_viewed', { ...obStep(STEP_FOCO, 'Reação · foco'), regioes: escolha.join(',') });
    setFase('foco');
    const k = reduce ? 0 : 1;
    mapaUi.value = withTiming(0, { duration: SAI_MS * k });
    rosto.value = withTiming(1, { duration: ROSTO_MS * k, easing: EASE });
    focoUi.value = withDelay(ROSTO_MS * k, withTiming(1, { duration: ENTRA_MS }, (ok) => {
      if (ok) runOnJS(fim)();
    }));
    setTimeout(pulsar, ROSTO_MS * k + 150);
  };

  const voltarParaMapa = () => {
    if (animando.current) return;
    animando.current = true;
    cancelAnimation(pulso);
    pulso.value = 1;
    setFase('mapa');
    const k = reduce ? 0 : 1;
    focoUi.value = withTiming(0, { duration: SAI_MS });
    rosto.value = withDelay(120 * k, withTiming(0, { duration: ROSTO_MS * k, easing: EASE }));
    mapaUi.value = withDelay((120 + ROSTO_MS - 200) * k, withTiming(1, { duration: ENTRA_MS }, (ok) => {
      if (ok) runOnJS(fim)();
    }));
  };

  const voltar = () => (fase === 'foco' ? voltarParaMapa() : router.back());

  // Botão "voltar" do Android: na fase do foco, volta para o mapa (não sai da tela).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fase !== 'foco') return false;
      voltarParaMapa();
      return true;
    });
    return () => sub.remove();
  }, [fase, reduce]);

  const handleFinal = () => {
    haptics.action();
    track('onboarding_step_completed', { ...obStep(STEP_FOCO, 'Reação · foco'), regioes: escolha.join(',') });
    // Guarda as regiões para a linha "Região" da rotina pronta (04/nov/2026). Só dado, sem
    // mudança nesta tela.
    useAppStore.getState().setRegioesFoco(escolha);
    // Depois do foco vem o tutorial do scan (03/nov/2026, pedido do produto); o pop-up
    // dos termos ("Sua pele. Seus dados.") aparece nele, antes da câmera.
    router.push('/(scan)/scan-prep');
  };

  const rostoStyle = useAnimatedStyle(() => ({
    opacity: aparece.value,
    transform: [
      { translateY: interpolate(rosto.value, [0, 1], [0, SOBE]) },
      { scale: interpolate(rosto.value, [0, 1], [1, ESCALA]) },
    ],
  }));
  const mapaStyle = useAnimatedStyle(() => ({ opacity: mapaUi.value }));
  const focoStyle = useAnimatedStyle(() => ({
    opacity: focoUi.value,
    transform: [{ translateY: interpolate(focoUi.value, [0, 1], [8, 0]) }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: focoUi.value }));

  const noMapa = fase === 'mapa';

  return (
    <ObScreen>
      {/* Na fase do foco, o gesto de voltar sairia da tela inteira: fica desligado e a
          seta faz o caminho inverso. */}
      <Stack.Screen options={{ gestureEnabled: noMapa }} />
      <ObHeader onBack={voltar} />
      <Text style={{
        position: 'absolute', left: 0, right: 0, top: y(74), textAlign: 'center',
        fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub,
      }}>SUA PELE</Text>

      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: y(TITULO_TOP) }, mapaStyle]}>
        <BalancedText text="Toque nas regiões do rosto que mais te incomodam" style={[obTitleStyle, { marginHorizontal: 17 }]} />
      </Animated.View>

      {/* Brilho rosa atrás do rosto (NF 6): radial-gradient(circle) num quadrado de
          320 pt — no CSS o raio vai até o canto (160·√2 ≈ 226). */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: y(96), alignSelf: 'center', width: 320, height: 320 }, haloStyle]}>
        <Svg width={320} height={320}>
          <Defs>
            <RadialGradient id="halo" cx={160} cy={160} r={226} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="rgb(255,110,175)" stopOpacity={0.3} />
              <Stop offset="0.45" stopColor="rgb(255,110,175)" stopOpacity={0.12} />
              <Stop offset="0.7" stopColor="rgb(255,110,175)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={320} height={320} fill="url(#halo)" />
        </Svg>
      </Animated.View>

      {/* O rosto é cortado 26 pt acima do botão; no foco ele termina bem acima disso. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: corte, overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', top: mapaTop, left: (W - FACE_W) / 2, width: FACE_W, height: FACE_H }, rostoStyle]}>
          <RostoBase onPronto={basePronta} />
          {ORDEM.map((r) => <Camada key={r} foco={r} on={sel.includes(r)} pulso={pulso} dica={dica} />)}
          {noMapa ? AREAS.map((a, i) => (
            <Pressable
              key={i}
              onPress={() => tocarRegiao(a.regiao)}
              style={{ position: 'absolute', left: `${a.left}%`, top: `${a.top}%`, width: `${a.width}%`, height: `${a.height}%` }}
            />
          )) : (
            <Pressable
              onPress={() => { haptics.tap(); pulsar(); }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
          )}
        </Animated.View>
      </View>

      {/* Título e subtítulo do foco empilhados: com várias regiões o título quebra em
          2 linhas e o subtítulo desce junto (design: título a 430, subtítulo 25 pt abaixo). */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: y(430) }, focoStyle]}>
        {escolha.length > 0 && (
          <>
            <BalancedText text={`Seu foco: ${focoNome(escolha)}.`} style={[obTitleStyle, { marginHorizontal: 17 }]} />
            <BalancedText
              text={`Sua rotina terá um cuidado maior ${focoSub(escolha)}.`}
              style={[obSubtitleStyle, { marginHorizontal: 30, marginTop: 25 }]}
            />
          </>
        )}
      </Animated.View>

      <Animated.View pointerEvents={noMapa ? 'auto' : 'none'} style={[{ position: 'absolute', top: btnTop, alignSelf: 'center' }, mapaStyle]}>
        <ObPillButton onPress={irParaFoco} disabled={!escolha.length} />
      </Animated.View>
      <Animated.View pointerEvents={noMapa ? 'none' : 'auto'} style={[{ position: 'absolute', top: btnTop, alignSelf: 'center' }, focoStyle]}>
        <ObPillButton label="Quero ver minha pele" width={254} onPress={handleFinal} />
      </Animated.View>
    </ObScreen>
  );
}

/** Uma região: acende/apaga com o fade de 250 ms do design, pulsa junto com `pulso`
 *  (foco) e, apagada, mostra a piscada de dica (`dica`, antes do 1º toque). */
function Camada({ foco, on, pulso, dica }: {
  foco: Regiao; on: boolean; pulso: SharedValue<number>; dica: SharedValue<number>;
}) {
  const op = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    op.value = withTiming(on ? 1 : 0, { duration: 250, easing: Easing.out(Easing.quad) });
  }, [on]);
  const style = useAnimatedStyle(() => ({ opacity: Math.max(op.value * pulso.value, dica.value) }));
  return <RegiaoCamada foco={foco} style={style} />;
}
