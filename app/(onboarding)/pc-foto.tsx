import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Ellipse } from 'react-native-svg';
import Sensivel from '../../components/Sensivel';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { t } from '../../lib/i18n';
import { registrarFotoPartida } from '../../lib/boasVindas';
import { BvScreen } from '../../components/boasVindas/kit';
import { PC, usePcFrame } from '../../components/posCompra/pcKit';

// Pós-compra v2 · tela 6 "Registre o seu antes"
// (design-handoff/pos-compra-v2/06-foto-de-ponto-de-partida.html).
// Mesma lógica da bv-foto: câmera FRONTAL de verdade dentro do card, com a moldura oval
// tracejada; a foto fica no cache do app (`registrarFotoPartida`) e, depois do cadastro, vira a
// Foto do dia 1. Não vai para IA nenhuma.
// Sem câmera (simulador) ou sem permissão: o card mostra a selfie do design (o oval já vem
// desenhado nela) e o disparo segue sem foto (em dev no simulador, abre a galeria).
const SELFIE = require('../../assets/pos-compra/selfie.jpg');
// Oval do design, medido na selfie (350 × 378): centro (175, 176), raios 102 × 137.
const OVAL = { cx: 175 / 350, cy: 176 / 378, rx: 102 / 350, ry: 137 / 378 };

export default function PcFoto() {
  const router = useRouter();
  const { track } = useMixpanel();
  const { top, bottom } = usePcFrame();
  const { width, height } = useWindowDimensions();
  const [perm, pedirPerm] = useCameraPermissions();
  const [foto, setFoto] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const cam = useRef<CameraView>(null);
  const tirando = useRef(false);
  const simulador = !Device.isDevice;
  const cameraOk = !simulador && !!perm?.granted;

  useEffect(() => {
    if (!simulador && perm && !perm.granted && perm.canAskAgain) void pedirPerm();
  }, [perm?.granted]);

  // Card de 350 × 378 no design; encolhe em tela baixa para não encostar no disparo.
  const cardW = width - 40;
  const cabecalho = 10 + 32 + 14 - 6 + 40 + 14 + 24 + 14;
  const rodape = 14 + 70 + 14 + 16;
  const cardH = Math.max(240, Math.min(cardW * (378 / 350), height - top - cabecalho - rodape - bottom - 8));

  const seguir = (tirou: boolean) => {
    track('boas_vindas_foto', { tirou, fluxo: 'pos_compra_v2' });
    router.push('/(onboarding)/pc-projecao' as any);
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
      console.warn('[pc-foto] falhou', e);
      tirando.current = false;
    }
  };

  const comOval = !!foto || cameraOk;

  return (
    <BvScreen fundo={<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />}>
      <View style={{ flex: 1, paddingTop: top, paddingBottom: bottom, paddingHorizontal: 20, gap: 14 }}>
        <Text style={{ marginTop: 10, fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, color: PC.ink }}>
          {t('Registre o seu antes')}
        </Text>
        <Text style={{ marginTop: -6, fontSize: 14, lineHeight: 20, color: PC.body }}>
          {t('Essa é a sua foto de ponto de partida. Daqui a 4 semanas, a gente compara.')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[t('Luz natural de frente'), t('Sem maquiagem')].map((dica) => (
            <View key={dica} style={{ backgroundColor: PC.blush, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: PC.ink }}>{dica}</Text>
            </View>
          ))}
        </View>

        <View style={{ width: cardW, height: cardH, borderRadius: 22, overflow: 'hidden', backgroundColor: '#EFE8E6' }}>
          {foto ? (
            <Image source={{ uri: foto }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
          ) : cameraOk ? (
            <Sensivel style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
              <CameraView ref={cam} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="front" mirror />
            </Sensivel>
          ) : (
            <Image source={SELFIE} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} resizeMode="cover" />
          )}
          {comOval && (
            <Svg pointerEvents="none" width={cardW} height={cardH} style={{ position: 'absolute', top: 0, left: 0 }}>
              <Ellipse
                cx={cardW * OVAL.cx} cy={cardH * OVAL.cy} rx={cardW * OVAL.rx} ry={cardH * OVAL.ry}
                fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2.5} strokeDasharray="8 6"
              />
            </Svg>
          )}
          {flash && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.55)' }} />}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={disparar}
            accessibilityRole="button"
            accessibilityLabel={t('Tirar foto')}
            style={{ width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: PC.pink, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: PC.pink }} />
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: PC.sub }}>{t('Só você vê. Fica guardada no seu perfil.')}</Text>
        </View>
      </View>
    </BvScreen>
  );
}
