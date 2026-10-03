// ─────────────────────────────────────────────────────────────────────────────
// Tela de carregamento dos scans de dentro do app — FONTE ÚNICA do visual.
// Réplica das telas 50a (rosto) e 50b (produto) do Claude Design, projeto
// "NIKS home redesign — rotina skincare", componente `NiksLoadingFlo.dc.html`:
// "Mesma tela pros dois scans. O anel rosa enche junto com a porcentagem e o
// texto troca a cada etapa, marcada pelos pontinhos embaixo."
//
// Só o VISUAL mora aqui. A lógica (chamada da IA, tentativas, aviso de alta
// demanda, erro) continua em cada tela: `loading-dentro-app.tsx` (rosto) e
// `product-loading.tsx` → `hooks/useProductAnalysis` (produto).
//
// Frame do design 393 × 852 pt; posições verticais convertidas por
// `useObFrame().y()` (mesma régua do onboarding novo). Tipografia SF Pro = fonte
// do sistema, por isso nenhum `fontFamily`.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Line, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { OB, ObPillButton, useObFrame } from '../onboarding/kit';
import { haptics } from '../../lib/haptics';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PINK = OB.pink;         // #FF5EA8
const INK = OB.ink;           // #121212
const MUTED = '#8A8385';      // eyebrow, "%" e subtítulo

export type ScanLoadingKind = 'face' | 'product';

// Etapas do design — uma por pontinho; trocam a cada 25% da porcentagem.
const STEPS: Record<ScanLoadingKind, string[]> = {
  face: ['Lendo suas fotos', 'Mapeando as áreas do rosto', 'Cruzando com o seu perfil de pele', 'Montando seu relatório'],
  product: ['Lendo o rótulo', 'Analisando os ingredientes', 'Comparando com a sua rotina atual', 'Calculando a compatibilidade'],
};

const COPY: Record<ScanLoadingKind, { eyebrow: string; demand: string; errorTitle: string; errorHint: string }> = {
  face: {
    eyebrow: 'Scan de pele',
    demand: 'A análise da sua pele está sendo finalizada. Por favor, aguarde só mais',
    errorTitle: 'Não conseguimos analisar a sua pele',
    errorHint: 'Tire uma nova foto para tentar novamente',
  },
  product: {
    eyebrow: 'Scan de produto',
    demand: 'A análise do produto está sendo finalizada. Por favor, aguarde só mais',
    errorTitle: 'Não conseguimos analisar o produto',
    errorHint: 'Tire uma nova foto do produto para tentar novamente',
  },
};

// Anel: SVG 272 × 272, raio 128, traço 12 (trilho branco + progresso rosa).
const RING_SVG = 272;
const RING_R = 128;
const RING_STROKE = 12;
const RING_C = 2 * Math.PI * RING_R;
const OUTER_D = 312;   // hairline externa
const DISC_D = 224;    // disco branco com a porcentagem
const GLOW_D = 560;    // brilho branco radial atrás do anel

type Props = {
  kind: ScanLoadingKind;
  percentage: number;
  showDemandNotice: boolean;
  countdown: number;
  countdownPaused: boolean;
  showError: boolean;
  /** "Tentar novamente" do estado de erro. */
  onRetry: () => void;
};

export function ScanLoadingView({
  kind, percentage, showDemandNotice, countdown, countdownPaused, showError, onRetry,
}: Props) {
  const { width } = useWindowDimensions();
  const { y } = useObFrame();
  const steps = STEPS[kind];
  const copy = COPY[kind];
  const stepIdx = Math.min(steps.length - 1, Math.floor((percentage / 100) * steps.length));

  // O arco segue a porcentagem com uma transição curta (a % sobe em saltos de 1).
  const ringAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ringAnim, {
      toValue: percentage, duration: 300, easing: Easing.linear, useNativeDriver: false,
    }).start();
  }, [percentage]);
  const ringOffset = ringAnim.interpolate({ inputRange: [0, 100], outputRange: [RING_C, 0] });

  const centerX = width / 2;
  const [numW, setNumW] = useState(0);

  return (
    <View style={{ flex: 1, backgroundColor: '#F9F2F5' }}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']}
        locations={[0, 0.3, 0.6, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Brilho branco radial (560 pt, centrado na horizontal, topo a 150 pt) */}
      <Svg
        width={GLOW_D} height={GLOW_D} pointerEvents="none"
        style={{ position: 'absolute', left: centerX - GLOW_D / 2, top: y(150) }}
      >
        <Defs>
          <RadialGradient id="scanLoadGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.75} />
            <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW_D / 2} cy={GLOW_D / 2} r={GLOW_D / 2} fill="url(#scanLoadGlow)" />
      </Svg>

      {showError ? (
        <ErrorState copy={copy} onRetry={onRetry} />
      ) : (
        <>
          {/* Eyebrow */}
          <Text style={{
            position: 'absolute', left: 0, right: 0, top: y(69), textAlign: 'center',
            fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: MUTED,
          }}>
            {copy.eyebrow}
          </Text>

          {showDemandNotice && (
            <DemandNotice top={y(100)} text={copy.demand} countdown={countdown} paused={countdownPaused} />
          )}

          {/* Hairline externa */}
          <View style={{
            position: 'absolute', top: y(206), left: centerX - OUTER_D / 2,
            width: OUTER_D, height: OUTER_D, borderRadius: OUTER_D / 2,
            borderWidth: 1, borderColor: 'rgba(255,94,168,0.16)',
          }} />

          {/* Anel: trilho branco + progresso rosa, começando no topo */}
          <Svg
            width={RING_SVG} height={RING_SVG}
            style={{
              position: 'absolute', top: y(226), left: centerX - RING_SVG / 2,
              transform: [{ rotate: '-90deg' }],
            }}
          >
            <Circle
              cx={RING_SVG / 2} cy={RING_SVG / 2} r={RING_R}
              fill="none" stroke="#FFFFFF" strokeWidth={RING_STROKE}
            />
            <AnimatedCircle
              cx={RING_SVG / 2} cy={RING_SVG / 2} r={RING_R}
              fill="none" stroke={PINK} strokeWidth={RING_STROKE} strokeLinecap="round"
              strokeDasharray={RING_C} strokeDashoffset={ringOffset}
            />
          </Svg>

          {/* Disco branco com a porcentagem */}
          <View style={{
            position: 'absolute', top: y(250), left: centerX - DISC_D / 2,
            width: DISC_D, height: DISC_D, borderRadius: DISC_D / 2,
            backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
            shadowColor: '#C0206A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 15,
          }}>
            {/* O número fica centrado; o "%" pendura à direita sem deslocá-lo.
                Posição do "%" pela largura MEDIDA do número — o `left: '100%'` do
                design não resolve igual no RN (o "%" ia parar na borda da tela). */}
            <Text
              onLayout={(e) => setNumW(e.nativeEvent.layout.width)}
              style={{
                fontSize: 64, fontWeight: '700', lineHeight: 70, letterSpacing: -2,
                fontVariant: ['tabular-nums'], color: INK,
              }}
            >
              {percentage}
            </Text>
            {numW > 0 && (
              <Text style={{
                position: 'absolute',
                left: (DISC_D + numW) / 2 + 3,
                top: (DISC_D - 70) / 2 + 70 - 9 - 24,
                fontSize: 24, lineHeight: 24, fontWeight: '600', letterSpacing: -0.4, color: MUTED,
              }}>
                %
              </Text>
            )}
          </View>

          {/* Etapa atual + aviso fixo */}
          <View style={{ position: 'absolute', left: 32, right: 32, top: y(566), alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK, textAlign: 'center' }}>
              {steps[stepIdx]}
            </Text>
            <Text style={{ fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: MUTED, textAlign: 'center' }}>
              Isso leva só alguns segundos. Não feche o app.
            </Text>
          </View>

          {/* Pontinhos das etapas */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: y(648), flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {steps.map((_, i) => (
              <StepDot key={i} active={i === stepIdx} done={i <= stepIdx} />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** Pontinho: 6 × 6, o da etapa atual estica para 20; largura e cor em 0,3 s. */
function StepDot({ active, done }: { active: boolean; done: boolean }) {
  const widthAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const colorAnim = useRef(new Animated.Value(done ? 1 : 0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(widthAnim, { toValue: active ? 1 : 0, duration: 300, easing: Easing.ease, useNativeDriver: false }),
      Animated.timing(colorAnim, { toValue: done ? 1 : 0, duration: 300, easing: Easing.ease, useNativeDriver: false }),
    ]).start();
  }, [active, done]);
  return (
    <Animated.View style={{
      height: 6, borderRadius: 100,
      width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 20] }),
      backgroundColor: colorAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,94,168,0.22)', PINK] }),
    }} />
  );
}

// ── Estados que o design não desenha — mantidos da tela anterior, na paleta nova ──

function DemandNotice({ top, text, countdown, paused }: { top: number; text: string; countdown: number; paused: boolean }) {
  return (
    <View style={{
      position: 'absolute', top, left: 24, right: 24,
      backgroundColor: PINK, borderRadius: 16, padding: 13,
      flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    }}>
      <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginTop: 1 }}>
        <Path d="M4 2h8v2.5C12 6.5 9.5 8 8 8C6.5 8 4 6.5 4 4.5V2z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
        <Path d="M4 14h8v-2.5C12 9.5 9.5 8 8 8C6.5 8 4 9.5 4 11.5V14z" stroke="white" strokeWidth={1.3} strokeLinejoin="round" fill="none" />
        <Line x1={3} y1={2} x2={13} y2={2} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
        <Line x1={3} y1={14} x2={13} y2={14} stroke="white" strokeWidth={1.3} strokeLinecap="round" />
      </Svg>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 }}>
          Estamos com alta demanda agora
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: '#FFFFFF' }}>
          {paused ? 'Por favor, aguarde só mais um pouco.' : (
            <>{text} <Text style={{ fontWeight: '700' }}>{countdown}s</Text>.</>
          )}
        </Text>
      </View>
    </View>
  );
}

function ErrorState({ copy, onRetry }: { copy: (typeof COPY)[ScanLoadingKind]; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <View style={{
        width: '100%', backgroundColor: PINK, borderRadius: 16, padding: 13,
        flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 20,
      }}>
        <Svg width={16} height={16} viewBox="0 0 16 16" style={{ marginTop: 1 }}>
          <Path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="white" strokeWidth={1.4} strokeLinejoin="round" fill="none" />
          <Line x1={8} y1={6.5} x2={8} y2={10} stroke="white" strokeWidth={1.4} strokeLinecap="round" />
          <Circle cx={8} cy={11.8} r={0.75} fill="white" />
        </Svg>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 }}>{copy.errorTitle}</Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: '#FFFFFF' }}>
            Estamos com alta demanda no momento. Tente novamente em instantes.
          </Text>
        </View>
      </View>

      <Svg width={72} height={72} viewBox="0 0 72 72" style={{ marginBottom: 12 }}>
        <Circle cx={36} cy={36} r={33} stroke={PINK} strokeWidth={3} fill="none" />
        <Circle cx={24} cy={30} r={4} fill={PINK} />
        <Circle cx={48} cy={30} r={4} fill={PINK} />
        <Path d="M24 50 C28 44 44 44 48 50" stroke={PINK} strokeWidth={3} strokeLinecap="round" fill="none" />
      </Svg>

      <Text style={{ fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK, textAlign: 'center', marginBottom: 6 }}>
        Algo deu errado por aqui...
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: MUTED, textAlign: 'center', marginBottom: 32 }}>
        {copy.errorHint}
      </Text>

      {/* Pílula do kit, mais larga: "Tentar novamente" não cabe nos 172 pt de "Continuar". */}
      <ObPillButton label="Tentar novamente" style={{ width: 210 }} onPress={() => { haptics.action(); onRetry(); }} />
    </View>
  );
}
