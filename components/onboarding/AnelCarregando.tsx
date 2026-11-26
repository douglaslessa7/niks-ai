// ─────────────────────────────────────────────────────────────────────────────
// O visual da tela "Criando uma rotina só sua" (antiga tela 23 do fluxo completo): etiqueta
// "SUA ROTINA", anel R 122 (trilho branco 13 pt + progresso em degradê #FF5EA8 → #FF8CC0,
// 11 pt) em volta de um disco branco Ø214 com a porcentagem, o título, a frase da vez e 4
// tracinhos pulsando. Só desenha: quem usa decide o progresso, o título e as frases.
// Usado pela tela de espera depois do cadastro (`(onboarding)/loading-rotina`) e pelo loading
// do pós-compra v2 (`(onboarding)/pc-gerando`). Tirado do `loading-rotina` sem mudar nada.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { OB, useObFrame } from './kit';

const R = 122;
const C = 2 * Math.PI * R;
const SIZE = 2 * R + 14;

/** A frase da vez entre `linhas`, pelo progresso (troca a cada fração), com a opacidade. */
export function linhaDoProgresso(linhas: string[], p: number): { texto: string; opacity: number } {
  const n = linhas.length;
  if (!n) return { texto: '', opacity: 0 };
  const idx = Math.min(n - 1, Math.floor(p * n));
  const local = p * n - idx;
  return { texto: linhas[idx], opacity: Math.max(0, Math.min(1, local * 6, idx === n - 1 ? 1 : (1 - local) * 8)) };
}

export default function AnelCarregando({ p, titulo, linha, linhaOpacity, carregando = true }: {
  /** Progresso de 0 a 1. */
  p: number;
  titulo: string;
  linha: string;
  linhaOpacity: number;
  /** false = esconde a frase e os tracinhos (ex.: falhou). */
  carregando?: boolean;
}) {
  const { y } = useObFrame();
  const dots = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(dots, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [dots]);

  const pct = Math.round(p * 100);
  const cy = y(370);

  return (
    <>
      <Text style={{
        position: 'absolute', left: 0, right: 0, top: y(74), textAlign: 'center',
        fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.4, color: OB.sub,
      }}>
        SUA ROTINA
      </Text>

      {/* Disco translúcido Ø300 atrás do anel */}
      <View style={{
        position: 'absolute', top: cy - 150, alignSelf: 'center', width: 300, height: 300, borderRadius: 150,
        backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.10)',
      }} />

      <View style={{ position: 'absolute', top: cy - SIZE / 2, alignSelf: 'center', width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <LinearGradient id="rotG" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={OB.pink} />
              <Stop offset="1" stopColor="#FF8CC0" />
            </LinearGradient>
          </Defs>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#FFFFFF" strokeWidth={13} />
          <Circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="url(#rotG)" strokeWidth={11} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0.005, p))}
          />
        </Svg>
      </View>

      {/* Disco branco Ø214 com a porcentagem */}
      <View style={{
        position: 'absolute', top: cy - 107, alignSelf: 'center', width: 214, height: 214, borderRadius: 107,
        backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', paddingTop: 78,
        shadowColor: OB.pink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.10, shadowRadius: 12,
      }}>
        <Text style={{ fontSize: 54, lineHeight: 58, fontWeight: '700', letterSpacing: -1.2, color: OB.ink, fontVariant: ['tabular-nums'] }}>{pct}</Text>
        <Text style={{ fontSize: 18, lineHeight: 18, fontWeight: '500', color: OB.sub, marginLeft: 3 }}>%</Text>
      </View>

      <Text style={{
        position: 'absolute', left: 24, right: 24, top: y(562), textAlign: 'center',
        fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: OB.ink,
      }}>
        {titulo}
      </Text>
      {carregando && (
        <Text style={{
          position: 'absolute', left: 24, right: 24, top: y(595), textAlign: 'center',
          fontSize: 15, lineHeight: 20, color: OB.sub, opacity: linhaOpacity,
        }}>
          {linha}
        </Text>
      )}

      {carregando && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: y(640), flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
          {[6, 14, 14, 6].map((w, k) => (
            <Animated.View key={k} style={{
              width: w, height: 5, borderRadius: 3, backgroundColor: OB.pink,
              opacity: dots.interpolate({
                inputRange: [0, 0.25, 0.5, 0.75, 1],
                outputRange: [0, 1, 2, 3, 4].map((j) => 0.35 + 0.65 * Math.max(0, Math.cos(((j / 4) - k / 4) * Math.PI * 2))),
              }),
            }} />
          ))}
        </View>
      )}
    </>
  );
}
