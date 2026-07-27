import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  useWindowDimensions, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold } from '@expo-google-fonts/nunito';
import { ChevronLeft } from 'lucide-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useAppStore, uploadScanPhoto } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { getScoreTheme } from '../../lib/scoreTheme';
import { invalidateCache } from '../../lib/cache';
import { haptics } from '../../lib/haptics';

// ── Ajustar a foto da home ──────────────────────────────────────────────────────
// A usuária tocou na própria foto na home e escolheu uma da galeria. Aqui ela enquadra
// essa foto DENTRO do círculo exato da home (mesmo diâmetro, mesmo anel, mesmo score em
// cima) — por isso a tela é um mini-espelho da home, e não um cropper genérico.
//
// No confirmar, o recorte vira um JPEG QUADRADO: a home continua fazendo só um
// `<Image resizeMode="cover">` no círculo, sem saber que essa tela existe.
//
// ⚠️ A foto gravada aqui tem precedência ABSOLUTA sobre a foto do scan na home
// (`users.foto_home_url` vs `skin_scans.foto_url`). Novos scans não a substituem.

const WHITE    = '#FFFFFF';
const INK      = '#121212';
const INK_MUTE = '#818181';
const CORAL    = '#FF9D9D'; // rosa da Rotina (cor primária do app)

const MIN_SCALE = 1;   // 1 = a imagem já cobre o círculo (base); nunca deixa buraco
const MAX_SCALE = 4;
const OUT_SIZE  = 1080; // lado do JPEG final

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function AjustarFoto() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const draft = useAppStore((s) => s.homePhotoDraft);
  const setHomePhotoDraft = useAppStore((s) => s.setHomePhotoDraft);
  const skinScore = useAppStore((s) => s.skinScore);

  const [saving, setSaving] = useState(false);

  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold' : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold' : undefined;

  // Geometria idêntica à da home (home.tsx) — é o ponto da tela: ela vê o formato real.
  const D        = Math.round(width * 0.58);          // foto = 228/393 (Figma node 1:51)
  const LOGO     = Math.round(width * (49 / 393));    // sparkle do topo (Figma node 1:385)
  const RING_IMG = D * (265.005 / 228);               // anel: asset cobre 265, círculo interno 228

  const theme = getScoreTheme(skinScore);

  // Sem foto no store (entrou direto na rota, ou o store foi resetado): não há o que ajustar.
  useEffect(() => {
    if (!draft) router.back();
  }, [draft, router]);

  // `base` = escala que faz a imagem COBRIR o círculo. Com scale 1 já não sobra buraco.
  const iw = draft?.width ?? 1;
  const ih = draft?.height ?? 1;
  const base = Math.max(D / iw, D / ih);
  const dw = iw * base; // tamanho exibido com scale 1, em pontos
  const dh = ih * base;

  // ── Gestos: pan + pinch, em pontos de tela ────────────────────────────────────
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const savedScale = useSharedValue(1);

  // Espelho na thread JS: o recorte é calculado no confirmar, fora do worklet.
  const pose = useRef({ tx: 0, ty: 0, scale: 1 });
  const commit = useCallback((x: number, y: number, sc: number) => {
    pose.current = { tx: x, ty: y, scale: sc };
  }, []);

  // A área recortada nunca pode sair da imagem: o centro fica preso a (exibido − D)/2.
  const clampPose = (x: number, y: number, sc: number): { x: number; y: number } => {
    'worklet';
    const maxX = Math.max(0, (dw * sc - D) / 2);
    const maxY = Math.max(0, (dh * sc - D) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const p = clampPose(savedTx.value + e.translationX, savedTy.value + e.translationY, scale.value);
      tx.value = p.x;
      ty.value = p.y;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(commit)(tx.value, ty.value, scale.value);
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const sc = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
      scale.value = sc;
      // Reprende: ao ENCOLHER, a foto pode passar a descobrir a borda do círculo.
      const p = clampPose(tx.value, ty.value, sc);
      tx.value = p.x;
      ty.value = p.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(commit)(tx.value, ty.value, scale.value);
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  // RN compõe o array como M = translate · scale, então a translação está em pontos de
  // TELA (não escalados). O recorte abaixo depende disso — não reordenar.
  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  // ── Confirmar: recorta, sobe e grava ──────────────────────────────────────────
  const handleConfirm = async () => {
    if (!draft || saving) return;
    haptics.action();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada.');

      // Um ponto a offset `o` do centro do círculo veio do pixel `(o − t)/eff` da origem.
      // O recorte é a caixa D×D centrada no círculo → lado `D/eff` em pixels da imagem.
      const { tx: px, ty: py, scale: sc } = pose.current;
      const eff = base * sc;
      const size = Math.round(D / eff);
      const originX = Math.round(iw / 2 - (D / 2 + px) / eff);
      const originY = Math.round(ih / 2 - (D / 2 + py) / eff);

      const out = await ImageManipulator.manipulateAsync(
        draft.uri,
        [
          {
            crop: {
              originX: clamp(originX, 0, Math.max(0, iw - size)),
              originY: clamp(originY, 0, Math.max(0, ih - size)),
              width: Math.min(size, iw),
              height: Math.min(size, ih),
            },
          },
          { resize: { width: OUT_SIZE } },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!out.base64) throw new Error('Falha ao processar a imagem.');

      // Mesmo bucket privado dos scans; o prefixo `home_` separa da foto de análise.
      const url = await uploadScanPhoto(user.id, out.base64, 'home_');

      const { error } = await supabase
        .from('users')
        .update({ foto_home_url: url })
        .eq('id', user.id);
      if (error) throw error;

      setHomePhotoDraft(null);
      // A home lê de cache agora, então precisa ser avisada que a foto mudou —
      // sem isso ela mostraria a foto antiga até o cache vencer.
      invalidateCache(`home:${user.id}`);
      router.back(); // a home revalida ao ganhar foco — sem callback nem estado extra
    } catch (e: any) {
      setSaving(false); // a tela fica aberta: nada foi gravado, ela pode tentar de novo
      Alert.alert('Não deu certo', e?.message ?? 'Não conseguimos salvar sua foto. Tente de novo.');
    }
  };

  if (!draft) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      {/* Mesmo gradiente da home, na cor da faixa do score */}
      <LinearGradient
        colors={['#FFFFFF', '#FFFFFF', theme.heroSoft, theme.heroMed, '#F9F9F9']}
        locations={[0, 0.5, 0.72, 0.82, 1]}
        style={styles.heroGradient}
        pointerEvents="none"
      />

      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              router.back();
            }}
            style={styles.backBtn}
            hitSlop={10}
            disabled={saving}
          >
            <ChevronLeft size={26} color={INK} strokeWidth={2.2} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontFamily: fBold }]}>Ajuste sua foto</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Bloco do score — idêntico ao da home, para ela ver o resultado no contexto */}
        <View style={styles.scoreBlock}>
          <Image
            source={theme.logo}
            style={[styles.scoreLogo, { width: LOGO, height: Math.round(LOGO * (199 / 196)) }]}
          />
          <Text style={[styles.scoreNumber, { fontFamily: fXBold, color: theme.score }]}>
            {skinScore != null ? skinScore : '—'}
          </Text>
          <Text style={[styles.scoreLabel, { fontFamily: fXBold }]}>Niks score</Text>
          <Image source={theme.underline} style={styles.scoreUnderline} resizeMode="stretch" />
        </View>

        {/* Círculo no diâmetro exato da home + anel do tema por cima */}
        <View style={styles.photoWrap}>
          <GestureDetector gesture={gesture}>
            <View style={{ width: D, height: D }}>
              <View style={[styles.photoCircle, { width: D, height: D, borderRadius: D / 2 }]}>
                <Animated.Image
                  source={{ uri: draft.uri }}
                  style={[
                    {
                      position: 'absolute',
                      width: dw,
                      height: dh,
                      left: (D - dw) / 2,
                      top: (D - dh) / 2,
                    },
                    imgStyle,
                  ]}
                />
              </View>
              {/* `pointerEvents="none"` no View: o anel não pode roubar o toque do
                  GestureDetector (no iOS o RNGH faz hit-test através das subviews). */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: RING_IMG, height: RING_IMG,
                  left: (D - RING_IMG) / 2, top: (D - RING_IMG) / 2,
                }}
              >
                <Image source={theme.ringImg} style={{ width: '100%', height: '100%' }} />
              </View>
            </View>
          </GestureDetector>
        </View>

        <Text style={[styles.hint, { fontFamily: fSemi }]}>
          Arraste e pince para enquadrar
        </Text>
      </SafeAreaView>

      {/* Botão fixo no rodapé */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.cta, saving && { opacity: 0.7 }]}
          onPress={handleConfirm}
          activeOpacity={0.9}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={[styles.ctaText, { fontFamily: fBold }]}>Usar esta foto</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F9F9' },
  heroGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 520 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, height: 44,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, color: INK, letterSpacing: -0.4 },

  // Score (mesmos valores da home)
  scoreBlock: { alignItems: 'center', paddingTop: 2 },
  scoreLogo: { resizeMode: 'contain' },
  scoreNumber: { fontSize: 72, letterSpacing: -2.88, marginTop: 2 },
  scoreLabel: { fontSize: 30.5, color: INK, letterSpacing: -1.2, marginTop: -14 },
  scoreUnderline: { width: 160, height: 7, marginTop: 3 },

  // Foto
  photoWrap: { alignItems: 'center', marginTop: 10, width: '100%' },
  photoCircle: { overflow: 'hidden', backgroundColor: '#F3F3F4' },

  hint: { fontSize: 14, color: INK_MUTE, textAlign: 'center', marginTop: 28 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  cta: {
    height: 48, minWidth: 180, paddingHorizontal: 28, borderRadius: 999,
    backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center',
    shadowColor: CORAL, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaText: { fontSize: 16, color: WHITE, letterSpacing: -0.3 },
});
