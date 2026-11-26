import { View, Text, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { t } from '../../lib/i18n';
import { useObName } from '../../components/onboarding/kit';
import { BvScreen } from '../../components/boasVindas/kit';
import { PC, PcBotao, PcCheck, usePcFrame } from '../../components/posCompra/pcKit';

// Pós-compra v2 · tela 11 "Tudo pronto, <nome>" (design-handoff/pos-compra-v2/11-tudo-pronto.html).
// Um celular inclinado (−8°) mostrando a "Sua rotina" da manhã, com o brilho rosa atrás (o
// `filter: blur(50px)` do design vira um degradê radial), e o convite para ver os recursos
// exclusivos ("Me mostra!" → pc-exclusivos).
const GEL = require('../../assets/pos-compra/gel-de-limpeza.png');
const SERUM = require('../../assets/pos-compra/serum.png');

function Passo({ img, cor, rotulo, nome, feito, agora, apagado }: {
  img?: number; cor?: string; rotulo: string; nome: string; feito?: boolean; agora?: boolean; apagado?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 4,
      opacity: apagado ? 0.7 : 1, borderWidth: agora ? 1.5 : 0, borderColor: PC.pink, margin: agora ? -1.5 : 0,
    }}>
      {img ? <Image source={img} style={{ width: 20, height: 20, borderRadius: 5 }} resizeMode="cover" />
        : <View style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: cor }} />}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 7, color: agora ? PC.pink : PC.sub }}>{rotulo}</Text>
        <Text style={{ fontSize: 8, fontWeight: '700', color: PC.ink }}>{nome}</Text>
      </View>
      {feito ? (
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: PC.pink, alignItems: 'center', justifyContent: 'center' }}>
          <PcCheck size={7} cor="#FFFFFF" traco={3} />
        </View>
      ) : (
        <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#F4A9CB' }} />
      )}
    </View>
  );
}

export default function PcTudoPronto() {
  const router = useRouter();
  const name = useObName();
  const { top, bottom } = usePcFrame();

  return (
    <BvScreen fundo={<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />}>
      <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 24, alignItems: 'center' }}>
        <View style={{ marginTop: 40, width: 320, height: 380 }}>
          <Svg width={420} height={480} style={{ position: 'absolute', left: -50, top: -50 }} pointerEvents="none">
            <Defs>
              <RadialGradient id="brilho" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor={PC.pink} stopOpacity={0.45} />
                <Stop offset="0.55" stopColor={PC.pink} stopOpacity={0.22} />
                <Stop offset="1" stopColor={PC.pink} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={210} cy={230} rx={180} ry={230} fill="url(#brilho)" />
          </Svg>

          <View style={{
            position: 'absolute', left: 92, top: 34, width: 136, height: 270, borderRadius: 30, backgroundColor: '#111111', padding: 8,
            transform: [{ rotate: '-8deg' }],
            shadowColor: PC.pink, shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.55, shadowRadius: 30,
          }}>
            <LinearGradient colors={['#FFF3F8', PC.rosaClaro]} style={{ flex: 1, borderRadius: 23, paddingTop: 18, paddingHorizontal: 8, paddingBottom: 10, gap: 6 }}>
              <Text style={{ fontSize: 7, fontWeight: '700', letterSpacing: 0.8, color: PC.pink }}>{t('MANHÃ · 07:30')}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: PC.ink }}>{t('Sua rotina')}</Text>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' }}>
                <View style={{ width: '50%', height: 4, borderRadius: 2, backgroundColor: PC.pink }} />
              </View>
              <Passo img={GEL} rotulo={t('Passo 1')} nome={t('Limpeza')} feito />
              <Passo img={SERUM} rotulo={t('Passo 2')} nome={t('Sérum')} feito />
              <Passo cor="#FFE3C7" rotulo={t('Agora')} nome={t('Hidratante')} agora />
              <Passo cor="#FDF0D5" rotulo={t('Passo 4')} nome={t('Protetor')} apagado />
              <View style={{ marginTop: 'auto', height: 22, borderRadius: 11, backgroundColor: PC.pink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: '#FFFFFF' }}>{t('Concluir passo')}</Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', color: PC.ink }}>
          {name ? t('Tudo pronto, {{name}}', { name }) : t('Tudo pronto')}
        </Text>
        <Text style={{ marginTop: 12, fontSize: 16, lineHeight: 23, textAlign: 'center', color: PC.body }}>
          {t('Tem muitos recursos personalizados pra você aproveitar agora. Dá uma olhada →')}
        </Text>
        <PcBotao label={t('Me mostra!')} style={{ marginTop: 32, alignSelf: 'stretch' }} onPress={() => router.push('/(onboarding)/pc-exclusivos' as any)} />
      </View>
    </BvScreen>
  );
}
