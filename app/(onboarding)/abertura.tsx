import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Animated, Easing, AccessibilityInfo, useWindowDimensions } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import BalancedText from '../../components/BalancedText';
import { OB, OB_STEPS, ObScreen, NIKS_LOGO_PINK, useObFrame, obStep, useOnMount } from '../../components/onboarding/kit';

// Tela 1 do onboarding (primeira depois da splash para quem não tem sessão,
// `app/index.tsx`). Layout da abertura do Tapfit adaptado ao NIKS (03/nov/2026, pedido do
// produto): logo no topo, o iPhone inteiro e parado com ~55% da altura da tela, "A rotina
// perfeita para sua pele." + "Feita especialmente para você." e o botão "Analisar minha pele"
// respirando (escala 1 → 1,03, 2 s) → nome. Fundo rosa claro do kit na tela inteira.
//
// O vídeo (abertura v6, 04/nov/2026: Home → Rotina da manhã → Estante → scan de compatibilidade
// da v5, 25 s em laço, sem som; projeto em ~/Developer/niks-video-abertura/abertura-v6) é SÓ o iPhone,
// recortado rente ao aro: o app desenha o vídeo com os cantos do aro (raio 98/636 da
// largura), e a sombra e os botões laterais ficam por fora, em RN. Assim não existe fundo
// de vídeo para destoar do rosa (o `expo-video` pinta branco atrás de vídeo transparente,
// e um rosa "igual" gravado no vídeo sai 2–3 níveis diferente). O 1º quadro em .jpg
// aparece na hora e só some quando o vídeo desenha o primeiro quadro; com "Reduzir
// movimento", fica só a imagem parada. Nome de arquivo sem acento (o Metro falha em silêncio).
const VIDEO_ABERTURA = require('../../assets/onboarding/abertura-video.mp4');
const POSTER_ABERTURA = require('../../assets/onboarding/abertura-poster.jpg');

const STEP = OB_STEPS.abertura;
const STEP_NAME = 'Abertura';

// Geometria do iPhone do vídeo (px da composição): aro 636 × 1340, raio 98; botões
// laterais de 6 px de largura saindo 5 px do aro.
const AR_W = 636;
const AR_H = 1340;
const AR_RAIO = 98;
const BOTOES: { lado: 'esq' | 'dir'; top: number; h: number }[] = [
  { lado: 'esq', top: 230, h: 60 },
  { lado: 'esq', top: 330, h: 110 },
  { lado: 'esq', top: 460, h: 110 },
  { lado: 'dir', top: 380, h: 170 },
];

export default function Abertura() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { insets } = useObFrame();
  const { height: H } = useWindowDimensions();
  const splashDone = useAppStore((s) => s.splashDone);
  const title = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const goingRef = useRef(false);
  // null = ainda não sabe: mostra a imagem parada até saber, para o vídeo não começar
  // e parar logo em seguida.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  // Espaço que sobra para o iPhone entre a logo e os textos (medido): em tela baixa ele
  // encolhe para caber tudo sem rolagem; no resto, 55% da altura da tela.
  const [espaco, setEspaco] = useState(0);
  const phoneH = Math.round(Math.min(H * 0.55, espaco > 0 ? espaco - 12 : H * 0.55));
  const phoneW = Math.round((phoneH * AR_W) / AR_H);
  const k = phoneW / AR_W;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useOnMount(() => track('onboarding_step_viewed', obStep(STEP, STEP_NAME)));
  // O onboarding começa aqui: as duas cartas do scan voltam a aparecer (07/nov/2026). O
  // marcador "carta já vista" vive na memória e, sem isto, um onboarding refeito na mesma
  // sessão do app pulava as cartas e ia direto ao "Calma".
  useOnMount(() => useAppStore.setState({ cartaChegadaVista: false, etapaCartaOb: null }));

  // O título só entra quando a splash termina de sumir (a tela monta por baixo dela).
  useEffect(() => {
    if (!splashDone) return;
    let loop: Animated.CompositeAnimation | null = null;
    Animated.timing(title, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loop.start();
    });
    return () => loop?.stop();
  }, [splashDone]);

  const handleStart = () => {
    if (goingRef.current) return;
    goingRef.current = true;
    haptics.action();
    track('onboarding_step_completed', obStep(STEP, STEP_NAME));
    router.push('/(onboarding)/nome');
    setTimeout(() => { goingRef.current = false; }, 600);
  };

  return (
    <ObScreen variant="blush">
      <Stack.Screen options={{ animation: 'fade', gestureEnabled: false }} />
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
        {/* Logo + NIKS centralizados JUNTOS no eixo da tela (07/nov/2026, pedido do produto:
            antes só a palavra ficava no centro e a logo pendurada à esquerda deixava o conjunto
            puxado para a esquerda). O espaçamento entre letras sai também da última letra
            (marginRight negativo), senão o conjunto fica 1,5 pt à esquerda. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, height: 32 }}>
          <Image source={NIKS_LOGO_PINK} style={{ width: 27, height: 27 }} />
          <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: 1.5, marginRight: -1.5, color: OB.ink }}>NIKS</Text>
        </View>

        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          onLayout={(e) => setEspaco(e.nativeEvent.layout.height)}
        >
          {espaco > 0 && (
            <View style={{ width: phoneW, height: phoneH }}>
              {BOTOES.map((b, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute', width: Math.max(2, 6 * k), height: b.h * k, top: b.top * k,
                    left: b.lado === 'esq' ? -5 * k : (AR_W - 1) * k, borderRadius: 3 * k, backgroundColor: '#3A3A40',
                  }}
                />
              ))}
              {/* Sombra no invólucro; o recorte arredondado no de dentro (README #20). */}
              <View style={{
                flex: 1, borderRadius: AR_RAIO * k, backgroundColor: '#0C0C0E',
                shadowColor: '#AA2869', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 16 },
              }}>
                <View style={{ flex: 1, borderRadius: AR_RAIO * k, overflow: 'hidden' }}>
                  {reduceMotion === false
                    ? <VideoAbertura source={VIDEO_ABERTURA} poster={POSTER_ABERTURA} />
                    : <Image source={POSTER_ABERTURA} resizeMode="cover" style={{ flex: 1, width: '100%' }} />}
                </View>
              </View>
            </View>
          )}
        </View>

        <Animated.View style={{ opacity: title }}>
          <BalancedText
            text="A rotina perfeita para sua pele."
            style={{ marginHorizontal: 24, textAlign: 'center', fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.5, color: OB.ink }}
          />
          <Text style={{ marginTop: 6, marginHorizontal: 30, textAlign: 'center', fontSize: 17, lineHeight: 23, color: OB.sub }}>
            Feita especialmente para você.
          </Text>
        </Animated.View>

        <Animated.View style={{
          marginTop: 22, alignSelf: 'center',
          transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
        }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleStart}
            style={{
              width: 245, height: 48, borderRadius: 24, backgroundColor: OB.pink,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#121212', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 6 },
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Analisar minha pele</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </ObScreen>
  );
}

function VideoAbertura({ source, poster }: { source: number; poster: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    // Sem som: não interrompe a música que a pessoa estiver ouvindo.
    p.audioMixingMode = 'mixWithOthers';
  });
  const posterOpacity = useRef(new Animated.Value(1)).current;
  const [posterGone, setPosterGone] = useState(false);

  // Toca só com a tela em foco: o nome entra por cima (push) e esta tela continua montada.
  // ⚠️ Ao DESMONTAR a tela, o player já foi liberado quando esta limpeza roda e o `pause`
  // lança ("NativeSharedObjectNotFoundException") — daí o try/catch.
  useFocusEffect(useCallback(() => {
    try { player.play(); } catch {}
    return () => { try { player.pause(); } catch {} };
  }, [player]));

  // A imagem sai só quando o vídeo já desenhou o primeiro quadro (o player ainda vazio é preto).
  const handleFirstFrame = () => {
    Animated.timing(posterOpacity, { toValue: 0, duration: 260, useNativeDriver: true })
      .start(() => setPosterGone(true));
  };

  return (
    <View style={{ flex: 1 }}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={handleFirstFrame}
      />
      {!posterGone && (
        <Animated.Image
          source={poster}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: posterOpacity }}
        />
      )}
    </View>
  );
}
