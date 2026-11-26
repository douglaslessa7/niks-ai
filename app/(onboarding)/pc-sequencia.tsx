import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { t, emIngles } from '../../lib/i18n';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import { sessionDate } from '../../lib/routineProgress';
import { boasVindasAtual } from '../../lib/boasVindas';
import { BvScreen } from '../../components/boasVindas/kit';
import { PC, PcBotao, usePcFrame } from '../../components/posCompra/pcKit';

// Pós-compra v2 · tela 10 "Sequência de 1 dia" (design-handoff/pos-compra-v2/10-sequencia.html).
// A chama com o "1", a semana a partir de HOJE (dia que vira às 04:00) com o 1º dia aceso na
// barra, e o lembrete de amanhã no horário da manhã que ela escolheu (só se o "Me lembrar" da
// tela 5 ficou marcado). A sequência de 1 dia é gravada DE VERDADE no servidor depois do
// cadastro (`lib/boasVindas.ts`).
const DIAS = emIngles ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TINTA = '#2B2B33';
const LINHA = '#ECE4E8';

export default function PcSequencia() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { top, bottom } = usePcFrame();
  const manha = useAppStore((s) => {
    const v = s.onboarding.rotina_manha_horario;
    return v && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5).padStart(5, '0') : '07:30';
  });
  const [lembrar] = useState(() => boasVindasAtual().lembrete);
  const hoje = sessionDate().getDay();
  const semana = Array.from({ length: 7 }, (_, i) => DIAS[(hoje + i) % 7]);

  const ponto = (left: number, topo: number, d: number) => (
    <View key={`${left}-${topo}`} style={{ position: 'absolute', left, top: topo, width: d, height: d, borderRadius: d / 2, backgroundColor: '#FF8CC2' }} />
  );

  return (
    <BvScreen fundo={<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />}>
      <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 20, alignItems: 'center' }}>
        <View style={{ marginTop: 50, width: 200, height: 222 }}>
          {ponto(104, 0, 5)}{ponto(124, 10, 8)}{ponto(100, 24, 3)}{ponto(62, 54, 7)}
          <Svg width={104} height={120} viewBox="5 1.5 14 17.5" style={{ position: 'absolute', left: 48, top: 36 }}>
            <Path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.3-5 .2 1.6 1 2.8 2.2 3.3C11 8.5 11.3 5 12 2z" fill={PC.pink} />
            <Path d="M12 10.6c.7 1.9 2.8 3.1 2.8 5.4a2.8 2.8 0 0 1-5.6 0c0-1.7 1.5-3 2.8-5.4z" fill="#FFC6DF" />
          </Svg>
          {/* "1" com contorno branco por baixo (o `paint-order: stroke` do design) */}
          <Svg width={200} height={90} viewBox="0 0 200 90" style={{ position: 'absolute', left: 0, top: 132 }}>
            <SvgText x={100} y={80} textAnchor="middle" fontSize={88} fontWeight="700" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={10} strokeLinejoin="round">1</SvgText>
            <SvgText x={100} y={80} textAnchor="middle" fontSize={88} fontWeight="700" fill={TINTA}>1</SvgText>
          </Svg>
        </View>

        <Text style={{ marginTop: 14, fontSize: 24, fontWeight: '700', color: TINTA }}>{t('Sequência de 1 dia')}</Text>

        <View style={{ marginTop: 26, alignSelf: 'stretch', borderWidth: 1.5, borderColor: LINHA, borderRadius: 18, overflow: 'hidden' }}>
          <View style={{ paddingTop: 20, paddingHorizontal: 22, paddingBottom: 22, gap: 16 }}>
            <View style={{ flexDirection: 'row' }}>
              {semana.map((d, i) => (
                <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: i === 0 ? '800' : '600', color: i === 0 ? TINTA : '#B6ADB2' }}>{t(d)}</Text>
              ))}
            </View>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: LINHA }}>
              <View style={{
                width: '13%', height: 12, borderRadius: 6,
                shadowColor: PC.pink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 9,
              }}>
                <LinearGradient colors={['#FF8CC2', PC.pink]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 6 }} />
              </View>
            </View>
          </View>
          <View style={{ borderTopWidth: 1.5, borderTopColor: LINHA, paddingVertical: 18, paddingHorizontal: 22 }}>
            <Text style={{ fontSize: 15, lineHeight: 21, textAlign: 'center', color: TINTA }}>
              {t('Parabéns, você começou sua sequência. Continue assim!')}
            </Text>
          </View>
        </View>

        {lembrar && (
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={PC.pink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </Svg>
            <Text style={{ fontSize: 13, color: PC.sub }}>{t('Te lembro amanhã às {{hora}}', { hora: manha })}</Text>
          </View>
        )}

        <View style={{ flex: 1 }} />
        <PcBotao
          label={t('Estou comprometida')}
          style={{ alignSelf: 'stretch' }}
          onPress={() => {
            track('boas_vindas_sequencia', { fluxo: 'pos_compra_v2', lembrete: lembrar });
            router.push('/(onboarding)/pc-tudo-pronto' as any);
          }}
        />
      </View>
    </BvScreen>
  );
}
