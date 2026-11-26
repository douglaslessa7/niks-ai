import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { t } from '../../lib/i18n';
import { haptics } from '../../lib/haptics';
import { useLote } from '../../lib/loteProdutos';
import { escolherSemProdutos, usePosCompraV2, PONTOS_POR_FOTO } from '../../lib/posCompraV2';
import { BvScreen } from '../../components/boasVindas/kit';
import { PC, PcBotao, usePcFrame } from '../../components/posCompra/pcKit';

// Pós-compra v2 · tela 2 "Vamos ver o que você já tem"
// (design-handoff/pos-compra-v2/02-vamos-ver-o-que-voce-ja-tem.html).
// O card mostra, em loop de 5,4 s, três produtos sendo escaneados (gel de limpeza, sérum e um
// protetor desenhado): o produto entra pela direita, a linha de scan desce, pisca, "+20" sobe,
// o produto encolhe para o seu lugar na bandeja de baixo e o contador do selo vai 0 → 20 → 40 → 60.
// Mesmos quadros-chave (em % do ciclo) do CSS do design, num único relógio no thread de UI.
//   · "Escanear meus produtos" → `(scan)/pc-camera` (mesma montagem de imagem do lote da Rotina).
//   · "Não tenho produtos agora" → direto ao loading (passo 4); a Rotina vai pedir as fotos
//     depois, como hoje.
const CICLO_MS = 5400;
const GEL = require('../../assets/pos-compra/gel-de-limpeza.png');
const SERUM = require('../../assets/pos-compra/serum.png');
const PROTETOR = ['#FFF6F0', '#FFEFE6', '#FFC9A3', '#FFB98C'] as const;
const PROTETOR_STOPS = [0, 0.62, 0.62, 1] as const;

/** Valor de um quadro-chave do CSS: `p` em 0–1, `ks` em 0–1 (crescentes), sem extrapolar. */
function k(p: number, ks: number[], vs: number[]) {
  'worklet';
  return interpolate(p, ks, vs, Extrapolation.CLAMP);
}

/** Um produto do palco: `o` = início do ciclo dele (0, 0,30, 0,60); `dx` = onde fica o lugar dele na bandeja. */
function useProduto(p: SharedValue<number>, o: number, dx: number) {
  const prod = useAnimatedStyle(() => {
    const ks = [o, o + 0.06, o + 0.19, o + 0.27];
    return {
      opacity: p.value < o ? 0 : k(p.value, ks, [0, 1, 1, 0]),
      transform: [
        { translateX: k(p.value, ks, [130, 0, 0, dx]) },
        { translateY: k(p.value, ks, [0, 0, 0, 150]) },
        { rotate: `${k(p.value, ks, [10, 0, 0, 0])}deg` },
        { scale: k(p.value, ks, [1, 1, 1, 0.28]) },
      ],
    };
  });
  const scan = useAnimatedStyle(() => ({
    opacity: p.value < o + 0.06 ? 0 : k(p.value, [o + 0.06, o + 0.07, o + 0.13, o + 0.14], [0, 1, 1, 0]),
    transform: [{ translateY: k(p.value, [o + 0.07, o + 0.13], [6, 170]) }],
  }));
  const flash = useAnimatedStyle(() => ({ opacity: k(p.value, [o + 0.13, o + 0.14, o + 0.17], [0, 0.85, 0]) }));
  const pts = useAnimatedStyle(() => {
    const ks = [o + 0.14, o + 0.17, o + 0.2, o + 0.25];
    return {
      opacity: k(p.value, ks, [0, 1, 1, 0]),
      transform: [{ translateY: k(p.value, ks, [14, 0, -4, -26]) }, { scale: k(p.value, ks, [0.5, 1.15, 1, 1]) }],
    };
  });
  const slot = useAnimatedStyle(() => {
    const s = o + 0.25;
    return {
      opacity: k(p.value, [s, s + 0.03, 0.96, 1], [0, 1, 1, 0]),
      transform: [{ scale: k(p.value, [s, s + 0.03, s + 0.05], [0.4, 1.18, 1]) }],
    };
  });
  return { prod, scan, flash, pts, slot };
}

function Palco() {
  const reduzir = useReducedMotion();
  const p = useSharedValue(reduzir ? 0.99 : 0);
  useEffect(() => {
    if (!reduzir) p.value = withRepeat(withTiming(1, { duration: CICLO_MS, easing: Easing.linear }), -1, false);
  }, []);

  const a = useProduto(p, 0, -89);
  const b = useProduto(p, 0.3, 0);
  const c = useProduto(p, 0.6, 88);
  const moldura = useAnimatedStyle(() => ({
    transform: [{
      scale: k(p.value,
        [0, 0.09, 0.14, 0.17, 0.3, 0.39, 0.44, 0.47, 0.6, 0.69, 0.74, 0.77, 1],
        [1, 0.94, 0.94, 1, 1, 0.94, 0.94, 1, 1, 0.94, 0.94, 1, 1]),
    }],
  }));
  // Contador do selo (`steps(1)`): 0 até 17%, 20 até 47%, 40 até 77%, 60 até o fim.
  const c0 = useAnimatedStyle(() => ({ opacity: p.value < 0.17 ? 1 : 0 }));
  const c20 = useAnimatedStyle(() => ({ opacity: p.value >= 0.17 && p.value < 0.47 ? 1 : 0 }));
  const c40 = useAnimatedStyle(() => ({ opacity: p.value >= 0.47 && p.value < 0.77 ? 1 : 0 }));
  const c60 = useAnimatedStyle(() => ({ opacity: p.value >= 0.77 ? 1 : 0 }));

  const canto = (lado: 'tl' | 'tr' | 'bl' | 'br') => {
    const topo = lado[0] === 't';
    const esq = lado[1] === 'l';
    return (
      <View key={lado} style={{
        position: 'absolute', width: 24, height: 24, borderColor: PC.pink,
        [topo ? 'top' : 'bottom']: 0, [esq ? 'left' : 'right']: 0,
        [topo ? 'borderTopWidth' : 'borderBottomWidth']: 3, [esq ? 'borderLeftWidth' : 'borderRightWidth']: 3,
        [`border${topo ? 'Top' : 'Bottom'}${esq ? 'Left' : 'Right'}Radius`]: 8,
      }} />
    );
  };
  const contador = (n: number, estilo: object) => (
    <Animated.Text key={n} style={[{ position: 'absolute', right: 0, top: 0, fontSize: 13, fontWeight: '700', color: PC.pink }, estilo]}>{n}</Animated.Text>
  );
  const prodImg = (fonte: number, estilo: object) => (
    <Animated.Image source={fonte} style={[{ position: 'absolute', left: 30, top: 22, width: 90, height: 136, borderRadius: 14 }, estilo]} resizeMode="cover" />
  );
  const linhaScan = (estilo: object, key: string) => (
    <Animated.View key={key} style={[{
      position: 'absolute', left: 8, right: 8, top: 0, height: 3, borderRadius: 2, backgroundColor: PC.pink,
      shadowColor: PC.pink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 9,
    }, estilo]} />
  );
  const flashV = (estilo: object, key: string) => (
    <Animated.View key={key} style={[{ position: 'absolute', left: 14, top: 14, right: 14, bottom: 14, borderRadius: 16, backgroundColor: '#FFFFFF' }, estilo]} />
  );
  const mais20 = (estilo: object, key: string) => (
    <Animated.View key={key} style={[{
      position: 'absolute', left: 104, top: -14, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: PC.pink,
      justifyContent: 'center', shadowColor: PC.pink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 9,
    }, estilo]}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>+{PONTOS_POR_FOTO}</Text>
    </Animated.View>
  );
  const lugar = (rotulo: string, conteudo: React.ReactNode) => (
    <View key={rotulo} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#F4A9CB' }}>
        {conteudo}
      </View>
      <Text style={{ fontSize: 11, fontWeight: '600', color: PC.body }}>{rotulo}</Text>
    </View>
  );
  const noLugar = { position: 'absolute' as const, left: -1.5, top: -1.5, width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: PC.pink, overflow: 'hidden' as const };

  return (
    <View style={{ marginTop: 24, width: 320, height: 370, borderRadius: 30, backgroundColor: PC.blush, overflow: 'hidden', alignSelf: 'center' }}>
      {/* Selo NIKS Points */}
      <View style={{
        position: 'absolute', right: 14, top: 14, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#FFFFFF',
        flexDirection: 'row', alignItems: 'center', gap: 6,
        shadowColor: PC.pink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 8,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: PC.sub }}>NIKS Points</Text>
        <View style={{ width: 22, height: 16 }}>
          {contador(0, c0)}{contador(20, c20)}{contador(40, c40)}{contador(60, c60)}
        </View>
      </View>

      {/* Palco do scan */}
      <View style={{ position: 'absolute', left: 85, top: 62, width: 150, height: 180 }}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 150, height: 180 }, moldura]}>
          {canto('tl')}{canto('tr')}{canto('bl')}{canto('br')}
        </Animated.View>
        {prodImg(GEL, a.prod)}
        {prodImg(SERUM, b.prod)}
        <Animated.View style={[{ position: 'absolute', left: 38, top: 22, width: 74, height: 136, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#F6DCCB' }, c.prod]}>
          <LinearGradient colors={[...PROTETOR]} locations={[...PROTETOR_STOPS]} style={{ flex: 1, alignItems: 'center', paddingTop: 25 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: '#C98A63' }}>FPS 50</Text>
          </LinearGradient>
        </Animated.View>
        {flashV(a.flash, 'f1')}{flashV(b.flash, 'f2')}{flashV(c.flash, 'f3')}
        {linhaScan(a.scan, 's1')}{linhaScan(b.scan, 's2')}{linhaScan(c.scan, 's3')}
        {mais20(a.pts, 'p1')}{mais20(b.pts, 'p2')}{mais20(c.pts, 'p3')}
      </View>

      {/* Bandeja: Limpeza · Sérum · Protetor */}
      <View style={{
        position: 'absolute', left: 20, right: 20, bottom: 18, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 10,
        flexDirection: 'row', gap: 8, shadowColor: PC.pink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 8,
      }}>
        {lugar(t('Limpeza'), <Animated.Image source={GEL} style={[noLugar, a.slot]} resizeMode="cover" />)}
        {lugar(t('Sérum'), <Animated.Image source={SERUM} style={[noLugar, b.slot]} resizeMode="cover" />)}
        {lugar(t('Protetor'), (
          <Animated.View style={[noLugar, c.slot]}>
            <LinearGradient colors={[...PROTETOR]} locations={[...PROTETOR_STOPS]} style={{ flex: 1 }} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

export default function PcCriarRotina() {
  const router = useRouter();
  const { top, bottom } = usePcFrame();

  const escanear = () => {
    useLote.getState().limpar();
    usePosCompraV2.setState({ fotos: 0 });
    router.push('/(scan)/pc-camera' as any);
  };

  const semProdutos = () => {
    haptics.tap();
    escolherSemProdutos();
    router.push('/(onboarding)/pc-gerando' as any);
  };

  return (
    <BvScreen fundo={<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />}>
      <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 24, alignItems: 'center' }}>
        <Palco />
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, color: PC.ink, textAlign: 'center' }}>
          {t('Vamos ver o que você já tem')}
        </Text>
        <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, color: PC.body, textAlign: 'center' }}>
          {t('Escaneie os produtos que você tem em casa. A gente monta sua rotina com eles, e cada um vale +{{n}} NIKS Points.', { n: PONTOS_POR_FOTO })}
        </Text>
        <PcBotao label={t('Escanear meus produtos')} onPress={escanear} style={{ marginTop: 28, alignSelf: 'stretch' }} />
        <TouchableOpacity
          onPress={semProdutos}
          accessibilityRole="button"
          style={{ marginTop: 8, height: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: PC.sub }}>{t('Não tenho produtos agora')}</Text>
        </TouchableOpacity>
      </View>
    </BvScreen>
  );
}
