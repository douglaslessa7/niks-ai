// ─────────────────────────────────────────────────────────────────────────────
// Câmera do scan em lote "Montar minha rotina com meus produtos" — réplica do Claude
// Design (`NiksLoteFlo`, telas 55b/55c/55d), em cima da câmera de verdade.
// Produto por produto (até 7), SÓ A FRENTE (decisão de 18/nov/2026: sem foto do rótulo;
// a lista de ingredientes vem da tabela no servidor). Cada foto fecha o produto (imagem
// da frente, lib/loteProdutos) e já pede o próximo; no 7º vai direto para a revisão. A
// fileira de 7 espaços mostra quantos já foram. "Pronto" (com 1+ produto) e o X (com
// produtos) levam à revisão; sem produtos, o X sai. Nada é analisado aqui.
// No simulador (sem câmera), o disparador abre a galeria.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Animated, Easing, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image as ExpoImage } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import Svg, { Path } from 'react-native-svg';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';
import { MAX_PRODUTOS_LOTE, montarProduto, useLote } from '../../lib/loteProdutos';
import { usePalco } from '../../lib/palco';
import { t } from '../../lib/i18n';

const PINK = '#FF5EA8';
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// Moldura do design (left/right 36, top 244, altura 392).
const MOLD = { x: 36, y: 244, w: 393 - 72, h: 392 };

export default function LoteCamera() {
  const router = useRouter();
  const { consentGate } = useScanConsentGate();
  const palco = usePalco();
  const produtos = useLote((s) => s.produtos);
  const adicionar = useLote((s) => s.adicionar);

  const [ocupado, setOcupado] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const isSimulator = !Device.isDevice;

  const count = produtos.length;
  const numero = Math.min(count + 1, MAX_PRODUTOS_LOTE);
  const cheio = count >= MAX_PRODUTOS_LOTE;

  // Flash da foto (.28s) · disparador apertado (.15s).
  const flash = useRef(new Animated.Value(0)).current;
  const piscar = () => {
    flash.setValue(0.85);
    Animated.timing(flash, { toValue: 0, duration: 280, delay: 140, easing: EASE, useNativeDriver: true }).start();
  };
  const shut = useRef(new Animated.Value(1)).current;
  const apertar = (v: number) => Animated.timing(shut, { toValue: v, duration: 150, easing: EASE, useNativeDriver: true }).start();

  // Uma foto (câmera ou, no simulador, galeria).
  const fotografar = async (): Promise<string | null> => {
    if (isSimulator) {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      return r.canceled ? null : r.assets[0]?.uri ?? null;
    }
    const foto = await cameraRef.current?.takePictureAsync({ quality: 0.9, base64: false });
    return foto?.uri ?? null;
  };

  // Fecha o produto (só a frente) → imagem → próximo.
  const fecharProduto = async (frente: string) => {
    adicionar(await montarProduto(frente, null));
    if (count + 1 >= MAX_PRODUTOS_LOTE) router.replace('/(scan)/lote-revisao' as any);
  };

  const disparar = async () => {
    if (ocupado || cheio) return;
    haptics.action();
    setOcupado(true);
    try {
      const uri = await fotografar();
      if (!uri) return;
      piscar();
      await fecharProduto(uri);
    } catch (e) {
      console.warn('[lote-camera] foto falhou:', e);
      Alert.alert(t('Não deu para usar essa foto'), t('Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  // X: com produtos, vai para a revisão (de lá dá para sair); sem produtos, sai.
  const fechar = () => {
    haptics.tap();
    if (count === 0) { router.back(); return; }
    router.push('/(scan)/lote-revisao' as any);
  };
  const revisar = () => { haptics.tap(); router.push('/(scan)/lote-revisao' as any); };

  if (!isSimulator && !permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
          {t('O NIKS AI precisa da câmera para fotografar seus produtos.')}
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.tap(); requestPermission(); }}
          style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>{t('Permitir câmera')}</Text>
        </TouchableOpacity>
        {consentGate}
      </View>
    );
  }

  // Véu fora da moldura (o box-shadow 0 0 0 999px rgba(10,8,9,.48) do design).
  const m = palco.naTela(MOLD.x, MOLD.y, MOLD.w, MOLD.h);
  const VEU = 'rgba(10,8,9,0.48)';

  // Fileira de 7 espaços.
  const tray = Array.from({ length: MAX_PRODUTOS_LOTE }, (_, i) => {
    const done = i < count;
    const curr = i === count;
    return { i, done, curr, img: done ? produtos[i].frenteUri : null };
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#0F0D0E' }}>
      <StatusBar style="light" />
      {!isSimulator && permission?.granted && (
        <CameraView ref={cameraRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" />
      )}

      {/* Véu em volta da moldura (tela inteira) */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: m.y, backgroundColor: VEU }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: m.y + m.h, bottom: 0, backgroundColor: VEU }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: m.x, top: m.y, height: m.h, backgroundColor: VEU }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: m.x + m.w, right: 0, top: m.y, height: m.h, backgroundColor: VEU }} />

      <View style={palco.style} pointerEvents="box-none">
        {/* Cantos rosa da moldura */}
        <View pointerEvents="none" style={[st.canto, { left: 36, top: 244, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 24 }]} />
        <View pointerEvents="none" style={[st.canto, { right: 36, top: 244, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 24 }]} />
        <View pointerEvents="none" style={[st.canto, { left: 36, top: 594, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 24 }]} />
        <View pointerEvents="none" style={[st.canto, { right: 36, top: 594, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 24 }]} />

        {/* Topo: fechar · "Produto N" */}
        <View style={{ position: 'absolute', left: 18, right: 18, top: 54, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity onPress={fechar} accessibilityLabel={t('Fechar')} activeOpacity={0.85} style={st.fechar}>
            <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" /></Svg>
          </TouchableOpacity>
          <Text style={st.produtoN}>{t('Produto {{n}}', { n: numero })}</Text>
          <View style={{ width: 40, height: 40 }} />
        </View>

        {/* Instrução */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 28, right: 28, top: 152, alignItems: 'center', gap: 5 }}>
          <Text style={st.titulo}>{t('Foto da frente')}</Text>
          <Text style={st.sub}>{t('Com o nome e a marca bem visíveis.')}</Text>
        </View>

        {/* Fileira de 7 espaços + contagem */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 660, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {tray.map((t) => (
            <View
              key={t.i}
              style={[st.slot,
                t.done ? { backgroundColor: '#FFFFFF' }
                  : t.curr ? { backgroundColor: 'rgba(255,94,168,0.12)', borderWidth: 2, borderColor: PINK }
                    : { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)' }]}
            >
              {t.img ? <ExpoImage source={{ uri: t.img }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                : t.curr ? <Text style={st.slotN}>{t.i + 1}</Text> : null}
            </View>
          ))}
        </View>
        <Text pointerEvents="none" style={st.trayNote}>{count === 0 ? t('Até {{max}} produtos', { max: MAX_PRODUTOS_LOTE }) : t('{{n}} de {{max}} produtos', { n: count, max: MAX_PRODUTOS_LOTE })}</Text>

        {/* Frente com produtos: "Pronto" — deixa óbvio que não precisa chegar a 7
            (no design era "Revisar (N)"; trocado a pedido do Douglas). Leva à revisão. */}
        {count > 0 && (
          <TouchableOpacity onPress={revisar} disabled={ocupado} activeOpacity={0.85} style={st.revisar}>
            <Text style={st.revisarTxt}>{t('Pronto')}</Text>
          </TouchableOpacity>
        )}

        {/* Disparador */}
        <Pressable
          onPress={disparar}
          onPressIn={() => apertar(0.88)}
          onPressOut={() => apertar(1)}
          disabled={ocupado || cheio}
          accessibilityLabel={t('Fotografar a frente')}
          style={[st.disparador, { opacity: cheio ? 0.4 : 1 }]}
        >
          {ocupado
            ? <ActivityIndicator color="#FFFFFF" />
            : <Animated.View style={[st.disparadorMiolo, { transform: [{ scale: shut }] }]} />}
        </Pressable>
      </View>

      {/* Flash da foto */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', opacity: flash }} />
      {consentGate}
    </View>
  );
}

const st = {
  canto: { position: 'absolute' as const, width: 42, height: 42, borderColor: PINK },
  fechar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center' as const, justifyContent: 'center' as const },
  produtoN: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.3, color: '#FFFFFF' },
  titulo: { fontSize: 24, fontWeight: '700' as const, lineHeight: 29, letterSpacing: -0.6, color: '#FFFFFF', textAlign: 'center' as const },
  sub: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: 'rgba(255,255,255,0.72)', textAlign: 'center' as const },
  slot: { width: 34, height: 34, borderRadius: 10, overflow: 'hidden' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
  slotN: { fontSize: 13, fontWeight: '700' as const, color: PINK },
  trayNote: { position: 'absolute' as const, left: 0, right: 0, top: 704, textAlign: 'center' as const, fontSize: 12, fontWeight: '500' as const, color: 'rgba(255,255,255,0.5)' },
  revisar: {
    position: 'absolute' as const, right: 20, top: 742, height: 40, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 16, borderRadius: 100, backgroundColor: PINK,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 8,
  },
  revisarTxt: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.25, color: '#FFFFFF' },
  disparador: {
    position: 'absolute' as const, left: (393 - 76) / 2, top: 724, width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  disparadorMiolo: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },
};
