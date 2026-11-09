import { useAcesso } from '../../lib/acesso';
import { useFaceScan } from '../../hooks/useFaceScan';
import { useEffect } from 'react';
import { View, Text, AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useObName, useOnMount } from '../../components/onboarding/kit';
import {
  BV, BvScreen, BolhaRadial, BvEtiqueta, BvTitulo, BvBotao, LOGO_ROSA, useBvFrame,
} from '../../components/boasVindas/kit';
import Medalha from '../../components/medalhas/Medalha';
import { medalhaDoNivel, NIVEL_MAXIMO } from '../../lib/niveis';

// Boas-vindas · tela 8 "Você deu o primeiro passo" (frame "08"). Desde 08/nov/2026 (pedido do
// produto) mostra a MEDALHA Bronze 2 desbloqueada (`components/medalhas/Medalha`, desenho do
// NiksMolduras 3a) no lugar da carta "NÍVEL 2 · Hidratadinha". A medalha entra de 0,7 → 1
// (520 ms, bezier(.23,1,.32,1)), com vibração no pouso. O Bronze 2 é DE VERDADE: os +100 NIKS
// Points da tela 6 são exatamente o que ele pede (curva em lib/niveis.ts), creditados depois do
// cadastro.
// A escada é de 1 MÊS, pela curva nova com 45 NIKS Points/dia + os 100 das boas-vindas:
// Bronze 3 na semana 1 (dia 4), Prata 2 na 2 (dia 14), Prata 3 na 3 (dia 20) e Ouro 1 na 4
// (dia 29). 5 degraus (decisão do produto, 08/nov/2026): a Prata 1 (dia 8) fica de fora.
// Mudou a curva, refaça a conta.
// "Entrar no app" → cadastro (tela 9, o cadastro de sempre com o fundo da home).
const POP = Easing.bezier(0.23, 1, 0.32, 1);
const NIVEL_AQUI = 2;   // Bronze 2
const TRILHA = [
  { nivel: 2, quando: 'você' },
  { nivel: 3, quando: 'sem 1' },
  { nivel: 5, quando: 'sem 2' },
  { nivel: 6, quando: 'sem 3' },
  { nivel: 7, quando: 'sem 4' },
];

export default function BvNivel() {
  const { startFaceScan } = useFaceScan();
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { y } = useBvFrame();
  const pop = useSharedValue(0);
  const aqui = medalhaDoNivel(NIVEL_AQUI);
  const proxima = medalhaDoNivel(NIVEL_AQUI + 1);
  useOnMount(() => track('boas_vindas_tela', { tela: 8, nome: 'nivel' }));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
      if (reduzir) { pop.value = 1; return; }
      pop.value = withDelay(120, withTiming(1, { duration: 520, easing: POP }));
      setTimeout(() => haptics.impact(), 120 + 260);
    });
  }, []);

  const carta = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [{ scale: 0.7 + 0.3 * pop.value }],
  }));

  return (
    <BvScreen>
      <BolhaRadial id="bv8" size={520} left={-53} top={120}
        stops={[{ offset: 0, color: '#FFFFFF', opacity: 0.8 }, { offset: 1, color: '#FFFFFF', opacity: 0 }]} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(92), alignItems: 'center', paddingHorizontal: 20 }}>
        <BvEtiqueta>{name ? `PARABÉNS, ${name.toUpperCase()}` : 'PARABÉNS'}</BvEtiqueta>
        <BvTitulo center style={{ marginTop: 10 }}>Você deu o primeiro passo.</BvTitulo>

        {/* A medalha Bronze 2 (o desenho tem sombra e brilho próprios). */}
        <Animated.View style={[{ marginTop: 26, width: 190, height: 190 }, carta]}>
          <Medalha nivel={NIVEL_AQUI} tamanho={190} />
        </Animated.View>

        <Text style={{ marginTop: 14, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: BV.sub }}>MEDALHA DESBLOQUEADA</Text>
        <Text style={{ marginTop: 4, fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2, color: aqui.cor }}>{aqui.nome}</Text>
        <Text style={{ marginTop: 4, fontSize: 15, color: BV.body }}>
          {`Nível ${NIVEL_AQUI} de ${NIVEL_MAXIMO} · próximo: `}<Text style={{ fontWeight: '700', color: BV.ink }}>{proxima.nome}</Text>
        </Text>

        <View style={{
          marginTop: 22, width: '100%', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.85)',
          paddingVertical: 14, paddingHorizontal: 12,
          shadowColor: '#C0206A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 12,
        }}>
          <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: BV.sub }}>ATÉ ONDE VOCÊ PODE CHEGAR</Text>
          <View style={{ marginTop: 14, flexDirection: 'row' }}>
            <View style={{ position: 'absolute', left: `${50 / TRILHA.length}%`, right: `${50 / TRILHA.length}%`, top: 21, height: 2, backgroundColor: 'rgba(255,94,168,0.18)' }} />
            {TRILHA.map((p, i) => {
              const m = medalhaDoNivel(p.nivel);
              const atual = i === 0;
              return (
                <View key={p.nivel} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 44, height: 44, opacity: atual ? 1 : 0.55 }}>
                    <Medalha nivel={p.nivel} tamanho={44} />
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={{ alignSelf: 'stretch', paddingHorizontal: 1, fontSize: 11, lineHeight: 13, fontWeight: '700', textAlign: 'center', color: atual ? m.cor : BV.body }}
                  >{m.nome}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: atual ? BV.pink : BV.sub }}>{p.quando}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <BvBotao label="Entrar no app" onPress={() => {
        track('boas_vindas_concluidas');
        if (useAcesso.getState().boasVindasEx) {
          // Ex-convidada: já tem conta. Vai direto ao scan novo; a rotina sai dele.
          useAcesso.setState({ boasVindasEx: false });
          router.replace('/(app)/home' as any);
          setTimeout(startFaceScan, 400);
          return;
        }
        router.replace('/(onboarding)/signup');
      }} />
    </BvScreen>
  );
}
