import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import Reanimated, {
  FadeInDown, FadeOut, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, {
  Path, Line, Circle, Defs,
  LinearGradient as SvgLinearGradient, Stop,
} from 'react-native-svg';
import { X } from 'lucide-react-native';
import { haptics } from '../../lib/haptics';
import { getUserId } from '../../lib/currentUser';
import { getAccessToken } from '../../lib/sessionToken';
import { getFacePhotoUrl } from '../../lib/facePhoto';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import {
  domainOf, extractProductImage, prepareProductImage, prepareProductImageFromBase64,
  prepareProductImageFromUrl, isDirectImageUrl,
} from '../../lib/shareProduct';
import { HiddenPageImageReader, type PageImageResult } from '../../components/share/HiddenPageImageReader';
import { useAppStore, type PendingShare } from '../../store/onboarding';
import { clearShareResume, takeShareForLoadingScreen } from '../../lib/shareResume';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { useProductAnalysis } from '../../hooks/useProductAnalysis';
import { getScoreTheme } from '../../lib/scoreTheme';

// Tela de carregamento EXCLUSIVA da feature "Compartilhar com o NIKS".
//
// VISUAL = a MESMA casca das outras loadings do app (`product-loading.tsx` e
// `loading-dentro-app.tsx`): véu rosa dissolvendo no branco, anel de progresso
// grosso em gradiente rosa sobre trilho claro, disco branco central com sombra
// rosa, frase rotativa + subtítulo abaixo do círculo. Tokens, tipografia e
// medidas são os mesmos de propósito — as telas são irmãs, não invente estilo novo.
//
// A ÚNICA diferença: dentro do disco central, no lugar do número, as fotos
// alternam (rosto da usuária ↔ foto do produto) com crossfade + uma linha de
// varredura (scanner) sincronizada; a % virou um número pequeno sob o subtítulo.
//
// A lógica da análise é a mesma da product-loading, via `useProductAnalysis`.
// Só é aberta pelo (app)/_layout, depois do guard de assinatura, com o conteúdo em
// `pendingShare` no store. Sem isso (ex.: deep link direto) volta pra home.

// Tokens iguais aos da product-loading.
const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_FAINT = 'rgba(29,58,68,0.38)';
const PINK = '#FF9D9D';           // rosa padrão do app
const PINK_SOFT = '#FFC9C9';      // parada clara do gradiente do arco
const CREAM = '#FFFFFF';

const RING_SIZE = 250;
const RING_STROKE = 8;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;
const WHITE_D = RING_SIZE - 30;   // disco branco central (dentro do anel)
const PHOTO_D = WHITE_D - 18;     // fotos dentro do disco

// Ritmo da alternância rosto ↔ produto: troca rápida (350 ms) com uma parada que dá
// tempo de olhar cada foto. ⚠️ Os 2000 ms originais pareciam slideshow e 900 ms
// ficaram afobados — 1300 ms foi o ponto escolhido no device.
const CROSSFADE_MS = 350;
const HOLD_MS = 1300;
// No fluxo de link a busca da imagem ocupa 0–15% e a análise continua dali.
const URL_EXTRACT_CAP = 14;
const URL_ANALYSIS_FLOOR = 15;

const PHRASE_SEARCH = 'Buscando o produto…';
const ANALYSIS_PHRASES = [
  'Analisando os componentes do produto…',
  'Comparando com a sua pele…',
  'Vendo se o produto é compatível com você…',
  'Montando o veredito…',
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Stage = 'preparing' | 'extracting' | 'analyzing' | 'no_image' | 'extract_error';

export default function ShareProductLoading() {
  const router = useRouter();
  const { track } = useMixpanel();
  const setPendingShare = useAppStore((s) => s.setPendingShare);
  const setProductImage = useAppStore((s) => s.setProductImage);
  const setProductSource = useAppStore((s) => s.setProductSource);
  const setProductScanResult = useAppStore((s) => s.setProductScanResult);

  // O share é lido UMA vez na montagem e retirado do store, para não reabrir a tela.
  // Numa REMONTAGEM (Fast Refresh, remount do Stack) o store já está vazio — daí a
  // retomada de `lib/shareResume`, senão a tela voltaria para a home no meio da análise.
  const shareRef = useRef<PendingShare | null>(takeShareForLoadingScreen());
  const share = shareRef.current;
  const isUrl = share?.kind === 'url';
  // `image_url` (link que já é uma foto) conta como imagem: não há página para raspar.
  const origem = isUrl ? 'share_url' : 'share_image';

  const [stage, setStage] = useState<Stage>('preparing');
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [productUri, setProductUri] = useState<string | null>(null);
  const [faceUri, setFaceUri] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(share?.kind === 'url' ? share.title : null);
  const [extractPct, setExtractPct] = useState(0);
  const preparingRef = useRef(false);
  // Link do Mercado Livre que o backend não conseguiu ler (anti-robô): lido por uma
  // WebView invisível. `null` = WebView desmontada.
  const [webviewUrl, setWebviewUrl] = useState<string | null>(null);
  const webviewTitleRef = useRef<string | null>(null);

  const goHome = useCallback(() => {
    clearShareResume();
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/home' as any);
  }, [router]);

  const { consentGate, granted } = useScanConsentGate({ onDecline: goHome, presentation: 'inline' });

  // `navigateOnSuccess: false`: esta tela NÃO pula para o resultado — ela vira a
  // tela de revelação (número da compatibilidade + "Ver análise completa"). A tela
  // da câmera (`product-loading`) continua navegando sozinha.
  const { percentage, showDemandNotice, countdown, countdownPaused, showError, retry, result } =
    useProductAnalysis({
      enabled: analysisEnabled,
      origem,
      productName,
      percentFloor: isUrl ? URL_ANALYSIS_FLOOR : 0,
      navigateOnSuccess: false,
    });

  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold });
  const fExtra = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi = fontsLoaded ? 'Nunito_600SemiBold' : undefined;

  // Montagem: sem share → home. Com share → tira do store e limpa resultado/imagem antigos.
  useEffect(() => {
    if (!share) {
      router.replace('/(app)/home' as any);
      return;
    }
    setPendingShare(null);
    setProductScanResult(null);
    setProductSource(null, null);
  }, []);

  // Rosto: mesma regra da home. Falha aqui nunca bloqueia — mostra só o produto.
  useEffect(() => {
    let cancelled = false;
    getUserId()
      .then((uid) => (uid ? getFacePhotoUrl(uid) : null))
      .then((url) => { if (!cancelled) setFaceUri(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const startAnalysis = useCallback((base64: string, title: string | null, fonte: 'safari' | 'backend' | 'webview') => {
    if (!share || share.kind !== 'url') return;
    setProductImage(base64, 'image/jpeg');
    setProductSource(share.sourceUrl, title);
    setProductName(title);
    setProductUri(`data:image/jpeg;base64,${base64}`);
    track('product_share_image_extracted', { dominio: domainOf(share.sourceUrl), fonte });
    setStage('analyzing');
    setAnalysisEnabled(true);
  }, [share, track]);

  // Prepara a imagem (e, no link, busca a foto no backend) — só depois do consentimento.
  const prepare = useCallback(async () => {
    if (!share || preparingRef.current) return;
    preparingRef.current = true;
    try {
      if (share.kind === 'image' || share.kind === 'image_url') {
        // Arquivo local (share de imagem) ou URL que já aponta para a foto
        // (toque longo → "Compartilhar imagem", galeria do Shopify abrindo o PNG).
        // Nos dois casos não há página: baixa/processa e manda para a IA.
        const base64 = share.kind === 'image'
          ? await prepareProductImage(share.imageUri)
          : await prepareProductImageFromUrl(share.imageUrl);
        setProductImage(base64, 'image/jpeg');
        setProductUri(`data:image/jpeg;base64,${base64}`);
        if (share.kind === 'image_url') setProductName(share.title);
        setStage('analyzing');
        setAnalysisEnabled(true);
        return;
      }

      setStage('extracting');
      const dominio = domainOf(share.sourceUrl);

      // (b) Foto lida no próprio Safari pelo preprocessor da extensão: não passa
      // pelo anti-robô das lojas. Se falhar (rede, não é imagem), cai no backend.
      if (share.pageImageUrl) {
        try {
          const base64 = await prepareProductImageFromUrl(share.pageImageUrl);
          startAnalysis(base64, share.title, 'safari');
          return;
        } catch (err) {
          console.warn('[share] foto do Safari falhou, usando extrair-imagem-produto:', err);
        }
      }

      const token = await getAccessToken();
      if (!token) throw new Error('Sem sessão válida');
      const result = await extractProductImage(share.sourceUrl, token);

      if (result.status !== 'ok') {
        // O backend não achou a foto → tenta ler a página no PRÓPRIO celular (a rede
        // é a dela e o motor é o do Safari). Vale para qualquer motivo — anti-robô
        // (Mercado Livre), página montada por JavaScript (Shopee), metatag ausente.
        // ⚠️ EXCETO `pagina_indisponivel` (4xx): link quebrado é link quebrado, e
        // abrir a WebView só faria a usuária esperar 25 s à toa.
        // Link de imagem nunca vai para a WebView: não há metatag num PNG, e o
        // script ficaria reinjetando até o timeout (25 s por nada).
        if (result.motivo !== 'pagina_indisponivel' && !isDirectImageUrl(share.sourceUrl)) {
          webviewTitleRef.current = result.titulo ?? share.title;
          setWebviewUrl(share.sourceUrl);
          return;
        }
        track('product_share_no_image', { dominio, motivo: result.motivo ?? null });
        setStage('no_image');
        return;
      }

      const base64 = await prepareProductImageFromBase64(result.imageBase64, result.mimeType);
      startAnalysis(base64, result.titulo ?? share.title, 'backend');
    } catch (err) {
      preparingRef.current = false;
      // A tela mostra "verifique sua conexão", que é o recado certo para a usuária —
      // mas esconde a causa. O log guarda o erro real (token, HTTP da função, falha
      // ao processar a imagem).
      console.warn('[share] falha ao preparar a imagem:', String((err as Error)?.message ?? err));
      track('product_scan_failed', { origem, etapa: 'preparar_imagem', error: String((err as Error)?.message ?? err).slice(0, 300) });
      setStage(share.kind === 'url' ? 'extract_error' : 'no_image');
    }
  }, [share, startAnalysis]);

  const handleWebviewResult = useCallback(async (result: PageImageResult) => {
    setWebviewUrl(null);
    if (!share || share.kind !== 'url') return;
    const dominio = domainOf(share.sourceUrl);
    if (!result.ok) {
      track('product_share_no_image', { dominio, motivo: `webview_${result.reason}`, ms: result.ms });
      setStage('no_image');
      return;
    }
    try {
      const base64 = await prepareProductImageFromUrl(result.imageUrl);
      startAnalysis(base64, result.title ?? webviewTitleRef.current, 'webview');
    } catch (err) {
      console.warn('[share-webview] imagem encontrada mas não baixou:', err);
      track('product_share_no_image', { dominio, motivo: 'webview_download_falhou', ms: result.ms });
      setStage('no_image');
    }
  }, [share, startAnalysis, track]);

  useEffect(() => {
    if (granted) prepare();
  }, [granted, prepare]);

  // % durante a busca da imagem: sobe devagar até 14 e espera o backend.
  useEffect(() => {
    if (stage !== 'extracting') return;
    const timer = setInterval(() => {
      setExtractPct((p) => (p >= URL_EXTRACT_CAP ? p : p + 1));
    }, 280);
    return () => clearInterval(timer);
  }, [stage]);

  const displayPct = stage === 'extracting' || (isUrl && !analysisEnabled) ? extractPct : percentage;

  let phrase: string;
  if (isUrl && !analysisEnabled) {
    phrase = PHRASE_SEARCH;
  } else {
    const floor = isUrl ? URL_ANALYSIS_FLOOR : 0;
    const span = (100 - floor) / ANALYSIS_PHRASES.length;
    const idx = Math.max(0, Math.min(ANALYSIS_PHRASES.length - 1, Math.floor((percentage - floor) / span)));
    phrase = ANALYSIS_PHRASES[idx];
  }

  // ── Animações ──────────────────────────────────────────────────────────────
  // Halo e anel de progresso: mesmo padrão da product-loading (RN Animated +
  // `strokeDashoffset` com `useNativeDriver: false` — decisão 22).
  const haloAnim = useRef(new Animated.Value(1)).current;
  const ringProgressAnim = useRef(new Animated.Value(0)).current;
  const phraseFadeAnim = useRef(new Animated.Value(1)).current;

  const ringOffsetAnim = ringProgressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [RING_C, 0],
  });

  const failed = showError || stage === 'no_image' || stage === 'extract_error';

  // ── Revelação ───────────────────────────────────────────────────────────────
  // Mesma régua de cor do `product-result` (getScoreTheme pela faixa da
  // compatibilidade). Sem o campo (scan antigo / `precisa_foto`) → "—" e tema rosa.
  const revealed = !!result && !failed;
  const rawCompat = result?.compatibilidade;
  const compat = typeof rawCompat === 'number' && Number.isFinite(rawCompat) ? rawCompat : null;
  const theme = getScoreTheme(compat);

  const openFullAnalysis = () => {
    haptics.action();
    router.replace('/(scan)/product-result' as any);
  };

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, { toValue: 1.1, duration: 1400, useNativeDriver: true }),
        Animated.timing(haloAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    Animated.timing(ringProgressAnim, {
      toValue: displayPct,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [displayPct]);

  useEffect(() => {
    phraseFadeAnim.setValue(0);
    Animated.timing(phraseFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [phrase]);

  // Fotos e varredura (UI thread, reanimated).
  const showProduct = useSharedValue(1);
  const scanProgress = useSharedValue(0);   // 0 = topo, 1 = base
  const scanOpacity = useSharedValue(0);
  const placeholderPulse = useSharedValue(1);

  useEffect(() => {
    placeholderPulse.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 1100 }), withTiming(0.94, { duration: 1100 })),
      -1, true,
    );
  }, []);

  // Crossfade rosto ↔ produto (~2s cada) + varredura sincronizada com a troca.
  // Sem rosto (ou sem produto ainda): mostra só o que existe, sem alternar.
  useEffect(() => {
    showProduct.value = 1;
    if (!productUri || !faceUri || failed) return;

    const sweep = () => {
      scanProgress.value = 0;
      // A varredura acompanha o crossfade: aparece, cruza o círculo e some junto.
      scanOpacity.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(1, { duration: Math.max(60, CROSSFADE_MS - 200) }),
        withTiming(0, { duration: 110 }),
      );
      scanProgress.value = withTiming(1, { duration: CROSSFADE_MS + 60 });
    };

    const timer = setInterval(() => {
      sweep();
      showProduct.value = withTiming(showProduct.value > 0.5 ? 0 : 1, { duration: CROSSFADE_MS });
    }, HOLD_MS + CROSSFADE_MS);
    return () => clearInterval(timer);
  }, [productUri, faceUri, failed]);

  const haloStyle = { transform: [{ scale: haloAnim }] };
  const placeholderStyle = useAnimatedStyle(() => ({ transform: [{ scale: placeholderPulse.value }] }));
  const productStyle = useAnimatedStyle(() => ({ opacity: showProduct.value }));
  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.value,
    transform: [{ translateY: scanProgress.value * PHOTO_D }],
  }));

  const handleClose = () => {
    haptics.tap();
    goHome();
  };

  const handleRetry = () => {
    haptics.action();
    if (stage === 'extract_error') {
      setExtractPct(0);
      prepare();
    } else {
      retry();
    }
  };

  const handleTakePhoto = () => {
    haptics.action();
    clearShareResume();
    router.replace('/(scan)/product-camera' as any);
  };

  if (!share) return null;

  return (
    <View style={{ flex: 1, backgroundColor: CREAM }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {/* Véu de fundo — igual ao da product-loading */}
      <LinearGradient
        colors={['#FFF1F2', '#FFF8F8', '#FFFFFF']}
        locations={[0, 0.4, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Fechar — esta tela é aberta de fora do app, então precisa de saída */}
          <View style={{ height: 44, paddingHorizontal: 20, justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={12}
              style={{
                width: 36, height: 36, borderRadius: 18,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(29,58,68,0.08)',
              }}
            >
              <X size={18} color={DEEP} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {!failed ? (
            <>
              {/* Revelação: número da compatibilidade acima do círculo. Só o número —
                  sem chip de veredito e sem nome do produto (isso é do product-result). */}
              {revealed && (
                <Reanimated.View
                  entering={FadeInDown.duration(420)}
                  style={{ alignItems: 'center', marginTop: 4 }}
                >
                  <Text style={{
                    fontFamily: fExtra, fontSize: 72, letterSpacing: -2.88, color: theme.score,
                  }}>
                    {compat != null ? `${compat}%` : '—'}
                  </Text>
                  <Text style={{
                    fontFamily: fExtra, fontSize: 20, letterSpacing: -0.4, color: '#121212', marginTop: -14,
                  }}>
                    Compatibilidade de pele
                  </Text>
                </Reanimated.View>
              )}

              {/* Aviso de alta demanda — mesmo card da product-loading */}
              {!revealed && showDemandNotice && (
                <View style={{
                  marginHorizontal: 24, marginTop: 4,
                  backgroundColor: PINK,
                  borderRadius: 16, padding: 13,
                  flexDirection: 'row', alignItems: 'flex-start', gap: 9,
                }}>
                  <View style={{ marginTop: 1, flexShrink: 0 }}>
                    <Svg width={16} height={16} viewBox="0 0 16 16">
                      <Path d="M4 2h8v2.5C12 6.5 9.5 8 8 8C6.5 8 4 6.5 4 4.5V2z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
                      <Path d="M4 14h8v-2.5C12 9.5 9.5 8 8 8C6.5 8 4 9.5 4 11.5V14z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
                      <Line x1={3} y1={2} x2={13} y2={2} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
                      <Line x1={3} y1={14} x2={13} y2={14} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
                    </Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fBold, fontSize: 13, color: '#FFFFFF', marginBottom: 3 }}>
                      Estamos com alta demanda agora
                    </Text>
                    {countdownPaused ? (
                      <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                        Por favor, aguarde só mais um pouco.
                      </Text>
                    ) : (
                      <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                        A análise do produto está sendo finalizada. Por favor, aguarde só mais{' '}
                        <Text style={{ fontFamily: fBold }}>{countdown}s</Text>.
                      </Text>
                    )}
                  </View>
                </View>
              )}

              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                {/* Círculo — mesma composição da product-loading, com as fotos no centro */}
                <View style={{
                  width: RING_SIZE + 44, height: RING_SIZE + 44,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Anel decorativo externo (hairline rosa) */}
                  <View style={{
                    position: 'absolute',
                    width: RING_SIZE + 44, height: RING_SIZE + 44,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,157,157,0.18)',
                  }} />

                  {/* Halo pulsante suave */}
                  <Animated.View style={[{
                    position: 'absolute',
                    width: RING_SIZE, height: RING_SIZE,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,157,157,0.10)',
                  }, haloStyle]} />

                  {/* Disco branco central (card flutuante) */}
                  <View style={{
                    position: 'absolute',
                    width: WHITE_D, height: WHITE_D,
                    borderRadius: 999,
                    backgroundColor: '#FFFFFF',
                    shadowColor: PINK,
                    shadowOffset: { width: 0, height: 12 },
                    shadowOpacity: 0.28,
                    shadowRadius: 28,
                    elevation: 10,
                  }} />

                  {/* Anel de progresso (preenche conforme a %) */}
                  <Svg
                    width={RING_SIZE}
                    height={RING_SIZE}
                    style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
                  >
                    <Defs>
                      <SvgLinearGradient id="splRing" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0%" stopColor={PINK_SOFT} />
                        <Stop offset="100%" stopColor={PINK} />
                      </SvgLinearGradient>
                    </Defs>
                    <Circle
                      cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                      stroke="rgba(29,58,68,0.06)" strokeWidth={RING_STROKE} fill="none"
                    />
                    <AnimatedCircle
                      cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R}
                      stroke="url(#splRing)" strokeWidth={RING_STROKE} fill="none"
                      strokeLinecap="round"
                      strokeDasharray={RING_C}
                      strokeDashoffset={ringOffsetAnim}
                    />
                  </Svg>

                  {/* Fotos alternando dentro do disco (no lugar do número) */}
                  <View style={{
                    width: PHOTO_D, height: PHOTO_D, borderRadius: PHOTO_D / 2,
                    overflow: 'hidden', backgroundColor: '#FFF7F7',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {!productUri && (
                      <Reanimated.View style={placeholderStyle}>
                        <ExpoImage
                          source={require('../../assets/home/niks-logo.png')}
                          style={{ width: 84, height: 85 }}
                          tintColor={PINK}
                          contentFit="contain"
                        />
                      </Reanimated.View>
                    )}

                    {productUri && faceUri && (
                      <ExpoImage
                        source={{ uri: faceUri }}
                        style={{ position: 'absolute', width: PHOTO_D, height: PHOTO_D }}
                        contentFit="cover"
                        onError={() => setFaceUri(null)}
                      />
                    )}

                    {productUri && (
                      <Reanimated.View
                        style={[{
                          position: 'absolute', width: PHOTO_D, height: PHOTO_D,
                          backgroundColor: '#FFFFFF',
                        }, productStyle]}
                      >
                        <ExpoImage
                          source={{ uri: productUri }}
                          style={{ width: PHOTO_D, height: PHOTO_D }}
                          contentFit="cover"
                        />
                      </Reanimated.View>
                    )}

                    {/* Varredura do scanner — faixa fina clara, sincronizada com o crossfade */}
                    <Reanimated.View
                      pointerEvents="none"
                      style={[{ position: 'absolute', top: -18, left: 0, width: PHOTO_D, height: 18 }, scanStyle]}
                    >
                      <LinearGradient
                        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,157,157,0.55)', 'rgba(255,255,255,0)']}
                        locations={[0, 0.45, 0.6, 1]}
                        style={{ flex: 1 }}
                      />
                    </Reanimated.View>
                  </View>
                </View>

                {!revealed ? (
                  <Reanimated.View exiting={FadeOut.duration(220)} style={{ alignItems: 'center', width: '100%' }}>
                    {/* Frase rotativa (fase atual) */}
                    <Animated.View style={{ opacity: phraseFadeAnim, marginTop: 44, paddingHorizontal: 24 }}>
                      <Text style={{
                        fontFamily: fSemi, fontSize: 17, color: DEEP_SOFT,
                        letterSpacing: -0.2, textAlign: 'center',
                      }}>
                        {phrase}
                      </Text>
                    </Animated.View>

                    {/* Subtexto fixo tranquilizador */}
                    <Text style={{
                      fontFamily: fSemi, fontSize: 13.5, color: DEEP_FAINT,
                      letterSpacing: -0.1, textAlign: 'center', marginTop: 10, paddingHorizontal: 32,
                    }}>
                      Isso leva só alguns segundos. Não feche o app.
                    </Text>

                    {/* Porcentagem — saiu do centro, virou número pequeno aqui */}
                    <Text style={{
                      fontFamily: fBold, fontSize: 15, color: DEEP_FAINT,
                      letterSpacing: -0.1, textAlign: 'center', marginTop: 14,
                    }}>
                      {displayPct}%
                    </Text>
                  </Reanimated.View>
                ) : (
                  /* Revelado: só o CTA. A análise completa continua no product-result. */
                  <Reanimated.View
                    entering={FadeInDown.delay(160).duration(420)}
                    style={{ width: '100%', paddingHorizontal: 24, marginTop: 48 }}
                  >
                    <TouchableOpacity
                      onPress={openFullAnalysis}
                      style={{
                        height: 60, borderRadius: 100, backgroundColor: PINK,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: PINK, shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
                      }}
                    >
                      <Text style={{ fontFamily: fBold, fontSize: 17, color: '#FFFFFF' }}>
                        Ver análise completa
                      </Text>
                    </TouchableOpacity>
                  </Reanimated.View>
                )}
              </View>
            </>
          ) : (
            /* Estados de falha — mesma casca de erro da product-loading */
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
              <View style={{
                width: '100%',
                backgroundColor: PINK,
                borderRadius: 16, padding: 13,
                flexDirection: 'row', alignItems: 'flex-start', gap: 9,
                marginBottom: 20,
              }}>
                <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginTop: 1, flexShrink: 0 }}>
                  <Path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="white" strokeWidth={1.4} strokeLinejoin="round" fill="none" />
                  <Line x1={8} y1={6.5} x2={8} y2={10} stroke="white" strokeWidth={1.4} strokeLinecap="round" />
                  <Circle cx={8} cy={11.8} r={0.75} fill="white" />
                </Svg>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fBold, fontSize: 13, color: '#FFFFFF', marginBottom: 3 }}>
                    {stage === 'no_image' ? 'Não conseguimos pegar a foto desse link' : 'Não conseguimos analisar agora'}
                  </Text>
                  <Text style={{ fontFamily: fSemi, fontSize: 12, color: '#FFFFFF', lineHeight: 18 }}>
                    {stage === 'no_image'
                      ? 'Tente compartilhar a imagem ou tirar uma foto do produto.'
                      : stage === 'extract_error'
                        ? 'Verifique sua conexão e tente de novo.'
                        : 'Estamos com alta demanda no momento. Tente novamente em instantes.'}
                  </Text>
                </View>
              </View>

              <Svg width={72} height={72} viewBox="0 0 72 72" style={{ marginBottom: 12 }}>
                <Circle cx={36} cy={36} r={33} stroke={PINK} strokeWidth={3} fill="none" />
                <Circle cx={24} cy={30} r={4} fill={PINK} />
                <Circle cx={48} cy={30} r={4} fill={PINK} />
                <Path d="M24 50 C28 44 44 44 48 50" stroke={PINK} strokeWidth={3} strokeLinecap="round" fill="none" />
              </Svg>

              <Text style={{ fontFamily: fBold, fontSize: 18, color: DEEP, textAlign: 'center', lineHeight: 24, marginBottom: 8 }}>
                Algo deu errado por aqui...
              </Text>
              <Text style={{ fontFamily: fSemi, fontSize: 14, color: DEEP_SOFT, textAlign: 'center', marginBottom: 32 }}>
                {stage === 'no_image'
                  ? 'Você pode tirar uma foto do produto agora'
                  : 'Toque para tentar novamente'}
              </Text>

              <TouchableOpacity
                onPress={stage === 'no_image' ? handleTakePhoto : handleRetry}
                style={{
                  width: '100%',
                  backgroundColor: PINK,
                  borderRadius: 100,
                  height: 60,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: PINK,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.45,
                  shadowRadius: 16, elevation: 8,
                }}
              >
                <Text style={{ fontFamily: fBold, fontSize: 17, color: '#FFFFFF' }}>
                  {stage === 'no_image' ? 'Tirar foto' : 'Tentar novamente'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleClose} style={{ paddingVertical: 14, marginTop: 6 }}>
                <Text style={{ fontFamily: fBold, fontSize: 15, color: DEEP_SOFT }}>Voltar</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </SafeAreaView>

      {webviewUrl && <HiddenPageImageReader url={webviewUrl} onResult={handleWebviewResult} timeoutMs={12_000} />}
      {consentGate}
    </View>
  );
}
