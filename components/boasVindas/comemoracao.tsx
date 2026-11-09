// ─────────────────────────────────────────────────────────────────────────────
// Peças de comemoração das boas-vindas (08/nov/2026, pedido do produto: a tela 6 "Pacto
// selado" é uma COMEMORAÇÃO de verdade — confete como o do TapFit, nas cores do NIKS, e o
// número subindo suave).
//
// DESEMPENHO (a 1ª versão travava no iPhone; no simulador parecia boa): 100 Views de confete
// + um TextInput com o texto animado = o Fabric refazendo a árvore de views a cada quadro. Agora:
//  - `Confete`: UM Canvas Skia (como as faíscas da caminhada). Os papéis não são views: são
//    desenhados num `Picture` recalculado no thread de UI a partir de um relógio só.
//  - `Odometro`: uma fita com todos os números que só DESLIZA (translateY) para o da vez.
//    Nada muda de tamanho nem de texto durante a animação.
//
// O confete tem duas partes, como no TapFit: uma CHUVA contínua de papeizinhos finos caindo
// do topo pela tela toda (balançam, viram em 3D e reaparecem lá em cima) e, na abertura, uma
// RAJADA dos dois cantos de baixo (sobem, freiam e caem). Física da rajada com arrasto linear:
// x = vx·(1−e^(−kt))/k ; y = (g/k)·t + (vy − g/k)·(1−e^(−kt))/k.
// Para quando a tela sai de foco (a tela de baixo da pilha não fica desenhando).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type TextStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';

// Rosas do NIKS + as cores de apoio que já aparecem no app (lilás, dourado, pêssego) e um
// verde-água para dar contraste no fundo rosa, como o turquesa do TapFit. Branco também.
export const CORES_CONFETE = ['#FF5EA8', '#E0447F', '#FF8FC4', '#B79CFF', '#F5B44A', '#FF9F7A', '#6FD6C0', '#FFFFFF'];

const K = 2.4;      // arrasto do ar (1/s)
const G = 480;      // gravidade (pt/s²) → cai a no máximo 200 pt/s
const RAJADA_POR_LADO = 45;
const RAJADA_S = 3.6;
const CHUVA = 70;

type Papel = {
  w: number; h: number; cor: string; redondo: boolean;
  giro0: number; giro: number; vira: number; fase: number; balanco: number;
  /** true = rajada dos cantos; false = chuva do topo. */
  canhao: boolean;
  x0: number; y0: number; vx: number; vy: number; vida: number; atraso: number;
};

function sortear(W: number, H: number): Papel[] {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  const cor = () => CORES_CONFETE[Math.floor(Math.random() * CORES_CONFETE.length)];
  const l: Papel[] = [];
  for (const lado of [-1, 1]) {
    for (let i = 0; i < RAJADA_POR_LADO; i++) {
      const ang = (r(50, 88) * Math.PI) / 180;
      const v = r(1150, 1900);
      const redondo = Math.random() < 0.15;
      const w = redondo ? r(7, 9) : r(5, 7);
      l.push({
        w, h: redondo ? w : r(11, 16), cor: cor(), redondo,
        giro0: r(0, 360), giro: r(-400, 400), vira: r(4, 10), fase: r(0, 6.28), balanco: r(6, 16),
        canhao: true, x0: lado < 0 ? -6 : W + 6, y0: H * 0.74,
        vx: -lado * v * Math.cos(ang), vy: -v * Math.sin(ang), vida: r(3, RAJADA_S), atraso: r(0, 0.18),
      });
    }
  }
  for (let i = 0; i < CHUVA; i++) {
    const redondo = Math.random() < 0.1;
    const w = redondo ? r(6, 8) : r(4, 6);
    l.push({
      w, h: redondo ? w : r(10, 15), cor: cor(), redondo,
      giro0: r(-30, 30), giro: r(-60, 60), vira: r(2.5, 6), fase: r(0, 6.28), balanco: r(8, 22),
      // x0 = coluna; y0 = começa ACIMA da tela (entra aos poucos); vy = velocidade de queda.
      canhao: false, x0: r(0, W), y0: -r(20, H * 1.1), vx: 0, vy: r(90, 170), vida: 0, atraso: 0,
    });
  }
  return l;
}

/** Confete por cima da tela inteira. Começa quando `disparar` vira true. */
export function Confete({ disparar }: { disparar: boolean }) {
  const { width: W, height: H } = useWindowDimensions();
  const papeis = useMemo(() => sortear(W, H), [W, H]);
  const t = useSharedValue(-1);        // segundos desde o disparo (−1 = ainda não)
  const inicio = useSharedValue(-1);
  const pausa = useSharedValue(0);     // tempo já corrido antes de uma pausa (saiu de foco)

  const cb = useFrameCallback((fi) => {
    if (inicio.get() < 0) inicio.set(fi.timestamp - pausa.get() * 1000);
    t.set((fi.timestamp - inicio.get()) / 1000);
  }, false);

  // Liga quando dispara e enquanto a tela está em foco; desliga ao sair (e retoma de onde parou).
  useFocusEffect(useCallback(() => {
    if (!disparar) return;
    inicio.set(-1);
    cb.setActive(true);
    return () => { cb.setActive(false); pausa.set(Math.max(0, t.get())); };
  }, [disparar]));

  const paint = useMemo(() => Skia.Paint(), []);
  const pic = useDerivedValue(() => {
    const s0 = t.get();
    return createPicture((cv) => {
      if (s0 < 0) return;
      const ALT = H + 40;
      for (let i = 0; i < papeis.length; i++) {
        const p = papeis[i];
        let x: number;
        let y: number;
        let op = 1;
        let s: number;
        if (p.canhao) {
          s = s0 - p.atraso;
          if (s <= 0 || s >= p.vida) continue;
          const e = (1 - Math.exp(-K * s)) / K;
          const queda = Math.min(1, s / 0.8);
          x = p.x0 + p.vx * e + Math.sin(s * 3.2 + p.fase) * p.balanco * queda;
          y = p.y0 + (G / K) * s + (p.vy - G / K) * e;
          const fim = p.vida - 0.6;
          if (s > fim) op = 1 - (s - fim) / 0.6;
        } else {
          s = s0;
          const yy = p.y0 + p.vy * s;
          if (yy < -20) continue;                       // ainda acima da tela
          y = ((yy + 20) % ALT) - 20;                   // passou do fim → volta lá em cima
          x = p.x0 + Math.sin(s * 1.7 + p.fase) * p.balanco;
        }
        // "Virar em 3D": achata na altura com o cosseno (nunca some de todo).
        const esc = Math.max(0.18, Math.abs(Math.cos(s * p.vira + p.fase)));
        paint.setColor(Skia.Color(p.cor));
        paint.setAlphaf(op);
        cv.save();
        cv.translate(x, y);
        cv.rotate(p.giro0 + p.giro * s, 0, 0);
        cv.scale(1, esc);
        if (p.redondo) cv.drawCircle(0, 0, p.w / 2, paint);
        else cv.drawRRect(Skia.RRectXY(Skia.XYWHRect(-p.w / 2, -p.h / 2, p.w, p.h), 1.2, 1.2), paint);
        cv.restore();
      }
    });
  });

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Picture picture={pic} />
    </Canvas>
  );
}

// ── Número que conta ─────────────────────────────────────────────────────────
// Uma FITA com todos os números (0, 1, 2 … alvo) empilhados, numa janela da altura de uma
// linha; a contagem só desliza a fita para o número inteiro da vez (um translateY por quadro,
// sem trocar texto nem refazer layout). Os números ficam sempre nítidos (08/nov/2026: as
// colunas que giravam mostravam meio dígito no meio do giro).

/** Número que conta de 0 ao `alvo` (inteiro, até uns 300) com `valor` indo de 0 a 1. */
export function Odometro({ valor, alvo, style, prefixo = '', sufixo = '', alinhar = 'center' }: {
  valor: SharedValue<number>; alvo: number; style: TextStyle; prefixo?: string; sufixo?: string; alinhar?: 'center' | 'right';
}) {
  const h = (style.lineHeight as number | undefined) ?? Math.round((style.fontSize ?? 16) * 1.2);
  const n = Math.max(0, Math.round(alvo));
  const linhas = useMemo(() => Array.from({ length: n + 1 }, (_, i) => `${prefixo}${i}${sufixo}`), [n, prefixo, sufixo]);
  const fita = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.round(Math.min(1, Math.max(0, valor.get())) * n) * h }],
  }));
  const textAlign = alinhar === 'right' ? 'right' : 'center';
  return (
    <View style={{ height: h, overflow: 'hidden', alignSelf: 'stretch' }}>
      {/* A linha mais larga dá a largura (fica invisível, por baixo). */}
      <Text allowFontScaling={false} style={[style, { lineHeight: h, height: h, opacity: 0, textAlign }]}>{linhas[n]}</Text>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, fita]}>
        {linhas.map((l, i) => (
          <Text key={i} allowFontScaling={false} style={[style, { lineHeight: h, height: h, textAlign }]}>{l}</Text>
        ))}
      </Animated.View>
    </View>
  );
}
