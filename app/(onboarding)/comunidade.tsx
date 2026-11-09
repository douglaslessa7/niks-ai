import { Image, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import {
  OB, ObHeader, ObPillButton, OB_BOTAO_H, ObScreen, ObSubtitle, ObTitle, useObFrame,
} from '../../components/onboarding/kit';
import { DEPOIMENTOS, type Depoimento } from '../../components/onboarding/depoimentos';

// Onboarding — "Comunidade" (prova social, 04/nov/2026, pedido do produto), depois das
// notificações. Layout da tela "Comunidade" do Tapfit (`~/Downloads/Captura de Tela
// 2026-11-04 à(s) 16.09.21.png`) na identidade das perguntas do onboarding (kit): fundo
// branco, "COMUNIDADE" pequeno e espaçado na linha do voltar (como o "SUA EVOLUÇÃO"),
// título e subtítulo do kit, 3 cards no cinza das opções (`OB.option`, raio 12, 17 pt das
// laterais, 8 pt entre eles) com avatar (a foto dela num círculo de 44; sem foto, círculo
// rosa com a inicial), nome, 5 estrelas rosa e o
// depoimento entre aspas, e o botão rosa "Montar minha rotina". Rola se não couber
// (iPhone SE), com a faixa branca do topo por cima, como nas perguntas.
//
// Os depoimentos vêm de `components/onboarding/depoimentos.ts` (os 3 enviados pelo produto em
// 04/nov/2026; antes eram textos de exemplo). Sem selo de verificado. O "Mais de 200 mil mulheres" é o número que o
// produto informou (o "237.887 mulheres" da rotina pronta; fonte fora do banco do app) —
// confirmar antes de ir ao ar.
//
// "Montar minha rotina" → rotina pronta v2 (`rotina-pronta-v2.tsx`), que leva ao paywall.
// O compromisso (segurar a digital) SAIU do onboarding em 07/nov/2026 (pedido do produto): o
// gesto ficou só no fluxo pós-compra, no pacto (`bv-pacto.tsx`). De 04 a 07/nov ia ao
// compromisso. Sem passo no Mixpanel.

const ESTRELA = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

export default function Comunidade() {
  const router = useRouter();
  const { y, buttonBottom } = useObFrame();

  const montar = () => {
    haptics.action();
    router.push('/(onboarding)/rotina-pronta-v2' as any);
  };

  return (
    <ObScreen>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(118), paddingBottom: buttonBottom + OB_BOTAO_H + 24 }}
      >
        <ObTitle>Mais de 200 mil mulheres</ObTitle>
        <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>estão usando o NIKS no mundo todo.</ObSubtitle>
        <View style={{ marginTop: 22, marginHorizontal: 17, gap: 8 }}>
          {DEPOIMENTOS.map((d, i) => <CardDepoimento key={i} d={d} />)}
        </View>
      </ScrollView>

      <ObHeader onBack={() => router.back()} backdrop={OB.bg} />
      <Text
        pointerEvents="none"
        style={{
          position: 'absolute', left: 0, right: 0, top: y(74), zIndex: 11, textAlign: 'center',
          fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub,
        }}
      >
        COMUNIDADE
      </Text>
      <ObPillButton label="Montar minha rotina" width={232} bottom={buttonBottom} onPress={montar} />
    </ObScreen>
  );
}

function CardDepoimento({ d }: { d: Depoimento }) {
  const inicial = d.nome.trim().charAt(0).toUpperCase();
  return (
    <View style={{ backgroundColor: OB.option, borderRadius: 12, paddingHorizontal: 19, paddingTop: 18, paddingBottom: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Avatar: a foto dela num círculo de 44; sem foto, círculo rosa com a inicial */}
        {d.foto ? (
          <Image source={d.foto} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: OB.wash }} />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: OB.pink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: '#FFFFFF' }}>{inicial}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: OB.ink }}>{d.nome}</Text>
          <Estrelas n={d.estrelas} />
        </View>
      </View>
      <Text style={{ fontSize: 16, lineHeight: 22, color: OB.ink }}>{`“${d.texto}”`}</Text>
    </View>
  );
}

function Estrelas({ n }: { n: number }) {
  return (
    <View accessible accessibilityLabel={`${n} de 5 estrelas`} style={{ flexDirection: 'row', gap: 2 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Svg key={i} width={14} height={14} viewBox="0 0 24 24">
          <Path d={ESTRELA} fill={i < n ? OB.pink : OB.track} />
        </Svg>
      ))}
    </View>
  );
}
