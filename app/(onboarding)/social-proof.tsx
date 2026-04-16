import { useEffect } from 'react';
import { View, Text as RNText, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { QuizLayout } from '../../components/layouts/QuizLayout';
import { CTAButton } from '../../components/ui/CTAButton';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Line,
  Text as SvgText,
  ClipPath,
  Rect,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { Colors } from '../../constants/colors';

// ─── Animated SVG primitives ─────────────────────────────────────────────────
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Fixed viewBox coordinate space (300 × 180) ──────────────────────────────
const VB_W = 300;
const VB_H = 180;
const PAD = 24;
const PLOT_L = PAD;            // 24
const PLOT_R = VB_W - PAD;    // 276
const PLOT_T = PAD;            // 24
const PLOT_B = VB_H - PAD - 10; // 146  (10px reserved for x-axis text)
const PLOT_W = PLOT_R - PLOT_L; // 252
const PLOT_H_PX = PLOT_B - PLOT_T; // 122
const PATH_LENGTH = 500;

type Pt = { x: number; y: number };

const gx = (t: number): number => PLOT_L + t * PLOT_W;
const gy = (v: number): number => PLOT_T + (1 - v / 100) * PLOT_H_PX;

// ─── Smooth bezier via Catmull-Rom ───────────────────────────────────────────
function catmullRomPath(pts: Pt[], tension = 0.4): string {
  if (pts.length < 2) return '';
  const cmds: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;
    cmds.push(
      `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    );
  }
  return cmds.join(' ');
}

function buildAreaPath(pts: Pt[]): string {
  const line = catmullRomPath(pts);
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${line} L ${last.x.toFixed(1)} ${PLOT_B} L ${first.x.toFixed(1)} ${PLOT_B} Z`;
}

// ─── Pre-computed paths (module-level — viewBox is fixed) ────────────────────
// NIKS AI: slight dip at week 2, then strong rise to 90
const NIKS_PTS: Pt[] = [
  { x: gx(0),    y: gy(30) },
  { x: gx(0.2),  y: gy(24) },
  { x: gx(0.5),  y: gy(58) },
  { x: gx(0.75), y: gy(77) },
  { x: gx(1),    y: gy(90) },
];

// Sem protocolo: slight rise then falls below start
const NO_PTS: Pt[] = [
  { x: gx(0),    y: gy(30) },
  { x: gx(0.3),  y: gy(38) },
  { x: gx(0.55), y: gy(45) },
  { x: gx(0.8),  y: gy(37) },
  { x: gx(1),    y: gy(27) },
];

const NIKS_LINE = catmullRomPath(NIKS_PTS);
const NO_LINE = catmullRomPath(NO_PTS);
const NIKS_AREA = buildAreaPath(NIKS_PTS);
const NO_AREA = buildAreaPath(NO_PTS);
const MID_Y = gy(50);
const NIKS_END = NIKS_PTS[NIKS_PTS.length - 1];
const NO_END = NO_PTS[NO_PTS.length - 1];

// ─── Chart ────────────────────────────────────────────────────────────────────
function Chart({
  lineProgress,
  endCircleScale,
}: {
  lineProgress: SharedValue<number>;
  endCircleScale: SharedValue<number>;
}) {
  // Maintain aspect ratio: height = (VB_H / VB_W) × rendered width
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.min(screenW, 393) - 96; // quiz px-6×2 (48) + card p-6×2 (48)
  const svgH = Math.round((VB_H / VB_W) * cardW);

  const niksLineProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - lineProgress.value),
  }));
  const noLineProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LENGTH * (1 - lineProgress.value),
  }));
  const niksCircleProps = useAnimatedProps(() => ({
    r: 6 * endCircleScale.value,
  }));
  const noCircleProps = useAnimatedProps(() => ({
    r: 5 * endCircleScale.value,
  }));

  return (
    <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={svgH}>
      <Defs>
        <LinearGradient id="niksGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={Colors.scanBtn} stopOpacity={0.15} />
          <Stop offset="100%" stopColor={Colors.scanBtn} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="noGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={Colors.disabled} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={Colors.disabled} stopOpacity={0} />
        </LinearGradient>
        {/* Clip to plot area — prevents curves from bleeding outside */}
        <ClipPath id="plotClip">
          <Rect x={PLOT_L} y={PLOT_T} width={PLOT_W} height={PLOT_H_PX + 4} />
        </ClipPath>
      </Defs>

      {/* Dashed reference at 50% */}
      <Line
        x1={PLOT_L}
        y1={MID_Y}
        x2={PLOT_R}
        y2={MID_Y}
        stroke="rgba(0,0,0,0.07)"
        strokeWidth={1}
        strokeDasharray="5 4"
      />

      {/* Area fills */}
      <Path d={NO_AREA} fill="url(#noGrad)" clipPath="url(#plotClip)" />
      <Path d={NIKS_AREA} fill="url(#niksGrad)" clipPath="url(#plotClip)" />

      {/* Sem protocolo — animated draw */}
      <AnimatedPath
        d={NO_LINE}
        fill="none"
        stroke={Colors.disabled}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={PATH_LENGTH}
        clipPath="url(#plotClip)"
        animatedProps={noLineProps}
      />

      {/* NIKS AI — animated draw */}
      <AnimatedPath
        d={NIKS_LINE}
        fill="none"
        stroke={Colors.scanBtn}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={PATH_LENGTH}
        clipPath="url(#plotClip)"
        animatedProps={niksLineProps}
      />

      {/* Start circles (static) */}
      <Circle cx={NO_PTS[0].x} cy={NO_PTS[0].y} r={4} fill={Colors.disabled} />
      <Circle cx={NIKS_PTS[0].x} cy={NIKS_PTS[0].y} r={4} fill={Colors.scanBtn} />

      {/* End circles — spring scale */}
      <AnimatedCircle cx={NO_END.x} cy={NO_END.y} fill={Colors.disabled} animatedProps={noCircleProps} />
      <AnimatedCircle
        cx={NIKS_END.x}
        cy={NIKS_END.y}
        fill={Colors.scanBtn}
        stroke={Colors.white}
        strokeWidth={2}
        animatedProps={niksCircleProps}
      />

      {/* X-axis extremes */}
      <SvgText x={PLOT_L} y={VB_H - 6} fontSize={10} fill={Colors.muted} textAnchor="start">
        Mês 1
      </SvgText>
      <SvgText x={PLOT_R} y={VB_H - 6} fontSize={10} fill={Colors.muted} textAnchor="end">
        Mês 3
      </SvgText>
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SocialProof() {
  const { track } = useMixpanel();

  const titleAnim = useSharedValue(0);
  const cardAnim = useSharedValue(0);
  const lineProgress = useSharedValue(0);
  const endCircleScale = useSharedValue(0);
  const labelAnim = useSharedValue(0);
  const statAnim = useSharedValue(0);
  const btnAnim = useSharedValue(0);

  useEffect(() => {
    track('onboarding_step_viewed', {
      step_number: 10,
      step_name: 'Social Proof',
      step_total: 23,
    });

    // Step 1 (0ms) — title: fade + slide up 20px
    titleAnim.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });

    // Step 2 (300ms) — card: fade + scale 0.95 → 1
    cardAnim.value = withDelay(
      300,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
    );

    // Step 3 (600ms) — lines draw left → right (smooth inOut)
    lineProgress.value = withDelay(
      600,
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.cubic) })
    );

    // Step 4 (1500ms) — end circles spring in
    endCircleScale.value = withDelay(
      1500,
      withSpring(1, { mass: 0.5, damping: 10 })
    );

    // Step 5 (1700ms) — legend labels fade in
    labelAnim.value = withDelay(
      1700,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
    );

    // Step 6 (1900ms) — stat card fade + slide up
    statAnim.value = withDelay(
      1900,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
    );

    // Step 7 (2100ms) — button fade in
    btnAnim.value = withDelay(
      2100,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleAnim.value,
    transform: [{ translateY: 20 * (1 - titleAnim.value) }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardAnim.value,
    transform: [{ scale: 0.95 + 0.05 * cardAnim.value }],
  }));
  const legendStyle = useAnimatedStyle(() => ({
    opacity: labelAnim.value,
  }));
  const statStyle = useAnimatedStyle(() => ({
    opacity: statAnim.value,
    transform: [{ translateY: 12 * (1 - statAnim.value) }],
  }));
  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnAnim.value,
  }));

  return (
    <ExpoLinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.3, 0.6, 1]}
      style={{ flex: 1 }}
    >
    <QuizLayout progress={56}>
      <View className="pt-6 flex-1">
        {/* Title */}
        <Animated.View style={titleStyle} className="mb-6">
          <RNText
            style={{ color: Colors.black, fontSize: 28, fontWeight: '800', lineHeight: 34 }}
          >
            NIKS AI cria resultados a longo prazo
          </RNText>
        </Animated.View>

        {/* Chart card */}
        <Animated.View style={cardStyle} className="mb-4">
          <View
            style={{ backgroundColor: Colors.cardBg, borderRadius: 20, overflow: 'hidden' }}
            className="p-6 shadow-sm"
          >
            <RNText style={{ color: Colors.muted, fontSize: 12 }} className="mb-3">
              Saúde da pele
            </RNText>

            <Chart lineProgress={lineProgress} endCircleScale={endCircleScale} />

            {/* Legend — fades in separately at Step 5 */}
            <Animated.View style={legendStyle} className="flex-row items-center gap-5 mt-3">
              <View className="flex-row items-center gap-2">
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.scanBtn }}
                />
                <RNText style={{ color: Colors.scanBtn, fontSize: 12, fontWeight: '700' }}>
                  NIKS AI
                </RNText>
              </View>
              <View className="flex-row items-center gap-2">
                <View
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.disabled }}
                />
                <RNText style={{ color: Colors.muted, fontSize: 12 }}>
                  Sem protocolo
                </RNText>
              </View>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Stat card */}
        <Animated.View style={statStyle} className="mb-6">
          <View style={{ backgroundColor: Colors.cardBg, borderRadius: 16 }} className="p-4">
            <RNText style={{ color: Colors.black, fontSize: 15, lineHeight: 22 }}>
              <RNText style={{ fontWeight: '700' }}>89%</RNText> dos usuários notaram melhora
              visível em 30 dias
            </RNText>
          </View>
        </Animated.View>

        <View className="flex-1" />

        {/* Button */}
        <Animated.View style={btnStyle} className="pb-8">
          <CTAButton
            text="Continuar"
            to="/(onboarding)/food-analysis"
            onPress={() =>
              track('onboarding_step_completed', {
                step_number: 10,
                step_name: 'Social Proof',
                step_total: 23,
              })
            }
          />
        </Animated.View>
      </View>
    </QuizLayout>
    </ExpoLinearGradient>
  );
}
