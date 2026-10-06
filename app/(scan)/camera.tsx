import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Device from 'expo-device';
import Svg, { Path, Line } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';
import { OB, OB_STEPS, obStep, useObFrame, useOnMount } from '../../components/onboarding/kit';
import { syncOnboardingPrefetch } from '../../lib/onboardingPrefetch';
import { SCAN_STEPS, ringTicks, ringBack } from '../../components/onboarding/scanRing';
import { FaceScanMesh } from '../../components/onboarding/FaceScanMesh';

// Tela 7 do fluxo completo — scan "girando o rosto" (SÓ o onboarding; o scan de
// dentro do app é a `camera-multi`).
//
// Câmera frontal em tela cheia, escurecida fora de uma moldura OVAL (236 × 316 no
// design, centro em y 392) e, em volta dela, um anel de 72 traços. São 3 FOTOS, uma
// por etapa, e cada etapa é dona de um terço do anel:
//   1. de frente            → traços de cima e de baixo;
//   2. olhando para a ESQUERDA da tela → arco da esquerda;
//   3. olhando para a DIREITA da tela  → arco da direita.
// Na etapa da vez, o arco do lado para onde ela olha fica em destaque (traços
// brancos maiores, pulsando) e vai ficando ROSA traço a traço; quando o arco fecha,
// a foto é tirada. Com as três, o anel inteiro está rosa.
//
// ⚠️ É ANIMAÇÃO GUIADA POR TEMPO, não detecção de pose: a câmera não sabe se ela
// virou o rosto (seria uma lib nativa de detecção facial). A instrução troca, ela
// tem `TURN_MS` para virar, o arco enche em `FILL_MS` e a foto sai no fim.
//
// Para a IA vai só a foto de FRENTE (`setSkinImage`, como antes — a `analyze-skin`
// do onboarding é de 1 foto). As laterais ficam em `skinScanSideUris` (store, em
// memória) até a função aceitar mais imagens. A foto NÃO é espelhada (`mirror`
// desligado, como na `camera-multi`): esquerda/direita da análise são as do rosto.
//
// DENTRO do oval: malha 3D branca + linha de scan com brilho rosa + faíscas
// (`components/onboarding/FaceScanMesh.tsx`, referência do produto). A malha gira para
// o lado da etapa da vez (`YAW`) no mesmo relógio do anel. Também é animação — não
// segue o rosto.
//
// O design tem uma pílula "Luz boa" no topo; ela ficou de fora porque a câmera não
// mede a luz. O card embaixo mostra só a instrução da etapa (a contagem "N de 3
// fotos" que ficava nele foi tirada a pedido do produto).
const N_TICKS = 72;
const OVAL_W = 236;
const OVAL_H = 316;
const CENTER_Y = 392;           // centro do oval no frame do design
const TURN_MS = 1100;           // tempo para ela virar o rosto antes de o arco encher
const FILL_MS = 2200;           // arco enchendo
const GROW_MS = 420;            // cada traço "nasce" rosa nesse tempo (easing com overshoot)
const YAW = 0.7;                // quanto a malha gira nas etapas de lado (rad, ~40°)
const MESH_FADE_MS = 500;
const easeInOut = (x: number) => { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

// Etapas, arcos e ordem dos traços: `components/onboarding/scanRing.ts` (o tutorial
// da tela 6 desenha o mesmo anel). 72 traços → 24 por etapa.
const STEPS = SCAN_STEPS;
const TICKS = ringTicks(N_TICKS);
const back = ringBack;

export default function Camera() {
  const router = useRouter();
  const { consentGate, granted } = useScanConsentGate();
  const setSkinImage = useAppStore((s) => s.setSkinImage);
  const setSkinScanSideUris = useAppStore((s) => s.setSkinScanSideUris);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const { track } = useMixpanel();
  const { width, height } = useWindowDimensions();
  const { insets, y } = useObFrame();
  // `retake=1`: veio do erro do loading da foto — a foto nova volta direto para lá.
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const isSimulator = !Device.isDevice;
  // Só em desenvolvimento, no simulador (sem câmera): a linha do tempo roda sem tirar
  // foto, em loop — para ver e ajustar a animação. (O botão de galeria de __DEV__ foi
  // tirado a pedido do produto; para seguir o fluxo no simulador, a foto entra pelo
  // depurador do Metro — ver README, "Navegar e preencher o store".)
  const demo = __DEV__ && isSimulator;
  const scanStart = useRef(0);

  // Linha do tempo: etapa atual + quando ela começou. `doneArcs` = arcos já fotografados.
  const [stepIdx, setStepIdx] = useState(-1);          // -1 = ainda não começou
  const [attempt, setAttempt] = useState(0);           // refazer a MESMA etapa reinicia o relógio
  const stepStart = useRef(0);
  const [, setFrame] = useState(0);
  const litAt = useRef<number[]>(Array(N_TICKS).fill(-1)); // instante em que cada traço ficou rosa
  const photos = useRef<{ uri: string; base64?: string }[]>([]);
  const capturingRef = useRef(false);
  const finishedRef = useRef(false);
  const mountedRef = useRef(true);

  useOnMount(() => track('onboarding_step_viewed', obStep(OB_STEPS.camera, 'Scan - Câmera')));
  useEffect(() => () => { mountedRef.current = false; }, []);

  const canRun = demo ? granted : granted && !isSimulator && !!permission?.granted && cameraReady;

  // Começa a etapa 1 quando a câmera está pronta (e o consentimento dado).
  useEffect(() => {
    if (!canRun || stepIdx !== -1) return;
    stepStart.current = Date.now();
    scanStart.current = Date.now();
    setStepIdx(0);
  }, [canRun, stepIdx]);

  // Relógio da animação (um quadro por frame enquanto há etapa em curso).
  useEffect(() => {
    if (stepIdx < 0 || stepIdx >= STEPS.length) return;
    let id: number;
    const loop = () => {
      const now = Date.now();
      const elapsed = now - stepStart.current - TURN_MS;
      const arc = STEPS[stepIdx].id;
      const p = Math.max(0, Math.min(1, elapsed / FILL_MS));
      TICKS.forEach((t, i) => {
        if (t.arc === arc && litAt.current[i] < 0 && t.order <= p) litAt.current[i] = now;
      });
      setFrame((f) => f + 1);
      if (p >= 1) { capture(stepIdx); return; }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [stepIdx, attempt]);

  const capture = async (idx: number) => {
    if (capturingRef.current) return;
    if (demo) {
      // Demonstração: sem câmera, só avança (e recomeça depois da última etapa).
      if (idx === STEPS.length - 1) litAt.current = Array(N_TICKS).fill(-1);
      stepStart.current = Date.now();
      setStepIdx((idx + 1) % STEPS.length);
      return;
    }
    capturingRef.current = true;
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.7, base64: false });
      if (!shot?.uri) throw new Error('Falha ao capturar');
      // Normaliza a orientação EXIF. Só a de frente precisa de base64 (vai para a IA).
      const out = await ImageManipulator.manipulateAsync(
        shot.uri, [], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: idx === 0 },
      );
      if (idx === 0 && !out.base64) throw new Error('Falha ao processar foto');
      photos.current[idx] = { uri: out.uri, base64: out.base64 };
      if (!mountedRef.current) return;
      if (idx === STEPS.length - 1) { haptics.success(); finish(); return; }
      haptics.tap();
      stepStart.current = Date.now();
      setStepIdx(idx + 1);
    } catch (error) {
      if (!mountedRef.current) return;
      // Refaz a etapa do zero (o arco dela volta a encher).
      TICKS.forEach((t, i) => { if (t.arc === STEPS[idx].id) litAt.current[i] = -1; });
      Alert.alert('Erro', 'Não foi possível capturar a foto. Vamos tentar de novo.', [{
        text: 'OK', onPress: () => { stepStart.current = Date.now(); setAttempt((n) => n + 1); },
      }]);
    } finally {
      capturingRef.current = false;
    }
  };

  const goNext = (front: { uri: string; base64: string }, sides: string[]) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    track('onboarding_step_completed', obStep(OB_STEPS.camera, 'Scan - Câmera'));
    setSkinImage(front.base64, front.uri);
    setSkinScanSideUris(sides);
    // Antes/depois E relatório já saem daqui (só precisam da foto). Ver `lib/onboardingPrefetch.ts`.
    syncOnboardingPrefetch();
    if (retake === '1') router.replace('/(scan)/analisando-foto' as any);
    else router.push('/(scan)/analisando-foto' as any);
  };

  const finish = () => {
    const [front, left, right] = photos.current;
    if (!front?.base64) return;
    goNext({ uri: front.uri, base64: front.base64 }, [left?.uri, right?.uri].filter(Boolean) as string[]);
  };

  const showTips = () => {
    haptics.tap();
    Alert.alert(
      'Como fazer o scan',
      'Fique num lugar bem iluminado, com o rosto limpo, sem óculos e com o cabelo preso. Siga a instrução embaixo do círculo e mova a cabeça devagar.',
    );
  };

  // ── Geometria ─────────────────────────────────────────────────────────────
  const cx = width / 2;
  const cy = y(CENTER_Y);
  const rx = OVAL_W / 2;
  const ry = OVAL_H / 2;
  const now = Date.now();
  const activeArc = stepIdx >= 0 && stepIdx < STEPS.length ? STEPS[stepIdx].id : null;
  const pulse = (Math.sin(now / 160) + 1) / 2;
  const ovalPath = `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${OVAL_W} 0 a${rx} ${ry} 0 1 0 ${-OVAL_W} 0 Z`;
  const veil = `M0 0 H${width} V${height} H0 Z ${ovalPath}`;
  const instruction = activeArc ? STEPS[stepIdx].text : 'Encaixe o rosto no círculo';
  // Malha: de frente na 1ª etapa, gira para a esquerda da tela na 2ª e para a direita na 3ª.
  const turnK = easeInOut((now - stepStart.current) / TURN_MS);
  const yaw = stepIdx === 1 ? -YAW * turnK : stepIdx === 2 ? -YAW + 2 * YAW * turnK : stepIdx > 2 ? YAW : 0;
  const meshOpacity = stepIdx < 0 ? 0 : Math.min(1, (now - scanStart.current) / MESH_FADE_MS);

  if (!isSimulator && !permission?.granted) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
        <StatusBar style="light" />
        <Text style={{ color: '#FFFFFF', fontSize: 17, lineHeight: 23, textAlign: 'center', marginBottom: 24 }}>
          A NIKS precisa da câmera para analisar sua pele.
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.action(); requestPermission(); }}
          style={{ backgroundColor: OB.pink, height: 48, paddingHorizontal: 28, borderRadius: 24, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>Permitir câmera</Text>
        </TouchableOpacity>
        {consentGate}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="light" />

      {!isSimulator && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          onCameraReady={() => setCameraReady(true)}
        />
      )}

      {/* Véu escuro com o furo oval + anel de traços */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={veil} fill="rgba(0,0,0,0.62)" fillRule="evenodd" />
        {stepIdx >= 0 && (
          <FaceScanMesh cx={cx} cy={cy} rx={rx} ry={ry} t={now - scanStart.current} yaw={yaw} opacity={meshOpacity} />
        )}
        {TICKS.map((t, i) => {
          const at = litAt.current[i];
          const lit = at >= 0;
          const age = lit ? now - at : 0;
          const g = lit ? back(Math.min(1, age / GROW_MS)) : 0;
          const head = lit && age < 900 ? Math.sin(Math.min(1, age / 900) * Math.PI) * 4 : 0;
          const focus = !lit && t.arc === activeArc;
          const r0 = 12 + g * 3;
          const r1 = 24 + g * 11 + head + (focus ? 5 + pulse * 5 : 0);
          return (
            <Line
              key={i}
              x1={cx + (rx + r0) * t.c} y1={cy + (ry + r0) * t.s}
              x2={cx + (rx + r1) * t.c} y2={cy + (ry + r1) * t.s}
              stroke={lit ? OB.pink : focus ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
              strokeWidth={lit ? 2 + Math.min(1, g) * 1.4 : focus ? 2.6 : 2}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>

      {/* Topo: ajuda e fechar (botões translúcidos do design) */}
      <TouchableOpacity onPress={showTips} activeOpacity={0.8} style={[styles.roundBtn, { left: 17, top: insets.top + 8 }]}>
        <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>?</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { haptics.tap(); router.back(); }}
        activeOpacity={0.8}
        style={[styles.roundBtn, { right: 17, top: insets.top + 8 }]}
      >
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Path d="M2 2 L12 12 M12 2 L2 12" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      </TouchableOpacity>

      {/* Card da instrução */}
      <View style={{
        position: 'absolute', left: 17, right: 17, top: y(668), borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.94)', paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', gap: 6,
      }}>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: OB.ink, textAlign: 'center' }}>
          {instruction}
        </Text>
      </View>

      {consentGate}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  roundBtn: {
    position: 'absolute', zIndex: 10, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
});
