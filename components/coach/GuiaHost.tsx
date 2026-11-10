// ─────────────────────────────────────────────────────────────────────────────
// Host das DICAS dos desafios do primeiro acesso (08/nov/2026) — `lib/guia.ts`.
// Mora no layout RAIZ: os desafios passam pela câmera e pelo resultado do scan, que ficam
// por cima do grupo `(app)`. Modais nativos ficam acima dele (por isso as dicas dentro da
// folha de produtos e do detalhe do produto moram nessas telas).
//
// Diferente do tour (`TutorialOverlay`, toque em qualquer lugar avança), aqui o toque
// PASSA pelo recorte: o véu é desenhado inteiro, mas só 4 faixas EM VOLTA do recorte pegam
// o toque (e encerram a dica). Contorno rosa pulsando devagar (opacidade, 1,2 s) e balão
// branco com a frase (e, no 1º passo vazio da Rotina, o atalho "Escanear vários de uma
// vez"). Passos sem alvo viram um balão embaixo, que some sozinho. Passo `livre`: sem véu e
// sem bloquear o toque, para ela poder ler o resultado do scan.
// Animação (skill animate-expo — dica de primeiro uso; propósito: mostrar onde tocar):
// Reanimated, só opacidade/transform; "Reduzir movimento" = sem pulsar, só esmaecer.
// A rota decide os passos: chegou à tela seguinte → avança; foi para outro lugar → encerra.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, Fill, RoundedRect } from '@shopify/react-native-skia';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { requestCoachMeasure, useCoachTargets, type CoachTargetKey } from '../../lib/coachMarks';
import { dispararAtalhoGuia, encerrarGuia, irParaGuia, useGuia, type Guia, type PassoGuia } from '../../lib/guia';
import { pularDesafio, type DesafioId } from '../../lib/missoes';
import { boxOf } from './TutorialOverlay';

const SCRIM = 'rgba(26,8,18,0.62)';
const PINK = '#FF5EA8';
const INK = '#121212';

type Passo = {
  /** Sem alvo = balão embaixo, que some sozinho em `some` ms. */
  alvo?: CoachTargetKey;
  pad?: number;
  r?: number | 'pill';
  texto: (g: Guia) => string | null;
  /** Rotas em que o passo vale (vazio = qualquer). Saiu delas sem avançar → encerra. */
  rotas: string[];
  /** Chegou nesta rota → vai para este passo (ou encerra, com `null`). */
  avanca?: { rota: string; para: PassoGuia | null }[];
  atalho?: boolean;
  some?: number;
  /** Sem véu e sem bloquear o toque: só o contorno e o balão. */
  livre?: boolean;
  /** Desafio que exige um produto em mãos: mostra "Não tenho um produto agora". */
  pular?: DesafioId;
};

const D4 = 'Fazer o skincare';
const ESTANTE = 'Este produto é seu? Coloque na sua estante.';
const PASSOS: Record<PassoGuia, Passo> = {
  'd1-aba': { alvo: 'nav-produtos', pad: 4, r: 'pill', texto: () => 'Vamos escanear um produto seu. Toque em Produtos.', rotas: ['/home'], avanca: [{ rota: '/recomendacao-produtos', para: 'd1-scan' }], pular: 'd1' },
  'd1-scan': { alvo: 'prod-scanBtn', pad: 6, r: 'pill', texto: () => 'Toque aqui para abrir o scanner.', rotas: ['/recomendacao-produtos'], avanca: [{ rota: '/product-camera', para: 'd1-foto' }], pular: 'd1' },
  'd1-foto': { alvo: 'scan-foto', pad: 6, r: 'pill', texto: () => 'Aponte para o produto e toque para tirar a foto.', rotas: ['/product-camera'], avanca: [{ rota: '/product-loading', para: 'd1-espera' }], pular: 'd1' },
  'd1-espera': { texto: () => null, rotas: ['/product-loading'], avanca: [{ rota: '/product-result', para: 'd2-adicionar' }, { rota: '/product-camera', para: 'd1-foto' }] },
  'd2-aba': { alvo: 'nav-produtos', pad: 4, r: 'pill', texto: () => 'Vamos montar sua estante. Toque em Produtos.', rotas: ['/home'], avanca: [{ rota: '/recomendacao-produtos', para: 'd2-card' }] },
  'd2-card': { alvo: 'prod-escaneado', pad: 4, r: 18, texto: () => 'Toque no produto que você tem em casa.', rotas: ['/recomendacao-produtos'] },
  // Dentro do detalhe do produto (Modal): a dica mora nele (`ProductAnalysis`).
  'd2-detalhe': { texto: () => null, rotas: ['/recomendacao-produtos'] },
  'd2-adicionar': { alvo: 'scan-estante', pad: 4, r: 'pill', texto: () => ESTANTE, rotas: ['/product-result'], livre: true },
  'd2-pronto': { texto: () => 'Produto na estante! Seu próximo desafio está na Home.', rotas: [], some: 4000 },
  'd3-aba': { alvo: 'nav-rotina', pad: 4, r: 'pill', texto: () => 'Vamos montar sua rotina. Toque em Rotina.', rotas: ['/home'], avanca: [{ rota: '/protocolo', para: 'd3-escolher' }], pular: 'd3' },
  'd3-escolher': { alvo: 'rot-escolher', pad: 6, r: 14, texto: () => 'Toque aqui para escolher o produto deste passo.', rotas: ['/protocolo'], atalho: true, pular: 'd3' },
  // Dentro da folha de produtos (Modal): a dica mora nela (`EscolherProdutoSheet`).
  'd3-folha': { texto: () => null, rotas: ['/protocolo'] },
  'd3-pronto': { texto: (g) => `Pronto! Sua rotina da ${g.periodo === 'pm' ? 'noite' : 'manhã'} está completa.`, rotas: [], some: 4500 },
  'd4-iniciar': { alvo: 'home-rot', pad: 6, r: 'pill', texto: () => D4, rotas: ['/home'], avanca: [{ rota: '/skincare', para: 'd4-concluir' }] },
  'd4-concluir': { alvo: 'sk-concluir', pad: 6, r: 'pill', texto: () => D4, rotas: ['/skincare'] },
  'd4-fora': { texto: (g) => (g.hora ? `Seu skincare abre às ${g.hora}.` : null), rotas: [], some: 4000 },
};

export default function GuiaHost() {
  const guia = useGuia();
  const pathname = usePathname();

  // A rota manda: avança, encerra ou segue.
  const anterior = useRef(pathname);
  useEffect(() => {
    if (!guia) return;
    const p = PASSOS[guia.passo];
    const av = p.avanca?.find((a) => a.rota === pathname);
    if (av) {
      if (av.para) irParaGuia(av.para); else encerrarGuia();
    } else if (p.rotas.length && !p.rotas.includes(pathname) && anterior.current !== pathname) {
      encerrarGuia();
    }
    anterior.current = pathname;
  }, [pathname, guia?.passo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!guia) return null;
  const p = PASSOS[guia.passo];
  const texto = p.texto(guia);
  if (!p.alvo) return texto ? <Balao key={guia.passo} texto={texto} some={p.some ?? 4000} /> : null;
  if (p.rotas.length && !p.rotas.includes(pathname)) return null;
  return <Recorte key={guia.passo} passo={p} texto={texto ?? ''} />;
}

// ── Recorte com o toque passando ─────────────────────────────────────────────
function Recorte({ passo, texto }: { passo: Passo; texto: string }) {
  const targets = useCoachTargets();
  const { width: W, height: H } = useWindowDimensions();
  const reduzir = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const pulso = useSharedValue(1);

  useEffect(() => {
    const medir = () => requestCoachMeasure([passo.alvo!]);
    medir();
    const iv = setInterval(medir, 500); // a tela de baixo pode assentar depois da dica aparecer
    return () => clearInterval(iv);
  }, [passo.alvo]);
  useEffect(() => {
    if (reduzir) { pulso.set(1); return; }
    pulso.set(withRepeat(withTiming(0.35, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduzir, pulso]);
  const aroSt = useAnimatedStyle(() => ({ opacity: pulso.get() }));

  const box = boxOf({ u: [passo.alvo!], pad: passo.pad ?? 6, r: passo.r ?? 16 }, targets, W, null);
  if (!box) return null;

  const fechar = () => { haptics.tap(); encerrarGuia(); };
  const y2 = box.y + box.h;
  const below = y2 + 16 + 120 <= H - 40;
  const ax = Math.max(22, Math.min(W - 40 - 36, box.x + box.w / 2 - 20 - 7));

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { zIndex: 41 }]} pointerEvents="box-none">
      {!passo.livre && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Canvas style={StyleSheet.absoluteFill}>
            <Fill color={SCRIM} />
            <RoundedRect x={box.x} y={box.y} width={box.w} height={box.h} r={box.r} color="#000000" blendMode="clear" />
          </Canvas>
        </View>
      )}

      {/* As 4 faixas em volta do recorte: tocar nelas fecha a dica. O recorte fica livre. */}
      {!passo.livre && (
        <>
          <Pressable onPress={fechar} style={{ position: 'absolute', left: 0, top: 0, width: W, height: Math.max(0, box.y) }} accessibilityLabel="Fechar dica" />
          <Pressable onPress={fechar} style={{ position: 'absolute', left: 0, top: y2, width: W, height: Math.max(0, H - y2) }} accessibilityLabel="Fechar dica" />
          <Pressable onPress={fechar} style={{ position: 'absolute', left: 0, top: box.y, width: Math.max(0, box.x), height: box.h }} accessibilityLabel="Fechar dica" />
          <Pressable onPress={fechar} style={{ position: 'absolute', left: box.x + box.w, top: box.y, width: Math.max(0, W - box.x - box.w), height: box.h }} accessibilityLabel="Fechar dica" />
        </>
      )}

      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', left: box.x - 5, top: box.y - 5, width: box.w + 10, height: box.h + 10,
        borderRadius: box.r + 5, borderWidth: 5, borderColor: 'rgba(255,94,168,0.22)',
      }, aroSt]}>
        <View style={{ flex: 1, borderRadius: box.r, borderWidth: 2, borderColor: PINK }} />
      </Animated.View>

      {!!texto && (
        <Animated.View entering={FadeIn.duration(220).delay(120)} pointerEvents="box-none" style={[styles.tip, below ? { top: y2 + 14 } : { bottom: H - box.y + 14 }]}>
          <View pointerEvents="none" style={[styles.arrow, { left: ax }, below ? { top: -6 } : { bottom: -6 }]} />
          <Text style={styles.text} lineBreakStrategyIOS="push-out" accessibilityRole="text">{texto}</Text>
          {passo.atalho && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { haptics.tap(); encerrarGuia(); dispararAtalhoGuia(); }}
              hitSlop={{ top: 8, bottom: 8 }}
              style={{ alignSelf: 'flex-start' }}
              accessibilityRole="button"
            >
              <Text style={styles.atalho}>Escanear vários de uma vez</Text>
            </TouchableOpacity>
          )}
          {passo.pular && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { haptics.tap(); void pularDesafio(passo.pular!, router, pathname); }}
              hitSlop={{ top: 8, bottom: 8 }}
              style={{ alignSelf: 'flex-start' }}
              accessibilityRole="button"
            >
              <Text style={styles.pular}>Não tenho um produto agora</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ── Balão sem alvo (some sozinho) ─────────────────────────────────────────────
function Balao({ texto, some }: { texto: string; some: number }) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const t = setTimeout(encerrarGuia, some);
    return () => clearTimeout(t);
  }, [some]);
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      pointerEvents="none"
      style={[styles.balao, { bottom: insets.bottom + 96 }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{texto}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: 'absolute', left: 20, right: 20,
    paddingTop: 14, paddingHorizontal: 18, paddingBottom: 14, borderRadius: 20, backgroundColor: '#FFFFFF', gap: 10,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 14,
  },
  arrow: { position: 'absolute', width: 14, height: 14, backgroundColor: '#FFFFFF', borderRadius: 3, transform: [{ rotate: '45deg' }] },
  text: { fontSize: 17, fontWeight: '600', lineHeight: 23, letterSpacing: -0.35, color: INK },
  atalho: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: '#E8468F' },
  pular: { fontSize: 14, fontWeight: '500', letterSpacing: -0.15, color: '#8A8387' },
  balao: {
    position: 'absolute', left: 20, right: 20, zIndex: 41,
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 20, backgroundColor: '#FFFFFF',
    shadowColor: '#000000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 12,
  },
});
