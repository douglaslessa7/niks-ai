import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useVideoPlayer, VideoView } from 'expo-video';
import { haptics } from '../../lib/haptics';

// ─── FONTE ÚNICA das telas de apresentação ("welcome") ──────────────────────────
// Slide 1 é renderizado sozinho em `app/index.tsx` (com link "Já tem conta? Entrar").
// Slides 2–5 vivem no carrossel `app/(onboarding)/apresentacao.tsx`, mostrado DEPOIS
// da criação de conta — lá NÃO se passa `onLogin`, então o link some. Não duplicar
// estes componentes: já se queimou antes (ver `NameCapture`/`ProductAnalysis`).

// ─── Design tokens ("Novo design app NIKS") ───────────────────
const INK       = '#121212';   // títulos
const INK_SOFT  = '#515151';   // subtítulos/corpo
const INK_MUTE  = '#818181';   // texto muted (footer)
const CORAL     = '#FF9D9D';   // acento primário (rosa da Rotina)
const WHITE     = '#FFFFFF';   // fundo
const DOT_OFF   = 'rgba(18,18,18,0.10)';

// ─── Video mockup ─────────────────────────────────────────────

// `poster` = imagem do primeiro quadro (require de um .jpg). Aparece INSTANTANEAMENTE
// por cima do vídeo e some com um fade no momento em que o vídeo começa a tocar
// (evento `playingChange`). Sem ela, a área ficava branca por 2–3 s enquanto o vídeo
// (antes 22–34 MB, agora ~1–3 MB) carregava. Se o vídeo falhar, o poster fica como
// fallback — nunca mais tela branca. Ver seção "Ponto de entrada — Welcome" no README.
export function VideoClip({
  source,
  poster,
  isActive,
}: {
  source: number | string;
  poster?: number | string;
  isActive: boolean;
}) {
  const player = useVideoPlayer(source as any, (p) => {
    p.loop = true;
    p.muted = true;
    // não inicia aqui — controlado por isActive
  });

  // Poster: some assim que o vídeo realmente começa a tocar (latch — não reaparece)
  const posterOpacity = useRef(new Animated.Value(1)).current;
  const [posterGone, setPosterGone] = useState(false);

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        Animated.timing(posterOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }).start(() => setPosterGone(true));
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (isActive) {
      player.replay();
    } else {
      player.pause();
    }
  }, [isActive]);

  return (
    <View style={{ flex: 1, width: '100%' }}>
      <VideoView
        player={player}
        style={{ flex: 1, width: '100%' }}
        contentFit="contain"
        nativeControls={false}
      />
      {poster && !posterGone && (
        <Animated.Image
          source={poster as any}
          style={[StyleSheet.absoluteFillObject, { opacity: posterOpacity }]}
          resizeMode="contain"
          pointerEvents="none"
        />
      )}
    </View>
  );
}

// ─── Shared atoms ─────────────────────────────────────────────

export function ProgressDots({ active }: { active: number }) {
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

export function PrimaryButton({ label, onPress, font }: { label: string; onPress: () => void; font?: string }) {
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
      <Text style={{ color: '#fff', fontSize: 17, fontFamily: font, fontWeight: '600', letterSpacing: -0.2 }}>
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

export function FooterLink({ onLogin, font }: { onLogin: () => void; font?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
      <Text style={{ color: INK_MUTE, fontSize: 14, fontFamily: font, letterSpacing: -0.1 }}>Já tem conta? </Text>
      <TouchableOpacity
        onPress={() => {
          haptics.tap();
          onLogin();
        }}
      >
        <Text style={{ color: INK, fontSize: 14, fontFamily: font, fontWeight: '600', letterSpacing: -0.1 }}>Entrar</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen props ─────────────────────────────────────────────

export interface ScreenProps {
  w: number;
  h: number;
  topInset: number;
  bottomInset: number;
  fXBold: string | undefined;
  fBold: string | undefined;
  fSemi: string | undefined;
  fReg: string | undefined;
  onNext: () => void;
  onLogin?: () => void;   // ausente → sem link "Já tem conta? Entrar"
  isActive?: boolean;
  activeDot?: number;     // ausente → sem bolinhas de progresso
}

// ─── Screen 1 — Welcome ───────────────────────────────────────

export function Screen1({ w, h, topInset, bottomInset, fXBold, fBold, fSemi, fReg, onNext, onLogin, isActive, activeDot }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: WHITE }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../../assets/welcome-1.mp4')} poster={require('../../assets/welcome-1-poster.jpg')} isActive={!!isActive} />
      </View>

      {/* text block */}
      <View style={{ paddingHorizontal: 32, paddingTop: 24, alignItems: 'center' }}>
        {/* "Bem-vinda ao" line */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Text style={{
            fontFamily: fBold,
            fontSize: 30,
            fontWeight: '700',
            color: CORAL,
            letterSpacing: -0.5,
          }}>
            Bem-vinda{' '}
          </Text>
          <Text style={{
            fontFamily: fReg,
            fontSize: 22,
            fontWeight: '400',
            color: INK,
          }}>
            ao
          </Text>
        </View>
        {/* NIKS */}
        <Text style={{
          fontFamily: fXBold,
          fontSize: 64,
          fontWeight: '800',
          color: INK,
          letterSpacing: -2.5,
          lineHeight: 68,
          marginTop: 8,
        }}>
          NIKS
        </Text>
        {/* subtitle */}
        <Text style={{
          fontFamily: fReg,
          fontSize: 16,
          lineHeight: 23,
          color: INK_SOFT,
          letterSpacing: -0.1,
          textAlign: 'center',
          marginTop: 12,
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
        {activeDot !== undefined && (
          <View style={{ marginBottom: 18 }}>
            <ProgressDots active={activeDot} />
          </View>
        )}
        <PrimaryButton label="Começar" onPress={onNext} font={fSemi} />
        {onLogin && <FooterLink onLogin={onLogin} font={fReg} />}
      </View>
    </View>
  );
}

// ─── Screen 2 — Glow Up ───────────────────────────────────────

export function Screen2({ w, h, topInset, bottomInset, fXBold, fBold, fSemi, fReg, onNext, onLogin, isActive, activeDot }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: WHITE }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../../assets/welcome-2.mp4')} poster={require('../../assets/welcome-2-poster.jpg')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 24, alignItems: 'center' }}>
        <Text style={{
          fontFamily: fXBold, fontSize: 32, fontWeight: '800', color: INK,
          letterSpacing: -0.9, lineHeight: 35, textAlign: 'center',
        }}>
          {'Seu '}
          <Text style={{ fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -1 }}>
            glow up
          </Text>
          {' começa\npela pele'}
        </Text>
        <Text style={{
          fontFamily: fReg, fontSize: 16, lineHeight: 23, color: INK_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 16,
          maxWidth: 330,
        }}>
          Com base na sua análise, montamos a sua rotina de skincare: o que usar de manhã, o que usar de noite e em que ordem aplicar cada produto.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 26 }}>
        {activeDot !== undefined && (
          <View style={{ marginBottom: 18 }}>
            <ProgressDots active={activeDot} />
          </View>
        )}
        <PrimaryButton label="Continuar" onPress={onNext} font={fSemi} />
        {onLogin && <FooterLink onLogin={onLogin} font={fReg} />}
      </View>
    </View>
  );
}

// ─── Screen 3 — Expert ────────────────────────────────────────

export function Screen3({ w, h, topInset, bottomInset, fXBold, fBold, fSemi, fReg, onNext, onLogin, isActive, activeDot }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: WHITE }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../../assets/welcome-3.mp4')} poster={require('../../assets/welcome-3-poster.jpg')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 20, alignItems: 'center' }}>
        <Text style={{
          fontFamily: fXBold, fontSize: 30, fontWeight: '800', color: INK,
          letterSpacing: -0.85, lineHeight: 33, textAlign: 'center',
        }}>
          {'Sua '}
          <Text style={{ fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -1 }}>
            expert de pele
          </Text>
          {',\nsempre disponível'}
        </Text>
        <Text style={{
          fontFamily: fReg, fontSize: 14.5, lineHeight: 22, color: INK_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 14,
          maxWidth: 348,
        }}>
          Espinha inflamada? Pele irritada do nada? Dúvida no meio da rotina? Chama a NIKS no chat. Ela já conhece a sua pele e te ajuda na hora que precisar.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 22 }}>
        {activeDot !== undefined && (
          <View style={{ marginBottom: 18 }}>
            <ProgressDots active={activeDot} />
          </View>
        )}
        <PrimaryButton label="Continuar" onPress={onNext} font={fSemi} />
        {onLogin && <FooterLink onLogin={onLogin} font={fReg} />}
      </View>
    </View>
  );
}

// ─── Screen 4 — Produtos ──────────────────────────────────────

export function Screen4({ w, h, topInset, bottomInset, fXBold, fBold, fSemi, fReg, onNext, onLogin, isActive, activeDot }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: WHITE }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../../assets/welcome-4.mp4')} poster={require('../../assets/welcome-4-poster.jpg')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 24, alignItems: 'center' }}>
        <Text style={{
          fontFamily: fXBold, fontSize: 32, fontWeight: '800', color: INK,
          letterSpacing: -0.9, lineHeight: 35, textAlign: 'center',
        }}>
          {'Escolhemos os\n'}
          <Text style={{ fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -1 }}>
            melhores produtos
          </Text>
          {'\npra sua pele'}
        </Text>
        <Text style={{
          fontFamily: fReg, fontSize: 15, lineHeight: 22.5, color: INK_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 16,
          maxWidth: 340,
        }}>
          Comparamos marcas nacionais e coreanas, e escolhemos os produtos certos para o objetivo que você quer alcançar.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 22 }}>
        {activeDot !== undefined && (
          <View style={{ marginBottom: 18 }}>
            <ProgressDots active={activeDot} />
          </View>
        )}
        <PrimaryButton label="Continuar" onPress={onNext} font={fSemi} />
        {onLogin && <FooterLink onLogin={onLogin} font={fReg} />}
      </View>
    </View>
  );
}

// ─── Screen 5 — Transition ────────────────────────────────────

export function Screen5({ w, h, topInset, bottomInset, fXBold, fBold, fSemi, fReg, onNext, onLogin, isActive, activeDot }: ScreenProps) {
  return (
    <View style={{ width: w, height: h, backgroundColor: WHITE }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={require('../../assets/welcome-5.mp4')} poster={require('../../assets/welcome-5-poster.jpg')} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 20, alignItems: 'center' }}>
        {/* title */}
        <Text style={{
          fontFamily: fXBold, fontSize: 30, fontWeight: '800', color: INK,
          letterSpacing: -0.85, lineHeight: 33, textAlign: 'center',
        }}>
          {'Esse produto serve\n'}
          <Text style={{ fontFamily: fXBold, fontWeight: '800', color: CORAL, letterSpacing: -1 }}>
            pra mim
          </Text>
          {'?'}
        </Text>

        {/* subtitle */}
        <Text style={{
          fontFamily: fReg, fontSize: 14.5, lineHeight: 22, color: INK_SOFT,
          letterSpacing: -0.1, textAlign: 'center', marginTop: 14,
          maxWidth: 348,
        }}>
          Viu um produto na farmácia ou já tem um em casa? Tira uma foto. A NIKS mostra a compatibilidade dele com a sua pele e diz se vale a pena colocar na sua rotina.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 22 }}>
        {activeDot !== undefined && (
          <View style={{ marginBottom: 18 }}>
            <ProgressDots active={activeDot} />
          </View>
        )}
        <PrimaryButton label="Começar" onPress={onNext} font={fSemi} />
        {onLogin && <FooterLink onLogin={onLogin} font={fReg} />}
      </View>
    </View>
  );
}
