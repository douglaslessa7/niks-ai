import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import BalancedText from '../../components/BalancedText';
import { useObName } from '../../components/onboarding/kit';
import { PRIMEIRA } from '../../components/onboarding/personalizacao';

// Onboarding — transição da personalização (04/nov/2026), logo depois do "Seu caminho":
// "Agora vamos personalizar sua rotina, <nome>." no estilo da "Calma, <nome>."
// (`(scan)/solucao.tsx`): mesmo fundo rosa, texto branco em negrito no mesmo lugar, mesma
// animação e o branco cobrindo o rosa no fim. Sem botão: com o branco cheio, segue sozinha para
// a 1ª pergunta (`(scan)/pergunta`, ordem em `components/onboarding/personalizacao.ts`).
//
// Os MESMOS tempos e curvas da "Calma": o texto entra aos 150 ms (esmaece e sobe 8 pt em
// 300 ms) e, aos 2,3 s, o branco cobre o rosa em 500 ms (≈ 2,5 s de texto na tela).
// "Reduzir movimento": só esmaecimento (sem subir). Sem voltar (o gesto está desligado no
// `(scan)/_layout`; o voltar do Android não faz nada).
const T = { texto: 150, branco: 2300 };
const EO = Easing.bezier(0.23, 1, 0.32, 1);           // ease-out forte
const BRANCO_CURVA = Easing.inOut(Easing.quad);

export default function Personalizar() {
  const router = useRouter();
  const nome = useObName();
  const { height: H } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [barraEscura, setBarraEscura] = useState(false);

  const texto = useSharedValue(0);
  const branco = useSharedValue(0);

  const foi = useRef(false);
  const irParaPerguntas = () => {
    if (foi.current) return;
    foi.current = true;
    router.replace({ pathname: '/(scan)/pergunta', params: { q: PRIMEIRA } } as any);
  };

  useEffect(() => {
    texto.set(withDelay(T.texto, withTiming(1, { duration: 300, easing: EO })));
    branco.set(withDelay(T.branco, withTiming(1, { duration: 500, easing: BRANCO_CURVA }, (ok) => {
      'worklet';
      if (ok) scheduleOnRN(irParaPerguntas);
    })));
    // A barra de status troca para escura no meio do branco (as perguntas são claras).
    const t = setTimeout(() => setBarraEscura(true), T.branco + 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const textoStyle = useAnimatedStyle(() => ({
    opacity: texto.get(), transform: [{ translateY: reduce ? 0 : (1 - texto.get()) * 8 }],
  }));
  const brancoStyle = useAnimatedStyle(() => ({ opacity: branco.get() }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.fundo]}>
      <StatusBar style={barraEscura ? 'dark' : 'light'} />
      <Animated.View pointerEvents="none" style={[styles.bloco, { top: H / 2 - 56 }, textoStyle]}>
        <BalancedText
          text={nome ? `Agora vamos personalizar sua rotina, ${nome}.` : 'Agora vamos personalizar sua rotina.'}
          style={styles.frase}
        />
      </Animated.View>
      {/* O branco da 1ª pergunta chegando por cima do rosa */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }, brancoStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // O MESMO fundo da "Calma" (`(scan)/solucao.tsx`) e da carta no onboarding (`fundoOb`).
  fundo: {
    backgroundColor: '#FF5EA8',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 46%, #FF8DC3 0%, #FF5EA8 52%, #EC4895 100%)',
  },
  bloco: { position: 'absolute', left: 32, right: 32, alignItems: 'center' },
  // Os mesmos textos brancos da "Calma".
  frase: { textAlign: 'center', fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: '#FFFFFF' },
});
