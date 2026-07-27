import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, useWindowDimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Sun, CalendarClock, Glasses, Sparkles } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Image as ExpoImage } from 'expo-image';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold, Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';

// ── Preparação do scan facial — versão DENTRO DO APP (novo design NIKS) ─────────
// Tutorial de 4 passos em CARROSSEL (antes era uma tela só com 5 dicas em lista):
// um conselho por tela, com espaço para um GIF demonstrando cada um. Substitui em
// comportamento a `scan-prep.tsx` (a versão do onboarding, que NÃO deve ser alterada).
// Aberta direto pelo botão "Escanear" da home (e pelo "Escanear minha pele" da Rotina)
// via hooks/useFaceScan.

const WHITE      = '#FFFFFF';
const INK        = '#121212';
const INK_MUTE   = '#818181';
const CORAL      = '#FF9D9D';                  // rosa da Rotina (protocolo BRAND)
const CORAL_WASH = 'rgba(255,157,157,0.14)';   // wash do rosa da Rotina
const CARD_BD    = '#E3E3E6';                  // hairline-assinatura do app
const DOT_OFF    = 'rgba(18,18,18,0.10)';

// ── Mídia dos passos ───────────────────────────────────────────────────────────
// Cada passo tem sua própria imagem (ver `media` no STEPS abaixo). Passos ainda
// sem imagem dedicada caem no fallback `FOTO_SCAN`.
//
// >>> Para dar uma imagem própria a um passo: coloque o arquivo em
//     assets/scan-tutorial/ e aponte o `media` daquele passo para
//     require('../../assets/scan-tutorial/<arquivo>'). Serve .png, .jpg e
//     também .gif animado (o expo-image anima nativamente). Depois de adicionar
//     arquivo novo, reinicie o Metro com `npx expo start -c`. <<<
const FOTO_SCAN       = require('../../assets/scan-tutorial/pessoa-scan.png');
const FOTO_LUZ        = require('../../assets/scan-tutorial/1-luz.png');
const FOTO_ROTINA     = require('../../assets/scan-tutorial/2-rotina.png');
const FOTO_ACESSORIOS = require('../../assets/scan-tutorial/3-acessorios.png');

const STEPS = [
  {
    Icon: Sun,
    media: FOTO_LUZ,
    title: 'Procure um lugar com uma boa iluminação natural',
    body: 'Durante o dia, com claridade suave e sem sol batendo direto no rosto. Luz de teto e lâmpada amarela criam sombras que a análise lê como mancha.',
  },
  {
    Icon: CalendarClock,
    media: FOTO_ROTINA,
    title: 'Repita sempre no mesmo lugar e horário',
    body: 'Mesmo cantinho, mesma hora do dia, de preferência com uma parede branca de fundo. É assim que conseguimos te dar uma análise precisa, comparar seus scans e te mostrar a evolução real da sua pele.',
  },
  {
    Icon: Glasses,
    media: FOTO_ACESSORIOS,
    title: 'Tire qualquer acessório do rosto',
    body: 'Óculos, brincos, boné, piercing. Nada pode cobrir a pele que a gente vai analisar.',
  },
  {
    Icon: Sparkles,
    media: FOTO_SCAN,
    title: 'Rosto limpo e cabelo preso',
    body: 'Sem maquiagem, sem filtro, cabelo preso para trás. É a sua pele de verdade que queremos ver.',
  },
];

const TOTAL = STEPS.length;

function ProgressDots({ active }: { active: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      {STEPS.map((_, i) => (
        <View
          key={i}
          style={{
            width: i === active ? 26 : 7,
            height: 7,
            borderRadius: 100,
            backgroundColor: i === active ? CORAL : DOT_OFF,
          }}
        />
      ))}
    </View>
  );
}

export default function ScanPrepApp() {
  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold, Nunito_400Regular,
  });
  const f8 = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const f7 = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const f4 = fontsLoaded ? 'Nunito_400Regular' : undefined;

  const router = useRouter();
  const { track } = useMixpanel();
  const setScanTutorialSeen = useAppStore((s) => s.setScanTutorialSeen);
  const { width, height } = useWindowDimensions();

  // largura de uma página do carrossel = largura do container (limitado a 393)
  const pageW = Math.min(width, 393);
  const mediaH = Math.round(height * 0.34);

  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
  }, []);

  // No New Architecture, `onMomentumScrollEnd` sozinho perde o swipe curto —
  // por isso os dois handlers apontam para a mesma função.
  const syncIndex = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / pageW);
    if (i !== index && i >= 0 && i < TOTAL) setIndex(i);
  };

  const goTo = (i: number) => {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  const handleBack = () => {
    haptics.tap();
    if (index > 0) goTo(index - 1);
    else router.back();
  };

  const handleOpenCamera = () => {
    haptics.action();
    track('onboarding_step_completed', { step_number: 13, step_name: 'Análise com IA', step_total: 23 });
    // Tutorial concluído: marca como visto (persistido) para que os próximos scans
    // pulem esta tela e vão direto à câmera — ver hooks/useFaceScan.
    setScanTutorialSeen(true);
    // `camera-multi` (6 fotos), não `camera` (1 foto) — esta última é a do ONBOARDING.
    router.push('/(scan)/camera-multi' as any);
  };

  const isLast = index === TOTAL - 1;

  const handleNext = () => {
    if (isLast) {
      handleOpenCamera();
      return;
    }
    haptics.tap();
    goTo(index + 1);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {/* Header — botão voltar (card branco do app) */}
        <View style={{ paddingVertical: 6, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={handleBack}
            activeOpacity={0.7}
            style={{
              width: 40, height: 40, borderRadius: 100, backgroundColor: WHITE,
              borderWidth: 1, borderColor: CARD_BD, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={18} color={INK} />
          </TouchableOpacity>
        </View>

        {/* Carrossel dos 4 passos */}
        <FlatList
          ref={listRef}
          data={STEPS}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollEndDrag={syncIndex}
          onMomentumScrollEnd={syncIndex}
          getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
          style={{ flexGrow: 0 }}
          renderItem={({ item, index: i }) => {
            const { Icon } = item;
            return (
              <View style={{ width: pageW, paddingHorizontal: 28 }}>

                {/* Área de mídia — arte de fundo + GIF por cima */}
                <View
                  style={{
                    height: mediaH, borderRadius: 28, backgroundColor: CORAL_WASH,
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}
                >
                  <Icon size={Math.round(mediaH * 0.3)} color={CORAL} strokeWidth={1.6} />
                  <ExpoImage
                    source={item.media}
                    contentFit="cover"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                </View>

                {/* Texto — altura mínima fixa para o botão não dançar entre slides */}
                <View style={{ paddingTop: 28, minHeight: 210 }}>
                  <Text style={{ fontFamily: f7, fontSize: 11, color: CORAL, letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14 }}>
                    {`Passo ${i + 1} de ${TOTAL}`}
                  </Text>
                  <Text style={{ fontFamily: f8, fontSize: 26, color: INK, letterSpacing: -0.7, lineHeight: 32 }}>
                    {item.title}
                  </Text>
                  <Text style={{ fontFamily: f4, marginTop: 14, fontSize: 14.5, lineHeight: 21.75, color: INK_MUTE, letterSpacing: -0.1 }}>
                    {item.body}
                  </Text>
                </View>

              </View>
            );
          }}
        />

        <View style={{ flex: 1 }} />

        {/* Bolinhas de progresso */}
        <View style={{ paddingBottom: 22 }}>
          <ProgressDots active={index} />
        </View>

        {/* Botão principal */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={handleNext}
            activeOpacity={0.9}
            style={{
              height: 58, borderRadius: 100, backgroundColor: CORAL,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: CORAL, shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.45, shadowRadius: 16, elevation: 6,
            }}
          >
            <Text style={{ fontFamily: f7, fontSize: 17, letterSpacing: -0.2, color: WHITE }}>
              {isLast ? 'Abrir câmera' : 'Continuar'}
            </Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}
