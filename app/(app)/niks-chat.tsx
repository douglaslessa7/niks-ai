import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import NightSky from '../../components/ui/NightSky';

// ── Color tokens (NIKS design system) ────────────────────────────────────────
const CORAL        = '#FB7B6B';
const CORAL_TINT   = 'rgba(251,123,107,0.06)';
const INK          = '#2B2724';
const INK_SOFT     = 'rgba(43,39,36,0.55)';
const INK_WHISPER  = 'rgba(43,39,36,0.35)';
const INK_HAIR     = 'rgba(43,39,36,0.08)';
const SURFACE_HAIR = 'rgba(43,39,36,0.06)';
const WHITE        = '#FFFFFF';

function isNightTime(): boolean {
  const h = new Date().getHours();
  return h >= 18 || h < 4;
}

// ── MiniOrb ───────────────────────────────────────────────────────────────────
// Moon craters scaled from the 132px protocolo orb (cx/cy/r proporcionais)
const MOON_CRATERS = [
  { cx: 77, cy: 49, r: 7,   op: 0.18 },
  { cx: 43, cy: 77, r: 5,   op: 0.16 },
  { cx: 96, cy: 60, r: 3.5, op: 0.14 },
  { cx: 71, cy: 91, r: 3,   op: 0.12 },
  { cx: 53, cy: 37, r: 2.5, op: 0.10 },
];

function MiniOrb({ size, isDark = false }: { size: number; isDark?: boolean }) {
  const r    = size / 2;
  const gCX  = size * 0.35;
  const gCY  = size * 0.30;
  const gR   = size * 0.955;
  const hlCX = size * 0.39;
  const hlCY = size * 0.23;
  const hlRX = size * 0.17;
  const hlRY = size * 0.11;
  const gId  = `mgOrbG_${size}${isDark ? 'd' : 'l'}`;
  const hlId = `mgOrbHl_${size}`;

  const c0 = isDark ? '#FFFFFF' : '#FFEFE4';
  const c1 = isDark ? '#F4EEE4' : '#F9C9B6';
  const c2 = isDark ? '#D8CDB8' : '#E89178';
  const c3 = isDark ? '#A89676' : '#C86651';

  // Scale craters from reference 132px orb to current size
  const sc = size / 132;
  const minR = size * 0.025;
  const craters = isDark ? MOON_CRATERS.map((c, i) => ({
    cx: c.cx * sc,
    cy: c.cy * sc,
    r: Math.max(c.r * sc, minR),
    op: c.op,
    id: `moCrater_${size}_${i}`,
  })) : [];

  return (
    <View style={{
      width: size, height: size,
      shadowColor: isDark ? '#FFF8DC' : '#E89178',
      shadowOffset: { width: 0, height: Math.round(size * 0.12) },
      shadowOpacity: 0.30,
      shadowRadius: Math.round(size * 0.28),
      elevation: 4,
    }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gId} cx={gCX} cy={gCY} r={gR} gradientUnits="userSpaceOnUse">
            <Stop offset="0%"   stopColor={c0} stopOpacity={1} />
            <Stop offset="30%"  stopColor={c1} stopOpacity={1} />
            <Stop offset="70%"  stopColor={c2} stopOpacity={1} />
            <Stop offset="100%" stopColor={c3} stopOpacity={1} />
          </RadialGradient>
          <RadialGradient id={hlId} cx={hlCX} cy={hlCY} r={hlRX} gradientUnits="userSpaceOnUse">
            <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity={0.65} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0}    />
          </RadialGradient>
          {craters.map(c => (
            <RadialGradient key={c.id} id={c.id} cx={c.cx} cy={c.cy} r={c.r} gradientUnits="userSpaceOnUse">
              <Stop offset="0%"   stopColor="#000000" stopOpacity={c.op} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={0}    />
            </RadialGradient>
          ))}
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${gId})`} />
        <Ellipse cx={hlCX} cy={hlCY} rx={hlRX} ry={hlRY} fill={`url(#${hlId})`} />
        {craters.map(c => (
          <Circle key={c.id} cx={c.cx} cy={c.cy} r={c.r} fill={`url(#${c.id})`} />
        ))}
      </Svg>
    </View>
  );
}

// Breath animation wrapper: scale 1 → 1.04 → 1, 4.8s ease-in-out infinite
function AnimatedMiniOrb({ size, isDark = false }: { size: number; isDark?: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,    { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}><MiniOrb size={size} isDark={isDark} /></Animated.View>;
}

// ── ChatHeader ────────────────────────────────────────────────────────────────
function ChatHeader({ showBack, onBack, onHistoryPress, isDark = false }: {
  showBack: boolean; onBack: () => void; onHistoryPress: () => void; isDark?: boolean;
}) {
  const iconColor = isDark ? 'rgba(255,255,255,0.55)' : INK_SOFT;
  const textColor = isDark ? '#FFFFFF' : INK;
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,39,36,0.05)';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14,
      borderBottomWidth: 0.5, borderBottomColor: borderColor,
    }}>
      {showBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d="M15 18l-6-6 6-6"
              stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 30, height: 30 }} />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Svg width={6} height={6} viewBox="0 0 6 6">
          <Defs>
            <RadialGradient id="niksHdrDot" cx="35%" cy="30%" r="100%" gradientUnits="objectBoundingBox">
              <Stop offset="0%"   stopColor="#FFEFE4" />
              <Stop offset="70%"  stopColor="#E89178" />
              <Stop offset="100%" stopColor="#C86651" />
            </RadialGradient>
          </Defs>
          <Circle cx={3} cy={3} r={3} fill="url(#niksHdrDot)" />
        </Svg>
        <Text style={{
          fontSize: 11, fontWeight: '600', letterSpacing: 3.2,
          textTransform: 'uppercase', color: textColor,
        }}>
          NIKS
        </Text>
      </View>

      <TouchableOpacity onPress={onHistoryPress} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={19} height={19} viewBox="0 0 24 24">
          <Path d="M3 12a9 9 0 1 0 3-6.7" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M3 4v5h5"            stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M12 8v4l2.5 1.5"     stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </TouchableOpacity>
    </View>
  );
}

// ── Suggestion icons ──────────────────────────────────────────────────────────
// Inline SVG paths from chat-components.jsx SUGGESTION_ICONS (lines 103-137)
const SUGGESTION_ICONS: Record<string, React.ReactNode> = {
  spot: (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9}   stroke={CORAL} strokeWidth="1.4" fill="none" />
      <Circle cx={12} cy={12} r={2.4} fill={CORAL} />
    </Svg>
  ),
  product: (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M9 14.5c.6 1 1.6 1.5 2.7 1.5"                       stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </Svg>
  ),
  mood: (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={CORAL} strokeWidth="1.4" fill="none" />
      <Path d="M8.5 14c.8.9 2 1.5 3.5 1.5s2.7-.6 3.5-1.5" stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <Circle cx={9}  cy={10} r={0.8} fill={CORAL} />
      <Circle cx={15} cy={10} r={0.8} fill={CORAL} />
    </Svg>
  ),
  chart: (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M4 17l5-5 3.5 3.5L20 8" stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M15 8h5v5"               stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  ),
  alert: (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M12 3l9.5 16.5a1 1 0 0 1-.87 1.5H3.37a1 1 0 0 1-.87-1.5L12 3z" stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M12 10v4.5" stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <Circle cx={12} cy={17} r={0.6} fill={CORAL} />
    </Svg>
  ),
};

// ── SuggestionCard ────────────────────────────────────────────────────────────
// SuggestionRow from chat-components.jsx adapted for React Native
// Cascade: opacity 0→1, translateY 6→0, 480ms cubic-bezier(0.2,0.7,0.2,1), delay = index * 60ms
// Uses TouchableOpacity (not Pressable) with explicit marginRight instead of gap —
// Pressable's function-style prop has inconsistent flexDirection behaviour in RN 0.83.
function SuggestionCard({ icon, text, index, onPress, isDark = false }: {
  icon: string; text: string; index: number; onPress: () => void; isDark?: boolean;
}) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(6);

  useEffect(() => {
    const delay = index * 60;
    opacity.value    = withDelay(delay, withTiming(1, { duration: 480, easing: Easing.bezier(0.2, 0.7, 0.2, 1) }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 480, easing: Easing.bezier(0.2, 0.7, 0.2, 1) }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
    marginBottom: 10,
  }));

  const cardBg      = isDark ? 'rgba(255,255,255,0.04)' : WHITE;
  const cardBorder  = isDark ? 'rgba(255,255,255,0.08)' : SURFACE_HAIR;
  const textColor   = isDark ? '#FFFFFF' : INK;
  const arrowColor  = isDark ? 'rgba(255,255,255,0.32)' : INK_WHISPER;

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          backgroundColor: cardBg,
          borderWidth: 0.5,
          borderColor: cardBorder,
          borderRadius: 18,
          paddingTop: 14,
          paddingRight: 14,
          paddingBottom: 14,
          paddingLeft: 16,
          shadowColor: isDark ? 'transparent' : '#2B2724',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 14,
          elevation: isDark ? 0 : 2,
        }}
      >
        <View style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: CORAL_TINT,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          flexShrink: 0,
        }}>
          {SUGGESTION_ICONS[icon]}
        </View>
        <Text style={{
          flex: 1, fontSize: 14, lineHeight: 19.6, letterSpacing: -0.1, color: textColor,
        }}>
          {text}
        </Text>
        <View style={{ flexShrink: 0, marginLeft: 4 }}>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M9 6l6 6-6 6"
              stroke={arrowColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"
            />
          </Svg>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── NiksMessage ───────────────────────────────────────────────────────────────
// AIMessageV2 with variant="bubble", showOrb=true from chat-screens-v2.jsx
// Left: MiniOrb 28px | Right: coral hairline bubble with serif text
// children: React.ReactNode — can contain nested <Text> for italic/coral inline spans
function NiksMessage({ children, streaming = false, fontReg, isDark = false }: {
  children: React.ReactNode; streaming?: boolean; fontReg?: string; isDark?: boolean;
}) {
  const caretOpacity = useSharedValue(0);

  useEffect(() => {
    if (streaming) {
      caretOpacity.value = 1;
      caretOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 450 }),
          withTiming(0, { duration: 450 }),
        ),
        -1, false,
      );
    } else {
      cancelAnimation(caretOpacity);
      caretOpacity.value = 0;
    }
  }, [streaming]);

  const caretStyle = useAnimatedStyle(() => ({ opacity: caretOpacity.value }));
  const bubbleBg   = isDark ? 'rgba(255,255,255,0.06)' : WHITE;
  const textColor  = isDark ? '#FFFFFF' : INK;

  return (
    <View style={{
      flexDirection: 'row', gap: 12, alignItems: 'flex-start',
      alignSelf: 'flex-start', maxWidth: '100%',
    }}>
      <View style={{ flexShrink: 0, paddingTop: 1 }}>
        <MiniOrb size={28} isDark={isDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{
          backgroundColor: bubbleBg,
          borderWidth: 0.5, borderColor: CORAL,
          borderTopLeftRadius: 4, borderTopRightRadius: 18,
          borderBottomRightRadius: 18, borderBottomLeftRadius: 18,
          paddingTop: 14, paddingHorizontal: 18, paddingBottom: 15,
          shadowColor: CORAL,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0 : 0.05,
          shadowRadius: 9,
          elevation: isDark ? 0 : 2,
        }}>
          <Text style={{
            fontFamily: fontReg,
            fontSize: 15,
            lineHeight: 23.25,
            letterSpacing: -0.15,
            color: textColor,
          }}>
            {children}
            {streaming && (
              <Animated.Text style={[{ color: CORAL }, caretStyle]}>{'|'}</Animated.Text>
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── UserBubble ────────────────────────────────────────────────────────────────
// UserBubble from chat-components.jsx — right-aligned solid coral bubble
function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View style={{
        maxWidth: '78%',
        backgroundColor: CORAL,
        borderTopLeftRadius: 18, borderTopRightRadius: 4,
        borderBottomRightRadius: 18, borderBottomLeftRadius: 18,
        paddingTop: 11, paddingHorizontal: 16, paddingBottom: 12,
        shadowColor: CORAL,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.20,
        shadowRadius: 18,
        elevation: 4,
      }}>
        <Text style={{
          fontSize: 15, lineHeight: 22.5, letterSpacing: -0.1, color: WHITE,
        }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

// ── UserPhotoBubble ───────────────────────────────────────────────────────────
// Renders real image when imageUri is provided, otherwise shows gradient placeholder
function UserPhotoBubble({ fontItalic, imageUri }: { fontItalic?: string; imageUri?: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View style={{
        width: 168, height: 210,
        borderTopLeftRadius: 20, borderTopRightRadius: 4,
        borderBottomRightRadius: 20, borderBottomLeftRadius: 20,
        overflow: 'hidden',
        borderWidth: 0.5, borderColor: 'rgba(251,123,107,0.20)',
        shadowColor: 'rgba(168,90,107,1)',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 26,
        elevation: 6,
      }}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['#F4D8C2', '#E8B59A', '#C58A6F']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        )}
        <View style={{
          position: 'absolute', left: 12, top: 12,
          paddingVertical: 4, paddingHorizontal: 9,
          borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.92)',
        }}>
          <Text style={{
            fontFamily: fontItalic,
            fontSize: 10, fontStyle: 'italic',
            color: CORAL, letterSpacing: 0.2,
          }}>
            foto · agora
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
// Animated dots — niks-pulse: scale(0.7) opacity(0.4) → scale(1) opacity(1), 1200ms, stagger 0/180/360ms
// Rendered as AIMessageV2 plain variant (no bubble): MiniOrb 28px left + dots right
function DotPulse({ delay }: { delay: number }) {
  const scale   = useSharedValue(0.7);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    const cfg = { duration: 480, easing: Easing.inOut(Easing.ease) };
    const cfg2 = { duration: 720, easing: Easing.inOut(Easing.ease) };
    scale.value   = withDelay(delay, withRepeat(withSequence(
      withTiming(1.0, cfg),
      withTiming(0.7, cfg2),
    ), -1, false));
    opacity.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1.0, cfg),
      withTiming(0.4, cfg2),
    ), -1, false));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{
      width: 6, height: 6, borderRadius: 3,
      backgroundColor: 'rgba(251,123,107,0.55)',
    }, animStyle]} />
  );
}

function TypingDots({ isDark = false }: { isDark?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', gap: 12, alignItems: 'flex-start',
      alignSelf: 'flex-start', maxWidth: '100%',
    }}>
      <View style={{ flexShrink: 0, paddingTop: 1 }}>
        <MiniOrb size={28} isDark={isDark} />
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
          <DotPulse delay={0}   />
          <DotPulse delay={180} />
          <DotPulse delay={360} />
        </View>
      </View>
    </View>
  );
}

// ── ChatInputBar ──────────────────────────────────────────────────────────────
// ChatInput from chat-components.jsx — pill with camera+gallery+text + send button
function ChatInputBar({
  value, onChangeText, onSend, fontItalic,
  bottomInset = 0, keyboardOpen = false,
  onCameraPress, onGalleryPress,
  pendingImages, onRemoveImage, atLimit, isDark = false,
}: {
  value: string
  onChangeText: (t: string) => void
  onSend: () => void
  fontItalic?: string
  bottomInset?: number
  keyboardOpen?: boolean
  onCameraPress: () => void
  onGalleryPress: () => void
  pendingImages: Array<{ uri: string }>
  onRemoveImage: (index: number) => void
  atLimit: boolean
  isDark?: boolean
}) {
  const paddingBottom = keyboardOpen ? 8 : bottomInset + 86;
  const pillBg       = isDark ? 'rgba(26,31,46,0.92)' : '#FAFAF8';
  const pillBorder   = isDark ? 'rgba(255,255,255,0.10)' : SURFACE_HAIR;
  const iconColor    = isDark ? 'rgba(255,255,255,0.50)' : INK_SOFT;
  const inputColor   = isDark ? '#FFFFFF' : INK;
  const placeholderC = isDark ? 'rgba(255,255,255,0.32)' : INK_WHISPER;

  return (
    <View style={{
      paddingTop: 12, paddingHorizontal: 16, paddingBottom,
    }}>
      {pendingImages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 8 }}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
        >
          {pendingImages.map((img, index) => (
            <View key={index} style={{ width: 56, height: 56 }}>
              <Image
                source={{ uri: img.uri }}
                style={{ width: 56, height: 56, borderRadius: 10, borderWidth: 0.5, borderColor: 'rgba(251,123,107,0.3)' }}
              />
              <TouchableOpacity
                onPress={() => onRemoveImage(index)}
                style={{
                  position: 'absolute', top: -5, right: -5,
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : INK_SOFT,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Svg width={10} height={10} viewBox="0 0 24 24">
                  <Path d="M18 6L6 18M6 6l12 12" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </Svg>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {/* Pill */}
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
          backgroundColor: pillBg,
          borderWidth: 0.5, borderColor: pillBorder,
          borderRadius: 100,
          paddingTop: 8, paddingBottom: 8, paddingLeft: 14, paddingRight: 8,
          minHeight: 44,
        }}>
          {/* Camera */}
          <View style={{ opacity: atLimit ? 0.3 : 1 }} pointerEvents={atLimit ? 'none' : 'auto'}>
            <TouchableOpacity
              onPress={onCameraPress}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M4 8a2 2 0 0 1 2-2h2.5l1.5-2h4l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <Circle cx={12} cy={13} r={3.5} stroke={iconColor} strokeWidth="1.5" fill="none" />
              </Svg>
            </TouchableOpacity>
          </View>
          {/* Gallery */}
          <View style={{ opacity: atLimit ? 0.3 : 1 }} pointerEvents={atLimit ? 'none' : 'auto'}>
            <TouchableOpacity
              onPress={onGalleryPress}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M3.5 4.5h17a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 1 17V7a2.5 2.5 0 0 1 2.5-2.5z" stroke={iconColor} strokeWidth="1.5" fill="none" />
                <Circle cx={9} cy={10} r={1.4} stroke={iconColor} strokeWidth="1.5" fill="none" />
                <Path d="M4 17l5-5 4 4 3-3 4 4" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
            </TouchableOpacity>
          </View>
          {/* Text input */}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="pergunte algo…"
            placeholderTextColor={placeholderC}
            style={{
              flex: 1,
              fontFamily: value ? undefined : fontItalic,
              fontStyle: value ? 'normal' : 'italic',
              fontSize: 15,
              color: inputColor,
              paddingVertical: 0,
              paddingLeft: 8, paddingRight: 6,
            }}
          />
        </View>
        {/* Send button */}
        <TouchableOpacity
          onPress={onSend}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: CORAL,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            shadowColor: CORAL,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.30,
            shadowRadius: 22,
            elevation: 6,
          }}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M5 12h13M12 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Suggestions data ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: 'spot',    text: 'Apareceu uma espinha no meu rosto, preciso de ajuda' },
  { icon: 'product', text: 'Esse produto vai funcionar pra mim?' },
  { icon: 'mood',    text: 'Não tô gostando da minha pele hoje, me ajuda a melhorar?' },
  { icon: 'chart',   text: 'Tô vendo resultado com meu protocolo?' },
  { icon: 'alert',   text: 'Minha pele reagiu a algo que usei' },
];

// ── Predefined responses ──────────────────────────────────────────────────────
const PREDEFINED_RESPONSES: Record<string, string> = {
  'Apareceu uma espinha no meu rosto, preciso de ajuda':
    'Me manda uma foto para eu ver o que está acontecendo.',
  'Esse produto vai funcionar pra mim?':
    'Me manda uma foto do produto e se puder da lista de ingredientes também que eu analiso pra você.',
  'Não tô gostando da minha pele hoje, me ajuda a melhorar?':
    'Me conta mais. O que você tá sentindo que está diferente nela? Ressecamento, oleosidade? Se puder me envia uma foto também pra eu conseguir te ajudar melhor.',
  'Minha pele reagiu a algo que usei':
    'Me manda uma foto da área afetada e me diz o que você usou antes de perceber a reação.',
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatRelativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1)  return 'agora'
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30)   return `${diffD}d`
  return `${Math.floor(diffD / 30)}mm`
}

// ── Types ──────────────────────────────────────────────────────────────────────
type HistoryConversation = {
  id: string
  title: string
  relativeTime: string
}

// ── Message type ──────────────────────────────────────────────────────────────
type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  imageUris?: string[]
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NiksChat() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Regular': require('../../assets/fonts/PlayfairDisplay-Regular.ttf'),
    'PlayfairDisplay-Italic':  require('../../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const fontReg    = fontsLoaded ? 'PlayfairDisplay-Regular' : undefined;
  const fontItalic = fontsLoaded ? 'PlayfairDisplay-Italic'  : undefined;

  const { setTabBarTheme, setNiksChatMode } = useAppStore();
  const [isDark, setIsDark] = useState(isNightTime);

  useFocusEffect(
    useCallback(() => {
      const dark = isNightTime();
      setIsDark(dark);
      setTabBarTheme(dark ? 'dark' : 'light');
      return () => { setTabBarTheme('light'); };
    }, [])
  );

  const ink         = isDark ? '#FFFFFF'                : INK;
  const inkSoft     = isDark ? 'rgba(255,255,255,0.65)' : INK_SOFT;
  const inkWhisper  = isDark ? 'rgba(255,255,255,0.42)' : INK_WHISPER;
  const inkHair     = isDark ? 'rgba(255,255,255,0.14)' : INK_HAIR;
  const surfaceHair = isDark ? 'rgba(255,255,255,0.08)' : SURFACE_HAIR;
  const screenBg    = isDark ? '#0F1420'                : WHITE;

  const [mode,           setMode]           = useState<'empty' | 'active'>('empty');
  const [firstName,      setFirstName]      = useState('você');
  const [inputText,      setInputText]      = useState('');
  const [keyboardOpen,   setKeyboardOpen]   = useState(false);
  const [userId,         setUserId]         = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [pendingImages,        setPendingImages]        = useState<Array<{ base64: string; mimeType: string; uri: string }>>([]);
  const [historyVisible,       setHistoryVisible]       = useState(false);
  const [historyConversations, setHistoryConversations] = useState<HistoryConversation[]>([]);
  const [historyLoading,       setHistoryLoading]       = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hide  = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true

      const init = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !active) return

        setUserId(user.id)

        const { data: userData } = await supabase
          .from('users').select('nome').eq('id', user.id).single()
        if (active && userData?.nome) {
          setFirstName(userData.nome.trim().split(' ')[0] || 'você')
        }

        const { data: latestConv } = await supabase
          .from('coach_conversations')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!active) return
        if (!latestConv) return

        const convId = latestConv.id
        setConversationId(convId)

        const { data: msgs } = await supabase
          .from('coach_messages')
          .select('id, role, content, image_url, created_at')
          .eq('conversation_id', convId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })

        if (!active) return

        const chatMode = useAppStore.getState().niksChatMode
        if (msgs && msgs.length > 0 && chatMode !== 'empty') {
          setMessages(msgs.map(msg => {
            let imageUris: string[] | undefined
            if (msg.image_url) {
              try {
                const parsed = JSON.parse(msg.image_url)
                imageUris = Array.isArray(parsed) ? parsed : [msg.image_url]
              } catch {
                imageUris = [msg.image_url]
              }
            }
            return {
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              imageUris,
            }
          }))
          setMode('active')
        } else if (chatMode !== 'empty') {
          setMessages([])
          setMode('empty')
        }
      }

      init()
      return () => { active = false }
    }, []),
  )

  const handleBackToEmpty = () => {
    setNiksChatMode('empty')
    setMode('empty')
    setMessages([])
  }

  const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
  const FUNCTION_URL = 'https://utpljvwmeyeqwrfulbfr.supabase.co/functions/v1/niks-chat'

  const sendMessage = async (text: string, images?: Array<{ base64: string; mimeType: string; uri: string }>) => {
    setNiksChatMode('active')
    if (!userId) return

    let activeConvId = conversationId

    if (mode === 'empty' || !activeConvId) {
      const title = text.trim() ? text.substring(0, 80) : 'Foto'
      const { data: newConv, error: convError } = await supabase
        .from('coach_conversations')
        .insert({ user_id: userId, title })
        .select('id')
        .single()
      if (convError || !newConv?.id) return
      activeConvId = newConv.id
      setConversationId(activeConvId)
    }

    const userMsgId       = `user_${Date.now()}`
    const assistantMsgId  = `assistant_${Date.now()}`
    const clientMessageId = `${userId}_${Date.now()}`

    setMessages(prev => [
      ...prev,
      { id: userMsgId,      role: 'user',      content: text, imageUris: images?.map(i => i.uri) },
      { id: assistantMsgId, role: 'assistant',  content: '', isStreaming: true },
    ])
    setMode('active')
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return

    let lastLength = 0
    const xhr = new XMLHttpRequest()
    xhr.open('POST', FUNCTION_URL)
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
    xhr.setRequestHeader('apikey', ANON_KEY)
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(lastLength)
      lastLength = xhr.responseText.length
      if (!chunk) return
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
      ))
      scrollRef.current?.scrollToEnd({ animated: false })
    }

    xhr.onload = () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, isStreaming: false } : m
      ))
    }

    xhr.onerror = () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'Ocorreu um erro. Tente novamente.', isStreaming: false }
          : m
      ))
    }

    xhr.send(JSON.stringify({
      userId,
      conversationId: activeConvId,
      message: text,
      clientMessageId,
      images: images?.map(i => ({ base64: i.base64, mimeType: i.mimeType })),
    }))
  }

  const handleSuggestionPress = async (text: string) => {
    setNiksChatMode('active')
    const predefined = PREDEFINED_RESPONSES[text]
    if (predefined) {
      if (!userId) return

      const { data: newConv } = await supabase
        .from('coach_conversations')
        .insert({ user_id: userId, title: text.substring(0, 80) })
        .select('id')
        .single()
      if (!newConv?.id) return

      const activeConvId = newConv.id
      setConversationId(activeConvId)

      await supabase.from('coach_messages').insert([
        { conversation_id: activeConvId, user_id: userId, role: 'user',      content: text },
        { conversation_id: activeConvId, user_id: userId, role: 'assistant', content: predefined },
      ])

      setMessages([
        { id: `user_${Date.now()}`,      role: 'user',      content: text },
        { id: `assistant_${Date.now()}`, role: 'assistant',  content: predefined },
      ])
      setMode('active')
    } else {
      sendMessage(text)
    }
  }

  const pickImage = async (source: 'camera' | 'gallery') => {
    if (pendingImages.length >= 5) return

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'] as any,
          quality: 0.8,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'] as any,
          quality: 0.8,
          allowsEditing: false,
        })

    if (result.canceled || !result.assets?.[0]) return

    const asset = result.assets[0]

    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 512 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    )

    if (!manipulated.base64) return

    setPendingImages(prev => [...prev, {
      base64: manipulated.base64!,
      mimeType: 'image/jpeg',
      uri: manipulated.uri,
    }])
  }

  const loadHistory = async () => {
    if (!userId) return
    setHistoryLoading(true)
    setHistoryVisible(true)

    const { data: convs } = await supabase
      .from('coach_conversations')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!convs || convs.length === 0) {
      setHistoryConversations([])
      setHistoryLoading(false)
      return
    }

    const convIds = convs.map(c => c.id)

    const [{ data: userMsgs }, { data: lastMsgs }] = await Promise.all([
      supabase
        .from('coach_messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', convIds)
        .eq('role', 'user')
        .order('created_at', { ascending: true }),
      supabase
        .from('coach_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
    ])

    const titleMap: Record<string, string> = {}
    userMsgs?.forEach(msg => {
      if (!titleMap[msg.conversation_id]) titleMap[msg.conversation_id] = msg.content || 'Conversa'
    })

    const lastTimeMap: Record<string, string> = {}
    lastMsgs?.forEach(msg => {
      if (!lastTimeMap[msg.conversation_id]) lastTimeMap[msg.conversation_id] = msg.created_at
    })

    setHistoryConversations(convIds.map(id => ({
      id,
      title: (titleMap[id] ?? 'Conversa').slice(0, 80),
      relativeTime: formatRelativeTime(lastTimeMap[id] ?? new Date().toISOString()),
    })))
    setHistoryLoading(false)
  }

  const loadConversation = async (convId: string) => {
    setHistoryVisible(false)
    setNiksChatMode('active')

    const { data: msgs } = await supabase
      .from('coach_messages')
      .select('id, role, content, image_url, created_at')
      .eq('conversation_id', convId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (!msgs || msgs.length === 0) return

    setConversationId(convId)
    setMessages(msgs.map(msg => {
      let imageUris: string[] | undefined
      if (msg.image_url) {
        try {
          const parsed = JSON.parse(msg.image_url)
          imageUris = Array.isArray(parsed) ? parsed : [msg.image_url]
        } catch {
          imageUris = [msg.image_url]
        }
      }
      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        imageUris,
      }
    }))
    setMode('active')
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100)
  }

  const handleSend = () => {
    const text = inputText.trim()
    if (!text && pendingImages.length === 0) return
    setInputText('')
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined
    setPendingImages([])
    sendMessage(text || '', images)
  }

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      {isDark && (
        <LinearGradient
          colors={['#0F1420', '#1A1F2E', '#2A1F28']}
          style={StyleSheet.absoluteFill}
        />
      )}
      {isDark && <NightSky />}

      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'transparent' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ChatHeader
            showBack={mode === 'active'}
            onBack={handleBackToEmpty}
            onHistoryPress={loadHistory}
            isDark={isDark}
          />

          <View style={{ flex: 1 }}>
          {mode === 'empty' ? (
            // ── ESTADO INICIAL ──────────────────────────────────────────────
            <View style={{ flex: 1, backgroundColor: 'transparent' }}>
              {/* Welcome hero */}
              <View style={{
                paddingTop: 36, paddingHorizontal: 28, paddingBottom: 22,
                alignItems: 'center',
              }}>
                <View style={{ marginBottom: 22 }}>
                  <AnimatedMiniOrb size={68} isDark={isDark} />
                </View>

                {/* Eyebrow */}
                <Text style={{
                  fontSize: 9, fontWeight: '600', letterSpacing: 2.2,
                  textTransform: 'uppercase', color: inkSoft,
                  marginBottom: 14,
                }}>
                  NIKS · SUA COACH DE PELE
                </Text>

                {/* Greeting "olá, juliana." */}
                <Text style={{
                  fontFamily: fontReg,
                  fontSize: 38, lineHeight: 40,
                  letterSpacing: -1.2, color: CORAL,
                  textTransform: 'lowercase',
                  textAlign: 'center',
                }}>
                  {'olá, '}
                  <Text style={{ fontFamily: fontItalic, fontStyle: 'italic', fontWeight: '500' }}>
                    {firstName}
                  </Text>
                  {'.'}
                </Text>

                {/* Tagline */}
                <Text style={{
                  fontFamily: fontItalic,
                  fontSize: 17, lineHeight: 23.8,
                  letterSpacing: -0.15,
                  fontStyle: 'italic',
                  color: inkSoft,
                  maxWidth: 260, textAlign: 'center',
                  marginTop: 10,
                }}>
                  como posso te ajudar hoje?
                </Text>
              </View>

              {/* "SUGESTÕES" divider */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingTop: 10, paddingHorizontal: 28, paddingBottom: 16,
              }}>
                <View style={{ flex: 1, height: 0.5, backgroundColor: inkHair }} />
                <Text style={{
                  fontSize: 9, fontWeight: '600', letterSpacing: 2.4,
                  textTransform: 'uppercase', color: inkSoft,
                }}>
                  SUGESTÕES
                </Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: inkHair }} />
              </View>

              {/* Suggestion cards list */}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 144 }}
                showsVerticalScrollIndicator={false}
              >
                {SUGGESTIONS.map((s, i) => (
                  <SuggestionCard
                    key={i}
                    icon={s.icon}
                    text={s.text}
                    index={i}
                    isDark={isDark}
                    onPress={() => handleSuggestionPress(s.text)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            // ── CONVERSA EM ANDAMENTO ───────────────────────────────────────
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              contentContainerStyle={{
                paddingTop: 16, paddingHorizontal: 22, paddingBottom: insets.bottom + 144,
                gap: 20,
              }}
              showsVerticalScrollIndicator={false}
            >
              {/* Timestamp divider */}
              <Text style={{
                alignSelf: 'center',
                fontSize: 9, fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 2.4,
                color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(43,39,36,0.42)',
                paddingTop: 2, paddingBottom: 8,
              }}>
                HOJE · 21:48
              </Text>

              {messages.map(m => {
                if (m.role === 'user') {
                  return (
                    <View key={m.id} style={{ gap: 8 }}>
                      {m.imageUris && m.imageUris.length > 0 && (
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          {m.imageUris.map((uri, i) => (
                            <UserPhotoBubble key={i} fontItalic={fontItalic} imageUri={uri} />
                          ))}
                        </View>
                      )}
                      {m.content ? <UserBubble text={m.content} /> : null}
                    </View>
                  )
                }
                if (m.content === '' && m.isStreaming) {
                  return <TypingDots key={m.id} isDark={isDark} />
                }
                return (
                  <NiksMessage key={m.id} fontReg={fontReg} streaming={m.isStreaming} isDark={isDark}>
                    {m.content}
                  </NiksMessage>
                )
              })}
            </ScrollView>
          )}

          {/* ── History panel ─────────────────────────────────────────────── */}
          {historyVisible && (
            <>
              <TouchableOpacity
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                activeOpacity={1}
                onPress={() => setHistoryVisible(false)}
              />
              <View style={{
                position: 'absolute', top: 8, right: 16, width: 276, zIndex: 11,
                backgroundColor: isDark ? '#1A1F2E' : WHITE,
                borderRadius: 20,
                borderWidth: 0.5, borderColor: surfaceHair,
                shadowColor: isDark ? '#000000' : INK,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.4 : 0.10,
                shadowRadius: 28,
                elevation: 16,
                overflow: 'hidden',
              }}>
                <View style={{
                  paddingVertical: 14, paddingHorizontal: 18,
                  borderBottomWidth: 0.5, borderBottomColor: surfaceHair,
                }}>
                  <Text style={{
                    fontSize: 9, fontWeight: '600', letterSpacing: 2.4,
                    textTransform: 'uppercase', color: inkSoft,
                  }}>
                    Conversas recentes
                  </Text>
                </View>

                {historyLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: inkWhisper }}>Carregando…</Text>
                  </View>
                ) : historyConversations.length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: inkWhisper }}>Nenhuma conversa ainda.</Text>
                  </View>
                ) : (
                  historyConversations.map((conv, index) => (
                    <TouchableOpacity
                      key={conv.id}
                      onPress={() => loadConversation(conv.id)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingVertical: 14, paddingHorizontal: 18,
                        borderBottomWidth: index < historyConversations.length - 1 ? 0.5 : 0,
                        borderBottomColor: surfaceHair,
                      }}
                    >
                      <Text
                        style={{ flex: 1, fontSize: 13, lineHeight: 18, color: ink }}
                        numberOfLines={2}
                      >
                        {conv.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: inkWhisper, flexShrink: 0 }}>
                        {conv.relativeTime}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </>
          )}

          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
            <ChatInputBar
              value={inputText}
              onChangeText={setInputText}
              onSend={handleSend}
              fontItalic={fontItalic}
              bottomInset={insets.bottom}
              keyboardOpen={keyboardOpen}
              onCameraPress={() => pickImage('camera')}
              onGalleryPress={() => pickImage('gallery')}
              pendingImages={pendingImages}
              onRemoveImage={(index) => setPendingImages(prev => prev.filter((_, i) => i !== index))}
              atLimit={pendingImages.length >= 5}
              isDark={isDark}
            />
          </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
