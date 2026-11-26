import { useEffect, useState } from 'react';
import { View, Text, AccessibilityInfo } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { t } from '../../lib/i18n';
import { BvScreen } from '../../components/boasVindas/kit';
import { Confete, Odometro } from '../../components/boasVindas/comemoracao';
import Medalha from '../../components/medalhas/Medalha';
import { PC, PcBotao, usePcFrame } from '../../components/posCompra/pcKit';
import { PONTOS_BOAS_VINDAS, pontosDoPacto, pontosDosProdutos, usePosCompraV2 } from '../../lib/posCompraV2';
import { TABELA_NIVEIS, fracaoNivel, nivelDe } from '../../lib/niveis';

// Pós-compra v2 · tela 9 "Recompensa" (design-handoff/pos-compra-v2/09-recompensa.html).
// "+<total>" NIKS Points, a medalha do nível atingido (a de verdade do app, components/medalhas),
// "Ponto de partida", o extrato (produtos escaneados × 20 e pacto selado +100) e a barra do nível
// atingido ao próximo, pela curva de verdade (lib/niveis.ts).
//
// ANIMAÇÃO (26/nov/2026, pedido do produto: "a animação dessa tela tá muito fraca"). Começa quando
// a tela termina de entrar e segue uma linha do tempo única (ms a partir daí):
//      0  número: estoura (0,4 → 1,12 → 1) e conta de 0 ao total em 1,4 s; no fim, um pulso.
//    250  medalha: aparece reta (esmaece e cresce de 85% a 100%, 0,5 s, sem girar); aos ~750 solta
//         uma onda de brilho, três faíscas piscam, vibra, e o CONFETE dispara UMA VEZ (estouro dos
//         dois cantos de baixo + chuva caindo do topo, sem repetir — o `Confete` da bv-recompensa
//         com `umaVez`). Sem raios atrás da medalha (pedido do produto, 26/nov/2026). Depois ela fica pulsando devagar (1 → 1,05 → 1, 2,2 s por ciclo).
//    900  "Ponto de partida" sobe; 1050/1150 as linhas do extrato entram da esquerda.
//   1300  barra: enche até o nível em 1,2 s (o "140 / 250" conta junto), e uma faixa de luz
//         passa por ela no fim; vibração leve ao completar.
// Tudo no thread de UI (Reanimated). "Reduzir movimento": tudo pronto, sem confete nem loops.
// Tudo é creditado no servidor depois do cadastro, num evento só: os +100 do pacto (`selarPacto`)
// e os +20 por produto (`registrarProdutosBoasVindas`) — `cartas` → `boas_vindas`.
const MEDALHA = 132;
/** Espaçamento entre as letras do número grande ("+140"). */
const LETRAS_NUMERO = -2;
/** Deslocamento que centraliza a TINTA do número na tela, medido no simulador (26/nov/2026):
 *  o espaçamento negativo depois do último algarismo (1 pt) + a diferença entre as margens
 *  internas do "+" e do "0" da fonte. Com ele, "+100" e "+140" ficam a menos de 1 pixel do centro. */
const AJUSTE_CENTRO = -4 / 3; // = 4 px físicos num iPhone de tela 3x
const CONTA_MS = 1400;
const BARRA_MS = 1200;
const T_MEDALHA = 250;
const T_POUSO = 750;
const T_TITULO = 900;
const T_BARRA = 1300;
const SAI = Easing.bezier(0.23, 1, 0.32, 1);

/** 0 → 1 depois de `atraso` ms (em `dur` ms). */
const entra = (v: SharedValue<number>, atraso: number, dur = 500, easing = SAI) => {
  v.value = withDelay(atraso, withTiming(1, { duration: dur, easing }));
};

/** Faísca de 4 pontas. */
function Faisca({ tamanho, cor }: { tamanho: number; cor: string }) {
  const s = tamanho;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={cor} />
    </Svg>
  );
}

export default function PcRecompensa() {
  const router = useRouter();
  const navigation = useNavigation();
  const { top, bottom } = usePcFrame();
  const [{ fotos, semProdutos }] = useState(() => usePosCompraV2.getState());
  const total = pontosDoPacto();
  const nivel = nivelDe(total, TABELA_NIVEIS);
  const fracao = fracaoNivel(total, nivel.piso, nivel.teto);
  const rotuloNivel = nivel.tituloProximo ? `${t(nivel.titulo)} → ${t(nivel.tituloProximo)}` : t(nivel.titulo);
  const tetoBarra = nivel.tituloProximo ? nivel.teto : total;
  const comProdutos = !semProdutos && fotos > 0;

  const [festa, setFesta] = useState(false);
  // Número
  const numeroIn = useSharedValue(0);
  const conta = useSharedValue(0);
  const pulso = useSharedValue(1);
  const legenda = useSharedValue(0);
  // Medalha
  const queda = useSharedValue(0);
  const onda = useSharedValue(0);
  const flutua = useSharedValue(0);
  const faiscas = useSharedValue(0);
  // Texto e extrato
  const titulo = useSharedValue(0);
  const linha1 = useSharedValue(0);
  const linha2 = useSharedValue(0);
  // Barra
  const barraBloco = useSharedValue(0);
  const barraV = useSharedValue(0);
  const brilho = useSharedValue(0);
  const botao = useSharedValue(0);

  useEffect(() => {
    let foi = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const depois = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
    const comecar = () => {
      if (foi) return;
      foi = true;
      AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
        if (reduzir) {
          for (const v of [numeroIn, conta, legenda, queda, titulo, linha1, linha2, barraBloco, barraV, botao]) v.value = 1;
          return;
        }
        // 0 — número
        numeroIn.value = withSpring(1, { damping: 9, stiffness: 160, mass: 0.8 });
        conta.value = withTiming(1, { duration: CONTA_MS, easing: Easing.out(Easing.cubic) });
        entra(legenda, 200, 400);
        depois(CONTA_MS, () => {
          pulso.value = withSequence(withTiming(1.12, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 7, stiffness: 220 }));
          haptics.tap();
        });
        // 250 — medalha cai girando e quica
        queda.value = withDelay(T_MEDALHA, withTiming(1, { duration: 500, easing: SAI }));
        depois(T_POUSO, () => {
          haptics.success();
          setFesta(true);
          onda.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
          faiscas.value = withSequence(withTiming(1, { duration: 350 }), withDelay(500, withTiming(0, { duration: 500 })));
          // Pulso contínuo e suave (cresce 5% e volta, 1,1 s cada lado), sem piscar.
          flutua.value = withDelay(300, withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true));
        });
        // 900 — título e extrato
        entra(titulo, T_TITULO);
        entra(linha1, T_TITULO + 150);
        entra(linha2, T_TITULO + 250);
        // 1300 — barra
        entra(barraBloco, T_BARRA - 150, 400);
        barraV.value = withDelay(T_BARRA, withTiming(1, { duration: BARRA_MS, easing: Easing.out(Easing.cubic) }));
        brilho.value = withDelay(T_BARRA + BARRA_MS - 100, withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }));
        depois(T_BARRA + BARRA_MS, () => haptics.tap());
        entra(botao, T_BARRA + 400, 500);
      });
    };
    const t1 = setTimeout(comecar, 700);
    const sai = navigation.addListener('transitionEnd' as never, () => { clearTimeout(t1); comecar(); });
    return () => { clearTimeout(t1); timers.forEach(clearTimeout); sai(); };
  }, []);

  // ── Estilos animados ──
  const stNumero = useAnimatedStyle(() => ({
    opacity: Math.min(1, numeroIn.value * 1.5),
    transform: [{ scale: (0.4 + 0.6 * numeroIn.value) * pulso.value }],
  }));
  const stLegenda = useAnimatedStyle(() => ({ opacity: legenda.value, transform: [{ translateY: 8 * (1 - legenda.value) }] }));
  const stMedalha = useAnimatedStyle(() => ({
    opacity: queda.value,
    transform: [{ scale: (0.85 + 0.15 * queda.value) * (1 + 0.05 * flutua.value) }],
  }));
  const stOnda = useAnimatedStyle(() => ({
    opacity: onda.value === 0 ? 0 : 0.55 * (1 - onda.value),
    transform: [{ scale: 0.9 + 1.1 * onda.value }],
  }));
  const stFaiscas = useAnimatedStyle(() => ({ opacity: faiscas.value, transform: [{ scale: 0.4 + 0.6 * faiscas.value }] }));
  const sobe = (v: SharedValue<number>) => useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: 16 * (1 - v.value) }] }));
  const daEsquerda = (v: SharedValue<number>) => useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateX: -24 * (1 - v.value) }] }));
  const stTitulo = sobe(titulo);
  const stLinha1 = daEsquerda(linha1);
  const stLinha2 = daEsquerda(linha2);
  const stBarraBloco = sobe(barraBloco);
  const stBotao = sobe(botao);
  const stBarra = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.0001, barraV.value * fracao) }] }));
  const stBrilho = useAnimatedStyle(() => ({
    opacity: brilho.value > 0 && brilho.value < 1 ? 1 : 0,
    transform: [{ translateX: -60 + 420 * brilho.value }],
  }));

  const linha = (texto: string, pontos: number, estilo: object) => (
    <Animated.View style={[{ flexDirection: 'row', justifyContent: 'space-between' }, estilo]}>
      <Text style={{ fontSize: 14, color: PC.ink }}>{texto}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: PC.pink }}>+{pontos}</Text>
    </Animated.View>
  );

  return (
    <BvScreen fundo={<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />}>
      <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 20, alignItems: 'center' }}>
        {/* Centralizado de verdade (26/nov/2026, pedido do produto): o espaçamento negativo (−2)
            também entra depois do último algarismo e empurrava o número 1 pt para a direita —
            o `translateX` (AJUSTE_CENTRO) compensa isso e a margem interna do "+"; e algarismos
            proporcionais (sem `tabular-nums`) tiram o vão largo entre o "+" e o "1".
            Medido no simulador: desvio de 1,3 pt → ≤ 0,2 pt. */}
        <Animated.View style={[{ marginTop: 40, alignSelf: 'stretch' }, stNumero]}>
          <View style={{ alignSelf: 'stretch', transform: [{ translateX: AJUSTE_CENTRO }] }}>
          <Odometro
            valor={conta}
            alvo={total}
            prefixo="+"
            style={{ fontSize: 76, lineHeight: 84, fontWeight: '700', letterSpacing: LETRAS_NUMERO, color: PC.pink }}
          />
          </View>
        </Animated.View>
        <Animated.Text style={[{ fontSize: 14, fontWeight: '600', color: PC.ink }, stLegenda]}>{t('NIKS Points')}</Animated.Text>

        {/* Medalha de verdade do nível atingido (components/medalhas/Medalha), com onda e faíscas. */}
        <View style={{ marginTop: 36, width: MEDALHA, height: MEDALHA, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View pointerEvents="none" style={[{
            position: 'absolute', width: MEDALHA, height: MEDALHA, borderRadius: MEDALHA / 2, borderWidth: 6, borderColor: '#E7B07E',
          }, stOnda]} />
          <Animated.View style={[{
            width: MEDALHA, height: MEDALHA, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#B47A4C', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 14,
          }, stMedalha]}>
            <Medalha nivel={nivel.nivel} tamanho={MEDALHA} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -14, top: 6 }, stFaiscas]}><Faisca tamanho={22} cor="#FFC94D" /></Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: -18, top: 30 }, stFaiscas]}><Faisca tamanho={16} cor={PC.pink} /></Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: 2, bottom: -10 }, stFaiscas]}><Faisca tamanho={20} cor="#FFFFFF" /></Animated.View>
        </View>

        <Animated.Text style={[{ marginTop: 28, fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: PC.ink }, stTitulo]}>
          {t('Ponto de partida')}
        </Animated.Text>

        <Animated.View style={[{ marginTop: 18, alignSelf: 'stretch', backgroundColor: PC.blush, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 8, overflow: 'hidden' }, stTitulo]}>
          {comProdutos && linha(
            fotos === 1 ? t('1 produto escaneado') : t('{{n}} produtos escaneados', { n: fotos }),
            pontosDosProdutos(fotos),
            stLinha1,
          )}
          {linha(t('Pacto selado · dia 1'), PONTOS_BOAS_VINDAS, comProdutos ? stLinha2 : stLinha1)}
        </Animated.View>

        <Animated.View style={[{ marginTop: 14, alignSelf: 'stretch', gap: 8 }, stBarraBloco]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: PC.ink }}>{rotuloNivel}</Text>
            <View style={{ width: 90 }}>
              <Odometro valor={barraV} alvo={total} sufixo={` / ${tetoBarra}`} alinhar="right"
                style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: PC.ink, fontVariant: ['tabular-nums'] }} />
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#F4D3E2', overflow: 'hidden' }}>
            <Animated.View style={[{ height: 6, width: '100%', borderRadius: 3, backgroundColor: PC.pink, transformOrigin: 'left' }, stBarra]} />
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, width: 60 }, stBrilho]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
            </Animated.View>
          </View>
        </Animated.View>

        <View style={{ flex: 1 }} />
        <Animated.View style={[{ alignSelf: 'stretch' }, stBotao]}>
          <PcBotao label={t('Continuar')} onPress={() => router.push('/(onboarding)/pc-sequencia' as any)} />
        </Animated.View>
      </View>
      <Confete disparar={festa} umaVez />
    </BvScreen>
  );
}
