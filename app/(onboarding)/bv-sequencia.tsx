import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useOnMount } from '../../components/onboarding/kit';
import { useAppStore } from '../../store/onboarding';
import { sessionDate } from '../../lib/routineProgress';
import { boasVindasAtual, setLembreteBoasVindas } from '../../lib/boasVindas';
import {
  BV, BvScreen, BolhaBranca, BvProgresso, BvBotao, useBvFrame, diaSemanaCurto,
} from '../../components/boasVindas/kit';

// Boas-vindas · tela 7 "Sequência" (frame "07"). A semana é a de verdade (segunda → domingo,
// dia que vira às 04:00): hoje rosa com "1", amanhã tracejado com "2". O card é o skincare
// matinal de AMANHÃ, no horário que ela escolheu; o número de passos vem da rotina pré-gerada
// (se ainda não chegou, o do design). A sequência de 1 dia é gravada DE VERDADE no servidor
// depois do cadastro (`lib/boasVindas.ts`).
// ⚠️ PROVISÓRIO (copiado do design): "Hoje você fez mais do que 80% de quem acabou de
// assinar." não vem de dado nenhum; o interruptor "Me lembrar" só guarda a escolha — os
// lembretes locais continuam sendo agendados pela home de qualquer jeito.
const LETRAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const PASSOS_PROVISORIO = 4;
const MOLA = Easing.bezier(0.23, 1, 0.32, 1);

export default function BvSequencia() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y } = useBvFrame();
  const manha = useAppStore((s) => {
    const v = s.onboarding.rotina_manha_horario;
    return v && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5).padStart(5, '0') : '07:30';
  });
  const passos = useAppStore((s) => (s.prefetchedProtocol?.result ?? s.protocolResult)?.morning?.length || PASSOS_PROVISORIO);
  const [lembrar, setLembrar] = useState(boasVindasAtual().lembrete);
  useOnMount(() => track('boas_vindas_tela', { tela: 7, nome: 'sequencia' }));

  const hoje = sessionDate();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const idxHoje = (hoje.getDay() + 6) % 7; // segunda = 0

  const alternar = () => {
    haptics.select();
    const v = !lembrar;
    setLembrar(v);
    setLembreteBoasVindas(v);
    track('boas_vindas_lembrete', { ativo: v });
  };
  const bolinha = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(lembrar ? 20 : 0, { duration: 260, easing: MOLA }) }],
  }), [lembrar]);

  return (
    <BvScreen>
      <BolhaBranca size={620} left={-330} top={360} />
      <BvProgresso feitas={6} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(120), alignItems: 'center', paddingHorizontal: 20 }}>
        <View style={{
          width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          shadowColor: BV.pink, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.28, shadowRadius: 20,
        }}>
          <Svg width={64} height={64} viewBox="0 0 24 24">
            <Defs>
              <LinearGradient id="fl7" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FF8CC0" />
                <Stop offset="1" stopColor={BV.pink} />
              </LinearGradient>
            </Defs>
            <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="url(#fl7)" />
          </Svg>
        </View>

        <Text style={{ marginTop: 26, textAlign: 'center', fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2, color: BV.ink }}>
          Sequência de 1 dia
        </Text>
        <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 16, lineHeight: 22, letterSpacing: -0.2, color: BV.body }}>
          Hoje você fez mais do que 80% de quem acabou de assinar.
        </Text>

        <View style={{ marginTop: 26, width: '100%', flexDirection: 'row' }}>
          {LETRAS.map((l, i) => {
            const eHoje = i === idxHoje;
            const eAmanha = i === idxHoje + 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: eHoje ? '800' : '500', color: eHoje ? BV.pink : BV.sub }}>{l}</Text>
                <View style={[{
                  width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: eHoje ? BV.pink : eAmanha ? 'transparent' : 'rgba(255,255,255,0.6)',
                }, eHoje && { shadowColor: BV.pink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 7 }]}>
                  {eAmanha && (
                    <Svg width={38} height={38} style={{ position: 'absolute' }}>
                      <Circle cx={19} cy={19} r={18.25} fill="rgba(255,255,255,0.6)" stroke={BV.pink} strokeWidth={1.5} strokeDasharray="4 3" />
                    </Svg>
                  )}
                  {(eHoje || eAmanha) && (
                    <Text style={{ fontSize: 15, fontWeight: '700', color: eHoje ? '#FFFFFF' : BV.pink }}>{eHoje ? '1' : '2'}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{
          marginTop: 22, width: '100%', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.85)',
          paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14,
          shadowColor: '#C0206A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 12,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: BV.sub }}>{`AMANHÃ · ${diaSemanaCurto(amanha)}`}</Text>
          <Text style={{ marginTop: 4, fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: BV.ink }}>
            {`Skincare matinal · ${passos} ${passos === 1 ? 'passo' : 'passos'}`}
          </Text>
          <View style={{ marginTop: 14, marginBottom: 12, height: 1, backgroundColor: BV.line }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, letterSpacing: -0.2, color: BV.ink }}>
              {'Me lembrar às '}<Text style={{ fontWeight: '700' }}>{manha}</Text>
            </Text>
            <Pressable
              onPress={alternar}
              accessibilityRole="switch"
              accessibilityState={{ checked: lembrar }}
              accessibilityLabel={`Me lembrar às ${manha}`}
              hitSlop={8}
              style={{ width: 51, height: 31, borderRadius: 16, backgroundColor: lembrar ? BV.pink : 'rgba(18,18,18,0.12)' }}
            >
              <Animated.View style={[{
                position: 'absolute', top: 2, left: 2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#FFFFFF',
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 3,
              }, bolinha]} />
            </Pressable>
          </View>
        </View>
      </View>

      <BvBotao label="Proteger minha sequência" onPress={() => router.push('/(onboarding)/bv-nivel' as any)} />
    </BvScreen>
  );
}
