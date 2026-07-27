import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFonts } from 'expo-font';
import { useRouter, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from '../lib/supabase';
import { useMixpanel } from '../lib/mixpanel/MixpanelProvider';
import { haptics } from '../lib/haptics';


// ─── Design tokens ────────────────────────────────────────────
const DEEP       = '#1D3A44';
const DEEP_SOFT  = 'rgba(29,58,68,0.55)';
const CORAL      = '#FB7B6B';
const CORAL_DEEP = '#E5654F';
const CREAM      = '#FFFFFF';
const DOT_OFF    = 'rgba(29,58,68,0.10)';

// ─── Video mockup ─────────────────────────────────────────────

function VideoClip({ source, isActive }: { source: number | string; isActive: boolean }) {
  const player = useVideoPlayer(source as any, (p) => {
    p.loop = true;
    p.muted = true;
    // não inicia aqui — controlado por isActive
  });

  useEffect(() => {
    if (isActive) {
      player.replay();
    } else {
      player.pause();
    }
  }, [isActive]);

  return (
    <VideoView
      player={player}
      style={{ flex: 1, width: '100%' }}
      contentFit="contain"
      nativeControls={false}
      allowsFullscreen={false}
    />
  );
}

// ─── Shared atoms ─────────────────────────────────────────────

function ProgressDots({ active }: { active: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: i === active ? 26 : 7,
            height: 7,
            borderRadius: 100,
            backgroundColor: i === active ? CORAL : DOT_OFF,
          }}
        />
      ))}
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={() => {
        haptics.action();
        onPress();
      }}
      activeOpacity={0.85}
      style={{
        width: '100%',
        height: 60,
        borderRadius: 100,
        backgroundColor: CORAL,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: CORAL,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.55,
        shadowRadius: 22,
        elevation: 8,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.2 }}>
        {label}
      </Text>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M5 12h14M13 6l6 6-6 6"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </TouchableOpacity>
  );
}

function FooterLink({ onLogin }: { onLogin: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
      <Text style={{ color: DEEP_SOFT, fontSize: 14, letterSpacing: -0.1 }}>Já tem conta? </Text>
      <TouchableOpacity
        onPress={() => {
          haptics.tap();
          onLogin();
        }}
      >
        <Text style={{ color: DEEP, fontSize: 14, fontWeight: '600', letterSpacing: -0.1 }}>Entrar</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen props ─────────────────────────────────────────────

interface ScreenProps {
  w: number;
  h: number;
  topInset: number;
  bottomInset: number;
  italicFont: string | undefined;
  onNext: () => void;
  onLogin: () => void;
  isActive?: boolean;
}

// ─── Screen 1 — Welcome ───────────────────────────────────────

function Screen1({ w, h, topInset, bottomInset, italicFont, onNext, onLogin, isActive }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: CREAM }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../assets/welcome-video.mp4.mp4')} isActive={!!isActive} />
      </View>

      {/* text block */}
      <View style={{ paddingHorizontal: 32, paddingTop: 24, alignItems: 'center' }}>
        {/* "Bem-vinda ao" line */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Text style={{
            fontFamily: italicFont,
            fontSize: 30,
            fontWeight: '400',
            color: CORAL,
            letterSpacing: -0.5,
          }}>
            Bem-vinda{' '}
          </Text>
          <Text style={{
            fontSize: 22,
            fontWeight: '400',
            color: DEEP,
          }}>
            ao
          </Text>
        </View>
        {/* NIKS */}
        <Text style={{
          fontSize: 64,
          fontWeight: '800',
          color: DEEP,
          letterSpacing: -2.5,
          lineHeight: 68,
          marginTop: 8,
        }}>
          NIKS
        </Text>
        {/* subtitle */}
        <Text style={{
          fontSize: 16,
          lineHeight: 23,
          color: DEEP_SOFT,
          letterSpacing: -0.1,
          textAlign: 'center',
          marginTop: 20,
          maxWidth: 330,
        }}>
          Feito para entender a sua pele{'\n'}melhor que ninguém.
        </Text>
      </View>

      {/* footer */}
      <View style={{
        paddingHorizontal: 24,
        paddingBottom: Math.max(18, bottomInset),
        marginTop: 22,
      }}>
        <View style={{ marginBottom: 18 }}>
          <ProgressDots active={0} />
        </View>
        <PrimaryButton label="Começar" onPress={onNext} />
        <FooterLink onLogin={onLogin} />
      </View>
    </View>
  );
}

// ─── Screen 2 — Glow Up ───────────────────────────────────────

function Screen2({ w, h, topInset, bottomInset, italicFont, onNext, onLogin, isActive }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: CREAM }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../assets/glowup-screen-video.mp4')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 24, alignItems: 'center' }}>
        <Text style={{
          fontSize: 32, fontWeight: '700', color: DEEP,
          letterSpacing: -0.9, lineHeight: 35, textAlign: 'center',
        }}>
          {'Seu '}
          <Text style={{ fontFamily: italicFont, fontWeight: '500', color: CORAL, letterSpacing: -1 }}>
            glow up
          </Text>
          {' começa\npela pele'}
        </Text>
        <Text style={{
          fontSize: 16, lineHeight: 23, color: DEEP_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 16,
          maxWidth: 330,
        }}>
          Vamos analisar a sua pele e montar a rotina de skincare perfeita pra você.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 26 }}>
        <View style={{ marginBottom: 18 }}>
          <ProgressDots active={1} />
        </View>
        <PrimaryButton label="Continuar" onPress={onNext} />
        <FooterLink onLogin={onLogin} />
      </View>
    </View>
  );
}

// ─── Screen 3 — Expert ────────────────────────────────────────

function Screen3({ w, h, topInset, bottomInset, italicFont, onNext, onLogin, isActive }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: CREAM }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../assets/expert-screen-video.mp4')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 20, alignItems: 'center' }}>
        <Text style={{
          fontSize: 30, fontWeight: '700', color: DEEP,
          letterSpacing: -0.85, lineHeight: 33, textAlign: 'center',
        }}>
          {'Sua '}
          <Text style={{ fontFamily: italicFont, fontWeight: '500', color: CORAL, letterSpacing: -1 }}>
            expert de pele
          </Text>
          {',\nsempre disponível'}
        </Text>
        <Text style={{
          fontSize: 14.5, lineHeight: 22, color: DEEP_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 14,
          maxWidth: 348,
        }}>
          Espinha inflamada? Não sabe o produto certo pra sua pele? Não tá gostando da sua pele hoje? A NIKS conhece a sua pele e te ajuda na hora que precisar.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 22 }}>
        <View style={{ marginBottom: 18 }}>
          <ProgressDots active={2} />
        </View>
        <PrimaryButton label="Continuar" onPress={onNext} />
        <FooterLink onLogin={onLogin} />
      </View>
    </View>
  );
}

// ─── Screen 4 — Food ──────────────────────────────────────────

function Screen4({ w, h, topInset, bottomInset, italicFont, onNext, onLogin, isActive }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: CREAM }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../assets/alimentacao-screen-video.mp4')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 24, alignItems: 'center' }}>
        <Text style={{
          fontSize: 32, fontWeight: '700', color: DEEP,
          letterSpacing: -0.9, lineHeight: 35, textAlign: 'center',
        }}>
          {'O que você '}
          <Text style={{ fontFamily: italicFont, fontWeight: '500', color: CORAL, letterSpacing: -1 }}>
            come
          </Text>
          {'\naparece na pele'}
        </Text>
        <Text style={{
          fontSize: 15, lineHeight: 22.5, color: DEEP_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 16,
          maxWidth: 340,
        }}>
          Fotografe o que você come. Descubra como cada alimento está afetando sua pele e o que comer para transformá-la.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 22 }}>
        <View style={{ marginBottom: 18 }}>
          <ProgressDots active={3} />
        </View>
        <PrimaryButton label="Continuar" onPress={onNext} />
        <FooterLink onLogin={onLogin} />
      </View>
    </View>
  );
}

// ─── Screen 5 — Transition ────────────────────────────────────

function Screen5({ w, h, topInset, bottomInset, italicFont, onNext, onLogin, isActive }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: CREAM }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../assets/transicao-screen-video.mp4')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 20, alignItems: 'center' }}>
        {/* title */}
        <Text style={{
          fontSize: 30, fontWeight: '700', color: DEEP,
          letterSpacing: -0.85, lineHeight: 33, textAlign: 'center',
        }}>
          {'Em poucas semanas você\nvai se olhar no espelho\n'}
          <Text style={{ fontFamily: italicFont, fontWeight: '500', color: CORAL, letterSpacing: -1 }}>
            de um jeito diferente
          </Text>
        </Text>

        {/* subtitle */}
        <Text style={{
          fontSize: 14.5, lineHeight: 22, color: DEEP_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 14,
          maxWidth: 348,
        }}>
          {'Vamos criar uma rotina de skincare baseada na '}
          <Text style={{ fontWeight: '700', color: DEEP }}>sua</Text>
          {' pele, nos '}
          <Text style={{ fontWeight: '700', color: DEEP }}>seus</Text>
          {' hábitos e nos '}
          <Text style={{ fontWeight: '700', color: DEEP }}>seus</Text>
          {' objetivos. Para isso, precisamos te conhecer.'}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 22 }}>
        <PrimaryButton label="Vamos lá" onPress={onNext} />
        <FooterLink onLogin={onLogin} />
      </View>
    </View>
  );
}

// ─── Root component ───────────────────────────────────────────

export default function Welcome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [activeScreen, setActiveScreen] = useState(0);
  const { track } = useMixpanel();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Italic': require('../assets/fonts/PlayfairDisplay-Italic.ttf'),
  });
  const italicFont = fontsLoaded ? 'PlayfairDisplay-Italic' : undefined;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session) {
          // Usuária logada — delega verificação de assinatura para (app)/_layout.tsx
          // (evita race condition: loginRevenueCat pode não ter completado ainda)
          router.replace('/(app)/home');
        } else {
          setChecking(false);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const goToNext = (index: number) => {
    if (index < 4) {
      setActiveScreen(index + 1);
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      track('onboarding_step_completed', { step_number: 1, step_name: 'Tela Inicial', step_total: 23 });
      router.replace('/(onboarding)/birthday');
    }
  };

  const goToLogin = () => router.push('/(onboarding)/login');

  const screenProps: Omit<ScreenProps, 'onNext' | 'isActive'> = {
    w: width,
    h: height,
    topInset: insets.top,
    bottomInset: insets.bottom,
    italicFont,
    onLogin: goToLogin,
  };

  const screens = [
    <Screen1 key="s1" {...screenProps} isActive={activeScreen === 0} onNext={() => goToNext(0)} />,
    <Screen2 key="s2" {...screenProps} isActive={activeScreen === 1} onNext={() => goToNext(1)} />,
    <Screen3 key="s3" {...screenProps} isActive={activeScreen === 2} onNext={() => goToNext(2)} />,
    <Screen4 key="s4" {...screenProps} isActive={activeScreen === 3} onNext={() => goToNext(3)} />,
    <Screen5 key="s5" {...screenProps} isActive={activeScreen === 4} onNext={() => goToNext(4)} />,
  ];

  return (
    <>
      <Stack.Screen options={{ contentStyle: { backgroundColor: CREAM } }} />
      <StatusBar style="dark" />
      {checking ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={CORAL} />
        </View>
      ) : (
      <FlatList
        ref={listRef}
        data={screens}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => item}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: CREAM }}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
      )}
    </>
  );
}
