import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useObName, useOnMount } from '../../components/onboarding/kit';
import {
  BV, BvScreen, BolhaBranca, BolhaRadial, SEMANAS_ROTINA, BvEtiqueta, BvTitulo, BvBotao, LOGO_ROSA, useBvFrame,
} from '../../components/boasVindas/kit';

// Boas-vindas pós-pagamento · tela 1 "Você entrou" (design NiksBoasVindas, frame "01").
// Vem do paywall com a compra confirmada e SEM conta (`paywall-soft` › `confirmarESeguir`).
// Fluxo das 8 telas e o que é gravado: `lib/boasVindas.ts`.
// ⚠️ PROVISÓRIO (decisão do produto, 07/nov/2026: copiar o design): "Membro nº 12.408" e
// "Anual · Rotina de 4 semanas" são FIXOS — não vêm de dado nenhum (o plano pode ter sido o
// mensal). Não pode ir ao ar assim.
const MEMBRO_PROVISORIO = '225.931'; // pedido do produto, 07/nov/2026 (era 12.408 no design)
const PLANO_PROVISORIO = `Anual · Rotina de ${SEMANAS_ROTINA} semanas`; // plano de 1 mês (07/nov/2026)

export default function BvEntrou() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const { y } = useBvFrame();
  useOnMount(() => track('boas_vindas_tela', { tela: 1, nome: 'entrou' }));

  return (
    <BvScreen>
      <BolhaBranca size={620} left={-330} top={300} />
      {/* Brilho rosa saindo de TRÁS da logo (07/nov/2026, pedido do produto, no lugar dos dois
          anéis do design — referência: a tela "Você entrou" do Tapfit, com a luz atrás do
          ícone). Centro = o do círculo (y 104 + 68 do frame), 520 pt. */}
      <BolhaRadial id="bv1glow" size={520} left={393 / 2 - 260} top={104 + 68 - 260}
        stops={[
          { offset: 0, color: '#FF5EA8', opacity: 0.5 },
          { offset: 0.3, color: '#FF7EB9', opacity: 0.26 },
          { offset: 0.6, color: '#FF8CC0', opacity: 0.09 },
          { offset: 1, color: '#FFC2DB', opacity: 0 },
        ]} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(104), alignItems: 'center', paddingHorizontal: 24 }}>
        <View style={{ width: 136, height: 136, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 136, height: 136, borderRadius: 68, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
            shadowColor: BV.pink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 24,
          }}>
            <Image source={LOGO_ROSA} style={{ width: 70, height: 70 }} resizeMode="contain" />
          </View>
        </View>

        <BvEtiqueta ponto style={{ marginTop: 58 }}>ACESSO PREMIUM LIBERADO</BvEtiqueta>
        <BvTitulo center style={{ marginTop: 12 }}>
          {name ? `Você entrou pro time NIKS, ${name}.` : 'Você entrou pro time NIKS.'}
        </BvTitulo>

        <View style={{
          marginTop: 24, width: '100%', borderRadius: 18, borderWidth: 1.5, borderColor: BV.pink,
          backgroundColor: BV.card, paddingVertical: 14, paddingHorizontal: 18,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          shadowColor: BV.pink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 11,
        }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: BV.sub }}>MEMBRO Nº</Text>
            {/* 20 pt (o design tem 24; com 225.931 ficava grande no card — pedido do produto, 07/nov/2026) */}
            <Text style={{ marginTop: 4, fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: BV.ink, fontVariant: ['tabular-nums'] }}>{MEMBRO_PROVISORIO}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: BV.sub }}>PLANO</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 5, fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: BV.ink }}>{PLANO_PROVISORIO}</Text>
          </View>
        </View>
      </View>

      <BvBotao label="Ativar meu plano" onPress={() => router.push('/(onboarding)/bv-rotina' as any)} />
    </BvScreen>
  );
}
