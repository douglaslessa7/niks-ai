import { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useOnMount } from '../../components/onboarding/kit';
import {
  BV, BvScreen, BolhaCanto, BvProgresso, BvEtiqueta, BvTitulo, BvBotao, useBvFrame,
  SEMANAS_ROTINA, DIAS_ROTINA, REDUCAO_DOR_PCT, useDorPrincipal, dataMeta, diaMesLongo, diaMesCurto,
} from '../../components/boasVindas/kit';

// Boas-vindas · tela 4 "Projeção" (07/nov/2026, pedido do produto) na estrutura da tela 4 do
// TapFit (`~/Downloads/TapFit Boas-vindas Protótipo.dc.html`, bloco "3 · PROJEÇÃO"), nas cores
// do NIKS. SEM FOTO e sem transformação por IA.
//   • "Seguindo a rotina por 4 semanas" + "Essa é a sua pele em <hoje + 30 dias>."
//   • Dois cards lado a lado com a DOR PRINCIPAL (a da carta de alerta), com as LISTRAS
//     DIAGONAIS no fundo, como os do TapFit (`Listras`). A ALTURA de cada card é proporcional à
//     dor: "Hoje" = 100%; "<data> · sem 4" = 60% (−40%).
//   • A barra fica FIXA na semana 4 (pedido do produto: sem arrastar e sem correr sozinha).
//   • Números: "−40% <dor>" e "30 dias"; "Meta estimada. Os resultados podem variar."
// ⚠️ PROVISÓRIO: os −40% (`REDUCAO_DOR_PCT`) não vêm de dado nenhum.
const CARD_H = 250;          // altura do card "Hoje" (= 100% da dor)
const THUMB = 24;
const NIVEL_META = 100 - REDUCAO_DOR_PCT;   // 60%

// ENTRADA (07/nov/2026, pedido do produto: só ao entrar, nada depois): os blocos aparecem em
// cascata de cima para baixo (esmaecem e sobem 12 pt, 420 ms, 70 ms entre eles) e a barra
// enche UMA vez até a semana 4. Tudo no UI thread (Reanimated); "Reduzir movimento" do iOS
// desliga sozinho (as animações de entrada respeitam a opção do sistema).
const SAIDA = Easing.bezier(0.23, 1, 0.32, 1);
const entra = (i: number) => FadeInDown.duration(420).delay(120 + i * 70).easing(SAIDA).withInitialValues({ transform: [{ translateY: 12 }] });

/** Listras diagonais (135°) do fundo dos cards do TapFit: faixas de 8 pt, período de 16 pt
 *  (`repeating-linear-gradient(135deg, a 0 8px, b 8px 16px)`). Desenhadas em SVG por cima da
 *  cor de base; o card recorta (`overflow: hidden`). */
function Listras({ cor, largura = 260, altura = CARD_H }: { cor: string; largura?: number; altura?: number }) {
  const passo = 16 * Math.SQRT2;          // distância horizontal entre faixas a 45°
  const lado = largura + altura;
  let d = '';
  for (let x = -altura; x < largura + altura; x += passo) d += `M${x} 0 L${x + lado} ${lado} `;
  return (
    <Svg pointerEvents="none" width={largura} height={altura} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Path d={d} stroke={cor} strokeWidth={8} />
    </Svg>
  );
}

export default function BvProjecao() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y } = useBvFrame();
  const dor = useDorPrincipal();
  useOnMount(() => track('boas_vindas_tela', { tela: 4, nome: 'projecao', dor: dor.problema }));

  // A barra enche uma vez, junto com a cascata (depois do card da semana 4).
  const enche = useSharedValue(0);
  useEffect(() => { enche.value = withDelay(120 + 4 * 70, withTiming(1, { duration: 700, easing: SAIDA })); }, []);
  const barra = useAnimatedStyle(() => ({ width: `${enche.value * 100}%` }));
  // Os cards SOBEM: crescem de baixo para cima até a altura deles, como barras de gráfico
  // (o "Hoje" primeiro, o da semana 4 logo depois).
  const sobeHoje = useSharedValue(0);
  const sobeMeta = useSharedValue(0);
  useEffect(() => {
    sobeHoje.value = withDelay(120 + 2 * 70, withTiming(1, { duration: 650, easing: SAIDA }));
    sobeMeta.value = withDelay(120 + 4 * 70, withTiming(1, { duration: 650, easing: SAIDA }));
  }, []);
  const cardHoje = useAnimatedStyle(() => ({ height: CARD_H * sobeHoje.value, opacity: Math.min(1, sobeHoje.value * 3) }));
  const cardMeta = useAnimatedStyle(() => ({ height: CARD_H * (NIVEL_META / 100) * sobeMeta.value, opacity: Math.min(1, sobeMeta.value * 3) }));
  const bolinha = useAnimatedStyle(() => ({ opacity: enche.value > 0.95 ? 1 : enche.value }));

  const meta = dataMeta();
  const titulo = dor.nome.charAt(0).toUpperCase() + dor.nome.slice(1);
  const rotuloDireita = `${diaMesCurto(meta).toUpperCase()} · SEM ${SEMANAS_ROTINA}`;

  return (
    <BvScreen>
      <BolhaCanto id="bv4" />
      <BvProgresso feitas={3} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: y(104), paddingHorizontal: 20 }}>
        <Animated.View entering={entra(0)}>
          <BvEtiqueta>{`SEGUINDO A ROTINA POR ${SEMANAS_ROTINA} SEMANAS`}</BvEtiqueta>
        </Animated.View>
        <Animated.View entering={entra(1)}>
          <BvTitulo style={{ marginTop: 10 }}>{`Essa é a sua pele em ${diaMesLongo(meta)}.`}</BvTitulo>
        </Animated.View>

        {/* Os dois cards, alinhados embaixo; a altura é a dor (Hoje = 100%). */}
        <View style={{ marginTop: 20, height: CARD_H, flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
          <Animated.View style={[{
            flex: 1, borderRadius: 20, overflow: 'hidden', padding: 12, justifyContent: 'space-between',
            backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
          }, cardHoje]}>
            <Listras cor="rgba(192,32,106,0.045)" />
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: BV.sub }}>HOJE</Text>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: BV.body }}>{titulo}</Text>
              <Text style={{ marginTop: 2, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: BV.ink, fontVariant: ['tabular-nums'] }}>100%</Text>
            </View>
          </Animated.View>

          {/* Borda em degradê (2 pt) por fora; sombra no de fora, recorte no de dentro (README #20). */}
          <Animated.View style={[{
            flex: 1.25, borderRadius: 22, padding: 2,
            shadowColor: BV.pink, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 18,
          }, cardMeta]}>
            <LinearGradient colors={['#FFC2DB', BV.pink]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22 }} />
            <View style={{ flex: 1, borderRadius: 20, backgroundColor: '#FFF6FA', overflow: 'hidden', padding: 12, justifyContent: 'space-between' }}>
              <Listras cor="rgba(255,94,168,0.07)" />
              <LinearGradient colors={['rgba(255,94,168,0)', 'rgba(255,94,168,0.18)']}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: BV.pink }}>{rotuloDireita}</Text>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: BV.body }}>{titulo}</Text>
                <Text style={{ marginTop: 2, fontSize: 28, fontWeight: '700', letterSpacing: -0.8, color: BV.pink, fontVariant: ['tabular-nums'] }}>{`${NIVEL_META}%`}</Text>
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Barra Hoje → Sem 4, FIXA na semana 4 (só mostra, não mexe). */}
        <Animated.View
          entering={entra(4)}
          accessible
          accessibilityLabel={`Semana ${SEMANAS_ROTINA} de ${SEMANAS_ROTINA}`}
          style={{ marginTop: 24, height: 28, justifyContent: 'center' }}
        >
          <View style={{ height: 6, borderRadius: 3, backgroundColor: BV.track, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: BV.pink }, barra]} />
          </View>
          <Animated.View style={[{
            position: 'absolute', right: -THUMB / 2 + 4, width: THUMB, height: THUMB, borderRadius: THUMB / 2,
            backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: BV.pink,
            shadowColor: BV.pink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5,
          }, bolinha]} />
        </Animated.View>
        <Animated.View entering={entra(4)} style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
          {['Hoje', 'Sem 1', 'Sem 2', 'Sem 3', `Sem ${SEMANAS_ROTINA}`].map((t, i) => (
            <Text key={t} style={{ fontSize: 12, fontWeight: '600', color: i === SEMANAS_ROTINA ? BV.pink : BV.sub }}>{t}</Text>
          ))}
        </Animated.View>

        <Animated.View entering={entra(5)} style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, borderRadius: 18, backgroundColor: BV.card, paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: BV.pink, fontVariant: ['tabular-nums'] }}>{`−${REDUCAO_DOR_PCT}%`}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: BV.sub }}>{dor.nome}</Text>
          </View>
          <View style={{ flex: 1, borderRadius: 18, backgroundColor: BV.card, paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: BV.ink, fontVariant: ['tabular-nums'] }}>{DIAS_ROTINA}</Text>
            <Text style={{ fontSize: 12, color: BV.sub }}>dias</Text>
          </View>
        </Animated.View>

        <Animated.Text entering={entra(6)} style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: BV.sub }}>Meta estimada. Os resultados podem variar.</Animated.Text>
      </View>

      <BvBotao label="Quero chegar lá" seta onPress={() => router.push('/(onboarding)/bv-pacto' as any)} />
    </BvScreen>
  );
}
