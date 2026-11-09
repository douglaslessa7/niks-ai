import { useEffect, useState } from 'react';
import { View, Text, Image, AccessibilityInfo } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useOnMount } from '../../components/onboarding/kit';
import {
  BV, BvScreen, BolhaRadial, BvProgresso, BvEtiqueta, BvBotao, LOGO_ROSA, useBvFrame,
} from '../../components/boasVindas/kit';
import { Confete, Odometro } from '../../components/boasVindas/comemoracao';
import Medalha from '../../components/medalhas/Medalha';

// Boas-vindas · tela 6 "Recompensa" (frame "06"). É uma COMEMORAÇÃO (08/nov/2026, pedido do
// produto): ao terminar de entrar, CONFETE sai dos dois cantos de baixo (`Confete`, no lugar
// das estrelinhas do design, que saíram) com `haptics.success()`. "+100" conta de 0 a 100 em
// 1,1 s (ease-out cúbico, o `play()` do design) numa fita de números que só desliza (`Odometro`), o selo "Ponto de partida" entra aos 120 ms
// (0,6 → 1, 520 ms, bezier(.23,1,.32,1)) e a barra Bronze 1 → Bronze 2 enche junto com o número
// (os 100 pontos são exatamente a subida para o Bronze 2 na curva de lib/niveis.ts).
// "Reduzir movimento": tudo pronto, sem animar.
// Desempenho (07/nov/2026: a 1ª versão travava ao entrar — contava redesenhando a TELA INTEIRA
// pelo JS a cada quadro, enquanto ela ainda deslizava para entrar): agora tudo começa só no fim
// da transição de entrada. 08/nov/2026: o `Contador` das cartas (setState a cada número) ainda
// travava no iPhone; agora os dois números, a barra e o selo andam no thread de UI, todos do
// mesmo valor animado.
// Os +100 são creditados DE VERDADE no servidor depois do cadastro (`lib/boasVindas.ts`).
// ⚠️ A barra mostra "/ 100" como no design; na curva real o Nível 2 começa em 90.
const PONTOS = 100;
const CONTA_MS = 1100;
const POP = Easing.bezier(0.23, 1, 0.32, 1);

export default function BvRecompensa() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y } = useBvFrame();
  const navigation = useNavigation();
  const [festa, setFesta] = useState(false);   // dispara o confete
  const pop = useSharedValue(0);
  const barraV = useSharedValue(0);

  useOnMount(() => track('boas_vindas_tela', { tela: 6, nome: 'recompensa' }));

  // Começa quando a tela TERMINA de entrar (rede de segurança: 700 ms sem o evento).
  useEffect(() => {
    let foi = false;
    let t2: ReturnType<typeof setTimeout> | undefined;
    const comecar = () => {
      if (foi) return;
      foi = true;
      AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
        if (reduzir) { pop.value = 1; barraV.value = 1; return; }
        pop.value = withDelay(120, withTiming(1, { duration: 520, easing: POP }));
        barraV.value = withTiming(1, { duration: CONTA_MS, easing: Easing.out(Easing.cubic) });
        setFesta(true);
        haptics.success();
        t2 = setTimeout(() => haptics.tap(), CONTA_MS);
      });
    };
    const t = setTimeout(comecar, 700);
    const sai = navigation.addListener('transitionEnd' as never, () => { clearTimeout(t); comecar(); });
    return () => { clearTimeout(t); if (t2) clearTimeout(t2); sai(); };
  }, []);

  // Escala (não `width`): mudar a largura refaz o layout a cada quadro.
  const barra = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.0001, barraV.value) }] }));

  const selo = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [{ rotate: '45deg' }, { scale: 0.6 + 0.4 * pop.value }],
  }));

  return (
    <BvScreen>
      <BolhaRadial id="bv6" size={620} left={-114} top={60}
        stops={[
          { offset: 0, color: '#FFFFFF', opacity: 0.85 },
          { offset: 0.55, color: '#FFC8E1', opacity: 0.4 },
          { offset: 1, color: '#FFC8E1', opacity: 0 },
        ]} />
      <BvProgresso feitas={5} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(124), alignItems: 'center', paddingHorizontal: 24 }}>
        <BvEtiqueta>PACTO SELADO · DIA 1 CONCLUÍDO</BvEtiqueta>
        <View style={{ marginTop: 6, alignSelf: 'stretch' }}>
          <Odometro
            valor={barraV}
            alvo={PONTOS}
            prefixo="+"
            style={{
              fontSize: 96, lineHeight: 108, fontWeight: '800', letterSpacing: -4, color: BV.pink,
              fontVariant: ['tabular-nums'],
              textShadowColor: 'rgba(255,94,168,0.25)', textShadowOffset: { width: 0, height: 8 }, textShadowRadius: 20,
            }}
          />
        </View>
        <Text style={{ fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: BV.ink }}>NIKS Points</Text>

        {/* Sombra no de fora, recorte no de dentro (README #20: overflow corta a sombra). */}
        <Animated.View style={[{
          marginTop: 40, width: 132, height: 132, borderRadius: 34, backgroundColor: '#FBCDE5',
          shadowColor: BV.pink, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.3, shadowRadius: 20,
        }, selo]}>
          <View style={{ flex: 1, borderRadius: 34, borderWidth: 3, borderColor: '#FFFFFF', overflow: 'hidden' }}>
            <LinearGradient
              colors={['#FFE1EE', '#FBCDE5', '#EBD6FB', '#FFD9EA']} locations={[0, 0.38, 0.66, 1]}
              start={{ x: 0.25, y: 0 }} end={{ x: 0.75, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <View style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)' }} />
            <Image source={LOGO_ROSA} style={{ position: 'absolute', left: 31, top: 31, width: 64, height: 64, transform: [{ rotate: '-45deg' }] }} />
          </View>
        </Animated.View>

        <Text style={{ marginTop: 44, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: BV.sub }}>CONQUISTA DESBLOQUEADA</Text>
        <Text style={{ marginTop: 6, fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -1, color: BV.ink }}>Ponto de partida</Text>

        <View style={{ marginTop: 22, width: '100%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Medalha nivel={1} tamanho={22} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: BV.body }}>Bronze 1 → Bronze 2</Text>
            </View>
            <View style={{ width: 90 }}>
            <Odometro valor={barraV} alvo={PONTOS} sufixo={` / ${PONTOS}`} alinhar="right" style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: BV.body, fontVariant: ['tabular-nums'] }} />
            </View>
          </View>
          <View style={{ marginTop: 8, height: 10, borderRadius: 5, backgroundColor: BV.track, overflow: 'hidden' }}>
            <Animated.View style={[{ height: '100%', width: '100%', borderRadius: 5, backgroundColor: BV.pink, transformOrigin: 'left' }, barra]} />
          </View>
        </View>
      </View>

      <BvBotao label="Continuar" onPress={() => router.push('/(onboarding)/bv-sequencia' as any)} />
      <Confete disparar={festa} />
    </BvScreen>
  );
}
