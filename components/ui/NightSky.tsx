// NightSky — céu noturno vivo
// 3 camadas de estrelas (70 far + 35 mid + 14 near = 119 estrelas) com parallax/twinkle/deriva,
// nebulosas respirando via Skia + Reanimated, 3 estrelas cadentes.
// Porta fiel de direction-3-cerimonia.jsx / direction-quietude-v3-original.jsx

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Canvas, Circle, BlurMask } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

// ── Tipos ──────────────────────────────────────────────────────────
interface StarData {
  id: string;
  x: number;
  y: number;
  size: number;
  baseOp: number;
  peakOp: number;
  twinkleDur: number;
  twinkleDelay: number;
  driftX: number;
  driftY: number;
  driftDur: number;
  driftDelay: number;
  color: string;
  shadowRadius: number;
  shadowColor: string | undefined;
  scaleAtPeak: boolean;
}

interface ShooterData {
  topPct: number;
  delay: number;
  duration: number;
  angle: number;
}

// ── Gerador de camada (algoritmo idêntico ao design JS) ────────────
// x = ((s * 137 + 13) % 1000) / 10  →  0..99.9 (%)
// y = ((s * 89  + 7)  % 1000) / 10  →  0..99.9 (%)
function makeLayer(
  count: number,
  seedBase: number,
  sizeRange: [number, number],
  opRange: [number, number],
  twinkleRange: [number, number],
  driftRange: [number, number],
  color: string,
  layer: string,
): StarData[] {
  return Array.from({ length: count }, (_, i) => {
    const s = seedBase + i;
    const size =
      sizeRange[0] + ((s * 31) % 100) / 100 * (sizeRange[1] - sizeRange[0]);
    const driftDir = ((s * 13) % 100) / 100 > 0.5;
    return {
      id: `${layer}-${i}`,
      x: (((s * 137 + 13) % 1000) / 10 / 100) * W,
      y: (((s * 89 + 7) % 1000) / 10 / 100) * H,
      size,
      baseOp: opRange[0],
      peakOp: opRange[1],
      twinkleDur:
        (twinkleRange[0] +
          ((s * 23) % 100) / 100 * (twinkleRange[1] - twinkleRange[0])) *
        1000,
      twinkleDelay: ((s * 19) % 100) / 100 * 6000,
      driftX: driftDir ? 18 : -18,
      driftY: driftDir ? -6 : 5,
      driftDur:
        (driftRange[0] +
          ((s * 41) % 100) / 100 * (driftRange[1] - driftRange[0])) *
        1000,
      driftDelay: ((s * 37) % 100) / 100 * 20000,
      color,
      shadowRadius:
        layer === 'near' ? size * 3 : layer === 'mid' ? 3 : 0,
      shadowColor:
        layer === 'near'
          ? 'rgba(255, 245, 224, 0.9)'
          : layer === 'mid'
            ? 'rgba(255, 248, 240, 0.6)'
            : undefined,
      scaleAtPeak: layer === 'near',
    };
  });
}

// ── StarDot — componente por estrela ──────────────────────────────
function StarDot({ star }: { star: StarData }) {
  const opacity = useSharedValue(star.baseOp);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(
      star.twinkleDelay,
      withRepeat(
        withTiming(star.peakOp, {
          duration: star.twinkleDur / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );

    translateX.value = withDelay(
      star.driftDelay,
      withRepeat(
        withTiming(star.driftX, {
          duration: star.driftDur,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );

    translateY.value = withDelay(
      star.driftDelay,
      withRepeat(
        withTiming(star.driftY, {
          duration: star.driftDur,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      ),
    );

    if (star.scaleAtPeak) {
      scale.value = withDelay(
        star.twinkleDelay,
        withRepeat(
          withTiming(1.15, {
            duration: star.twinkleDur / 2,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true,
        ),
      );
    }
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: star.x,
          top: star.y,
          width: star.size,
          height: star.size,
          borderRadius: star.size / 2,
          backgroundColor: star.color,
          shadowColor: star.shadowColor ?? 'transparent',
          shadowRadius: star.shadowRadius,
          shadowOpacity: star.shadowColor ? 1 : 0,
          shadowOffset: { width: 0, height: 0 },
        },
        animStyle,
      ]}
    />
  );
}

// ── ShootingStar ──────────────────────────────────────────────────
function ShootingStar({ sh }: { sh: ShooterData }) {
  const translateX = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const d = sh.duration;

    translateX.value = withDelay(
      sh.delay,
      withRepeat(
        withSequence(
          withTiming(W * 1.8, {
            duration: d * 0.16,
            easing: Easing.out(Easing.quad),
          }),
          withDelay(d * 0.84, withTiming(-100, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );

    opacity.value = withDelay(
      sh.delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: d * 0.02 }),   // 0–2% silêncio
          withTiming(1, { duration: d * 0.02 }),   // 2–4% fade in
          withTiming(1, { duration: d * 0.06 }),   // 4–10% visível
          withTiming(0, { duration: d * 0.06 }),   // 10–16% fade out
          withDelay(d * 0.84, withTiming(0, { duration: 0 })), // 16–100% pausa
        ),
        -1,
        false,
      ),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  // Outer View fixa rotação; inner Animated.View faz o movimento
  return (
    <View
      style={{
        position: 'absolute',
        top: sh.topPct * H,
        left: 0,
        transform: [{ rotate: `${sh.angle}deg` }],
        pointerEvents: 'none',
      }}
    >
      <Animated.View style={[{ width: 90, height: 1 }, animStyle]}>
        <LinearGradient
          colors={[
            'rgba(255,245,220,0)',
            'rgba(255,245,220,0.9)',
            '#FFFFFF',
          ]}
          locations={[0, 0.85, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, borderRadius: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// ── Nebula — círculo difuso respirando (Skia + Reanimated) ─────────
interface NebulaProps {
  cx: number;
  cy: number;
  r: number;
  color: string;
  blurSigma: number;
  dxPeak: number;
  dyPeak: number;
  scalePeak: number;
  duration: number;
}

function Nebula({ cx, cy, r, color, blurSigma, dxPeak, dyPeak, scalePeak, duration }: NebulaProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 0.85 + progress.value * 0.15,
    transform: [
      { translateX: progress.value * dxPeak },
      { translateY: progress.value * dyPeak },
      { scale: 1 + progress.value * (scalePeak - 1) },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={cx} cy={cy} r={r} color={color}>
          <BlurMask blur={blurSigma} style="normal" />
        </Circle>
      </Canvas>
    </Animated.View>
  );
}

// ── NightSky ──────────────────────────────────────────────────────
export default function NightSky() {
  const stars = useMemo(
    () => [
      // FAR — 70 estrelas, brancas, pequenas, deriva lenta
      ...makeLayer(70, 100, [0.6, 1.2], [0.15, 0.4], [3, 6], [60, 120], '#FFFFFF', 'far'),
      // MID — 35 estrelas, tom quente, glint sutil
      ...makeLayer(35, 200, [1.0, 1.8], [0.35, 0.7], [2.5, 5], [40, 80], '#FFF8F0', 'mid'),
      // NEAR — 14 estrelas, grandes, glow + scale pulse
      ...makeLayer(14, 300, [1.8, 2.8], [0.6, 1.0], [2, 4], [30, 60], '#FFF5E0', 'near'),
    ],
    [],
  );

  const shooters: ShooterData[] = [
    { topPct: 0.18, delay: 0,     duration: 12000, angle: 18 },
    { topPct: 0.52, delay: 6000,  duration: 14000, angle: 12 },
    { topPct: 0.34, delay: 11000, duration: 18000, angle: 22 },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Nebulosas respirando — 3 camadas */}
      <Nebula
        cx={W * 0.45} cy={H * 0.32} r={W * 0.30}
        color="rgba(140, 160, 220, 0.14)" blurSigma={12}
        dxPeak={12} dyPeak={-8} scalePeak={1.08} duration={22000}
      />
      <Nebula
        cx={W * 0.72} cy={H * 0.60} r={W * 0.275}
        color="rgba(200, 150, 180, 0.12)" blurSigma={14}
        dxPeak={-10} dyPeak={10} scalePeak={1.10} duration={28000}
      />
      <Nebula
        cx={W * 0.22} cy={H * 0.77} r={W * 0.25}
        color="rgba(120, 180, 200, 0.10)" blurSigma={16}
        dxPeak={8} dyPeak={-6} scalePeak={1.06} duration={32000}
      />

      {/* Estrelas — 119 total */}
      {stars.map(star => (
        <StarDot key={star.id} star={star} />
      ))}

      {/* Estrelas cadentes — 3 */}
      {shooters.map((sh, i) => (
        <ShootingStar key={i} sh={sh} />
      ))}
    </View>
  );
}
