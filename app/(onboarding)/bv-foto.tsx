import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useOnMount } from '../../components/onboarding/kit';
import { registrarFotoPartida } from '../../lib/boasVindas';
import {
  BV, BvScreen, BvProgresso, BvEtiqueta, BvTitulo, useBvFrame,
} from '../../components/boasVindas/kit';

// Boas-vindas · tela 3 "Foto de partida" (frame "03"). Câmera FRONTAL de verdade dentro do
// card, com a moldura oval tracejada. A foto fica no cache do app (`registrarFotoPartida`) e,
// depois do cadastro, vira a Foto do dia 1 (`routine-photos`). Não vai
// para IA nenhuma.
// Só a foto de FRENTE: o seletor Frente/Esquerda/Direita do design saiu (07/nov/2026, pedido
// do produto) — dentro do card fica só a moldura oval.
// Sem câmera (simulador) ou sem permissão: o card mostra a foto de exemplo do design e o
// disparo segue sem foto (em dev no simulador, abre a galeria).
// ⚠️ PROVISÓRIO (copiado do design): o selo "+50 pontos" (o que ela ganha de verdade são os
// +100 da tela 6, todos juntos).
const EXEMPLO = require('../../assets/home-grupo/model-face-3.png');

export default function BvFoto() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { y, b } = useBvFrame();
  const { height } = useWindowDimensions();
  const [perm, pedirPerm] = useCameraPermissions();
  const [foto, setFoto] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const cam = useRef<CameraView>(null);
  const tirando = useRef(false);
  const simulador = !Device.isDevice;
  const cameraOk = !simulador && !!perm?.granted;

  useOnMount(() => track('boas_vindas_tela', { tela: 3, nome: 'foto' }));
  useEffect(() => {
    if (!simulador && perm && !perm.granted && perm.canAskAgain) void pedirPerm();
  }, [perm?.granted]);

  // Card de 390 pt no design; encolhe em tela baixa para não encostar no disparo.
  const topo = y(104);
  const cabecalho = 159;
  const cardH = Math.max(220, Math.min(390, height - topo - cabecalho - b(66) - 78 - 14));
  const k = cardH / 390;

  const seguir = (tirou: boolean) => {
    track('boas_vindas_foto', { tirou });
    router.push('/(onboarding)/bv-projecao' as any);
  };

  const disparar = async () => {
    if (tirando.current) return;
    tirando.current = true;
    haptics.action();
    try {
      let uri: string | null = null;
      if (cameraOk) {
        uri = (await cam.current?.takePictureAsync({ quality: 0.8 }))?.uri ?? null;
      } else if (__DEV__ && simulador) {
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 });
        uri = r.canceled ? null : r.assets?.[0]?.uri ?? null;
      }
      if (!uri) { seguir(false); return; }
      const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1080 } }], {
        compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true,
      });
      setFlash(true);
      setFoto(small.uri);
      haptics.success();
      if (small.base64) await registrarFotoPartida(small.base64);
      setTimeout(() => { setFlash(false); seguir(true); }, 700);
    } catch (e) {
      console.warn('[bv-foto] falhou', e);
      tirando.current = false;
    }
  };

  return (
    <BvScreen>
      <BvProgresso feitas={2} />

      <View style={{ position: 'absolute', left: 0, right: 0, top: topo, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BvEtiqueta>MISSÃO DO DIA 1</BvEtiqueta>
          <View style={{
            height: 26, paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#FFFFFF', justifyContent: 'center',
            shadowColor: BV.pink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 5,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: BV.pink }}>+50 pontos</Text>
          </View>
        </View>
        <BvTitulo style={{ marginTop: 10 }}>Sua foto de ponto de partida</BvTitulo>
        <View style={{ marginTop: 14, flexDirection: 'row', gap: 6 }}>
          {['Luz natural de frente', 'Sem maquiagem'].map((t) => (
            <View key={t} style={{ height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: BV.card, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: BV.ink }}>{t}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 16, height: cardH, borderRadius: 28, overflow: 'hidden', backgroundColor: '#E9DCE1' }}>
          {foto ? (
            <Image source={{ uri: foto }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
          ) : cameraOk ? (
            <CameraView ref={cam} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="front" mirror />
          ) : (
            <Image source={EXEMPLO} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} resizeMode="cover" />
          )}

          {/* Moldura oval tracejada (206 × 276 a 44 pt do topo do card) */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 44 * k, alignSelf: 'center', width: 206 * k, height: 276 * k }}>
            <Svg width={206 * k} height={276 * k}>
              <Ellipse cx={103 * k} cy={138 * k} rx={103 * k - 1.25} ry={138 * k - 1.25}
                fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={2.5} strokeDasharray="8 6" />
            </Svg>
          </View>

          {flash && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.55)' }} />}
        </View>
      </View>

      {/* Disparo */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: b(66), alignItems: 'center' }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={disparar}
          accessibilityRole="button"
          accessibilityLabel="Tirar a foto de partida"
          style={{ width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: BV.pink, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{
            width: 62, height: 62, borderRadius: 31, backgroundColor: BV.pink,
            shadowColor: BV.pink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 8,
          }} />
        </TouchableOpacity>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: b(30), flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        <Svg width={13} height={13} viewBox="0 0 24 24">
          <Rect x={4} y={11} width={16} height={10} rx={2.5} fill="none" stroke={BV.sub} strokeWidth={2.2} />
          <Path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke={BV.sub} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
        <Text style={{ fontSize: 13, color: BV.sub }}>Só você vê. Fica guardada no seu perfil.</Text>
      </View>
    </BvScreen>
  );
}
