import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useOnMount } from '../../components/onboarding/kit';
import {
  BV, BvScreen, BolhaCanto, BvProgresso, BvEtiqueta, BvTitulo, BvBotao, useBvFrame,
  SEMANAS_ROTINA, REDUCAO_DOR_PCT, useDorPrincipal,
} from '../../components/boasVindas/kit';

// Boas-vindas · tela 2 "Rotina pronta" (frame "02"). Plano de 1 MÊS (07/nov/2026, pedido do
// produto) em torno da DOR PRINCIPAL (a mesma da carta de alerta): "4 semanas" · "2× por dia" ·
// "−40% de <dor>", e as fases semana 1 / semanas 2–3 / semana 4.
// ⚠️ PROVISÓRIO: os −40% (`REDUCAO_DOR_PCT`) não vêm de dado nenhum.
export default function BvRotina() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y } = useBvFrame();
  const dor = useDorPrincipal();
  useOnMount(() => track('boas_vindas_tela', { tela: 2, nome: 'rotina', dor: dor.problema }));

  const fases = [
    { cor: '#FFC2DB', peso: 1, titulo: 'Fase 1 · Adaptação', texto: 'Semana 1 · sua pele se acostuma aos ativos' },
    { cor: '#FF8CC0', peso: 2, titulo: 'Fase 2 · Tratamento', texto: 'Semanas 2–3 · ativos na dose certa' },
    { cor: BV.pink, peso: 1, titulo: 'Fase 3 · Resultado', texto: `Semana ${SEMANAS_ROTINA} · meta de −${REDUCAO_DOR_PCT}% de ${dor.nome}` },
  ];

  const stat = (n: string, label: string, cor: string = BV.ink) => (
    <View style={{ flex: 1, borderRadius: 18, backgroundColor: BV.card, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -1, color: cor }}>{n}</Text>
      <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13, color: BV.sub }}>{label}</Text>
    </View>
  );

  return (
    <BvScreen>
      <BolhaCanto id="bv2" />
      <BvProgresso feitas={1} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(104), paddingHorizontal: 20 }}>
        <BvEtiqueta>FEITA SÓ PRA VOCÊ</BvEtiqueta>
        <BvTitulo style={{ marginTop: 10 }}>Sua rotina está pronta.</BvTitulo>

        <View style={{ marginTop: 22, flexDirection: 'row', gap: 8 }}>
          {stat(String(SEMANAS_ROTINA), 'semanas')}
          {stat('2×', 'por dia')}
          {stat(`−${REDUCAO_DOR_PCT}%`, `de ${dor.nome}`, BV.pink)}
        </View>

        <View style={{ marginTop: 10, borderRadius: 18, backgroundColor: BV.card, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {fases.map((f) => <View key={f.titulo} style={{ flex: f.peso, height: 6, borderRadius: 3, backgroundColor: f.cor }} />)}
          </View>
          {fases.map((f, i) => (
            <View key={f.titulo}>
              {i > 0 && <View style={{ height: 1, backgroundColor: BV.line }} />}
              <View style={{ marginTop: i === 0 ? 16 : 14, flexDirection: 'row', gap: 12, paddingBottom: 14 }}>
                <View style={{ marginTop: 6, width: 9, height: 9, borderRadius: 4.5, backgroundColor: f.cor }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: BV.ink }}>{f.titulo}</Text>
                  <Text style={{ marginTop: 2, fontSize: 14, color: BV.sub }}>{f.texto}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <BvBotao label="Ver meu dia 1" onPress={() => router.push('/(onboarding)/bv-foto' as any)} />
    </BvScreen>
  );
}
