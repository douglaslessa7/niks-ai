import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image,
  TouchableWithoutFeedback,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
  Nunito_500Medium, Nunito_400Regular, Nunito_300Light,
} from '@expo-google-fonts/nunito';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay, Easing, cancelAnimation,
} from 'react-native-reanimated';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/onboarding';
import { useCachedQuery, invalidateCache } from '../../lib/cache';
import { getUserId, useUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';

// ── Color tokens (novo design system NIKS — home/protocolo/recomendação) ──────
const INK        = '#121212';
const INK_SOFT   = '#515151';
const INK_MUTE   = '#818181';
const INK_FAINT  = '#B5B5B5';
const CORAL      = '#FF9D9D';                 // rosa da Rotina (protocolo BRAND)
const CORAL_TINT = 'rgba(255,157,157,0.12)';  // wash do rosa da Rotina
const CARD_BD    = '#E3E3E6';
const BUBBLE_BG  = '#F3EEEE'; // balão de mensagem (Figma node 1:424/1:425)
const WHITE      = '#FFFFFF';
const PILL_BG    = '#FFFFFF';
// Gradiente vermelho dos botões de ação (mesmo dos "Escanear")
const RED_GRAD: [string, string] = ['#FF9D9D', '#FF9D9D']; // rosa da Rotina (protocolo BRAND)

// Avatar da NIKS nas mensagens = logo (sparkle bloom), como no Figma (node 1:408)
function NiksAvatar({ size }: { size: number }) {
  return (
    <Image
      source={require('../../assets/home/niks-logo.png')}
      style={{ width: size, height: size, resizeMode: 'contain', tintColor: '#FF9D9D' }}
    />
  );
}

// Logo do app (sparkle NIKS) com o mesmo "respiro" da orbe — usado no hero do estado inicial
function AnimatedLogo({ size }: { size: number }) {
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
  return (
    <Animated.View style={style}>
      <Image
        source={require('../../assets/home/niks-logo.png')}
        style={{ width: size, height: size, resizeMode: 'contain', tintColor: '#FF9D9D' }}
      />
    </Animated.View>
  );
}

// ── ChatHeader ────────────────────────────────────────────────────────────────
// Padrão dos headers do novo design: logo NIKS (sparkle) + título Nunito, centrado.
function ChatHeader({
  showBack, onBack, onHistoryPress, showHistory,
  title, titleFont, titleSize = 20, logoSize = 22,
}: {
  showBack: boolean; onBack: () => void; onHistoryPress: () => void; showHistory: boolean;
  title: string; titleFont?: string; titleSize?: number; logoSize?: number;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14,
      borderBottomWidth: 0.5, borderBottomColor: 'rgba(18,18,18,0.06)',
    }}>
      {showBack ? (
        <TouchableOpacity
          onPress={() => { haptics.tap(); onBack(); }}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
              d="M15 18l-6-6 6-6"
              stroke={INK_MUTE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 32, height: 32 }} />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Image
          source={require('../../assets/home/niks-logo.png')}
          style={{ width: logoSize, height: logoSize, resizeMode: 'contain', tintColor: '#FF9D9D' }}
        />
        <Text style={{
          marginLeft: 8, fontFamily: titleFont, fontSize: titleSize, color: INK, letterSpacing: -0.6,
        }}>
          {title}
        </Text>
      </View>

      {showHistory ? (
        <TouchableOpacity onPress={() => { haptics.tap(); onHistoryPress(); }} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M3 12a9 9 0 1 0 3-6.7" stroke={INK_MUTE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Path d="M3 4v5h5"            stroke={INK_MUTE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Path d="M12 8v4l2.5 1.5"     stroke={INK_MUTE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 32, height: 32 }} />
      )}
    </View>
  );
}

// ── Suggestion icons ──────────────────────────────────────────────────────────
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
  meal: (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      {/* Garfo */}
      <Path d="M4 3v5a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3" stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M6 10v11"                              stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Faca */}
      <Path d="M20 14V3a4 4 0 0 0-4 4v4a2 2 0 0 0 2 2h2zm0 0v7" stroke={CORAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
// Card branco arredondado com borda #E3E3E6 (mesmo padrão de home/recomendação).
function SuggestionCard({ icon, text, index, onPress, fSemi }: {
  icon: string; text: string; index: number; onPress: () => void; fSemi?: string;
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

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={() => { haptics.tap(); onPress(); }}
        activeOpacity={0.85}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          backgroundColor: WHITE,
          borderWidth: 1,
          borderColor: CARD_BD,
          borderRadius: 18,
          paddingTop: 14,
          paddingRight: 14,
          paddingBottom: 14,
          paddingLeft: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        <View style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: CORAL_TINT,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          flexShrink: 0,
        }}>
          {SUGGESTION_ICONS[icon]}
        </View>
        <Text style={{
          flex: 1, fontFamily: fSemi, fontSize: 14, lineHeight: 19, letterSpacing: -0.3, color: INK,
        }}>
          {text}
        </Text>
        <View style={{ flexShrink: 0, marginLeft: 4 }}>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M9 6l6 6-6 6"
              stroke={INK_FAINT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
            />
          </Svg>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── NiksMessage ───────────────────────────────────────────────────────────────
// Avatar orb 28px à esquerda + balão branco borda #E3E3E6 com texto Nunito.
function NiksMessage({ children, streaming = false, fReg }: {
  children: React.ReactNode; streaming?: boolean; fReg?: string;
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

  // Figma node 1:424 — balão #F3EEEE radius 18, avatar (logo) no canto inferior esquerdo
  return (
    <View style={{
      flexDirection: 'row', gap: 10, alignItems: 'flex-end',
      alignSelf: 'flex-start', maxWidth: '92%',
    }}>
      <View style={{ flexShrink: 0, paddingBottom: 2 }}>
        <NiksAvatar size={30} />
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <View style={{
          backgroundColor: WHITE,
          borderWidth: 1, borderColor: CARD_BD,
          borderRadius: 18,
          paddingVertical: 15, paddingHorizontal: 20,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 1,
        }}>
          <Text style={{
            fontFamily: fReg,
            fontSize: 14,
            lineHeight: 20,
            letterSpacing: -0.3,
            color: '#111111',
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
// Figma node 1:425 — balão #F3EEEE radius 18, à direita, texto preto.
function UserBubble({ text, fReg }: { text: string; fReg?: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View style={{
        maxWidth: '82%',
        backgroundColor: BUBBLE_BG,
        borderRadius: 18,
        paddingVertical: 14, paddingHorizontal: 20,
      }}>
        <Text style={{
          fontFamily: fReg, fontSize: 14, lineHeight: 20, letterSpacing: -0.3, color: '#111111',
        }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

// ── UserPhotoBubble ───────────────────────────────────────────────────────────
// Figma node 1:423 — imagem arredondada radius 35, alinhada à direita.
function UserPhotoBubble({ imageUri }: { imageUri?: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <View style={{
        width: 222, height: 207,
        borderRadius: 35,
        overflow: 'hidden',
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
      </View>
    </View>
  );
}

// ── Typing dots ───────────────────────────────────────────────────────────────
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
      backgroundColor: 'rgba(248,107,121,0.6)',
    }, animStyle]} />
  );
}

function TypingDots() {
  return (
    <View style={{
      flexDirection: 'row', gap: 10, alignItems: 'flex-end',
      alignSelf: 'flex-start', maxWidth: '92%',
    }}>
      <View style={{ flexShrink: 0, paddingBottom: 2 }}>
        <NiksAvatar size={30} />
      </View>
      <View style={{
        backgroundColor: WHITE, borderWidth: 1, borderColor: CARD_BD, borderRadius: 18,
        paddingVertical: 15, paddingHorizontal: 18,
        justifyContent: 'center',
      }}>
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
// Pill de input branca com borda #E3E3E6 + botão enviar em gradiente vermelho.
function ChatInputBar({
  value, onChangeText, onSend, fReg,
  bottomInset = 0, keyboardOpen = false,
  onCameraPress, onGalleryPress,
  pendingImages, onRemoveImage, atLimit,
}: {
  value: string
  onChangeText: (t: string) => void
  onSend: () => void
  fReg?: string
  bottomInset?: number
  keyboardOpen?: boolean
  onCameraPress: () => void
  onGalleryPress: () => void
  pendingImages: Array<{ uri: string }>
  onRemoveImage: (index: number) => void
  atLimit: boolean
}) {
  // Navbar global = 80px fixos (cobre o home indicator). Ancorar a ~20px acima dela,
  // sem somar a safe area (evita o vão grande e o risco de colar no menu).
  const paddingBottom = keyboardOpen ? 8 : 100;

  const LINE_HEIGHT = 20;
  const MAX_INPUT_HEIGHT = LINE_HEIGHT * 4;
  const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
  const isMultiline = contentHeight > LINE_HEIGHT + 4;

  useEffect(() => {
    if (!value) setContentHeight(LINE_HEIGHT);
  }, [value]);

  return (
    <View style={{
      paddingTop: 12, paddingHorizontal: 16, paddingBottom,
      backgroundColor: 'transparent',
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
                style={{ width: 56, height: 56, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(248,107,121,0.3)' }}
              />
              <TouchableOpacity
                onPress={() => { haptics.tap(); onRemoveImage(index); }}
                style={{
                  position: 'absolute', top: -5, right: -5,
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: INK_SOFT,
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
      <View style={{ flexDirection: 'row', alignItems: isMultiline ? 'flex-end' : 'center', gap: 10 }}>
        {/* Pill */}
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: isMultiline ? 'flex-end' : 'center', gap: 4,
          backgroundColor: PILL_BG,
          borderWidth: 1, borderColor: CARD_BD,
          borderRadius: isMultiline ? 22 : 100,
          paddingTop: 8, paddingBottom: 8, paddingLeft: 14, paddingRight: 8,
          minHeight: 46,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 1,
        }}>
          {/* Camera */}
          <View style={{ opacity: atLimit ? 0.3 : 1 }} pointerEvents={atLimit ? 'none' : 'auto'}>
            <TouchableOpacity
              onPress={() => { haptics.tap(); onCameraPress(); }}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M4 8a2 2 0 0 1 2-2h2.5l1.5-2h4l1.5 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" stroke={INK_MUTE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <Circle cx={12} cy={13} r={3.5} stroke={INK_MUTE} strokeWidth="1.5" fill="none" />
              </Svg>
            </TouchableOpacity>
          </View>
          {/* Gallery */}
          <View style={{ opacity: atLimit ? 0.3 : 1 }} pointerEvents={atLimit ? 'none' : 'auto'}>
            <TouchableOpacity
              onPress={() => { haptics.tap(); onGalleryPress(); }}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M3.5 4.5h17a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 1 17V7a2.5 2.5 0 0 1 2.5-2.5z" stroke={INK_MUTE} strokeWidth="1.5" fill="none" />
                <Circle cx={9} cy={10} r={1.4} stroke={INK_MUTE} strokeWidth="1.5" fill="none" />
                <Path d="M4 17l5-5 4 4 3-3 4 4" stroke={INK_MUTE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
            </TouchableOpacity>
          </View>
          {/* Text input */}
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="pergunte algo…"
            placeholderTextColor={INK_FAINT}
            multiline
            onContentSizeChange={(e) => {
              setContentHeight(e.nativeEvent.contentSize.height);
            }}
            style={{
              flex: 1,
              fontFamily: fReg,
              fontSize: 15,
              lineHeight: LINE_HEIGHT,
              color: INK,
              paddingVertical: 0,
              paddingLeft: 8, paddingRight: 6,
              maxHeight: MAX_INPUT_HEIGHT,
            }}
          />
        </View>
        {/* Send button */}
        <TouchableOpacity onPress={() => { haptics.action(); onSend(); }} activeOpacity={0.9} style={{ flexShrink: 0 }}>
          <LinearGradient
            colors={RED_GRAD}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              width: 46, height: 46, borderRadius: 23,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#FF9D9D',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.30,
              shadowRadius: 18,
              elevation: 6,
            }}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M12 19V6M5 13l7-7 7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Suggestions data ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: 'spot',    text: 'Apareceu uma espinha no meu rosto, preciso de ajuda' },
  { icon: 'meal',    text: 'Analisar o impacto da minha refeição na minha pele', action: 'foodScan' },
  { icon: 'mood',    text: 'Não tô gostando da minha pele hoje, me ajuda a melhorar?' },
  { icon: 'chart',   text: 'Tô vendo resultado com meu protocolo?' },
  { icon: 'alert',   text: 'Minha pele reagiu a algo que usei' },
];

// ── Predefined responses ──────────────────────────────────────────────────────
const PREDEFINED_RESPONSES: Record<string, string> = {
  'Apareceu uma espinha no meu rosto, preciso de ajuda':
    'Me manda uma foto para eu ver o que está acontecendo.',
  'Não tô gostando da minha pele hoje, me ajuda a melhorar?':
    'Me conta mais. O que você tá sentindo que está diferente nela? Ressecamento, oleosidade? Se puder me envia uma foto também pra eu conseguir te ajudar melhor.',
  'Minha pele reagiu a algo que usei':
    'Me manda uma foto da área afetada e me diz o que você usou antes de perceber a reação.',
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatConversationDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const dayLabel = isToday
    ? 'HOJE'
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dayLabel} · ${time}`
}

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Nunito_500Medium,
    Nunito_400Regular,
    Nunito_300Light,
  });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold'      : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold'  : undefined;
  const fMed   = fontsLoaded ? 'Nunito_500Medium'    : undefined;
  const fReg   = fontsLoaded ? 'Nunito_400Regular'   : undefined;

  const { setTabBarTheme, setNiksChatMode } = useAppStore();

  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      return () => { setTabBarTheme('light'); };
    }, [])
  );

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
  const [conversationTime,     setConversationTime]     = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hide  = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Carga inicial do chat, cacheada ──────────────────────────────────────
  // Antes eram 4 requisições a CADA foco da aba — incluindo rebaixar a conversa
  // inteira — e a checagem de `niksChatMode` acontecia DEPOIS de tudo, ou seja,
  // não evitava requisição nenhuma. Agora nome + conversa + mensagens são uma
  // entrada de cache só, e a tela volta instantânea.
  const cachedUserId = useUserId()

  const fetchChat = useCallback(async () => {
    const uid = await getUserId()
    if (!uid) throw new Error('sem sessão')

    const [userRes, convRes] = await Promise.all([
      supabase.from('users').select('nome').eq('id', uid).single(),
      supabase
        .from('coach_conversations')
        .select('id')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const nome = userRes.data?.nome ?? null
    const convId: string | null = convRes.data?.id ?? null
    if (!convId) return { userId: uid, nome, conversationId: null, msgs: [] as any[] }

    const { data: msgs } = await supabase
      .from('coach_messages')
      .select('id, role, content, image_url, created_at')
      .eq('conversation_id', convId)
      .eq('user_id', uid)
      .order('created_at', { ascending: true })

    return { userId: uid, nome, conversationId: convId, msgs: msgs ?? [] }
  }, [])

  const { data: chatData } = useCachedQuery(
    cachedUserId ? `chat:${cachedUserId}` : null,
    fetchChat,
    { enabled: Boolean(cachedUserId) },
  )

  useEffect(() => {
    if (!chatData) return

    setUserId(chatData.userId)
    if (chatData.nome) setFirstName(chatData.nome.trim().split(' ')[0] || 'você')
    if (!chatData.conversationId) return
    setConversationId(chatData.conversationId)

    // ⚠️ `niksChatMode` (store) decide se a conversa é RESTAURADA na tela. Cold
    // start cai em 'empty' de propósito (README) — o cache não muda isso, só
    // evita ir à rede para descobrir o que já sabíamos.
    const chatMode = useAppStore.getState().niksChatMode
    if (chatMode === 'empty') return

    const msgs = chatData.msgs
    if (msgs.length > 0) {
      setMessages(msgs.map((msg: any) => {
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
      setConversationTime(msgs[0].created_at)
      setMode('active')
    } else {
      setMessages([])
      setMode('empty')
    }
  }, [chatData])

  const handleBackToEmpty = () => {
    setNiksChatMode('empty')
    setMode('empty')
    setMessages([])
    setConversationTime(null)
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
      setConversationTime(new Date().toISOString())
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

    const showSendError = (msg: string) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: msg, isStreaming: false }
          : m
      ))
    }

    // Obtain a valid token before sending. Only refresh when the token is
    // about to expire (<5 min) to avoid the extra network round-trip on
    // every message while still handling clock-skew / near-expiry cases.
    let accessToken: string | null = null

    try {
      const { data: { session: current } } = await supabase.auth.getSession()
      const expiresAt = current?.expires_at ?? 0
      const nowSecs   = Math.floor(Date.now() / 1000)

      if (current?.access_token && expiresAt - nowSecs > 300) {
        accessToken = current.access_token
      } else {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
        accessToken = (!refreshError && refreshed.session?.access_token)
          ? refreshed.session.access_token
          : (current?.access_token ?? null)
      }
    } catch {
      const { data: { session } } = await supabase.auth.getSession()
      accessToken = session?.access_token ?? null
    }

    if (!accessToken) {
      showSendError('Ocorreu um erro. Tente novamente.')
      return
    }

    let lastLength = 0
    const xhr = new XMLHttpRequest()
    xhr.open('POST', FUNCTION_URL)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
    xhr.setRequestHeader('apikey', ANON_KEY)
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.onprogress = () => {
      if (xhr.status !== 200) return
      const chunk = xhr.responseText.slice(lastLength)
      lastLength = xhr.responseText.length
      if (!chunk) return
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
      ))
      scrollRef.current?.scrollToEnd({ animated: false })
    }

    xhr.onload = () => {
      if (xhr.status !== 200) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: 'Ocorreu um erro. Tente novamente.', isStreaming: false }
            : m
        ))
        return
      }
      // Always use the full responseText to guarantee no truncation,
      // regardless of whether onprogress fired for every chunk.
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: xhr.responseText, isStreaming: false }
          : m
      ))
      // A conversa cresceu no banco — marca o cache como velho para que a próxima
      // entrada na aba busque o histórico atualizado em vez de servir o antigo.
      if (cachedUserId) invalidateCache(`chat:${cachedUserId}`)
    }

    xhr.onerror = () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'Ocorreu um erro. Tente novamente.', isStreaming: false }
          : m
      ))
    }

    // Image analysis requires more time (upload + multimodal inference).
    // Supabase Edge Functions run up to ~150s, so give the client enough
    // headroom: 120s with images, 90s for text-only.
    xhr.timeout = images && images.length > 0 ? 120000 : 90000
    xhr.ontimeout = () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'A resposta demorou muito. Tente novamente.', isStreaming: false }
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
      setConversationTime(new Date().toISOString())

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
    setConversationTime(msgs[0].created_at)
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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>

      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: 'transparent' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ChatHeader
            showBack={mode === 'active'}
            onBack={handleBackToEmpty}
            onHistoryPress={loadHistory}
            showHistory={mode !== 'active'}
            title={mode === 'active' ? 'NIKS Chat' : 'NIKS'}
            titleFont={mode === 'active' ? fMed : fBold}
            titleSize={mode === 'active' ? 22 : 20}
            logoSize={mode === 'active' ? 24 : 22}
          />

          <View style={{ flex: 1 }}>
          {mode === 'empty' ? (
            // ── ESTADO INICIAL ──────────────────────────────────────────────
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={{ flex: 1, backgroundColor: 'transparent' }}>
              {/* Welcome hero */}
              <View style={{
                paddingTop: 36, paddingHorizontal: 28, paddingBottom: 22,
                alignItems: 'center',
              }}>
                <View style={{ marginBottom: 22 }}>
                  <AnimatedLogo size={84} />
                </View>

                {/* Greeting "Olá, juliana" */}
                <Text style={{
                  fontFamily: fXBold,
                  fontSize: 32, lineHeight: 36,
                  letterSpacing: -1, color: '#FF9D9D',
                  textAlign: 'center',
                }}>
                  {'Olá, '}
                  <Text style={{ color: '#FF9D9D' }}>{firstName}</Text>
                </Text>

                {/* Tagline */}
                <Text style={{
                  fontFamily: fMed,
                  fontSize: 16, lineHeight: 22,
                  letterSpacing: -0.3,
                  color: INK_MUTE,
                  maxWidth: 260, textAlign: 'center',
                  marginTop: 8,
                }}>
                  como posso te ajudar hoje?
                </Text>
              </View>

              {/* "SUGESTÕES" divider */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingTop: 10, paddingHorizontal: 28, paddingBottom: 16,
              }}>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(18,18,18,0.07)' }} />
                <Text style={{
                  fontFamily: fBold,
                  fontSize: 10, letterSpacing: 1.6,
                  textTransform: 'uppercase', color: INK_MUTE,
                }}>
                  SUGESTÕES
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(18,18,18,0.07)' }} />
              </View>

              {/* Suggestion cards list */}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 144 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps='handled'
              >
                {SUGGESTIONS.map((s, i) => (
                  <SuggestionCard
                    key={i}
                    icon={s.icon}
                    text={s.text}
                    index={i}
                    fSemi={fSemi}
                    onPress={() =>
                      s.action === 'foodScan'
                        ? router.push('/(scan)/food-camera' as any)
                        : handleSuggestionPress(s.text)
                    }
                  />
                ))}
              </ScrollView>
            </View>
            </TouchableWithoutFeedback>
          ) : (
            // ── CONVERSA EM ANDAMENTO ───────────────────────────────────────
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1, backgroundColor: 'transparent' }}
              contentContainerStyle={{
                paddingTop: 20, paddingHorizontal: 22, paddingBottom: insets.bottom + 144,
                gap: 18,
              }}
              showsVerticalScrollIndicator={false}
            >
              {messages.map(m => {
                if (m.role === 'user') {
                  return (
                    <View key={m.id} style={{ gap: 8 }}>
                      {m.imageUris && m.imageUris.length > 0 && (
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          {m.imageUris.map((uri, i) => (
                            <UserPhotoBubble key={i} imageUri={uri} />
                          ))}
                        </View>
                      )}
                      {m.content ? <UserBubble text={m.content} fReg={fReg} /> : null}
                    </View>
                  )
                }
                if (m.content === '' && m.isStreaming) {
                  return <TypingDots key={m.id} />
                }
                return (
                  <NiksMessage key={m.id} fReg={fReg} streaming={m.isStreaming}>
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
                backgroundColor: WHITE,
                borderRadius: 20,
                borderWidth: 1, borderColor: CARD_BD,
                shadowColor: INK,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.10,
                shadowRadius: 28,
                elevation: 16,
                overflow: 'hidden',
              }}>
                <View style={{
                  paddingVertical: 14, paddingHorizontal: 18,
                  borderBottomWidth: 1, borderBottomColor: 'rgba(18,18,18,0.06)',
                }}>
                  <Text style={{
                    fontFamily: fBold,
                    fontSize: 10, letterSpacing: 1.6,
                    textTransform: 'uppercase', color: INK_MUTE,
                  }}>
                    Conversas recentes
                  </Text>
                </View>

                {historyLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ fontFamily: fMed, fontSize: 13, color: INK_FAINT }}>Carregando…</Text>
                  </View>
                ) : historyConversations.length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ fontFamily: fMed, fontSize: 13, color: INK_FAINT }}>Nenhuma conversa ainda.</Text>
                  </View>
                ) : (
                  historyConversations.map((conv, index) => (
                    <TouchableOpacity
                      key={conv.id}
                      onPress={() => { haptics.tap(); loadConversation(conv.id); }}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingVertical: 14, paddingHorizontal: 18,
                        borderBottomWidth: index < historyConversations.length - 1 ? 1 : 0,
                        borderBottomColor: 'rgba(18,18,18,0.06)',
                      }}
                    >
                      <Text
                        style={{ flex: 1, fontFamily: fSemi, fontSize: 13, lineHeight: 18, color: INK }}
                        numberOfLines={2}
                      >
                        {conv.title}
                      </Text>
                      <Text style={{ fontFamily: fMed, fontSize: 11, color: INK_FAINT, flexShrink: 0 }}>
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
              fReg={fReg}
              bottomInset={insets.bottom}
              keyboardOpen={keyboardOpen}
              onCameraPress={() => pickImage('camera')}
              onGalleryPress={() => pickImage('gallery')}
              pendingImages={pendingImages}
              onRemoveImage={(index) => setPendingImages(prev => prev.filter((_, i) => i !== index))}
              atLimit={pendingImages.length >= 5}
            />
          </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
