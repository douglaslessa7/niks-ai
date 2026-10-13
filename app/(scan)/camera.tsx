import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Device from 'expo-device';
import Svg, { Path, Line, G, Defs, ClipPath, Ellipse, Circle } from 'react-native-svg';
import { Sun } from 'lucide-react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useAppStore } from '../../store/onboarding';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';
import { OB, OB_STEPS, obStep, useObFrame, useOnMount } from '../../components/onboarding/kit';
import { syncOnboardingPrefetch } from '../../lib/onboardingPrefetch';
import { SCAN_STEPS, ringTicks, ringBack, type ScanStepId } from '../../components/onboarding/scanRing';
import { FaceSkinMesh } from '../../components/onboarding/FaceSkinMesh';
import FaceTracker, {
  faceTrackerAvailable, faceARAvailable, FaceAR, detectFaceInImage, faceLandmarksInImage, detectAccessoryInImage, type FaceAccessory, type FaceFrame, type FaceARHandle, type FaceTrackerHandle,
} from '../../modules/niks-face-tracker';
import {
  frontState, inOvalForTurn, headDirection, lightLevel, lightFill,
  type FrontState, type HeadBase, type LightLevel, type Oval,
} from '../../lib/faceScan';
import { cameraOval } from '../../lib/faceFrame';
import { shapeFromFrame, shapeFromOval, easeShape, type FaceShape } from '../../lib/faceGrid';

// Scan do rosto — onboarding E (desde out/2026) dentro do app (`?modo=app`; a
// `camera-multi`, de 6 fotos com expressões, saiu do fluxo). Visual no molde do scan do
// Lovi (referência do produto): limpo, só o essencial na tela.
//
// MODO APP (`?modo=app`, aberto por `useFaceScan`/`scan-prep-app`): a MESMA tela, mas o
// giro tira fotos de verdade — durante o círculo, sai sozinha uma foto com o rosto virado
// para um lado e outra para o outro (`SIDE_SHOT`, parada por `SIDE_HOLD_MS`). O círculo só
// termina com as duas; as 3 fotos (frente, um lado, outro) vão para a `analyze-skin-app`
// como `scanLayout: 'turns_v1'` (`setSkinScanImages`) → `loading-dentro-app`. Sem Mixpanel
// do onboarding e sem o prefetch do onboarding.
//
// O QUE A TELA MOSTRA:
//   • câmera em tela cheia, DESFOCADA fora de um oval grande e nítida dentro dele;
//   • a malha SUTIL encaixada no rosto real (olhos, nariz, boca, queixo), das
//     sobrancelhas ao queixo, com a linha de scan e o rastro com brilhos
//     (`components/onboarding/FaceSkinMesh.tsx` — só a câmera; o resultado usa a
//     `FaceScanMesh`);
//   • no topo: ajuda (?), medidor de luz (Escuro demais / OK / Perfeito) e fechar (X);
//   • embaixo: o botão branco "Começar" com anéis suaves; tocado, ele sai e entram os
//     tracinhos em volta do oval e a pílula escura com a instrução (o único texto).
//
// Só UMA FOTO, a de frente — é ela que vai para a IA (`setSkinImage`; a `analyze-skin`
// do onboarding é de 1 foto). A foto NÃO é espelhada (`mirror` desligado, como na
// `camera-multi`) e sai SEM som de obturador (`shutterSound: false`).
//
// TRÊS NÍVEIS de câmera (cada um cai para o seguinte se faltar ou não der sinal de vida):
//   (1) ARKit — iPhone com Face ID: `<FaceAR>` (`modules/niks-face-tracker/ios/
//       NiksFaceARView.swift`) é câmera, MALHA 3D REAL do rosto (molde do Lovi: gruda em
//       qualquer rosto), fundo desfocado e rastreador, tudo nativo; foto pelo `takePhoto`;
//   (2) Vision — `<CameraView>` + `<FaceTracker>`, malha desenhada no contorno do rosto
//       (`FaceSkinMesh` + `lib/faceGrid.ts`);
//   (3) plano B por tempo (abaixo).
// Os dois primeiros mandam o MESMO formato de dados (`FaceFrame`), então as regras de
// foto e do círculo são as mesmas.
//
// GUIADO PELO ROSTO DE VERDADE (`modules/niks-face-tracker`, Apple Vision ao vivo na
// mesma sessão da câmera — ele também desenha o fundo desfocado com o furo do oval;
// regras e limiares em `lib/faceScan.ts`):
//   1. frente: com o rosto dentro do oval, na distância certa, olhando para a câmera e
//      PARADO por `HOLD_MS`, a foto sai sozinha (o anel não acende nessa fase — fica
//      para o giro; a pílula diz o que falta). A foto ainda é conferida pelo Vision: sem
//      rosto, é jogada fora e o "segure" recomeça. Nunca sai foto sem rosto.
//   2. círculo (como o cadastro do Face ID): ela move a cabeça em círculo; cada tracinho
//      acende em rosa quando a cabeça aponta para ele (lados pelo nariz, cima/baixo pelo
//      pitch, a partir da pose da foto), em qualquer ordem. Termina com o anel inteiro
//      aceso. Rosto fora do oval ou sumido = para de acender. Não tira foto.
//   O medidor de luz só AVISA (decisão do produto): não trava a foto.
// ⚠️ PLANO B POR TEMPO: sem o módulo no binário (build antigo, Android, OTA para versão
// antiga) ou se ele não der sinal de vida, mesmo layout, mas com o fundo só escurecido,
// a malha genérica parada no oval, sem medidor de luz, e a linha do tempo antiga: 3
// etapas (frente → esquerda da tela → direita da tela, cada uma dona de 1/3 do anel),
// `TURN_MS` para virar, o arco enche em `FILL_MS`, e só a de frente tira foto. Nunca
// prende a usuária na tela.
const N_TICKS = 216;            // tracinhos finos e densos (múltiplo de 6 — `ringTicks`)
const TICK_R0 = 5;              // tracinho começa a esta distância da borda do oval…
const TICK_R1 = 19;             // …e termina aqui (pt)
const TURN_MS = 1100;           // (por tempo) tempo para ela virar o rosto antes de o arco encher
const FILL_MS = 2200;           // (por tempo) arco enchendo
const GROW_MS = 420;            // cada traço "nasce" rosa nesse tempo (easing com overshoot)
const FADE_MS = 280;            // botão saindo, tracinhos e pílula entrando
const HOLD_MS = 900;            // (rosto) parada, enquadrada, até a foto de frente sair
const SMOOTH_MS = 70;           // (rosto) suavização da cabeça (menor = mais colado, mais tremido)
const MESH_SMOOTH_MS = 50;      // (rosto) suavização do contorno da malha
const LIGHT_SMOOTH_MS = 400;    // medidor de luz: não reage a cada piscada da câmera
const LIGHT_MIN = 0.5;          // (rosto) quanto a cabeça tem de apontar (0…1 do giro "todo") para acender traços
const AIM_MIN = 0.18;           // (rosto) a partir daqui os traços da direção já ficam em destaque
const LIGHT_CONE = 20;          // (rosto) meia-abertura, em graus, do leque de traços que acende
const LIGHT_STAGGER_MS = 6;     // (rosto) atraso por grau a partir do centro do leque
const STALE_MS = 400;           // (rosto) quadro mais velho que isto = sem rosto
// (rosto) Estilo do Lovi: os traços na direção para onde a cabeça aponta "saltam" para fora
// (acesos ou não), numa onda que cai suave até as pontas do leque.
const POP_CONE = 38;            // meia-abertura do leque que salta, em graus
const POP_LEN = 11;             // quanto o traço do meio do leque cresce para fora (pt)
const POP_WIDTH = 0.9;          // e quanto ele engrossa
const POP_EASE_MS = 140;        // entrada/saída suave do salto
// Som + vibração conforme os traços acendem (out/2026, pedido do produto): um "toc" curto e GRAVE
// (`assets/sounds/scan-tick.wav`) e um toque seco a cada leva de traços, no máximo 1 a cada
// `TICK_FEEDBACK_MS`; o tom sobe conforme o anel enche (sensação de "empilhando"). Segue
// o modo silencioso do iPhone (o som; a vibração vale sempre).
const TICK_FEEDBACK_MS = 60;
const TICK_RATE_MIN = 0.9;      // velocidade/tom do "tic" com o anel vazio…
const TICK_RATE_MAX = 1.15;     // …e cheio (sobe pouco: grave e neutro, pedido do produto)
const TICK_VOLUME = 0.7;
const TICK_POOL = 4;            // tocadores em rodízio: um "tic" não corta o anterior
const TICK_SOUND = require('../../assets/sounds/scan-tick.wav');
const TRACKER_TIMEOUT_MS = 4000; // (rosto) sem nenhum quadro com a câmera pronta → plano B
const BG_DIM = 0.35;            // escurecimento do fundo desfocado
const PINK = '#FF5EA8';         // rosa do onboarding: tracinho aceso
// (modo app) foto de lado: cabeça virada pelo menos isto (1 = giro "todo", `NOSE_FULL` em
// lib/faceScan), sem olhar muito para cima/baixo, parada por `SIDE_HOLD_MS`.
const SIDE_SHOT = 0.85;
const SIDE_MAX_DY = 0.7;
const SIDE_HOLD_MS = 250;
const SIDE_FACE_TRIES = 2;      // a conferência do Vision recusou N vezes → aceita a foto
const APP_PHOTO_W = 1200;       // (modo app) as 3 fotos vão juntas à IA: reduz a 1200 de largura
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Etapas (plano B), arcos e ordem dos traços: `components/onboarding/scanRing.ts`.
const STEPS = SCAN_STEPS;
const TICKS = ringTicks(N_TICKS);
// Ângulo de cada traço na tela (0 = direita, 90 = baixo), para o círculo do modo com rosto.
const TICK_DEG = TICKS.map((t) => ((Math.atan2(t.s, t.c) * 180) / Math.PI + 360) % 360);
const back = ringBack;

const FRONT_HINT: Record<FrontState, string> = {
  none: 'Encaixe o rosto no círculo',
  out: 'Encaixe o rosto no círculo',
  far: 'Aproxime o rosto',
  near: 'Afaste um pouco',
  look: 'Olhe para a câmera',
  ok: 'Segure assim…',
};

// Acessório no rosto (foto de frente conferida pelo classificador da Apple): a foto é
// descartada e a pílula pede para tirar, por `ACCESSORY_HINT_MS` (renovado a cada tentativa).
const ACCESSORY_HINT: Record<FaceAccessory, string> = {
  glasses: 'Tire os óculos para o scan',
  hat: 'Tire o boné ou chapéu para o scan',
  mask: 'Tire a máscara para o scan',
};
const ACCESSORY_HINT_MS = 2500;
const ACCESSORY_MIN_CONF = 0.45;   // óculos deram 0,91 × sem óculos 0,00 nos testes — calibrar no iPhone

const LIGHT_UI: Record<LightLevel, { label: string; color: string }> = {
  dark: { label: 'Escuro demais', color: '#E3A257' },
  ok: { label: 'OK', color: '#9DBF4F' },
  perfect: { label: 'Perfeito', color: '#5E9F5B' },
};

type Sample = FaceFrame & { t: number };
type Photo = { uri: string; base64: string };
type Side = 'left' | 'right';   // lado da TELA para onde o nariz foi

export default function Camera() {
  const router = useRouter();
  const { consentGate, granted } = useScanConsentGate();
  const setSkinImage = useAppStore((s) => s.setSkinImage);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const { track } = useMixpanel();
  const { width, height } = useWindowDimensions();
  const { insets } = useObFrame();
  // `retake=1`: veio do erro do loading da foto — a foto nova volta direto para lá.
  const { retake, modo } = useLocalSearchParams<{ retake?: string; modo?: string }>();
  const inApp = modo === 'app';
  const setSkinScanImages = useAppStore((s) => s.setSkinScanImages);
  const isSimulator = !Device.isDevice;
  // Só em desenvolvimento, no simulador (sem câmera): a linha do tempo roda sem tirar
  // foto, em loop — para ver e ajustar a animação. (Para seguir o fluxo no simulador, a
  // foto entra pelo depurador do Metro — ver README, "Navegar e preencher o store".)
  const demo = __DEV__ && isSimulator;
  // Três níveis, do melhor para o reserva: (1) ARKit — câmera do Face ID, malha 3D real;
  // (2) Vision — `<CameraView>` + rastreador, malha desenhada no contorno; (3) plano B por
  // tempo. Cada um cai para o seguinte se faltar no aparelho ou não der sinal de vida.
  const [arDead, setArDead] = useState(false);
  const [trackerDead, setTrackerDead] = useState(false);
  const ar = faceARAvailable && !demo && !arDead;
  const tracked = (ar || faceTrackerAvailable) && !demo && !trackerDead;   // guiado pelo rosto
  const arRef = useRef<FaceARHandle>(null);
  const trackerRef = useRef<FaceTrackerHandle>(null);
  // O relógio da tela (efeito com `[tracked]`) guarda as funções do 1º render: se o ARKit
  // cair para o Vision, `tracked` segue `true` e o `takeFront` antigo ainda pediria a foto
  // ao ARKit. Lido por ref, vale sempre o nível ATUAL.
  const arOn = useRef(ar);
  arOn.current = ar;

  // "Começar" tocado → `startAt`; a etapa só começa com a câmera pronta (e o consentimento).
  const [started, setStarted] = useState(false);
  const startAt = useRef(0);
  const mountAt = useRef(Date.now());

  // Etapa atual: -1 = ainda não começou; 0 = frente; (rosto) 1 = círculo; (plano B) 1, 2 = lados.
  const [stepIdx, setStepIdx] = useState(-1);
  const stepRef = useRef(-1);
  const stepStart = useRef(0);
  const timedFired = useRef(false);                    // (plano B) a etapa da vez já terminou
  const [, setFrame] = useState(0);
  const litAt = useRef<number[]>(Array(N_TICKS).fill(-1)); // instante em que cada traço fica rosa
  const frontPhoto = useRef<Photo | null>(null);
  // (modo app) fotos dos lados, tiradas sozinhas durante o giro.
  const sidePhotos = useRef<Record<Side, Photo | null>>({ left: null, right: null });
  const sideBusy = useRef(false);
  const sideHold = useRef<{ side: Side; at: number } | null>(null);
  const sideRejects = useRef<Record<Side, number>>({ left: 0, right: 0 });
  const capturingRef = useRef(false);
  const finishedRef = useRef(false);
  const mountedRef = useRef(true);

  // Modo guiado pelo rosto: último quadro do Vision e o que a tela deriva dele.
  const faceRef = useRef<Sample | null>(null);
  const holdStart = useRef<number | null>(null);       // desde quando está "ok" para a foto
  const accessory = useRef<{ kind: FaceAccessory; at: number } | null>(null); // última recusa por acessório
  const poseSum = useRef({ nose: 0, pitch: 0, n: 0 });  // soma da pose durante o "segure"
  const base = useRef<HeadBase>({ nose: 0, pitch: 0 }); // pose de referência do círculo
  const dirRef = useRef({ dx: 0, dy: 0 });             // direção da cabeça, suavizada
  const aimRef = useRef<number | null>(null);          // ângulo (graus) para onde ela aponta agora
  const popRef = useRef({ ang: 0, s: 0 });              // leque que salta: direção e força (0…1), suavizados
  const hintRef = useRef(FRONT_HINT.none);
  const meshShape = useRef<FaceShape | null>(null);    // contorno do rosto na tela, suavizado
  const meshAlpha = useRef(0);                         // malha some quando o rosto some
  const light = useRef<{ bv: number | null; level: LightLevel | null }>({ bv: null, level: null });

  const oval = cameraOval(width, height, insets.top, insets.bottom);
  const geo = useRef<{ oval: Oval; width: number; height: number }>({ oval, width, height });
  geo.current = { oval, width, height };

  useOnMount(() => { if (!inApp) track('onboarding_step_viewed', obStep(OB_STEPS.camera, 'Scan - Câmera')); });
  useEffect(() => () => { mountedRef.current = false; }, []);

  // "Tic" dos traços acendendo: tocadores criados uma vez, liberados ao sair da tela.
  const tickPlayers = useRef<AudioPlayer[]>([]);
  const tickIdx = useRef(0);
  const tickAt = useRef(0);
  const litSeen = useRef(0);
  useEffect(() => {
    try {
      tickPlayers.current = Array.from({ length: TICK_POOL }, () => {
        const pl = createAudioPlayer(TICK_SOUND);
        pl.volume = TICK_VOLUME;
        pl.shouldCorrectPitch = false;   // o tom sobe junto com a velocidade
        return pl;
      });
    } catch {}
    return () => { tickPlayers.current.forEach((pl) => { try { pl.release(); } catch {} }); tickPlayers.current = []; };
  }, []);
  const tickFeedback = (fill: number) => {
    haptics.select();
    const pl = tickPlayers.current[tickIdx.current++ % TICK_POOL];
    if (!pl) return;
    try {
      pl.setPlaybackRate(TICK_RATE_MIN + (TICK_RATE_MAX - TICK_RATE_MIN) * clamp01(fill));
      pl.seekTo(0);
      pl.play();
    } catch {}
  };

  const canRun = demo ? granted : granted && !isSimulator && !!permission?.granted && cameraReady;

  const setStep = (i: number) => {
    stepRef.current = i;
    timedFired.current = false;
    stepStart.current = Date.now();
    setStepIdx(i);
  };

  // Começa a etapa da frente quando ela tocou em "Começar" e a câmera está pronta.
  useEffect(() => {
    if (!started || !canRun || stepRef.current !== -1) return;
    setStep(0);
  }, [started, canRun]);

  // O módulo existe mas nenhum quadro chegou: em vez de deixar a tela parada, cai para o
  // nível seguinte (ARKit → Vision → plano B), recomeçando a frente se já tinha começado.
  useEffect(() => {
    if (!tracked || !cameraReady) return;
    const id = setTimeout(() => {
      if (faceRef.current || !mountedRef.current || capturingRef.current) return;
      litAt.current = Array(N_TICKS).fill(-1);
      frontPhoto.current = null;
      sidePhotos.current = { left: null, right: null };
      if (stepRef.current >= 0) setStep(0);
      if (ar) {
        setCameraReady(false);       // a `<CameraView>` entra e avisa quando estiver pronta
        setArDead(true);
      } else {
        setTrackerDead(true);
      }
    }, TRACKER_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [tracked, ar, cameraReady]);

  const lightArc = (arc: ScanStepId, p: number, now: number) => {
    TICKS.forEach((t, i) => {
      if (t.arc === arc && litAt.current[i] < 0 && t.order <= p) litAt.current[i] = now;
    });
  };

  // Relógio ÚNICO da tela (um quadro por frame): malha, luz e a etapa da vez.
  useEffect(() => {
    let id: number;
    let last = Date.now();
    const loop = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      const s = faceRef.current;
      const f = s && now - s.t < STALE_MS ? s : null;
      const { oval: ov, width: W, height: H } = geo.current;
      // Suavização por tempo (não por quadro): o Vision manda ~24 quadros/s e a tela
      // desenha a 60 — tudo desliza entre um quadro e outro, sem trancos.
      const k = 1 - Math.exp(-dt / SMOOTH_MS);
      const step = stepRef.current;

      if (tracked) {
        // Luz (vem mesmo sem rosto).
        if (s?.light != null && now - s.t < 1000) {
          const L = light.current;
          L.bv = L.bv == null ? s.light : L.bv + (s.light - L.bv) * (1 - Math.exp(-dt / LIGHT_SMOOTH_MS));
          L.level = lightLevel(L.bv, L.level);
        }
        // Malha: construída dentro do contorno do rosto; some devagar quando ele some.
        const target = shapeFromFrame(f, W, H);
        if (target) {
          meshShape.current = easeShape(meshShape.current, target, 1 - Math.exp(-dt / MESH_SMOOTH_MS));
          meshAlpha.current = Math.min(1, meshAlpha.current + dt / 250);
        } else {
          meshAlpha.current = Math.max(0, meshAlpha.current - dt / 250);
          if (meshAlpha.current === 0) meshShape.current = null;
        }

        if (step === 0 && !capturingRef.current) {
          const st = frontState(f, ov, W, H);
          const acc = accessory.current && now - accessory.current.at < ACCESSORY_HINT_MS ? accessory.current.kind : null;
          hintRef.current = acc && st !== 'none' && st !== 'out' ? ACCESSORY_HINT[acc] : FRONT_HINT[st];
          if (st === 'ok') {
            if (holdStart.current == null) { holdStart.current = now; poseSum.current = { nose: 0, pitch: 0, n: 0 }; }
            // A pose do "segure" vira a referência do círculo (ela segura o celular do
            // jeito dela; "para cima" é a partir daí).
            poseSum.current.nose += f!.nose ?? 0;
            poseSum.current.pitch += f!.pitch ?? 0;
            poseSum.current.n += 1;
            if (now - holdStart.current >= HOLD_MS) captureFront();
          } else {
            holdStart.current = null;
          }
        } else if (step === 1 && !finishedRef.current) {
          // Círculo (como o cadastro do Face ID): cada traço acende quando a cabeça
          // aponta para ele, em qualquer ordem.
          const ok = inOvalForTurn(f, ov, W, H);
          const raw = ok ? headDirection(f, base.current) : null;
          const d = dirRef.current;
          if (raw) {
            d.dx += (raw.dx - d.dx) * k;
            d.dy += (raw.dy - d.dy) * k;
          }
          const m = Math.hypot(d.dx, d.dy);
          const ang = ((Math.atan2(d.dy, d.dx) * 180) / Math.PI + 360) % 360;
          aimRef.current = raw && m >= AIM_MIN ? ang : null;
          // O salto acompanha a direção e entra/sai suave (não some de uma vez quando ela volta ao centro).
          const P = popRef.current;
          if (aimRef.current != null) P.ang = ang;
          const popTarget = aimRef.current != null ? clamp01((m - AIM_MIN) / (LIGHT_MIN - AIM_MIN)) : 0;
          P.s += (popTarget - P.s) * (1 - Math.exp(-dt / POP_EASE_MS));
          if (raw && m >= LIGHT_MIN) {
            TICK_DEG.forEach((deg, i) => {
              if (litAt.current[i] >= 0) return;
              const off = Math.abs(((deg - ang + 540) % 360) - 180);
              // Os traços do meio do leque acendem primeiro e os das pontas logo atrás:
              // o anel "escorre" em vez de acender em bloco.
              if (off <= LIGHT_CONE) litAt.current[i] = now + off * LIGHT_STAGGER_MS;
            });
          }
          // (modo app) Foto de cada lado: sai sozinha com a cabeça virada e parada.
          if (inApp) {
            const side: Side | null = raw && Math.abs(raw.dy) <= SIDE_MAX_DY
              ? raw.dx <= -SIDE_SHOT ? 'left' : raw.dx >= SIDE_SHOT ? 'right' : null
              : null;
            if (side && !sidePhotos.current[side] && !sideBusy.current) {
              if (sideHold.current?.side !== side) sideHold.current = { side, at: now };
              else if (now - sideHold.current.at >= SIDE_HOLD_MS) { sideHold.current = null; captureSide(side); }
            } else if (!side) {
              sideHold.current = null;
            }
          }
          const lit = litAt.current.filter((t) => t >= 0).length;
          const missing: Side | null = !inApp ? null
            : !sidePhotos.current.left ? 'left' : !sidePhotos.current.right ? 'right' : null;
          hintRef.current = !ok
            ? 'Volte o rosto para o círculo'
            : lit === N_TICKS && missing
              ? missing === 'left' ? 'Vire o rosto devagar para a esquerda' : 'Agora vire devagar para a direita'
              : lit >= N_TICKS * 0.8 && lit < N_TICKS
                ? 'Quase lá, complete o círculo'
                : 'Mova a cabeça devagar para completar o círculo';
          if (lit === N_TICKS && !missing && !sideBusy.current && now >= Math.max(...litAt.current) + GROW_MS) {
            haptics.success();
            finish();
          }
        }
      } else if (step >= 0 && step < STEPS.length && !capturingRef.current && !timedFired.current) {
        // Plano B: linha do tempo.
        const p = clamp01((now - stepStart.current - TURN_MS) / FILL_MS);
        lightArc(STEPS[step].id, p, now);
        if (p >= 1) { timedFired.current = true; timedStepDone(step); }
      }

      // Som + vibração a cada leva de traços que ACABOU de acender (vale para o círculo e
      // para o plano B). Recomeçou o anel (contagem caiu) → zera.
      const litNow = litAt.current.reduce((n, at) => n + (at >= 0 && now >= at ? 1 : 0), 0);
      if (litNow < litSeen.current) litSeen.current = litNow;
      if (litNow > litSeen.current && now - tickAt.current >= TICK_FEEDBACK_MS) {
        litSeen.current = litNow;
        tickAt.current = now;
        tickFeedback(litNow / N_TICKS);   // também na demonstração do simulador (para ouvir)
      }

      setFrame((n) => n + 1);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [tracked]);

  // Tira a foto (frente ou lado) e normaliza a orientação EXIF (com base64: vai para a IA).
  // SEM SOM: ela não pode perceber que saiu uma foto — para ela, o rosto inteiro está sendo
  // analisado. Por isso a foto sai do QUADRO AO VIVO do ARKit ou do rastreador; só o plano B
  // (sem módulo) usa o `takePictureAsync`, cujo `shutterSound: false` o iOS nem sempre respeita.
  const takeFront = async () => {
    let shot: { uri: string } | undefined;
    if (arOn.current) shot = await arRef.current?.takePhoto();
    // Build sem a foto silenciosa no rastreador: `takePhoto` não existe → cai no expo-camera.
    else if (typeof trackerRef.current?.takePhoto === 'function') {
      shot = await trackerRef.current.takePhoto().catch(() => undefined);
    }
    if (!shot?.uri && !arOn.current) {
      shot = await cameraRef.current?.takePictureAsync({ quality: 0.7, base64: false, shutterSound: false });
    }
    if (!shot?.uri) throw new Error('Falha ao capturar');
    const out = await ImageManipulator.manipulateAsync(
      shot.uri,
      inApp ? [{ resize: { width: APP_PHOTO_W } }] : [],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!out.base64) throw new Error('Falha ao processar foto');
    return { uri: out.uri, base64: out.base64 };
  };

  // Falha REAL da câmera: avisa e refaz a etapa da frente do zero.
  const captureFailed = () => {
    holdStart.current = null;
    TICKS.forEach((t, i) => { if (t.arc === 'frente') litAt.current[i] = -1; });
    Alert.alert('Erro', 'Não foi possível capturar a foto. Vamos tentar de novo.', [{
      text: 'OK', onPress: () => { capturingRef.current = false; setStep(0); },
    }]);
  };

  const captureFront = async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    let alerted = false;
    try {
      const photo = await takeFront();
      // Segunda garantia: o Vision confere a própria foto. (Erro na conferência não
      // barra: a detecção ao vivo já tinha confirmado o rosto.)
      const hasFace = await detectFaceInImage(photo.uri).catch(() => true);
      if (!mountedRef.current) return;
      if (!hasFace) {
        holdStart.current = null;
        return;
      }
      // Óculos, boné/chapéu ou máscara cobrem a pele: descarta e pede para tirar (a próxima
      // foto sai sozinha quando ela tirar). Build sem a função: segue normalmente.
      const acc = await detectAccessoryInImage(photo.uri, ACCESSORY_MIN_CONF);
      if (!mountedRef.current) return;
      if (acc) {
        // Vibra só no 1º aviso (de óculos, ela é reconferida a cada ~1 s).
        const prev = accessory.current;
        if (!prev || Date.now() - prev.at > ACCESSORY_HINT_MS) haptics.warning();
        accessory.current = { kind: acc, at: Date.now() };
        holdStart.current = null;
        return;
      }
      accessory.current = null;
      frontPhoto.current = photo;
      haptics.tap();
      // Começa o círculo a partir da pose da foto.
      const ps = poseSum.current;
      base.current = ps.n ? { nose: ps.nose / ps.n, pitch: ps.pitch / ps.n } : { nose: 0, pitch: 0 };
      dirRef.current = { dx: 0, dy: 0 };
      litAt.current = Array(N_TICKS).fill(-1);
      sidePhotos.current = { left: null, right: null };
      sideRejects.current = { left: 0, right: 0 };
      setStep(1);
    } catch {
      if (!mountedRef.current) return;
      alerted = true;
      captureFailed();
    } finally {
      // Com o alerta aberto, segue "capturando" até o OK — senão sairia outra foto atrás dele.
      if (!alerted) capturingRef.current = false;
    }
  };

  // (modo app) Foto de um lado, durante o giro. Sem alerta: se falhar, a próxima vez que
  // ela virar para esse lado tenta de novo (o círculo só termina com as duas).
  const captureSide = async (side: Side) => {
    if (sideBusy.current || sidePhotos.current[side]) return;
    sideBusy.current = true;
    try {
      const photo = await takeFront();
      // Semi-perfil pode escapar da conferência do Vision: depois de N recusas, aceita
      // (a detecção ao vivo já via o rosto no oval).
      const hasFace = await detectFaceInImage(photo.uri).catch(() => true);
      if (!mountedRef.current) return;
      if (!hasFace && sideRejects.current[side] < SIDE_FACE_TRIES) {
        sideRejects.current[side] += 1;
        return;
      }
      sidePhotos.current[side] = photo;
      haptics.tap();
    } catch {
      // tenta de novo no próximo giro para esse lado
    } finally {
      sideBusy.current = false;
    }
  };

  // Fim de uma etapa no plano B: só a de frente tira foto (no modo app, também os lados).
  const timedStepDone = async (idx: number) => {
    if (demo) {
      // Demonstração: sem câmera, só avança (e recomeça depois da última etapa).
      if (idx === STEPS.length - 1) litAt.current = Array(N_TICKS).fill(-1);
      setStep((idx + 1) % STEPS.length);
      return;
    }
    if (idx > 0 && inApp) {
      // Plano B do modo app: a foto do lado sai no fim da etapa (esquerda/direita da tela).
      capturingRef.current = true;
      try {
        sidePhotos.current[STEPS[idx].id === 'esquerda' ? 'left' : 'right'] = await takeFront();
      } catch {
        if (!mountedRef.current) return;
        capturingRef.current = false;
        timedFired.current = false;
        stepStart.current = Date.now();   // refaz a etapa
        return;
      }
      capturingRef.current = false;
      if (!mountedRef.current) return;
    }
    if (idx === STEPS.length - 1) { haptics.success(); finish(); return; }
    if (idx > 0) { haptics.tap(); setStep(idx + 1); return; }
    capturingRef.current = true;
    let alerted = false;
    try {
      frontPhoto.current = await takeFront();
      if (!mountedRef.current) return;
      haptics.tap();
      setStep(1);
    } catch {
      if (!mountedRef.current) return;
      alerted = true;
      captureFailed();
    } finally {
      if (!alerted) capturingRef.current = false;
    }
  };

  const finish = () => {
    const front = frontPhoto.current;
    if (!front || finishedRef.current) return;
    if (inApp) {
      const { left, right } = sidePhotos.current;
      if (!left || !right) return;
      finishedRef.current = true;
      // Ordem fixa: frente, lado ESQUERDO da tela, lado DIREITO da tela. A IA identifica
      // pela própria foto qual lado do rosto aparece (as fotos não são espelhadas).
      setSkinScanImages(front, [front.base64, left.base64, right.base64], 'turns_v1');
      router.replace('/(scan)/loading-dentro-app' as any);
      return;
    }
    finishedRef.current = true;
    track('onboarding_step_completed', obStep(OB_STEPS.camera, 'Scan - Câmera'));
    setSkinImage(front.base64, front.uri);
    // Pontos do rosto na foto pelo próprio iPhone (para os pontinhos do relatório caírem na
    // região certa). Em segundo plano: o relatório leva segundos; se não vier, vale o da IA.
    faceLandmarksInImage(front.uri).then((lm) => {
      if (lm && useAppStore.getState().skinImageUri === front.uri) useAppStore.setState({ skinFaceLandmarks: lm });
    });
    // Antes/depois E relatório já saem daqui (só precisam da foto). Ver `lib/onboardingPrefetch.ts`.
    syncOnboardingPrefetch();
    if (retake === '1') router.replace('/(scan)/analisando-foto' as any);
    else router.push('/(scan)/analisando-foto' as any);
  };

  const start = () => {
    if (started) return;
    haptics.action();
    startAt.current = Date.now();
    setStarted(true);
  };

  const showTips = () => {
    haptics.tap();
    Alert.alert(
      'Como fazer o scan',
      'Fique num lugar bem iluminado, com o rosto limpo, sem óculos e com o cabelo preso. Siga a instrução embaixo do círculo e mova a cabeça devagar.',
    );
  };

  // ── Geometria e estado do quadro ─────────────────────────────────────────
  const { cx, cy, rx, ry, buttonCy } = oval;
  const now = Date.now();
  const sinceStart = started ? now - startAt.current : -1;
  const ringAlpha = started ? clamp01(sinceStart / FADE_MS) : 0;
  const buttonAlpha = started ? 1 - clamp01(sinceStart / FADE_MS) : 1;
  const pillAlpha = started ? clamp01((sinceStart - FADE_MS * 0.6) / FADE_MS) : 0;
  const activeArc = !tracked && stepIdx >= 0 && stepIdx < STEPS.length ? STEPS[stepIdx].id : null;
  const circle = tracked && stepIdx === 1;
  const pulse = (Math.sin(now / 160) + 1) / 2;
  const breathe = 1 + 0.035 * Math.sin(now / 650);
  const ovalPath = `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
  const veil = `M0 0 H${width} V${height} H0 Z ${ovalPath}`;
  const instruction = !started || stepIdx < 0
    ? 'Encaixe o rosto no círculo'
    : tracked ? hintRef.current : STEPS[stepIdx].text;
  const meshT = now - mountAt.current;

  // Malha: no modo com rosto, construída dentro do contorno real (`lib/faceGrid.ts`). No
  // plano B, um rosto genérico parado no oval.
  let mesh: ReactNode = null;
  if (ar) {
    // A malha 3D é desenhada pela própria view do ARKit.
  } else if (tracked) {
    if (meshShape.current && meshAlpha.current > 0) {
      mesh = <FaceSkinMesh shape={meshShape.current} t={meshT} opacity={meshAlpha.current} />;
    }
  } else {
    mesh = <FaceSkinMesh shape={shapeFromOval(cx, cy, rx, ry)} t={meshT} opacity={clamp01(meshT / 500)} />;
  }

  const L = light.current;
  const lightUi = tracked && L.level && L.bv != null ? { ...LIGHT_UI[L.level], fill: lightFill(L.bv) } : null;

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

  const topY = insets.top + 12;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="light" />

      {/* iPhone com Face ID: a view do ARKit é câmera, malha, fundo desfocado e rastreador. */}
      {ar && !isSimulator && permission?.granted && (
        <FaceAR
          ref={arRef}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          hole={[cx - rx, cy - ry, 2 * rx, 2 * ry]}
          dim={BG_DIM}
          onReady={() => setCameraReady(true)}
          onFace={(e) => { faceRef.current = { ...e.nativeEvent, t: Date.now() }; }}
        />
      )}
      {!ar && !isSimulator && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          onCameraReady={() => setCameraReady(true)}
        />
      )}
      {/* Fundo desfocado ao vivo com o furo do oval (nativo; também é o rastreador). */}
      {tracked && !ar && !isSimulator && permission?.granted && (
        <FaceTracker
          ref={trackerRef}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          hole={[cx - rx, cy - ry, 2 * rx, 2 * ry]}
          dim={BG_DIM}
          onFace={(e) => { faceRef.current = { ...e.nativeEvent, t: Date.now() }; }}
        />
      )}

      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <ClipPath id="camOval">
            <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
          </ClipPath>
        </Defs>
        {/* Plano B: sem desfoque, o fundo só escurece. */}
        {!tracked && <Path d={veil} fill="rgba(0,0,0,0.62)" fillRule="evenodd" />}
        <G clipPath="url(#camOval)">{mesh}</G>
        {ringAlpha > 0 && (
          <G opacity={ringAlpha}>
            {TICKS.map((t, i) => {
              const at = litAt.current[i];
              const lit = at >= 0 && now >= at;
              const age = lit ? now - at : 0;
              const g = lit ? back(Math.min(1, age / GROW_MS)) : 0;
              const head = lit && age < 900 ? Math.sin(Math.min(1, age / 900) * Math.PI) * 2.5 : 0;
              // Plano B: o arco da vez pulsa. Com rosto: o leque da direção da cabeça salta.
              const focus = !lit && !circle && t.arc === activeArc;
              const popOff = circle ? Math.abs(((TICK_DEG[i] - popRef.current.ang + 540) % 360) - 180) : 180;
              const pop = popOff < POP_CONE ? popRef.current.s * Math.pow(Math.cos((popOff / POP_CONE) * (Math.PI / 2)), 1.6) : 0;
              const r1 = TICK_R1 + g * 3 + head + pop * POP_LEN + (focus ? 2 + pulse * 3 : 0);
              return (
                <Line
                  key={i}
                  x1={cx + (rx + TICK_R0) * t.c} y1={cy + (ry + TICK_R0) * t.s}
                  x2={cx + (rx + r1) * t.c} y2={cy + (ry + r1) * t.s}
                  stroke={lit ? PINK : '#FFFFFF'}
                  strokeOpacity={lit || focus || pop > 0.15 ? 1 : 0.8}
                  strokeWidth={(lit ? 1.6 + Math.min(1, g) * 0.6 : 1.4) + pop * POP_WIDTH}
                  strokeLinecap="round"
                />
              );
            })}
          </G>
        )}
      </Svg>

      {/* Topo: ajuda, medidor de luz e fechar */}
      <TouchableOpacity onPress={showTips} activeOpacity={0.8} style={[styles.roundBtn, { left: 18, top: topY }]}>
        <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '600' }}>?</Text>
      </TouchableOpacity>
      {lightUi && (
        <View style={[styles.lightPill, { top: topY + 2, left: width / 2 - LIGHT_W / 2 }]} pointerEvents="none">
          <View style={[styles.lightFill, { width: (LIGHT_W - 6) * lightUi.fill, backgroundColor: lightUi.color }]} />
          <View style={styles.lightContent}>
            <Sun size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.lightText}>{lightUi.label}</Text>
          </View>
        </View>
      )}
      <TouchableOpacity
        onPress={() => { haptics.tap(); router.back(); }}
        activeOpacity={0.8}
        style={[styles.roundBtn, { right: 18, top: topY }]}
      >
        <Svg width={16} height={16} viewBox="0 0 14 14">
          <Path d="M2 2 L12 12 M12 2 L2 12" stroke="#FFFFFF" strokeWidth={1.9} strokeLinecap="round" />
        </Svg>
      </TouchableOpacity>

      {/* Embaixo: "Começar" (antes) → pílula da instrução (depois) */}
      {buttonAlpha > 0 && (
        <View
          style={{ position: 'absolute', left: 0, right: 0, top: buttonCy - 92, height: 184, alignItems: 'center', justifyContent: 'center', opacity: buttonAlpha }}
          pointerEvents={started ? 'none' : 'box-none'}
        >
          <Svg width={width} height={184} style={StyleSheet.absoluteFill} pointerEvents="none">
            <G transform={`translate(${width / 2 - 92} 0)`}>
              <Circle cx={92} cy={92} r={92 * breathe} fill="#FFFFFF" fillOpacity={0.05} />
              <Circle cx={92} cy={92} r={76} fill="#FFFFFF" fillOpacity={0.08} />
              <Circle cx={92} cy={92} r={61} fill="#FFFFFF" fillOpacity={0.12} />
            </G>
          </Svg>
          <TouchableOpacity onPress={start} activeOpacity={0.85} style={styles.startBtn}>
            <Text style={styles.startText}>Começar</Text>
          </TouchableOpacity>
        </View>
      )}
      {pillAlpha > 0 && (
        <View style={[styles.pill, { top: buttonCy - 38, opacity: pillAlpha }]} pointerEvents="none">
          <Text style={styles.pillText}>{instruction}</Text>
        </View>
      )}

      {consentGate}
    </View>
  );
}

const LIGHT_W = 156;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  roundBtn: {
    position: 'absolute', zIndex: 10, width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(30,30,30,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightPill: {
    position: 'absolute', zIndex: 10, width: LIGHT_W, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(30,30,30,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  lightFill: { position: 'absolute', left: 3, top: 3, bottom: 3, borderRadius: 18 },
  lightContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  lightText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  startBtn: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  startText: { fontSize: 18, fontWeight: '600', color: '#111111', letterSpacing: -0.3 },
  pill: {
    position: 'absolute', left: 44, right: 44, minHeight: 76, borderRadius: 38,
    backgroundColor: 'rgba(12,12,12,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 26, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  pillText: { fontSize: 19, lineHeight: 24, fontWeight: '600', color: '#FFFFFF', textAlign: 'center', letterSpacing: -0.2 },
});
