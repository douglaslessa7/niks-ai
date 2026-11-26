import { useRef, useState } from 'react';
import { View, Text, Image, ScrollView, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { t } from '../../lib/i18n';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useFaceScan } from '../../hooks/useFaceScan';
import { BvScreen } from '../../components/boasVindas/kit';
import { sairDasBoasVindas } from '../../components/boasVindas/sairDasBoasVindas';
import { PC, PcBotao, PcCheck, Pontinhos, SeloPremium, usePcFrame } from '../../components/posCompra/pcKit';

// Pós-compra v2 · telas 12–14 "Exclusivo do Premium" (design-handoff/pos-compra-v2/
// 12-exclusivo-evolucao.html, 13-exclusivo-scanner.html, 14-exclusivo-chat-ia.html).
// As três páginas numa tela só, de arrastar para o lado (os pontinhos e o botão ficam fixos):
// evolução semanal · scanner de produto na loja · chat com a NIKS IA. "Começar!" passa para a
// próxima; na última, sai das boas-vindas (`sairDasBoasVindas`: cadastro, ou a tela de espera se
// ela já tem conta) — o mesmo fim do fluxo de sempre.
const FARMACIA = require('../../assets/pos-compra/scan-farmacia.jpg');
const SOMBRA = { shadowColor: '#EE3F92', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 14 };

function Evolucao({ largura }: { largura: number }) {
  const w = Math.min(342, largura);
  const k = (w - 36) / 306;
  return (
    <View style={{
      marginTop: 40, width: w, backgroundColor: '#FFFFFF', borderRadius: 24, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 16, gap: 14,
      shadowColor: PC.pink, shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.18, shadowRadius: 20,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: PC.ink }}>{t('Sua evolução')}</Text>
        <View style={{ backgroundColor: PC.rosaClaro, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: PC.pinkDark }}>{t('Últimas 4 semanas')}</Text>
        </View>
      </View>
      <Svg width={306 * k} height={200 * k} viewBox="0 0 306 200">
        <Defs>
          <SvgLinearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={PC.pink} stopOpacity={0.35} />
            <Stop offset="1" stopColor={PC.pink} stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Line x1={0} y1={40} x2={306} y2={40} stroke="#F6E3EC" strokeWidth={1} />
        <Line x1={0} y1={95} x2={306} y2={95} stroke="#F6E3EC" strokeWidth={1} />
        <Line x1={0} y1={150} x2={306} y2={150} stroke="#F6E3EC" strokeWidth={1} />
        <Path d="M12 150 C60 146 80 128 110 120 C150 108 170 96 200 78 C235 58 260 44 292 30 L292 176 L12 176 Z" fill="url(#evoFill)" />
        <Path d="M12 150 C60 146 80 128 110 120 C150 108 170 96 200 78 C235 58 260 44 292 30" fill="none" stroke={PC.pink} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={292} cy={30} r={16} fill={PC.pink} opacity={0.18} />
        <Circle cx={292} cy={30} r={8} fill="#FFFFFF" stroke={PC.pink} strokeWidth={4} />
        <SvgText x={12} y={196} fontSize={11} fill={PC.sub}>{t('Sem 1')}</SvgText>
        <SvgText x={96} y={196} fontSize={11} fill={PC.sub}>{t('Sem 2')}</SvgText>
        <SvgText x={180} y={196} fontSize={11} fill={PC.sub}>{t('Sem 3')}</SvgText>
        <SvgText x={266} y={196} fontSize={11} fontWeight="700" fill={PC.pink}>{t('Sem 4')}</SvgText>
      </Svg>
    </View>
  );
}

function Scanner({ largura }: { largura: number }) {
  const k = Math.min(1, largura / 342);
  return (
    <View style={{ marginTop: 26, width: 342 * k, height: 390 * k }}>
      <View style={{ width: 342, height: 390, transform: [{ scale: k }], transformOrigin: 'top left' }}>
        <Image source={FARMACIA} resizeMode="cover" style={{
          position: 'absolute', left: 61, top: 0, width: 220, height: 309, borderRadius: 26,
        }} />
        <View style={[{ position: 'absolute', left: 0, top: 34, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, SOMBRA]}>
          <View style={{ width: 44, height: 44 }}>
            <Svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={22} cy={22} r={18} fill="none" stroke={PC.rosaClaro} strokeWidth={5} />
              <Circle cx={22} cy={22} r={18} fill="none" stroke={PC.pink} strokeWidth={5} strokeLinecap="round" strokeDasharray="104 114" />
            </Svg>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: PC.ink }}>92%</Text>
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: PC.ink }}>{t('Combina com')}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: PC.ink }}>{t('sua pele')}</Text>
          </View>
        </View>
        <View style={[{ position: 'absolute', right: 0, top: 140, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, SOMBRA]}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: PC.rosaClaro, alignItems: 'center', justifyContent: 'center' }}>
            <PcCheck size={12} traco={2.2} />
          </View>
          <View>
            <Text style={{ fontSize: 10, color: PC.sub }}>{t('Seu tipo de pele')}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: PC.ink }}>{t('Ideal pra oleosa')}</Text>
          </View>
        </View>
        <View style={[{ position: 'absolute', left: 6, bottom: 0, width: 240, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, gap: 6 }, SOMBRA]}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: PC.sub }}>{t('ATIVOS ENCONTRADOS')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {[t('Ceramidas'), t('Niacinamida'), t('Ácido hialurônico')].map((a) => (
              <View key={a} style={{ backgroundColor: PC.rosaClaro, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#C2337A' }}>{a}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[{ position: 'absolute', right: 4, bottom: 74, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }, SOMBRA]}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={PC.pink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />
          </Svg>
          <Text style={{ fontSize: 12, fontWeight: '700', color: PC.ink }}>{t('Sem perfume')}</Text>
        </View>
      </View>
    </View>
  );
}

function Chat({ largura }: { largura: number }) {
  const minha = (texto: string) => (
    <View style={{
      alignSelf: 'flex-end', maxWidth: 240, backgroundColor: PC.pink, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6,
      paddingVertical: 12, paddingHorizontal: 14, ...SOMBRA,
    }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: '#FFFFFF' }}>{texto}</Text>
    </View>
  );
  const sombraLeve = { ...SOMBRA, shadowOpacity: 0.12 };
  return (
    <View style={{ marginTop: 30, width: Math.min(342, largura), gap: 12 }}>
      {minha(t('Posso usar ácido junto com vitamina C?'))}
      <View style={{
        alignSelf: 'flex-start', maxWidth: 280, backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6,
        paddingVertical: 12, paddingHorizontal: 14, gap: 6, ...sombraLeve,
      }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: PC.pink }}>{t('NIKS IA')}</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: PC.ink }}>
          {t('Pra sua pele, melhor separar: vitamina C de manhã e o ácido à noite. Assim você evita irritação.')}
        </Text>
      </View>
      {minha(t('E protetor, preciso reaplicar?'))}
      <View style={{ alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 5, alignItems: 'center', ...sombraLeve }}>
        {[PC.pink, '#FF9CCB', '#FFD1E6'].map((c) => <View key={c} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />)}
      </View>
    </View>
  );
}

export default function PcExclusivos() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { startFaceScan } = useFaceScan();
  const { width } = useWindowDimensions();
  const { top, bottom } = usePcFrame();
  const lista = useRef<ScrollView>(null);
  const saindo = useRef(false);
  const [pagina, setPagina] = useState(0);
  const largura = width - 48;

  const paginas = [
    { ilustracao: <Evolucao largura={largura} />, titulo: t('Acompanhe sua evolução'), texto: t('Escaneie toda semana e veja, em número, se a sua rotina está funcionando.') },
    { ilustracao: <Scanner largura={largura} />, titulo: t('Escaneie antes de comprar'), texto: t('Na loja ou na farmácia, aponte a câmera e saiba se o produto combina com a sua pele.') },
    { ilustracao: <Chat largura={largura} />, titulo: t('Tire dúvidas a qualquer hora'), texto: t('A NIKS IA conhece a sua pele e responde qualquer pergunta sobre skincare, na hora.') },
  ];

  const aoRolar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== pagina) {
      setPagina(p);
      track('bv_exclusivo_vista', { pagina: p + 1, fluxo: 'pos_compra_v2' });
    }
  };

  const comecar = () => {
    if (pagina < paginas.length - 1) {
      // O `scrollTo` não dispara o `onMomentumScrollEnd` no iOS: a página muda aqui.
      lista.current?.scrollTo({ x: (pagina + 1) * width, animated: true });
      setPagina(pagina + 1);
      track('bv_exclusivo_vista', { pagina: pagina + 2, fluxo: 'pos_compra_v2' });
      return;
    }
    if (saindo.current) return;
    saindo.current = true;
    track('boas_vindas_concluidas', { fluxo: 'pos_compra_v2' });
    void sairDasBoasVindas(router, startFaceScan);
  };

  return (
    <BvScreen fundo={<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />}>
      <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom }}>
        <ScrollView
          ref={lista}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={aoRolar}
          style={{ flex: 1 }}
        >
          {paginas.map((p) => (
            <View key={p.titulo} style={{ width, paddingHorizontal: 24, alignItems: 'center' }}>
              {p.ilustracao}
              <View style={{ flex: 1 }} />
              <SeloPremium texto={t('Exclusivo do Premium')} />
              <Text style={{ marginTop: 14, fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', color: PC.ink }}>
                {p.titulo}
              </Text>
              <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 22, textAlign: 'center', color: PC.body }}>{p.texto}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ marginTop: 24, alignItems: 'center' }}>
          <Pontinhos total={paginas.length} ativo={pagina} />
        </View>
        <PcBotao label={t('Começar!')} onPress={comecar} style={{ marginTop: 22, marginHorizontal: 24 }} />
      </View>
    </BvScreen>
  );
}
