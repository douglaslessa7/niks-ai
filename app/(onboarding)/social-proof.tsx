import { useEffect } from 'react';
import { View, Text as RNText, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
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

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const VB_W = 300;
const VB_H = 180;
const PAD = 24;
const PLOT_L = PAD;
const PLOT_R = VB_W - PAD;
const PLOT_T = PAD;
const PLOT_B = VB_H - PAD - 10;
const PLOT_W = PLOT_R - PLOT_L;
const PLOT_H_PX = PLOT_B - PLOT_T;
const PATH_LENGTH = 500;

type Pt = { x: number; y: number };

const gx = (t: number): number => PLOT_L + t * PLOT_W;
const gy = (v: number): number => PLOT_T + (1 - v / 100) * PLOT_H_PX;

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

const NIKS_PTS: Pt[] = [
  { x: gx(0),    y: gy(30) },
  { x: gx(0.2),  y: gy(24) },
  { x: gx(0.5),  y: gy(58) },
  { x: gx(0.75), y: gy(77) },
  { x: gx(1),    y: gy(90) },
];

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

function Chart({
  lineProgress,
  endCircleScale,
}: {
  lineProgress: SharedValue<number>;
  endCircleScale: SharedValue<number>;
}) {
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.min(screenW, 393) - 96;
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
        <SvgLinearGradient id="niksGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={Colors.scanBtn} stopOpacity={0.15} />
          <Stop offset="100%" stopColor={Colors.scanBtn} stopOpacity={0} />
        </SvgLinearGradient>
        <SvgLinearGradient id="noGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={Colors.disabled} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={Colors.disabled} stopOpacity={0} />
        </SvgLinearGradient>
        <ClipPath id="plotClip">
          <Rect x={PLOT_L} y={PLOT_T} width={PLOT_W} height={PLOT_H_PX + 4} />
        </ClipPath>
      </Defs>

      <Line x1={PLOT_L} y1={MID_Y} x2={PLOT_R} y2={MID_Y} stroke="rgba(0,0,0,0.07)" strokeWidth={1} strokeDasharray="5 4" />

      <Path d={NO_AREA} fill="url(#noGrad)" clipPath="url(#plotClip)" />
      <Path d={NIKS_AREA} fill="url(#niksGrad)" clipPath="url(#plotClip)" />

      <AnimatedPath d={NO_LINE} fill="none" stroke={Colors.disabled} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={PATH_LENGTH} clipPath="url(#plotClip)" animatedProps={noLineProps} />
      <AnimatedPath d={NIKS_LINE} fill="none" stroke={Colors.scanBtn} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={PATH_LENGTH} clipPath="url(#plotClip)" animatedProps={niksLineProps} />

      <Circle cx={NO_PTS[0].x} cy={NO_PTS[0].y} r={4} fill={Colors.disabled} />
      <Circle cx={NIKS_PTS[0].x} cy={NIKS_PTS[0].y} r={4} fill={Colors.scanBtn} />

      <AnimatedCircle cx={NO_END.x} cy={NO_END.y} fill={Colors.disabled} animatedProps={noCircleProps} />
      <AnimatedCircle cx={NIKS_END.x} cy={NIKS_END.y} fill={Colors.scanBtn} stroke={Colors.white} strokeWidth={2} animatedProps={niksCircleProps} />

      <SvgText x={PLOT_L} y={VB_H - 6} fontSize={10} fill={Colors.muted} textAnchor="start">Mês 1</SvgText>
      <SvgText x={PLOT_R} y={VB_H - 6} fontSize={10} fill={Colors.muted} textAnchor="end">Mês 3</SvgText>
    </Svg>
  );
}

export default function SocialProof() {
  const { track } = useMixpanel();
  const router = useRouter();

  const titleAnim = useSharedValue(0);
  const cardAnim = useSharedValue(0);
  const lineProgress = useSharedValue(0);
  const endCircleScale = useSharedValue(0);
  const labelAnim = useSharedValue(0);
  const statAnim = useSharedValue(0);
  const btnAnim = useSharedValue(0);

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 10, step_name: 'Social Proof', step_total: 23 });

    titleAnim.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    cardAnim.value = withDelay(300, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    lineProgress.value = withDelay(600, withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.cubic) }));
    endCircleScale.value = withDelay(1500, withSpring(1, { mass: 0.5, damping: 10 }));
    labelAnim.value = withDelay(1700, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
    statAnim.value = withDelay(1900, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
    btnAnim.value = withDelay(2100, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleAnim.value,
    transform: [{ translateY: 20 * (1 - titleAnim.value) }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardAnim.value,
    transform: [{ scale: 0.95 + 0.05 * cardAnim.value }],
  }));
  const legendStyle = useAnimatedStyle(() => ({ opacity: labelAnim.value }));
  const statStyle = useAnimatedStyle(() => ({
    opacity: statAnim.value,
    transform: [{ translateY: 12 * (1 - statAnim.value) }],
  }));
  const btnStyle = useAnimatedStyle(() => ({ opacity: btnAnim.value }));

  return (
    <LinearGradient
      colors={['#FCEAE5', '#FDF0ED', '#FDFAF9', '#FFFFFF']}
      locations={[0, 0.4, 0.7, 1]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Header */}
          <View style={{ paddingTop: 16, paddingHorizontal: 18 }}>
            <TouchableOpacity
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              activeOpacity={0.7}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0.5,
                borderColor: 'rgba(0,0,0,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>

            <View style={{ marginTop: 16 }}>
              <View style={{ height: 2, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 1 }}>
                <View style={{ height: 2, width: '56%', backgroundColor: Colors.scanBtn, borderRadius: 1 }} />
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 24 }}>
            <Animated.View style={[titleStyle, { marginBottom: 24 }]}>
              <RNText style={{ color: Colors.tabActive, fontSize: 26, fontWeight: '800', lineHeight: 31 }}>
                NIKS AI cria resultados a longo prazo
              </RNText>
            </Animated.View>

            <Animated.View style={[cardStyle, { marginBottom: 12 }]}>
              <View style={{ backgroundColor: Colors.white, borderRadius: 20, overflow: 'hidden', padding: 20 }}>
                <RNText style={{ color: Colors.muted, fontSize: 12, marginBottom: 12 }}>
                  Saúde da pele
                </RNText>
                <Chart lineProgress={lineProgress} endCircleScale={endCircleScale} />
                <Animated.View style={[legendStyle, { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.scanBtn }} />
                    <RNText style={{ color: Colors.scanBtn, fontSize: 12, fontWeight: '700' }}>NIKS AI</RNText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.disabled }} />
                    <RNText style={{ color: Colors.muted, fontSize: 12 }}>Sem protocolo</RNText>
                  </View>
                </Animated.View>
              </View>
            </Animated.View>

            <Animated.View style={[statStyle, { marginBottom: 24 }]}>
              <View style={{ backgroundColor: Colors.white, borderRadius: 16, padding: 16 }}>
                <RNText style={{ color: Colors.black, fontSize: 15, lineHeight: 22 }}>
                  <RNText style={{ fontWeight: '700' }}>89%</RNText> dos usuários notaram melhora visível em 30 dias
                </RNText>
              </View>
            </Animated.View>

            <View style={{ flex: 1 }} />

            <Animated.View style={[btnStyle, { paddingBottom: 32 }]}>
              <TouchableOpacity
                onPress={() => {
                  track('onboarding_step_completed', { step_number: 10, step_name: 'Social Proof', step_total: 23 });
                  router.push('/(onboarding)/food-analysis');
                }}
                activeOpacity={0.8}
                style={{
                  backgroundColor: Colors.scanBtn,
                  borderRadius: 100,
                  paddingVertical: 16,
                  alignItems: 'center',
                }}
              >
                <RNText style={{ fontSize: 16, fontWeight: '600', color: Colors.white }}>
                  Continuar
                </RNText>
              </TouchableOpacity>
            </Animated.View>
          </View>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
