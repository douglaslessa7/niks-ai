import { useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFonts } from 'expo-font';
import Svg, {
  Path,
  Circle,
  Ellipse,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
  Line,
  Filter,
  FeGaussianBlur,
} from 'react-native-svg';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';

const DEEP = '#1D3A44';
const DEEP_SOFT = 'rgba(29,58,68,0.55)';
const DEEP_HAIR = 'rgba(29,58,68,0.10)';
const CORAL = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM = '#FFFFFF';

const STEP = 4;
const TOTAL = 14;

const W = 320;
const H = 170;
const pts = [
  { x: 44, y: 144 },
  { x: 125, y: 122 },
  { x: 199, y: 82 },
  { x: 286, y: 30 },
];
const curvePath = `
  M ${pts[0].x} ${pts[0].y}
  C ${pts[0].x + 28} ${pts[0].y - 4}, ${pts[1].x - 28} ${pts[1].y + 4}, ${pts[1].x} ${pts[1].y}
  C ${pts[1].x + 28} ${pts[1].y - 6}, ${pts[2].x - 28} ${pts[2].y + 8}, ${pts[2].x} ${pts[2].y}
  C ${pts[2].x + 30} ${pts[2].y - 8}, ${pts[3].x - 30} ${pts[3].y + 8}, ${pts[3].x} ${pts[3].y}
`;
const areaPath = `${curvePath} L ${pts[3].x} ${H - 12} L ${pts[0].x} ${H - 12} Z`;

function Chart({ width }: { width: number }) {
  const svgH = Math.round((H / W) * width);
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width={width} height={svgH}>
      <Defs>
        <SvgLinearGradient id="gvAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={CORAL} stopOpacity="0.32" />
          <Stop offset="60%" stopColor={CORAL} stopOpacity="0.12" />
          <Stop offset="100%" stopColor={CORAL} stopOpacity="0" />
        </SvgLinearGradient>
        <RadialGradient id="gvOrb" cx="35%" cy="28%" r="70%">
          <Stop offset="0%" stopColor="#FFEFE4" />
          <Stop offset="30%" stopColor="#F9C9B6" />
          <Stop offset="70%" stopColor="#E89178" />
          <Stop offset="100%" stopColor="#C86651" />
        </RadialGradient>
        <Filter id="gvGlow" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation="3" />
        </Filter>
      </Defs>

      {/* Horizontal dashed gridlines */}
      {[42, 82, 122].map((y) => (
        <Line key={`h${y}`} x1="14" y1={y} x2={W - 14} y2={y}
          stroke="rgba(29,58,68,0.22)" strokeWidth="0.9" strokeDasharray="4 5" />
      ))}
      {/* Vertical dashed gridlines */}
      {[88, 162, 236].map((x) => (
        <Line key={`v${x}`} x1={x} y1="20" x2={x} y2={H - 14}
          stroke="rgba(29,58,68,0.18)" strokeWidth="0.9" strokeDasharray="4 5" />
      ))}
      {/* Baseline */}
      <Line x1="14" y1={H - 12} x2={W - 14} y2={H - 12}
        stroke="rgba(29,58,68,0.18)" strokeWidth="1" strokeLinecap="round" />

      {/* Area fill */}
      <Path d={areaPath} fill="url(#gvAreaGrad)" />

      {/* Curve stroke */}
      <Path d={curvePath} fill="none" stroke={CORAL} strokeWidth="2.6"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Intermediate dots */}
      {pts.slice(0, 3).map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r="4.6" fill="#FFFFFF" stroke={CORAL} strokeWidth="2" />
      ))}

      {/* Final NIKS orb */}
      <Circle cx={pts[3].x} cy={pts[3].y} r="14" fill="#FB7B6B" opacity="0.18" filter="url(#gvGlow)" />
      <Circle cx={pts[3].x} cy={pts[3].y} r="10.5" fill="url(#gvOrb)" stroke="#FFFFFF" strokeWidth="2" />
      <Ellipse cx={pts[3].x - 2.5} cy={pts[3].y - 3} rx="2.6" ry="1.6" fill="#FFFFFF" opacity="0.55" />
    </Svg>
  );
}

export default function GoalValidation() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const { width: screenW } = useWindowDimensions();
  const { track } = useMixpanel();
  const router = useRouter();

  const cardInnerWidth = Math.min(screenW, 393) - 48 - 36; // 24px card h-padding * 2 on each side

  useEffect(() => {
    track('onboarding_step_viewed', { step_number: 19, step_name: 'Goal Validation', step_total: 23 });
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CREAM }}>
      <View style={{ flex: 1, maxWidth: 393, width: '100%', alignSelf: 'center' }}>

        {/* QHeader */}
        <View style={{
          paddingVertical: 6, paddingHorizontal: 24,
          flexDirection: 'row', alignItems: 'center', gap: 14,
        }}>
          <TouchableOpacity
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            activeOpacity={0.7}
            style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: 100,
              backgroundColor: 'rgba(255,255,255,0.6)',
              borderWidth: 0.5, borderColor: DEEP_HAIR,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={18} color={DEEP} />
          </TouchableOpacity>
          <View style={{
            flex: 1, height: 4, borderRadius: 100,
            backgroundColor: 'rgba(29,58,68,0.08)', overflow: 'hidden',
          }}>
            <View style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${(STEP / TOTAL) * 100}%`,
              backgroundColor: CORAL, borderRadius: 100,
            }} />
          </View>
        </View>

        {/* QTitleBlock */}
        <View style={{ paddingHorizontal: 28, paddingTop: 28 }}>
          <Text style={{
            fontSize: 10, fontWeight: '600', color: CORAL_DEEP,
            letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 14,
          }}>
            seu potencial
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: 27, fontWeight: '700', color: DEEP,
              letterSpacing: -0.85, lineHeight: 32,
            }}
          >
            {'Você tem '}
            <Text style={{
              fontFamily: fontsLoaded ? 'PlayfairDisplay-Italic' : undefined,
              fontStyle: 'italic', fontWeight: '500', color: CORAL, letterSpacing: -1,
            }}>
              tudo
            </Text>
            {' para conseguir'}
          </Text>
          <Text style={{
            fontSize: 27, fontWeight: '700', color: DEEP,
            letterSpacing: -0.85, lineHeight: 32,
          }}>
            o que quer.
          </Text>
        </View>

        {/* Chart card */}
        <View style={{ paddingHorizontal: 24, paddingTop: 24 }}>
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            borderWidth: 0.5, borderColor: DEEP_HAIR,
            padding: 20,
            shadowColor: '#2B2724',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 30,
            elevation: 3,
          }}>
            {/* Eyebrow inside card */}
            <Text style={{
              fontSize: 10, fontWeight: '600', color: DEEP_SOFT,
              letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 8,
            }}>
              evolução da sua pele
            </Text>

            <Chart width={cardInnerWidth} />

            {/* Caption */}
            <Text style={{
              marginTop: 14, fontSize: 13, lineHeight: 19.5,
              color: DEEP_SOFT, letterSpacing: -0.05, textAlign: 'center',
              paddingHorizontal: 6,
            }}>
              O NIKS torna muito fácil saber exatamente o que a sua pele precisa para atingir o seu objetivo.
            </Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* PrimaryButton */}
        <View style={{ paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18 }}>
          <TouchableOpacity
            onPress={() => {
              track('onboarding_step_completed', { step_number: 19, step_name: 'Goal Validation', step_total: 23 });
              router.push('/(onboarding)/concerns');
            }}
            activeOpacity={0.85}
            style={{
              height: 60, borderRadius: 100, backgroundColor: CORAL,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              shadowColor: CORAL,
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: 0.55,
              shadowRadius: 15, elevation: 8,
            }}
          >
            <Text style={{
              fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: '#FFFFFF',
            }}>
              Continuar
            </Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}
