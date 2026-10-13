import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { haptics } from '../../lib/haptics';
import { OB, ObPillButton } from './kit';

// ─── FONTE ÚNICA das telas de apresentação ("welcome") ──────────────────────────
// Slides 2–5 vivem no carrossel `app/(onboarding)/apresentacao.tsx`, mostrado DEPOIS
// da criação de conta — lá NÃO se passa `onLogin`, então o link some. O slide 1
// ("Bem-vinda ao NIKS") saiu: a abertura do app é a splash + "Olá, eu sou a NIKS" do
// design (telas 0 e 0.1). Textos da versão B (commit 8ae3453);
// visual do kit do onboarding (SF Pro = fonte do sistema, rosa `OB.pink`, botão pílula
// `ObPillButton`). Não duplicar estes componentes: já se queimou antes (ver
// `NameCapture`/`ProductAnalysis`).

const DOT_OFF = 'rgba(18,18,18,0.10)';

// ─── Video mockup ─────────────────────────────────────────────

// `poster` = imagem do primeiro quadro (require de um .jpg). Aparece INSTANTANEAMENTE
// por cima do vídeo e some com um fade no momento em que o vídeo começa a tocar
// (evento `playingChange`). Sem ela, a área ficava branca por 2–3 s enquanto o vídeo
// carregava. Se o vídeo falhar, o poster fica como fallback — nunca mais tela branca.
// Ver seção "Ponto de entrada — Welcome" no README.
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
          // @ts-expect-error o tipo de Image não declara pointerEvents, mas o nativo repassa (o pôster não pode bloquear toque)
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
            backgroundColor: i === active ? OB.pink : DOT_OFF,
          }}
        />
      ))}
    </View>
  );
}

export function FooterLink({ onLogin }: { onLogin: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 14 }}>
      <Text style={{ fontSize: 17, lineHeight: 23, color: OB.sub }}>Já tem conta? </Text>
      <TouchableOpacity
        hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
        onPress={() => {
          haptics.tap();
          onLogin();
        }}
      >
        <Text style={{ fontSize: 17, lineHeight: 23, fontWeight: '600', color: OB.ink }}>Entrar</Text>
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
  onNext: () => void;
  onLogin?: () => void;   // ausente → sem link "Já tem conta? Entrar"
  isActive?: boolean;
  activeDot?: number;     // ausente → sem bolinhas de progresso
}

// ─── Esqueleto comum: vídeo no topo, texto, rodapé ────────────

const titleStyle = {
  fontSize: 30, lineHeight: 35, fontWeight: '700' as const, letterSpacing: -0.5,
  color: OB.ink, textAlign: 'center' as const,
};
const subtitleStyle = {
  fontSize: 16, lineHeight: 22, color: OB.sub, textAlign: 'center' as const, marginTop: 12, maxWidth: 348,
};

function Slide({
  w, h, topInset, bottomInset, onNext, onLogin, isActive, activeDot,
  video, poster, buttonLabel, children,
}: ScreenProps & { video: number; poster: number; buttonLabel: string; children: React.ReactNode }) {
  return (
    <View style={{ width: w, height: h, backgroundColor: OB.bg }}>
      <View style={{ flex: 1, paddingTop: topInset + 8 }}>
        <VideoClip source={video} poster={poster} isActive={!!isActive} />
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 22, alignItems: 'center' }}>
        {children}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(18, bottomInset), marginTop: 24 }}>
        {activeDot !== undefined && (
          <View style={{ marginBottom: 18 }}>
            <ProgressDots active={activeDot} />
          </View>
        )}
        <ObPillButton label={buttonLabel} onPress={() => { haptics.action(); onNext(); }} />
        {onLogin && <FooterLink onLogin={onLogin} />}
      </View>
    </View>
  );
}

const Accent = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ color: OB.pink }}>{children}</Text>
);

// ─── Screen 2 — Glow Up ───────────────────────────────────────

export function Screen2(props: ScreenProps) {
  return (
    <Slide {...props} video={require('../../assets/welcome-2.mp4')} poster={require('../../assets/welcome-2-poster.jpg')} buttonLabel="Continuar">
      <Text style={titleStyle}>
        {'Seu '}<Accent>glow up</Accent>{' começa\npela pele'}
      </Text>
      <Text style={subtitleStyle}>
        Com base na sua análise, montamos a sua rotina de skincare: o que usar de manhã, o que usar de noite e em que ordem aplicar cada produto.
      </Text>
    </Slide>
  );
}

// ─── Screen 3 — Expert ────────────────────────────────────────

export function Screen3(props: ScreenProps) {
  return (
    <Slide {...props} video={require('../../assets/welcome-3.mp4')} poster={require('../../assets/welcome-3-poster.jpg')} buttonLabel="Continuar">
      <Text style={titleStyle}>
        {'Sua '}<Accent>expert de pele</Accent>{',\nsempre disponível'}
      </Text>
      <Text style={subtitleStyle}>
        Espinha inflamada? Pele irritada do nada? Dúvida no meio da rotina? Chama a NIKS no chat. Ela já conhece a sua pele e te ajuda na hora que precisar.
      </Text>
    </Slide>
  );
}

// ─── Screen 4 — Produtos ──────────────────────────────────────

export function Screen4(props: ScreenProps) {
  return (
    <Slide {...props} video={require('../../assets/welcome-4.mp4')} poster={require('../../assets/welcome-4-poster.jpg')} buttonLabel="Continuar">
      <Text style={titleStyle}>
        {'Escolhemos os\n'}<Accent>melhores produtos</Accent>{'\npra sua pele'}
      </Text>
      <Text style={subtitleStyle}>
        Comparamos marcas nacionais e coreanas, e escolhemos os produtos certos para o objetivo que você quer alcançar.
      </Text>
    </Slide>
  );
}

// ─── Screen 5 — Escanear produto ──────────────────────────────

export function Screen5(props: ScreenProps) {
  return (
    <Slide {...props} video={require('../../assets/welcome-5.mp4')} poster={require('../../assets/welcome-5-poster.jpg')} buttonLabel="Começar">
      <Text style={titleStyle}>
        {'Esse produto serve\n'}<Accent>pra mim</Accent>{'?'}
      </Text>
      <Text style={subtitleStyle}>
        Viu um produto na farmácia ou já tem um em casa? Tira uma foto. A NIKS mostra a compatibilidade dele com a sua pele e diz se vale a pena colocar na sua rotina.
      </Text>
    </Slide>
  );
}
