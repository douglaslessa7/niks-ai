import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';
import BalancedText from '../../components/BalancedText';
import { useObName } from '../../components/onboarding/kit';

// Onboarding — "Calma, <nome>." (04/nov/2026): entre a carta revelada ("Quero resolver
// isso") e o "Seu caminho". Sem botão, sem voltar, sem avanço por toque: segue sozinha.
// O fundo é o MESMO degradê rosa da carta, e a tela entra sem animação (`animation: 'none'`
// no `(scan)/_layout`) depois que a carta cobriu o próprio conteúdo com esse rosa — a troca
// não aparece. No fim, o branco cobre o rosa e o "Seu caminho" entra esmaecendo, de branco
// para branco.
//
// Linha do tempo (ms desde a montagem):
//     150–450   "Calma, <nome>." aparece (esmaece e sobe 8 pt)
//    1350–1600  some  (≈ 1,2 s na tela)
//    1600–1950  "Nós temos a solução para a sua pele." aparece + vibração leve no 1º quadro
//    3200–3700  o branco cobre o rosa  (a 2ª frase fica ≈ 1,6 s na tela) → "Seu caminho"
// Sem a logo do NIKS (tirada a pedido do produto, 04/nov/2026): só as duas frases.
// "Reduzir movimento": os mesmos tempos, só com esmaecimento (sem subir).
// Saiu do app e voltou (segundo plano → ativo): vai direto para o "Seu caminho".
const T = {
  frase1: { entra: 150, sai: 1350 },
  frase2: 1600,
  branco: 3200,
};
const ENTRA = 300;
const SAI = 250;
const EO = Easing.bezier(0.23, 1, 0.32, 1);           // ease-out forte
const BRANCO_CURVA = Easing.inOut(Easing.quad);

export default function Solucao() {
  const router = useRouter();
  const nome = useObName();
  const { height: H } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [barraEscura, setBarraEscura] = useState(false);

  const f1 = useSharedValue(0);
  const f2 = useSharedValue(0);
  const branco = useSharedValue(0);

  const foi = useRef(false);
  const irParaCaminho = () => {
    if (foi.current) return;
    foi.current = true;
    router.replace('/(scan)/seu-caminho' as any);
  };
  const vibrar = () => haptics.tap();
  const escurecerBarra = () => setBarraEscura(true);

  useEffect(() => {
    f1.set(withSequence(
      withDelay(T.frase1.entra, withTiming(1, { duration: ENTRA, easing: EO })),
      withDelay(T.frase1.sai - T.frase1.entra - ENTRA, withTiming(0, { duration: SAI, easing: EO })),
    ));
    // A vibração sai no mesmo quadro em que a 2ª frase começa a aparecer.
    f2.set(withDelay(T.frase2, withTiming(1, { duration: 350, easing: EO }, (ok) => {
      'worklet';
      if (ok) scheduleOnRN(vibrar);
    })));
    branco.set(withDelay(T.branco, withTiming(1, { duration: 500, easing: BRANCO_CURVA }, (ok) => {
      'worklet';
      if (ok) scheduleOnRN(irParaCaminho);
    })));
    // A barra de status troca para escura no meio do branco (o "Seu caminho" é claro).
    const t = setTimeout(escurecerBarra, T.branco + 250);
    return () => clearTimeout(t);
  }, []);

  // Sem voltar: o voltar do Android não faz nada; o gesto está desligado no `(scan)/_layout`.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Saiu do app no meio e voltou: segue direto para o "Seu caminho" (sem repetir nada).
  useEffect(() => {
    let saiu = false;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') saiu = true;
      else if (s === 'active' && saiu) irParaCaminho();
    });
    return () => sub.remove();
  }, []);

  const sobe = 8;
  const f1Style = useAnimatedStyle(() => ({
    opacity: f1.get(), transform: [{ translateY: reduce ? 0 : (1 - f1.get()) * sobe }],
  }));
  // A 1ª frase sai só esmaecendo (o "subir" é da entrada).
  const f2Style = useAnimatedStyle(() => ({
    opacity: f2.get(), transform: [{ translateY: reduce ? 0 : (1 - f2.get()) * sobe }],
  }));
  const brancoStyle = useAnimatedStyle(() => ({ opacity: branco.get() }));

  // As frases ficam no mesmo lugar dos textos da carta (centro da tela, um pouco acima).
  const topoTexto = H / 2 - 56;

  return (
    <View style={[StyleSheet.absoluteFill, styles.fundo]}>
      <StatusBar style={barraEscura ? 'dark' : 'light'} />

      <Animated.View pointerEvents="none" style={[styles.bloco, { top: topoTexto }, f1Style]}>
        <Text style={styles.frase} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
          {nome ? `Calma, ${nome}.` : 'Calma.'}
        </Text>
      </Animated.View>

      <View pointerEvents="none" style={[styles.bloco, { top: topoTexto }]}>
        <Animated.View style={f2Style}>
          <BalancedText text="Nós temos a solução para a sua pele." style={styles.frase} />
        </Animated.View>
      </View>

      {/* O branco do "Seu caminho" chegando por cima do rosa */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }, brancoStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // O MESMO fundo da carta no onboarding (`fundoOb` em `(carta)/carta.tsx`).
  fundo: {
    backgroundColor: '#FF5EA8',
    experimental_backgroundImage: 'radial-gradient(circle at 50% 46%, #FF8DC3 0%, #FF5EA8 52%, #EC4895 100%)',
  },
  bloco: { position: 'absolute', left: 32, right: 32, alignItems: 'center' },
  // Os mesmos textos brancos da carta ("Espera, <nome>...").
  frase: { textAlign: 'center', fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: '#FFFFFF' },
});
