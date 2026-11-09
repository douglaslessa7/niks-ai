import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';
import BalancedText from '../../components/BalancedText';

// Onboarding — transição da demonstração do scan de produto (04/nov/2026), logo depois da
// pergunta da água; substituiu as 2 telas de preparação (educação + apresentação), a pedido do
// produto. No estilo da "Calma, <nome>." (`(scan)/solucao.tsx`): mesmo fundo rosa, texto branco
// em negrito centrado, duas frases em sequência, vibração leve na 2ª e, no fim, o fundo do scan
// cobrindo o rosa → o scan interativo (`(scan)/demo-scan`, que entra sem animação: a troca não
// aparece). Sem botão, sem voltar, sem avanço por toque.
//
// Linha do tempo (ms desde a montagem):
//      150–450   frase 1 aparece (esmaece e sobe 8 pt) — fica ≈ 2,6 s (são duas orações)
//     2750–3000  some
//     3000–3350  frase 2 aparece + vibração leve no 1º quadro — fica ≈ 1,9 s
//     4900–5400  o fundo do scan cobre o rosa → scan
// "Reduzir movimento": os mesmos tempos, só esmaecimento. Saiu do app e voltou: vai direto ao scan.
const T = {
  frase1: { entra: 150, sai: 2750 },
  frase2: 3000,
  cobre: 4900,
};
const ENTRA = 300;
const SAI = 250;
const EO = Easing.bezier(0.23, 1, 0.32, 1);           // ease-out forte
const COBRE_CURVA = Easing.inOut(Easing.quad);

const FRASE_1 = 'Nem todo produto serve para a sua pele. Alguns podem até estar te fazendo mal.';
const FRASE_2 = 'O NIKS analisa cada um para você.';

export default function DemoTransicao() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [barraEscura, setBarraEscura] = useState(false);

  const f1 = useSharedValue(0);
  const f2 = useSharedValue(0);
  const cobre = useSharedValue(0);

  const foi = useRef(false);
  const irParaScan = () => {
    if (foi.current) return;
    foi.current = true;
    router.replace('/(scan)/demo-scan' as any);
  };
  const vibrar = () => haptics.tap();

  useEffect(() => {
    f1.set(withSequence(
      withDelay(T.frase1.entra, withTiming(1, { duration: ENTRA, easing: EO })),
      withDelay(T.frase1.sai - T.frase1.entra - ENTRA, withTiming(0, { duration: SAI, easing: EO })),
    ));
    // A vibração sai no mesmo quadro em que a 2ª frase começa a aparecer.
    f2.set(withDelay(T.frase2, withSequence(
      withTiming(0, { duration: 0 }, (ok) => {
        'worklet';
        if (ok) scheduleOnRN(vibrar);
      }),
      withTiming(1, { duration: 350, easing: EO }),
    )));
    cobre.set(withDelay(T.cobre, withTiming(1, { duration: 500, easing: COBRE_CURVA }, (ok) => {
      'worklet';
      if (ok) scheduleOnRN(irParaScan);
    })));
    // A barra de status troca para escura no meio da troca (o scan é claro).
    const t = setTimeout(() => setBarraEscura(true), T.cobre + 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let saiu = false;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') saiu = true;
      else if (s === 'active' && saiu) irParaScan();
    });
    return () => sub.remove();
  }, []);

  const f1Style = useAnimatedStyle(() => ({
    opacity: f1.get(), transform: [{ translateY: reduce ? 0 : (1 - f1.get()) * 8 }],
  }));
  const f2Style = useAnimatedStyle(() => ({
    opacity: f2.get(), transform: [{ translateY: reduce ? 0 : (1 - f2.get()) * 8 }],
  }));
  const cobreStyle = useAnimatedStyle(() => ({ opacity: cobre.get() }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.fundo]}>
      <StatusBar style={barraEscura ? 'dark' : 'light'} />
      <Animated.View pointerEvents="none" style={[styles.bloco, f1Style]}>
        <BalancedText text={FRASE_1} style={styles.frase} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.bloco, f2Style]}>
        <BalancedText text={FRASE_2} style={styles.frase} />
      </Animated.View>
      {/* O fundo do scan (`demo-scan`) chegando por cima do rosa */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fundoScan, cobreStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // O MESMO fundo da "Calma" (`(scan)/solucao.tsx`) e da carta no onboarding (`fundoOb`).
  fundo: {
    backgroundColor: '#FF5EA8',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 46%, #FF8DC3 0%, #FF5EA8 52%, #EC4895 100%)',
  },
  // As duas frases no mesmo lugar: centradas, um pouco acima do meio (como na "Calma").
  bloco: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 60 },
  // Os mesmos textos brancos da "Calma".
  frase: { textAlign: 'center', fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: '#FFFFFF' },
  // O MESMO fundo neutro do scan (`demo-scan`, sem foto) — a troca de tela não aparece.
  fundoScan: {
    backgroundColor: '#ECE6E9',
    experimental_backgroundImage: 'linear-gradient(180deg, #F5F1F3 0%, #E6DFE3 100%)',
  },
});
