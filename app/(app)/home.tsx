import {
  View, Text, TouchableOpacity, ScrollView, Image,
  useWindowDimensions, StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useState, useCallback, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Path, Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { useAppStore, ScanResult } from '../../store/onboarding';
import { ScanModal } from '../../components/scan/ScanModal';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────
type FoodScan = {
  id: string;
  meal_name: string;
  meal_score: number;
  meal_label: string;
  created_at: string;
  image_url: string | null;
  full_result: any | null;
};

type SkinScan = {
  id: string;
  foto_url: string;
  full_result: ScanResult;
  created_at: string;
};

type OrbVariant = 'dawn' | 'dusk' | 'night';
type TimeCtx = { mode: 'am' | 'pm'; orbVariant: OrbVariant; greeting: string; period: string };

// ── Helpers ─────────────────────────────────────────────────────────────────
function getTimeContext(hour: number): TimeCtx {
  if (hour >= 5 && hour < 12)  return { mode: 'am', orbVariant: 'dawn',  greeting: 'Bom dia',   period: 'manhã' };
  if (hour >= 12 && hour < 18) return { mode: 'pm', orbVariant: 'dusk',  greeting: 'Boa tarde', period: 'entardecer' };
  return { mode: 'pm', orbVariant: 'night', greeting: 'Boa noite', period: 'noite' };
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS   = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatDateShort(d: Date) { return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${WEEKDAYS[d.getDay()]}`; }

function getProtocolDate() {
  const now = new Date();
  now.setHours(now.getHours() - 3);
  return now.toISOString().split('T')[0];
}

function getTodayStart(): Date {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(2, 30, 0, 0);
  if (now < cutoff) cutoff.setDate(cutoff.getDate() - 1);
  return cutoff;
}

// ── HomeOrb ──────────────────────────────────────────────────────────────────
// Copiado literalmente de home-screen.jsx → HomeOrb (home-horizonte-reformulado.jsx referencia este arquivo)
// Gradientes: radial-gradient(circle at 35% 30%, ...) convertido para SVG RadialGradient
// Sombras: box-shadow convertidas para shadowColor/shadowOpacity/shadowRadius do RN
// Highlight: radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 70%)
// Variante night: craters adicionais (3 círculos com radial-gradient escuro)

// Stops dos gradientes orb — extraídos de home-screen.jsx linha 56-59
const ORB_STOPS: Record<OrbVariant, Array<[string, string]>> = {
  dawn:  [['#FFEFE4','0%'],['#F9C9B6','30%'],['#E89178','70%'],['#C86651','100%']],
  dusk:  [['#FFDCCB','0%'],['#E59A82','35%'],['#A85A6B','75%'],['#4A2E4A','100%']],
  night: [['#FFFFFF','0%'],['#F4EEE4','30%'],['#D8CDB8','60%'],['#A89676','100%']],
};

// Sombras — extraídas de home-screen.jsx linhas 62-65
// night: '0 0 70px rgba(255,248,220,0.4), 0 20px 48px rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.6)'
// RN não suporta múltiplas sombras nem inset — usar o drop shadow principal
const ORB_SHADOW: Record<OrbVariant, object> = {
  dawn:  { shadowColor: '#E89178', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.32, shadowRadius: 48, elevation: 8  },
  dusk:  { shadowColor: '#A85A6B', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.35, shadowRadius: 48, elevation: 8  },
  night: { shadowColor: '#000000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.45, shadowRadius: 48, elevation: 12 },
};

function HomeOrb({ variant, size }: { variant: OrbVariant; size: number }) {
  const r   = size / 2;
  // Gradiente: circle at 35% 30% → cx=35%*size, cy=30%*size
  // r cobre o canto mais distante de (35%,30%): sqrt(0.65²+0.70²)*size ≈ 0.955*size
  const gCX = size * 0.35;
  const gCY = size * 0.30;
  const gR  = size * 0.955;

  // Highlight: top:10% left:20% w:32% h:20% — radial-gradient(ellipse at center, ...)
  // centro = (left + w/2, top + h/2) = (0.20+0.16, 0.10+0.10) = (0.36, 0.20)
  const hlCX = size * 0.36;
  const hlCY = size * 0.20;
  const hlRX = size * 0.16;  // 0.32/2
  const hlRY = size * 0.10;  // 0.20/2

  const isNight = variant === 'night';
  const gid  = `g_orb_${variant}`;
  const hlid = `g_hl_${variant}`;

  // Craters (night only) — extraídos de home-screen.jsx linhas 84-90
  // Cada crater: { position, dimensões, gradient at 30% 30% }
  // Raio do gradiente = farthest-corner de (30%,30%) no elemento quadrado = 0.70*dim*sqrt(2)
  // Crater 1: top:32% left:54% w:11% h:11% → center=(0.595,0.375), r=0.70*0.11*√2*size≈0.109*size
  // Crater 2: top:55% left:28% w:8%  h:8%  → center=(0.32, 0.59),  r=0.70*0.08*√2*size≈0.079*size
  // Crater 3: top:68% left:50% w:5%  h:5%  → center=(0.525,0.705), r=0.70*0.05*√2*size≈0.050*size
  // gCx de cada crater = left + 0.30*width; gCy = top + 0.30*height

  return (
    <View style={{ width: size, height: size, ...ORB_SHADOW[variant] }}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Gradiente principal do orb — radial-gradient(circle at 35% 30%, ...) */}
          <RadialGradient id={gid} cx={gCX} cy={gCY} r={gR} gradientUnits="userSpaceOnUse">
            {ORB_STOPS[variant].map(([color, offset], i) => (
              <Stop key={i} offset={offset} stopColor={color} stopOpacity={1} />
            ))}
          </RadialGradient>

          {/* Highlight — radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 70%) */}
          <RadialGradient id={hlid} cx={hlCX} cy={hlCY} r={hlRX} gradientUnits="userSpaceOnUse">
            <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>

          {/* Craters da variante night */}
          {isNight && (
            <>
              {/* Crater 1 — top:32% left:54% w:11% h:11% — gradient at 30%,30% */}
              <RadialGradient id="g_cr1" cx={size * 0.573} cy={size * 0.353} r={size * 0.109} gradientUnits="userSpaceOnUse">
                <Stop offset="0%"   stopColor="#000000" stopOpacity={0.08} />
                <Stop offset="60%"  stopColor="#000000" stopOpacity={0.18} />
                <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
              </RadialGradient>
              {/* Crater 2 — top:55% left:28% w:8% h:8% — gradient at 30%,30% */}
              <RadialGradient id="g_cr2" cx={size * 0.304} cy={size * 0.574} r={size * 0.079} gradientUnits="userSpaceOnUse">
                <Stop offset="0%"   stopColor="#000000" stopOpacity={0.06} />
                <Stop offset="60%"  stopColor="#000000" stopOpacity={0.16} />
                <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
              </RadialGradient>
              {/* Crater 3 — top:68% left:50% w:5% h:5% — gradient at 30%,30% */}
              <RadialGradient id="g_cr3" cx={size * 0.515} cy={size * 0.695} r={size * 0.050} gradientUnits="userSpaceOnUse">
                <Stop offset="0%"   stopColor="#000000" stopOpacity={0.06} />
                <Stop offset="60%"  stopColor="#000000" stopOpacity={0.14} />
                <Stop offset="100%" stopColor="#000000" stopOpacity={0} />
              </RadialGradient>
            </>
          )}
        </Defs>

        {/* Corpo do orb */}
        <Circle cx={r} cy={r} r={r} fill={`url(#${gid})`} />

        {/* Highlight — filter:blur(5px) não suportado em RN; gradiente já é suave */}
        <Ellipse cx={hlCX} cy={hlCY} rx={hlRX} ry={hlRY} fill={`url(#${hlid})`} />

        {/* Craters (variant === 'night' only) */}
        {isNight && (
          <>
            <Ellipse cx={size * 0.595} cy={size * 0.375} rx={size * 0.055} ry={size * 0.055} fill="url(#g_cr1)" />
            <Ellipse cx={size * 0.32}  cy={size * 0.59}  rx={size * 0.040} ry={size * 0.040} fill="url(#g_cr2)" />
            <Ellipse cx={size * 0.525} cy={size * 0.705} rx={size * 0.025} ry={size * 0.025} fill="url(#g_cr3)" />
          </>
        )}
      </Svg>
    </View>
  );
}

// ── Night sky ────────────────────────────────────────────────────────────────
const STAR_DATA = Array.from({ length: 56 }, (_, i) => ({
  cx: `${(i * 37 + 13) % 100}%`,
  cy: `${(i * 53 + 7) % 100}%`,
  r:   i % 3 === 0 ? 1.3 : 0.7,
  op:  0.3 + ((i * 17) % 60) / 100,
}));

function ReformuladoNightSkyStatic() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        {STAR_DATA.map((s, i) => (
          <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" opacity={s.op} />
        ))}
      </Svg>
    </View>
  );
}

const SHOOTERS = [
  { topPct: 0.12, leftPct: -0.20, delay: 1200,  duration: 9000  },
  { topPct: 0.40, leftPct: -0.22, delay: 5500,  duration: 11000 },
  { topPct: 0.68, leftPct: -0.18, delay: 9800,  duration: 10000 },
];

function ShootingStar({ topPct, leftPct, delay, duration }: (typeof SHOOTERS)[0]) {
  const { height: H, width: W } = useWindowDimensions();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    const d = duration;
    tx.value = withDelay(delay, withRepeat(
      withSequence(withTiming(520, { duration: d, easing: Easing.linear }), withTiming(0, { duration: 0 })),
      -1, false,
    ));
    ty.value = withDelay(delay, withRepeat(
      withSequence(withTiming(170, { duration: d, easing: Easing.linear }), withTiming(0, { duration: 0 })),
      -1, false,
    ));
    op.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(1, { duration: d * 0.08, easing: Easing.linear }),
        withTiming(1, { duration: d * 0.84, easing: Easing.linear }),
        withTiming(0, { duration: d * 0.08, easing: Easing.linear }),
      ),
      -1, false,
    ));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <View
      style={{ position: 'absolute', top: topPct * H, left: leftPct * W, transform: [{ rotate: '18deg' }] }}
      pointerEvents="none"
    >
      <Animated.View style={[{ width: 140, height: 1, borderRadius: 1, overflow: 'hidden' }, animStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.9)', '#FFFFFF']}
          locations={[0, 0.7, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

function ReformuladoNightSky() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        {STAR_DATA.map((s, i) => (
          <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" opacity={s.op} />
        ))}
      </Svg>
      {SHOOTERS.map((sh, i) => <ShootingStar key={i} {...sh} />)}
    </View>
  );
}

// ── HeroEditorial (VAR 3 — variante aprovada) ─────────────────────────────────
function HeroEditorial({
  firstName, displayFont, displayFontReg, accent, ctx, today, isDark, inkSoft,
  onDebugToggle,
}: {
  firstName: string;
  displayFont: string | undefined;
  displayFontReg: string | undefined;
  accent: string;
  ctx: TimeCtx;
  today: Date;
  isDark: boolean;
  inkSoft: string;
  onDebugToggle: () => void;
}) {
  const tapCountRef  = useRef(0);
  const tapTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNiksTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 2000);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      onDebugToggle();
    }
  };

  const mastheadColor = isDark ? 'rgba(255,255,255,0.7)' : inkSoft;
  const titleColor    = isDark ? '#FFFFFF' : accent;
  return (
    <View style={{ position: 'relative', paddingTop: 8, paddingBottom: 24, overflow: 'visible' }}>
      {/* Orb — atrás dos cards. right:-110 sangra fora do container, overflow:visible obrigatório */}
      {/* top: 56 = referência top:110 - (paddingTop referência:62 - paddingTop app:8). SafeAreaView cuida do safe area aqui, a referência embutia no paddingTop:62 */}
      <View style={{ position: 'absolute', right: -110, top: 56, zIndex: 0, opacity: isDark ? 1 : 0.9 }} pointerEvents="none">
        <HomeOrb variant={ctx.orbVariant} size={320} />
      </View>

      {/* Masthead — 5 toques no "NIKS" ativam o debug de modo dia/noite */}
      <View style={{ paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 3 }}>
        <TouchableOpacity onPress={handleNiksTap} activeOpacity={1}>
          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 2.8, color: mastheadColor, textTransform: 'uppercase' }}>
            NIKS
          </Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 0.5, color: mastheadColor }}>
          {formatDateShort(today)}
        </Text>
      </View>

      {/* Saudação */}
      <View style={{ paddingLeft: 28, paddingRight: 28, marginTop: 44, position: 'relative', zIndex: 2 }}>
          <Text style={{ fontFamily: displayFont, fontSize: 54, fontWeight: '400', color: titleColor, lineHeight: 54, letterSpacing: -1.89 }}>
            Olá,
          </Text>
          <Text
            style={{ fontFamily: displayFontReg, fontSize: 54, fontWeight: '400', color: titleColor, lineHeight: 54, letterSpacing: -1.89 }}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.5}
          >
            {firstName.toLowerCase() || 'você'}.
          </Text>
        <Text style={{ fontFamily: displayFont, fontSize: 15, fontWeight: '400', color: isDark ? 'rgba(255,255,255,0.75)' : 'rgb(251, 123, 107)', fontStyle: 'italic', letterSpacing: -0.075, marginTop: 13, lineHeight: 22.5, maxWidth: 190 }}>
          {ctx.mode === 'am'
            ? 'Sua rotina da manhã já \nestá esperando por você.'
            : 'Sua rotina da noite já \nestá esperando por você.'}
        </Text>
      </View>
    </View>
  );
}

// ── Tab bar icons — paths copiados literalmente de niks-protocolo-shared.jsx (Icon.home/homeFilled/protocol/protocolFilled/user/userFilled) ──
function TabIconHome({ color, size = 24, filled }: { color: string; size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15V14H9v7.5H4.5A1.5 1.5 0 0 1 3 20z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap={filled ? undefined : 'round'}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function TabIconProtocol({ color, size = 24, filled }: { color: string; size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap={filled ? undefined : 'round'}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function TabIconUser({ color, size = 24, filled }: { color: string; size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap={filled ? undefined : 'round'}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={7} r={4} fill={filled ? color : 'none'} stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

// ── HomeBottomBar — ProtoTabBar + FAB copiados de HomeHorizonteReformulado ─────
// Estrutura idêntica ao design de referência: tab bar e FAB são irmãos no mesmo
// container, com zIndex: 20 e zIndex: 30 respectivamente (mesma lógica de empilhamento).
// fabVariant = 'floating' (padrão do design de referência): FAB em bottom: 102, tab bar full width.
function HomeBottomBar({ isDark, accent, onScanPress }: { isDark: boolean; accent: string; onScanPress: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Cores — copiadas de ProtoTabBar (niks-protocolo-shared.jsx linhas 326-330)
  const activeColor   = isDark ? '#F9A898' : accent;            // PROTO.coralSoft / PROTO.coral
  const inactiveColor = isDark ? 'rgba(255,255,255,0.45)' : '#8A8A8E'; // PROTO.gray6
  const bg     = isDark ? 'rgba(26,31,46,0.85)' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#F0F0F0';

  const tabDefs = [
    { key: 'home',      label: 'início', Icon: TabIconHome,     active: true  },
    { key: 'protocolo', label: 'rotina', Icon: TabIconProtocol, active: false },
    { key: 'perfil',    label: 'perfil', Icon: TabIconUser,     active: false },
  ];

  const tabItems = tabDefs.map((t) => {
    const color = t.active ? activeColor : inactiveColor;
    return (
      <TouchableOpacity
        key={t.key}
        onPress={() => { if (t.key !== 'home') router.push(`/${t.key}` as any); }}
        activeOpacity={0.8}
        style={{ alignItems: 'center', paddingVertical: 4, gap: 4, minWidth: 52 }}
      >
        <t.Icon color={color} size={24} filled={t.active} />
        <Text style={{ fontSize: 12, color, fontWeight: t.active ? '600' : '400' }}>{t.label}</Text>
      </TouchableOpacity>
    );
  });

  // Conteúdo interno do tab bar (reutilizado em light e dark)
  const tabContent = (
    <View style={{
      backgroundColor: bg,
      borderWidth: 1, borderColor: border, borderRadius: 20,
      flexDirection: 'row', justifyContent: 'space-around',
      paddingVertical: 10, paddingHorizontal: 8,
    }}>
      {tabItems}
    </View>
  );

  return (
    <>
      <View style={{
        position: 'absolute', left: 16, right: 92, bottom: 20, zIndex: 20,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: isDark ? 4 : 1 },
        shadowOpacity: isDark ? 0.4 : 0.06,
        shadowRadius: isDark ? 20 : 4,
        elevation: isDark ? 8 : 2,
      }}>
        {isDark ? (
          <BlurView intensity={50} tint="dark" style={{ borderRadius: 20, overflow: 'hidden' }}>
            {tabContent}
          </BlurView>
        ) : (
          tabContent
        )}
      </View>

      <TouchableOpacity
        onPress={onScanPress}
        activeOpacity={0.88}
        style={{
          position: 'absolute', right: 20, bottom: 24, zIndex: 30,
          width: 68, height: 68, borderRadius: 34,
          backgroundColor: accent,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: accent, shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.33, shadowRadius: 28, elevation: 12,
        }}
      >
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </Svg>
      </TouchableOpacity>
    </>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function IconCheck() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function IconArrowRight({ color = '#fff', size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function IconCamera() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M3 7V5a2 2 0 0 1 2-2h2" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M17 3h2a2 2 0 0 1 2 2v2" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M21 17v2a2 2 0 0 1-2 2h-2" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M7 21H5a2 2 0 0 1-2-2v-2" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={12} cy={12} r={3} stroke="#fff" strokeWidth={1.8} fill="none" />
    </Svg>
  );
}
function IconPlus({ accent }: { accent: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 14 14">
      <Path d="M7 2v10M2 7h10" stroke={accent} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// ── RitualCard ───────────────────────────────────────────────────────────────
function RitualCard({
  ritualComplete, ctx, nextStep, doneSoFar, total,
  displayFont, accent, ink, inkSoft, inkHair, surface, surfaceHair, isDark,
  onPress,
}: {
  ritualComplete: boolean; ctx: TimeCtx; nextStep: string;
  doneSoFar: number; total: number; displayFont: string | undefined;
  accent: string; ink: string; inkSoft: string; inkHair: string;
  surface: string; surfaceHair: string; isDark: boolean; onPress: () => void;
}) {
  const periodLabel = ctx.mode === 'am' ? 'matinal' : 'noturno';
  const safeTotal = total > 0 ? total : 1;
  const safeDone  = Math.min(doneSoFar, safeTotal);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.92}
      style={{
        marginHorizontal: 20, marginTop: 8,
        backgroundColor: surface, borderWidth: 0.5, borderColor: surfaceHair,
        borderRadius: 24, paddingVertical: 20, paddingHorizontal: 22,
        position: 'relative', zIndex: 5,
        shadowColor: '#2B2724', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 14, elevation: isDark ? 0 : 2,
      }}
    >
      {/* Eyebrow + counter */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 2.4, color: inkSoft, textTransform: 'uppercase' }}>
          Skincare {periodLabel}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '500', color: inkSoft, letterSpacing: 0.3 }}>
          {ritualComplete ? safeTotal : safeDone + 1}
          <Text style={{ opacity: 0.5 }}> / </Text>
          {safeTotal}
        </Text>
      </View>

      {ritualComplete ? (
        <>
          <Text style={{ fontFamily: displayFont, fontSize: 32, fontWeight: '400', color: ink, lineHeight: 33.6, letterSpacing: -0.64, marginTop: 16 }}>
            <Text style={{ fontStyle: 'italic' }}>{'skincare ' + periodLabel + '\n'}</Text>
            <Text style={{ color: accent }}>concluído.</Text>
          </Text>
          <Text style={{ marginTop: 8, fontSize: 13, fontWeight: '400', color: inkSoft, letterSpacing: -0.065 }}>
            {safeTotal} de {safeTotal} passos · até {ctx.mode === 'am' ? 'a noite' : 'amanhã'}
          </Text>
          <View style={{ marginTop: 20, flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: safeTotal }).map((_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: accent }} />
            ))}
          </View>
          <View style={{ marginTop: 20, backgroundColor: accent, borderRadius: 100, paddingVertical: 15, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.188, shadowRadius: 22, elevation: 6 }}>
            <IconCheck />
            <Text style={{ fontSize: 15, fontWeight: '600', letterSpacing: -0.075, color: '#FFFFFF' }}>Ver resumo</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: displayFont, fontSize: 32, fontWeight: '400', color: ink, lineHeight: 33.6, letterSpacing: -0.64, fontStyle: 'italic', marginTop: 16 }}>
            {nextStep || 'Configure seu protocolo'}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 13, fontWeight: '400', color: inkSoft, letterSpacing: -0.065 }}>
            passo {safeDone + 1} de {safeTotal} · ~2 min
          </Text>
          <View style={{ marginTop: 20, flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: safeTotal }).map((_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < safeDone + 1 ? accent : inkHair }} />
            ))}
          </View>
          <View style={{ marginTop: 20, backgroundColor: accent, borderRadius: 100, paddingVertical: 15, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.188, shadowRadius: 22, elevation: 6 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: -0.075 }}>Começar agora</Text>
            <IconArrowRight />
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

// ── ScanCard — extraído para componente próprio (useState não pode ficar em map) ──
function ScanCard({
  scan, delta, displayFont, accent, ink, inkSoft, surface, surfaceHair, isDark, onPress,
}: {
  scan: SkinScan; delta: number; displayFont: string | undefined;
  accent: string; ink: string; inkSoft: string; surface: string;
  surfaceHair: string; isDark: boolean; onPress: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const isValidUrl = scan.foto_url.startsWith('http');
  const score  = scan.full_result.skin_score;
  const dateStr = new Date(scan.created_at)
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '');

  return (
    <View style={{ width: 196, flexShrink: 0, backgroundColor: surface, borderWidth: 0.5, borderColor: surfaceHair, borderRadius: 22, overflow: 'hidden', shadowColor: '#2B2724', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 10, elevation: isDark ? 0 : 1 }}>
      {/* Imagem + overlays */}
      <View style={{ height: 232, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F4EFE9' }}>
        {isValidUrl && !imgErr ? (
          <Image source={{ uri: scan.foto_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setImgErr(true)} />
        ) : (
          <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#C8C0B8' }} />
        )}

        {/* Score badge */}
        <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: isDark ? 'rgba(15,20,32,0.72)' : 'rgba(255,255,255,0.92)', borderWidth: 0.5, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(43,39,36,0.06)', borderRadius: 14, paddingVertical: 6, paddingLeft: 11, paddingRight: 10, flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
          <Text style={{ fontFamily: displayFont, fontSize: 20, fontWeight: '400', color: ink, lineHeight: 20, letterSpacing: -0.4 }}>{score}</Text>
          <Text style={{ fontFamily: displayFont, fontSize: 11, fontWeight: '400', color: inkSoft, fontStyle: 'italic' }}>/100</Text>
        </View>

        {/* Delta */}
        {delta !== 0 && (
          <Text style={{ position: 'absolute', left: 12, bottom: 12, fontFamily: displayFont, fontSize: 13, fontStyle: 'italic', color: '#FFFFFF', letterSpacing: 0.2 }}>
            {delta > 0 ? '+' : ''}{delta}
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={{ padding: 14, gap: 12 }}>
        <View>
          <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, color: inkSoft, textTransform: 'uppercase' }}>Scan facial</Text>
          <Text style={{ fontFamily: displayFont, fontSize: 18, fontWeight: '400', color: ink, letterSpacing: -0.36, lineHeight: 19.8, marginTop: 4, fontStyle: 'italic' }}>
            {dateStr}
          </Text>
        </View>
        <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ borderWidth: 0.5, borderColor: accent, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text style={{ color: accent, fontSize: 12, fontWeight: '600', letterSpacing: -0.06 }}>Ver resultado</Text>
          <IconArrowRight color={accent} size={10} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── ScansRecentes ─────────────────────────────────────────────────────────────
function ScansRecentes({
  scans, displayFont, accent, ink, inkSoft, surface, surfaceHair, isDark, onVerResultado,
}: {
  scans: SkinScan[]; displayFont: string | undefined; accent: string;
  ink: string; inkSoft: string; surface: string; surfaceHair: string;
  isDark: boolean; onVerResultado: (scan: SkinScan) => void;
}) {
  if (scans.length === 0) return null;

  const scansWithDelta = scans.map((s, i) => ({
    scan: s,
    delta: i < scans.length - 1
      ? s.full_result.skin_score - scans[i + 1].full_result.skin_score
      : 0,
  }));

  return (
    <View style={{ paddingTop: 28 }}>
      <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, color: inkSoft, textTransform: 'uppercase' }}>Scans recentes</Text>
        <Text style={{ fontSize: 12, fontWeight: '500', color: accent }}>ver tudo</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={208}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }}
      >
        {scansWithDelta.map(({ scan, delta }) => (
          <ScanCard
            key={scan.id}
            scan={scan}
            delta={delta}
            displayFont={displayFont}
            accent={accent}
            ink={ink}
            inkSoft={inkSoft}
            surface={surface}
            surfaceHair={surfaceHair}
            isDark={isDark}
            onPress={() => onVerResultado(scan)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── RefeicoesSection ─────────────────────────────────────────────────────────
function RefeicoesSection({
  meals, displayFont, accent, ink, inkSoft, inkHair, surface, surfaceHair, isDark,
  onMealPress, onScanPress,
}: {
  meals: FoodScan[]; displayFont: string | undefined; accent: string;
  ink: string; inkSoft: string; inkHair: string; surface: string;
  surfaceHair: string; isDark: boolean;
  onMealPress: (meal: FoodScan) => void; onScanPress: () => void;
}) {
  const filled = meals.length > 0;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
      <View style={{
        backgroundColor: surface, borderWidth: 0.5, borderColor: surfaceHair, borderRadius: 22,
        paddingTop: filled ? 20 : 22, paddingBottom: filled ? 8 : 22, paddingHorizontal: 22,
        shadowColor: '#2B2724', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 10, elevation: isDark ? 0 : 1,
      }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: filled ? 6 : 0 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1.8, color: inkSoft, textTransform: 'uppercase' }}>Hoje você comeu</Text>
          {filled && <Text style={{ fontSize: 12, fontWeight: '500', color: accent }}>ver tudo</Text>}
        </View>

        {filled ? (
          <>
            {meals.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => onMealPress(m)}
                activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: inkHair }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F4EFE9', borderWidth: 0.5, borderColor: surfaceHair }}>
                  {m.image_url
                    ? <Image source={{ uri: m.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <View style={{ flex: 1 }} />}
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: ink, lineHeight: 17.5, letterSpacing: -0.07 }} numberOfLines={1}>
                    {m.meal_name}
                  </Text>
                  <Text style={{ marginTop: 4, fontFamily: displayFont, fontSize: 12, color: inkSoft, fontStyle: 'italic' }}>
                    {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1, flexShrink: 0 }}>
                  <Text style={{ fontFamily: displayFont, fontSize: 22, fontWeight: '400', color: '#FB7B6B', letterSpacing: -0.44, lineHeight: 22 }}>{m.meal_score}</Text>
                  <Text style={{ fontFamily: displayFont, fontSize: 12, color: inkSoft, fontStyle: 'italic' }}>/100</Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Add row */}
            <TouchableOpacity
              onPress={onScanPress}
              activeOpacity={0.8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: inkHair }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: `${accent}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconPlus accent={accent} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '500', color: accent, letterSpacing: -0.07 }}>Escanear refeição</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Empty state */
          <View style={{ marginTop: 16, paddingTop: 22, borderTopWidth: 0.5, borderTopColor: inkHair }}>
            <Text style={{ fontFamily: displayFont, fontSize: 22, fontWeight: '400', color: ink, letterSpacing: -0.44, lineHeight: 25.3, maxWidth: 260 }}>
              <Text style={{ fontStyle: 'italic' }}>{'nenhuma refeição\n'}</Text>
              {'escaneada '}
              <Text style={{ color: accent }}>{'hoje '}</Text>
              <Text style={{ color: accent }}>ainda</Text>
              {'.'}
            </Text>
            <Text style={{ marginTop: 10, fontSize: 13, color: inkSoft, lineHeight: 18.85, letterSpacing: -0.065, maxWidth: 270 }}>
              Fotografe sua próxima refeição pra ver o impacto dela na sua pele.
            </Text>
            <TouchableOpacity
              onPress={onScanPress}
              activeOpacity={0.85}
              style={{ marginTop: 18, alignSelf: 'stretch', backgroundColor: accent, borderRadius: 100, paddingVertical: 13, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.165, shadowRadius: 18, elevation: 4 }}
            >
              <IconCamera />
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: -0.07 }}>Escanear refeição</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { setSelectedScan, setSelectedFoodResult, setTabBarTheme } = useAppStore();
  const [scanOpen, setScanOpen] = useState(false);
  const [debugMode, setDebugMode] = useState<'am' | 'pm' | null>(null); // DEBUG — remover antes do release

  const hour = debugMode === 'am' ? 9 : debugMode === 'pm' ? 22 : new Date().getHours();
  const ctx  = getTimeContext(hour);
  const isDark      = ctx.orbVariant === 'night';
  const accent      = '#FB7B6B';
  const ink         = isDark ? '#FFFFFF'                : '#2B2724';
  const inkSoft     = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(43,39,36,0.58)';
  const inkHair     = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(43,39,36,0.08)';
  const surface     = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const surfaceHair = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,39,36,0.06)';

  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    'PlayfairDisplay-Italic':  require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
    'DMSerifDisplay-Regular':  require('../../assets/fonts/DMSerifDisplay-Regular.ttf'),
    'DMSerifDisplay-Italic':   require('../../assets/fonts/DMSerifDisplay-Italic.ttf'),
  });
  const displayFont    = fontsLoaded ? 'PlayfairDisplay-Italic'  : undefined;
  const displayFontReg = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined;

  const [firstName,      setFirstName]      = useState('');
  const [meals,          setMeals]          = useState<FoodScan[]>([]);
  const [scans,          setScans]          = useState<SkinScan[]>([]);
  const [ritualComplete, setRitualComplete] = useState(false);
  const [nextStep,       setNextStep]       = useState('');
  const [doneSoFar,      setDoneSoFar]      = useState(0);
  const [ritualTotal,    setRitualTotal]    = useState(0);

  // ── Todo o fetch em um único useFocusEffect ──────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setTabBarTheme(isDark ? 'dark' : 'light');

      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !active) return;

          // First name — salvo na tabela users.nome (via set-name screen)
          const { data: userData } = await supabase
            .from('users')
            .select('nome')
            .eq('id', user.id)
            .single();
          const nome = userData?.nome ?? (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? '';
          if (active) setFirstName(nome.split(' ')[0] || 'você');

          // Refeições do dia (reset às 2h30)
          const todayStart = getTodayStart().toISOString();
          const { data: foodData } = await supabase
            .from('food_scans')
            .select('id, meal_name, meal_score, meal_label, created_at, image_url, full_result')
            .eq('user_id', user.id)
            .gte('created_at', todayStart)
            .order('created_at', { ascending: false });
          if (active && foodData) setMeals(foodData as FoodScan[]);

          // Scans de pele (últimos 5)
          const { data: skinData } = await supabase
            .from('skin_scans')
            .select('id, foto_url, full_result, created_at')
            .eq('user_id', user.id)
            .not('full_result', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);

          if (active && skinData) {
            const fetchedScans = skinData as SkinScan[];
            setScans(fetchedScans);

            // Reparo de foto_url inválida do onboarding (uma vez)
            const { skinScanId, skinImageBase64: b64 } = useAppStore.getState();
            const brokenScan = fetchedScans.find(
              (s) => s.id === skinScanId && !s.foto_url.startsWith('http'),
            );
            if (brokenScan && b64) {
              try {
                const path = `${user.id}/${Date.now()}.jpg`;
                const binaryStr = atob(b64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                const { error: upErr } = await supabase.storage
                  .from('scans').upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
                if (!upErr) {
                  const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
                  const fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
                  await supabase.from('skin_scans').update({ foto_url: fotoUrl }).eq('id', brokenScan.id);
                  if (active) setScans((prev) => prev.map((s) => s.id === brokenScan.id ? { ...s, foto_url: fotoUrl } : s));
                }
              } catch (e) { console.warn('Failed to repair scan photo:', e); }
            }
          }

          // Ritual / protocolo
          const { data: protData } = await supabase
            .from('protocolos')
            .select('rotina_am, rotina_pm')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

          if (active && protData) {
            const steps: Array<{ id: number; name: string }> =
              ctx.mode === 'am'
                ? (protData.rotina_am as any[] ?? [])
                : (protData.rotina_pm as any[] ?? []);

            const period = ctx.mode === 'am' ? 'morning' : 'night';
            const key    = `protocolo_check_${getProtocolDate()}_${period}`;
            const stored = await AsyncStorage.getItem(key);
            const checked: number[] = stored ? JSON.parse(stored) : [];

            const done     = checked.length;
            const total    = steps.length;
            const complete = total > 0 && done >= total;
            const next     = steps[done]?.name ?? steps[0]?.name ?? '';

            if (active) {
              setRitualTotal(total);
              setDoneSoFar(done);
              setRitualComplete(complete);
              setNextStep(next);
            }
          }
        } catch (e) {
          console.warn('Home fetch error:', e);
        }
      })();

      return () => { active = false; };
    }, [isDark]),
  );

  const today = new Date();

  return (
    <View style={{ flex: 1 }}>
      {/* Background */}
      {isDark ? (
        <LinearGradient
          colors={['#0F1420', '#1A1F2E', '#2A1F28']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
      )}

      {isDark && <ReformuladoNightSky />}

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          style={{ flex: 1, zIndex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 180 }}
        >
          <HeroEditorial
            firstName={firstName}
            displayFont={displayFont}
            displayFontReg={displayFontReg}
            accent={accent}
            ctx={ctx}
            today={today}
            isDark={isDark}
            inkSoft={inkSoft}
            onDebugToggle={() => setDebugMode(prev => prev === null ? 'am' : prev === 'am' ? 'pm' : null)}
          />

          <RitualCard
            ritualComplete={ritualComplete}
            ctx={ctx}
            nextStep={nextStep}
            doneSoFar={doneSoFar}
            total={ritualTotal}
            displayFont={displayFont}
            accent={accent}
            ink={ink}
            inkSoft={inkSoft}
            inkHair={inkHair}
            surface={surface}
            surfaceHair={surfaceHair}
            isDark={isDark}
            onPress={() => router.push('/(app)/protocolo' as any)}
          />

          <ScansRecentes
            scans={scans}
            displayFont={displayFont}
            accent={accent}
            ink={ink}
            inkSoft={inkSoft}
            surface={surface}
            surfaceHair={surfaceHair}
            isDark={isDark}
            onVerResultado={(scan) => {
              setSelectedScan({ result: scan.full_result, imageUri: scan.foto_url });
              router.push('/(app)/skin-result' as any);
            }}
          />

          <RefeicoesSection
            meals={meals}
            displayFont={displayFont}
            accent={accent}
            ink={ink}
            inkSoft={inkSoft}
            inkHair={inkHair}
            surface={surface}
            surfaceHair={surfaceHair}
            isDark={isDark}
            onMealPress={(meal) => {
              if (meal.full_result) setSelectedFoodResult(meal.full_result);
              router.push('/(scan)/food-report' as any);
            }}
            onScanPress={() => setScanOpen(true)}
          />
        </ScrollView>
      </SafeAreaView>

      {/* Menu inferior — ProtoTabBar + FAB copiados do design de referência (HomeHorizonteReformulado).
          Irmãos no mesmo container, zIndex: 20 e 30, exatamente como no reference. */}
      <HomeBottomBar isDark={isDark} accent={accent} onScanPress={() => setScanOpen(true)} />

      <ScanModal isOpen={scanOpen} onClose={() => setScanOpen(false)} isDark={isDark} />
    </View>
  );
}
