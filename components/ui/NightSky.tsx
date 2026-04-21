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
import { Canvas, Oval, BlurMask, RadialGradient } from '@shopify/react-native-skia';
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
  layer: 'far' | 'mid' | 'near';
  outerGlowRadius: number;
  outerGlowColor: string | undefined;
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
  layer: 'far' | 'mid' | 'near',
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
      layer,
      shadowRadius:
        layer === 'near' ? size * 3 : layer === 'mid' ? 3 : 0,
      shadowColor:
        layer === 'near'
          ? 'rgba(255, 245, 224, 0.9)'
          : layer === 'mid'
            ? 'rgba(255, 248, 240, 0.6)'
            : undefined,
      scaleAtPeak: layer === 'near',
      // near: anel de glow externo (CSS: 0 0 ${size*6}px rgba(255,245,224,0.4))
      outerGlowRadius: layer === 'near' ? size * 6 : 0,
      outerGlowColor: layer === 'near' ? 'rgba(255, 245, 224, 0.4)' : undefined,
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
    // Mid: curva assimétrica do design (0%/100%→0.35, 45%→0.85, 55%→0.70)
    if (star.layer === 'mid') {
      opacity.value = withDelay(
        star.twinkleDelay,
        withRepeat(
          withSequence(
            withTiming(0.85, { duration: star.twinkleDur * 0.45, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.70, { duration: star.twinkleDur * 0.10, easing: Easing.inOut(Easing.sin) }),
            withTiming(star.baseOp, { duration: star.twinkleDur * 0.45, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        ),
      );
    } else {
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
    }

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

  const glow = star.outerGlowRadius;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: star.x - glow,
          top: star.y - glow,
          width: star.size + glow * 2,
          height: star.size + glow * 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animStyle,
      ]}
    >
      {/* Anel externo difuso — near only (CSS: box-shadow 0 0 ${size*6}px 0.4) */}
      {star.outerGlowColor != null && (
        <View
          style={{
            position: 'absolute',
            width: star.size,
            height: star.size,
            borderRadius: star.size / 2,
            backgroundColor: 'rgba(255,245,224,0.02)',
            shadowColor: '#FFF5E0',
            shadowRadius: star.size * 6,
            shadowOpacity: 0.4,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      )}
      {/* Corpo da estrela com glow interno */}
      <View
        style={{
          width: star.size,
          height: star.size,
          borderRadius: star.size / 2,
          backgroundColor: star.color,
          shadowColor: star.shadowColor ?? 'transparent',
          shadowRadius: star.shadowRadius,
          shadowOpacity: star.shadowColor ? 1 : 0,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </Animated.View>
  );
}

// ── ShootingStar ──────────────────────────────────────────────────
// Tradução literal do CSS do design (direction-3-cerimonia.jsx):
//   left: -5%  |  translateX: -100 → 600  |  dur: 16% do ciclo  |  ease-out
//   opacity: 0%=0, 2%=0, 4%=1, 10%=1, 16%=0, 100%=0
function ShootingStar({ sh }: { sh: ShooterData }) {
  const translateX = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const d = sh.duration;

    translateX.value = withDelay(
      sh.delay,
      withRepeat(
        withSequence(
          withTiming(600, {
            duration: d * 0.16,
            easing: Easing.bezier(0, 0, 0.58, 1),
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
          withTiming(0, { duration: d * 0.02 }),
          withTiming(1, { duration: d * 0.02 }),
          withTiming(1, { duration: d * 0.06 }),
          withTiming(0, { duration: d * 0.06 }),
          withDelay(d * 0.84, withTiming(0, { duration: 0 })),
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

  return (
    <View
      style={{
        position: 'absolute',
        top: sh.topPct * H,
        left: -W * 0.05,
        pointerEvents: 'none',
      }}
    >
      <Animated.View
        style={[
          {
            width: 90,
            height: 1,
            backgroundColor: 'rgba(255,245,220,0.18)',
            borderRadius: 1,
            shadowColor: '#FFF5DC',
            shadowRadius: 4,
            shadowOpacity: 0.65,
            shadowOffset: { width: 0, height: 0 },
          },
          animStyle,
        ]}
      >
        <LinearGradient
          colors={[
            'rgba(255,245,220,0)',
            'rgba(255,245,220,0.9)',
            '#FFFFFF',
          ]}
          locations={[0, 0.85, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// ── Nebula — elipse difusa respirando (Skia Oval + RadialGradient + BlurMask) ─────
// Porta do CSS: radial-gradient(ellipse, color 0%, transparent 65%) + filter:blur()
// - Oval:           forma elíptica (width ≠ height), não circular
// - RadialGradient: cor no centro → transparente em 65% do raio (como o CSS)
// - BlurMask:       suaviza as bordas alfa (aproxima o filter:blur)
// - pad:            canvas maior que o oval para blur não cortar nas bordas
interface NebulaProps {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  blurSigma: number;
  dxPeak: number;
  dyPeak: number;
  scalePeak: number;
  duration: number;
  baseOpacity: number;
}

function Nebula({ left, top, width, height, color, blurSigma, dxPeak, dyPeak, scalePeak, duration, baseOpacity }: NebulaProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: baseOpacity + progress.value * (1 - baseOpacity),
    transform: [
      { translateX: progress.value * dxPeak },
      { translateY: progress.value * dyPeak },
      { scale: 1 + progress.value * (scalePeak - 1) },
    ],
  }));

  const pad = blurSigma * 2;
  const cW = width + pad * 2;
  const cH = height + pad * 2;

  return (
    <Animated.View
      style={[{ position: 'absolute', left: left - pad, top: top - pad, width: cW, height: cH }, style]}
      pointerEvents="none"
    >
      <Canvas style={{ width: cW, height: cH }}>
        <Oval rect={{ x: pad, y: pad, width, height }}>
          <RadialGradient
            c={{ x: pad + width / 2, y: pad + height / 2 }}
            r={Math.max(width, height) / 2}
            colors={[color, 'rgba(0,0,0,0)']}
            positions={[0, 0.65]}
          />
          <BlurMask blur={blurSigma} style="normal" />
        </Oval>
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
      // MID — 35 estrelas, tom quente, twinkle assimétrico
      ...makeLayer(35, 200, [1.0, 1.8], [0.35, 0.7], [2.5, 5], [40, 80], '#FFF8F0', 'mid'),
      // NEAR — 14 estrelas, grandes, glow duplo + scale pulse (baseOp 0.55 cf. design)
      ...makeLayer(14, 300, [1.8, 2.8], [0.55, 1.0], [2, 4], [30, 60], '#FFF5E0', 'near'),
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
      {/* Nebulosas respirando — elipses, posições cf. design reference CSS */}
      {/* CSS: top:10% left:15% width:60% height:55% blur:12px */}
      <Nebula
        left={W * 0.15} top={H * 0.10} width={W * 0.60} height={H * 0.55}
        color="rgba(140, 160, 220, 0.14)" blurSigma={12}
        dxPeak={12} dyPeak={-8} scalePeak={1.08} duration={22000}
        baseOpacity={0.90}
      />
      {/* CSS: top:35% left:45% width:55% height:50% blur:14px */}
      <Nebula
        left={W * 0.45} top={H * 0.35} width={W * 0.55} height={H * 0.50}
        color="rgba(200, 150, 180, 0.12)" blurSigma={14}
        dxPeak={-10} dyPeak={10} scalePeak={1.10} duration={28000}
        baseOpacity={0.80}
      />
      {/* CSS: top:55% left:-5% width:50% height:45% blur:16px */}
      <Nebula
        left={W * (-0.05)} top={H * 0.55} width={W * 0.50} height={H * 0.45}
        color="rgba(120, 180, 200, 0.10)" blurSigma={16}
        dxPeak={8} dyPeak={-6} scalePeak={1.06} duration={32000}
        baseOpacity={0.85}
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
