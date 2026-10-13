import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  useWindowDimensions, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import * as ImageManipulator from 'expo-image-manipulator';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useAppStore, uploadScanPhoto } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { BG_STOPS, homeTheme, isNightTheme } from '../../lib/homeTheme';
import { invalidateCache } from '../../lib/cache';
import { haptics } from '../../lib/haptics';

// ── Ajustar a foto de perfil ────────────────────────────────────────────────────
// A usuária tocou na própria foto ("Seu progresso" ou Perfil — `lib/profilePhoto`) e
// escolheu uma da galeria. Aqui ela enquadra essa foto no círculo (arrastar + pinça).
// Visual na identidade do app (out/2026): fundo degradê de `lib/homeTheme` (dia/noite),
// voltar redondo branco, SF Pro, arco em degradê rosa #FF5EA8 → #FFDEED, botão rosa.
//
// No confirmar, o recorte vira um JPEG QUADRADO: a home continua fazendo só um
// `<Image resizeMode="cover">` no círculo, sem saber que essa tela existe.
//
// ⚠️ A foto gravada aqui tem precedência ABSOLUTA sobre a foto do scan na home
// (`users.foto_home_url` vs `skin_scans.foto_url`). Novos scans não a substituem.

const WHITE    = '#FFFFFF';
const INK      = '#121212';
const INK_MUTE = '#818181';
const PINK     = '#FF5EA8'; // rosa do app (botão, arco)
const PINK_LIGHT = '#FFDEED';

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

  const [saving, setSaving] = useState(false);


  // Diâmetro do círculo de enquadramento (o recorte é quadrado; as telas mostram em círculo).
  const D = Math.round(width * 0.62);
  const RING = 5; // espessura do arco

  const theme = homeTheme(isNightTheme(), 'rgba(255,226,236,0.40)');

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
      invalidateCache(`progresso:${user.id}`);
      invalidateCache(`perfil:${user.id}`);
      router.back(); // a home revalida ao ganhar foco — sem callback nem estado extra
    } catch (e: any) {
      setSaving(false); // a tela fica aberta: nada foi gravado, ela pode tentar de novo
      Alert.alert('Não deu certo', e?.message ?? 'Não conseguimos salvar sua foto. Tente de novo.');
    }
  };

  if (!draft) return <View style={styles.root} />;

  return (
    <View style={[styles.root, { backgroundColor: theme.base }]}>
      <LinearGradient colors={theme.bg} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />
      <View style={[styles.circleBlob, { backgroundColor: theme.blob }]} pointerEvents="none" />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              router.back();
            }}
            style={styles.backBtn}
            hitSlop={10}
            disabled={saving}
            accessibilityLabel="Voltar"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M15 5l-7 7 7 7" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ajuste sua foto</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Círculo de enquadramento com o arco em degradê rosa */}
        <View style={styles.photoWrap}>
          <LinearGradient
            colors={[PINK, PINK_LIGHT]}
            start={{ x: 0.33, y: 0 }}
            end={{ x: 0.67, y: 1 }}
            style={[styles.ring, { width: D + RING * 2, height: D + RING * 2, borderRadius: (D + RING * 2) / 2, padding: RING }]}
          >
            <GestureDetector gesture={gesture}>
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
            </GestureDetector>
          </LinearGradient>

          <Text style={styles.hint}>Arraste e pince para enquadrar</Text>
        </View>
      </SafeAreaView>

      {/* Botão fixo no rodapé */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.cta, saving && { opacity: 0.7 }]}
          onPress={handleConfirm}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.ctaText}>Usar esta foto</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Mesmas bolhas de fundo do Perfil / "Seu progresso".
  circleWhite: {
    position: 'absolute', width: 620, height: 620, borderRadius: 310,
    left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)',
  },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280,
    left: 190, top: -90,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: WHITE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  headerTitle: { fontSize: 17, fontWeight: '500', color: INK, letterSpacing: -0.3 },

  // Foto: centralizada no espaço entre o cabeçalho e o botão.
  photoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 90 },
  ring: {
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.14, shadowRadius: 15,
  },
  photoCircle: { overflow: 'hidden', backgroundColor: '#FDE6EF' },

  hint: { fontSize: 15, color: INK_MUTE, textAlign: 'center', marginTop: 24, letterSpacing: -0.2 },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  cta: {
    height: 48, minWidth: 200, paddingHorizontal: 28, borderRadius: 24,
    backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#121212', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaText: { fontSize: 18, fontWeight: '600', color: WHITE },
});
