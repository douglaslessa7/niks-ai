// ─────────────────────────────────────────────────────────────────────────────
// Kit do ONBOARDING NOVO (design "NIKS Onboarding - fluxo completo", Claude
// Design — padrão "réplica do Flo"). FONTE ÚNICA dos átomos das telas de
// pergunta: fundo, header (voltar), título/subtítulo, card de opção, botão
// pílula e seletor de ano. Não duplicar estes estilos nas telas.
//
// O design é desenhado num frame de 393 × 852 pt com a status bar ocupando os
// 54 pt de cima. As posições verticais do arquivo são convertidas por `y()`:
// `insets.top + (yDoDesign − 54)` — o que no design está a 118 pt do topo fica
// 64 pt abaixo da safe area em qualquer iPhone.
//
// ⚠️ O fluxo completo (out/2026) NÃO tem barra de progresso em nenhuma tela — as
// telas reaproveitadas do design anterior vieram "sem-barra". Só o voltar.
//
// Tipografia: SF Pro = fonte do sistema no iOS, por isso nenhum `fontFamily`.
// ─────────────────────────────────────────────────────────────────────────────
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView, Animated, Easing,
  NativeSyntheticEvent, NativeScrollEvent, StyleProp, ViewStyle, TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import Reanimated, { Easing as REasing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAppStore } from '../../store/onboarding';
import { t } from '../../lib/i18n';

// ── Tokens (paleta do design) ────────────────────────────────────────────────
export const OB = {
  bg: '#FFFFFF',          // fundo de todas as telas
  option: '#F0F0F0',      // opções, campos, faixa do seletor
  pink: '#FF5EA8',        // botão, seleção, barra, checks, compromisso
  ink: '#121212',         // títulos, texto, ícones
  sub: '#818181',         // subtítulos
  body: '#515151',        // corpo (benefícios)
  wheel: '#6E6468',       // números do seletor
  divider: '#F0EDEB',     // divisórias / grade dos gráficos
  track: '#DCD5D6',       // trilho da barra
  radio: '#C4C4C4',       // radio das opções não selecionadas
  wash: '#FFE3EF',        // fundo rosa claro (chip ativo, selo de intensidade)
  blush: ['#FBEDEF', '#FAF1F2'] as const, // fundo das telas de valor
};

// ── Contadores do funil ──────────────────────────────────────────────────────
// Numeração ÚNICA do onboarding (Mixpanel `step_number`) na ordem do fluxo de
// out/2026 (o fluxo da versão B — commit 8ae3453 — com o scan novo e o visual do kit).
// As telas condicionais (detalhe da rotina, detalhe da alergia) mantêm o número mesmo
// quando não aparecem — o funil mostra o pulo, não renumera.
export const OB_STEPS = {
  // Funil v2 (09/nov/2026, `onboarding_version: '2.0'`): TODA tela antes do paywall, na ordem
  // real e sem buracos — antes 11 telas seguidas (cartas → comunidade) não tinham passo e a
  // queda delas aparecia como se fosse no "Analisando foto". Não comparar com o funil 1.0.
  // Código do grupo (só com convite), pergunta da assinatura, boas-vindas e cadastro (depois
  // do pagamento) ficam fora do funil numerado, com eventos próprios no Mixpanel.
  abertura: 1, nome: 2, objetivo: 3, transformacao: 4, evolucao: 5, idade: 6, incomoda: 7,
  mapaRosto: 8, focoRosto: 9, prepScan: 10, camera: 11, analisando: 12,
  cartas: 13, calma: 14, seuCaminho: 15, personalizar: 16,
  // As 7 perguntas da personalização: 17 + posição em `ORDEM` (personalizacao.ts) = 17 a 23.
  // "Qual ativo ou produto causou?" é condicional: fica fora (0).
  pergunta: 17,
  demoTransicao: 24, demoScan: 25, horarioManha: 26, horarioNoite: 27, notificacoes: 28,
  comunidade: 29, rotinaPronta: 30,
  // Depois do paywall: só no Mixpanel (acima de OB_PAYWALLO_LAST, o repasse ao Paywallo ignora).
  criarConta: 31,
  // Fora do caminho (arquivos no repo; o 0 garante que nada delas entra no funil).
  resultadoScan: 0, compromisso: 0,
  gravidez: 0, alergias: 0, alergiaDetalhe: 0, potencial: 0,
  tipoPele: 0, sol: 0, hidratacao: 0, sono: 0, rotinaAtual: 0, comSemNiks: 0,
  ola: 0, seusDados: 0, prazer: 0,
  avisoLembretes: 0, pedidoNotificacao: 0, entendi: 0, idadePele: 0, transicaoRotina: 0,
  aguaSono: 0, rotinaDetalhe: 0, horarioRotina: 0, empatia: 0,
  loadingRotina: 0, incomodaRotina: 0,
  loading: 0, relatorio: 0, planPreview: 0, apresentacao: 0,
} as const;
export const OB_STEP_TOTAL = 30;
/**
 * Último passo repassado ao funil do Paywallo (tela Dropout). Os passos depois dele
 * (paywall → conta → compromisso) ficam só no Mixpanel; o `onboardingManager.complete()`
 * sai no "Vamos começar" desta tela — ver `lib/mixpanel/MixpanelProvider.tsx`.
 */
export const OB_PAYWALLO_LAST = OB_STEPS.rotinaPronta;

/** Evento de Mixpanel no padrão do onboarding (`step_total` fixo do funil novo). */
export function obStep(step: number, name: string) {
  return { step_number: step, step_name: name, step_total: OB_STEP_TOTAL };
}

// ── Nome ─────────────────────────────────────────────────────────────────────
/** Primeiro nome digitado na tela 2 (store persistido), ou '' se ainda não há. */
export function useObName() {
  const pendingName = useAppStore((s) => s.pendingName);
  return (pendingName ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "Jane, quanto tempo…" — sem nome, cai em "Quanto tempo…". */
export function withName(name: string, rest: string) {
  if (name) return `${name}, ${rest}`;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// ── Frame ────────────────────────────────────────────────────────────────────
export function useObFrame() {
  const insets = useSafeAreaInsets();
  return {
    insets,
    /** Converte uma coordenada Y do frame de 852 pt do design para a tela real. */
    y: (designY: number) => insets.top + designY - 54,
    /** Distância do botão pílula até a base: topo a 757 pt no design (base do
     *  botão a 47 pt da borda = indicador de 34 pt + 13). */
    buttonBottom: insets.bottom + 13,
  };
}

/** Fundo da tela: branco (perguntas) ou degradê rosado (telas de valor). */
/** `home` = o fundo da home (degradê rosa + bolha branca), usado no cadastro desde as
 *  boas-vindas pós-pagamento (07/nov/2026, tela 9 do design NiksBoasVindas). */
export function ObScreen({ variant = 'white', children }: { variant?: 'white' | 'blush' | 'home'; children: React.ReactNode }) {
  const { y } = useObFrame();
  return (
    <View style={{ flex: 1, backgroundColor: OB.bg }}>
      {variant === 'blush' && (
        <LinearGradient colors={[...OB.blush]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      )}
      {variant === 'home' && (
        <>
          <LinearGradient
            colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']} locations={[0, 0.45, 0.72, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View pointerEvents="none" style={{
            position: 'absolute', left: -330, top: y(300), width: 620, height: 620, borderRadius: 310,
            backgroundColor: 'rgba(255,255,255,0.42)',
          }} />
        </>
      )}
      {children}
    </View>
  );
}

// ── Header: voltar ───────────────────────────────────────────────────────────
// Chevron 13 × 22 a 17 pt da esquerda, topo a 64 pt (traço 2,2). Sem barra de
// progresso (ver o cabeçalho do arquivo). `backdrop` pinta a faixa do topo para a
// lista rolar por baixo sem aparecer atrás do voltar.
export function ObHeader({
  onBack, backdrop,
}: { onBack?: () => void; backdrop?: string }) {
  const { insets, y } = useObFrame();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        height: y(100), backgroundColor: backdrop,
      }}
    >
      {onBack && (
        <TouchableOpacity
          onPress={() => { haptics.tap(); onBack(); }}
          activeOpacity={0.6}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ position: 'absolute', left: 17, top: insets.top + 10, width: 13, height: 22 }}
        >
          <Svg width={13} height={22} viewBox="0 0 13 22">
            <Path d="M11 2 L2 11 L11 20" fill="none" stroke={OB.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Tipografia ───────────────────────────────────────────────────────────────
export const obTitleStyle: TextStyle = {
  textAlign: 'center', fontSize: 28, lineHeight: 33, fontWeight: '700',
  letterSpacing: -0.4, color: OB.ink,
};
export const obSubtitleStyle: TextStyle = {
  textAlign: 'center', fontSize: 17, lineHeight: 23, color: OB.sub,
};

export function ObTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[obTitleStyle, { marginHorizontal: 17 }, style]}>{children}</Text>;
}
export function ObSubtitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[obSubtitleStyle, { marginHorizontal: 17 }, style]}>{children}</Text>;
}

// ── Check (círculo cheio + visto) ────────────────────────────────────────────
export function ObCheck({ size = 18, bg = OB.pink, fg = '#FFFFFF', stroke = 2.4 }: {
  size?: number; bg?: string; fg?: string; stroke?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      <Circle cx={11} cy={11} r={11} fill={bg} />
      <Path d="M6.5 11.2 L9.6 14.2 L15.5 8" fill="none" stroke={fg} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Card de opção (modelo do Flo) ────────────────────────────────────────────
// Não selecionado: #F0F0F0, raio 12, mín. 65 pt, texto 17/23 ink, aro #C4C4C4 de
// 20 pt. Selecionado (a pedido do produto, igual ao Flo — vale para escolha única E
// múltipla em todo o onboarding): o card INTEIRO fica #FF5EA8, texto branco, círculo
// branco com visto rosa e — quando a opção tem — a frase revelada embaixo, em
// branco (15/21). Mesmo padding nos dois estados: o texto não pula ao selecionar.
//
// ⚠️ `key` por estado é OBRIGATÓRIO: o card muda de cor no meio do toque, e o
// `TouchableOpacity` (Fabric) não devolvia a opacidade do toque — o card selecionado
// ficava rosa CLARO até um 2º toque (bug visto no simulador). Com a `key`, cada
// estado é um touchable novo, nascido com opacidade cheia.
// `sub` = frase curta SEMPRE visível embaixo do rótulo (ex.: "Oleosa — Brilha durante
// o dia", textos da versão B); `reveal` = frase que só aparece com a opção marcada.
// ── Toque das opções (out/2026, pedido do produto — réplica do toque do Flo) ──
// Medido quadro a quadro numa gravação do Flo (30 fps): ao encostar o dedo o botão encolhe
// ~5% em ~0,1 s; ao soltar, o rosa nasce como um CÍRCULO no ponto do dedo e cobre o botão
// em ~0,13 s enquanto ele volta ao tamanho; a opção que estava marcada se fecha num círculo
// para o meio. Vibração leve (`haptics.tap`) no instante do toque. Quem usa `ObPress` NÃO
// chama haptics no próprio onPress (vibraria duas vezes). Tudo no driver nativo.
// ⚠️ O círculo sai de `locationX/Y` do toque: o conteúdo do botão leva
// `pointerEvents="none"`, senão o alvo do toque é o texto e a coordenada sai relativa a ele.
// Afundar PERCEPTÍVEL e suave (pedido do produto, 13/out): desce 8% desacelerando, chega ao
// fundo mesmo num toque rápido e sobe macio com um quique leve.
// 18/nov/2026 — tempos medidos quadro a quadro (60 fps) numa gravação do Flo enviada pelo
// produto ("quero igual, mesma resposta e mesma suavidade"):
//   toque → o card afunda ~4% em ~3 quadros e um PONTO rosa nasce sob o dedo;
//   escolheu → o ponto vira círculo e cobre o card em ~6 quadros (~110 ms); o texto fica
//   branco SÓ dentro do círculo (máscara), escuro fora; a frase abre em ~7 quadros;
//   a opção anterior: a frase fecha junto e o rosa ENCOLHE num círculo até sumir (~150 ms,
//   rápido no começo e devagar no fim), voltando para o ponto onde nasceu.
const PRESS_SCALE = 0.96;
const PRESS_IN_MS = 60;         // o afundar SEMPRE vai até o fim (toque rápido incluso)…
const PRESS_BACK_MS = 140;      // …e volta sem quique
const DOT_R = 9;                // ponto rosa sob o dedo enquanto encosta (pt)
const DOT_MS = 70;
const FILL_IN_MS = 110;         // círculo abrindo a partir do dedo
const FILL_OUT_MS = 150;        // círculo da opção anterior encolhendo
const FILL_H_MIN = 180;         // o círculo cheio cobre ao menos esta altura (frase abrindo)
// 16/nov/2026: o "soltou o dedo" chega antes do "escolheu" — sem esta folga o rosa recebia
// apaga→acende no mesmo toque e, às vezes, a opção escolhida ficava cinza com o visto rosa.
const PRESS_OUT_FOLGA_MS = 150;

type Touch = { x: number; y: number };

/** Cor do texto/ícone do botão com `ObFill`: fica "aceso" (branco) NA HORA em que o rosa
 *  começa e só apaga quando o círculo da opção que sai já quase fechou — senão aparece
 *  texto preto sobre o rosa por um instante. */
export function useObFillText(on: boolean) {
  // 16/nov/2026: ao desmarcar, o texto volta ao escuro NA HORA (o rosa agora esmaece, e texto
  // escuro sobre rosa claro é legível). Antes ele ficava branco até o círculo fechar e, trocando
  // rápido de opção, aparecia texto branco sobre o cinza por alguns quadros.
  return on;
}

export function ObPress({
  onPress, onPressIn, onPressOut, disabled, style, outerStyle, children,
}: {
  onPress: () => void; onPressIn?: (touch: Touch) => void; onPressOut?: () => void;
  disabled?: boolean; style?: StyleProp<ViewStyle>;
  /** Tamanho na linha do pai (ex.: `width: '100%'`, `flex: 1`). ⚠️ % de largura no `style`
   *  é relativo ao toque por fora (que abraça o conteúdo) — sem isto o card encolhe. */
  outerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const downAt = useRef(0);
  const upTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (upTimer.current) clearTimeout(upTimer.current);
    if (outTimer.current) clearTimeout(outTimer.current);
  }, []);
  return (
    <TouchableOpacity
      activeOpacity={1}
      disabled={disabled}
      style={outerStyle}
      onPressIn={(e) => {
        haptics.tap();
        if (upTimer.current) clearTimeout(upTimer.current);
        if (outTimer.current) clearTimeout(outTimer.current);
        downAt.current = Date.now();
        Animated.timing(scale, { toValue: PRESS_SCALE, duration: PRESS_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        onPressIn?.({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
      }}
      onPressOut={() => {
        // …e só então volta: num toque rápido o dedo sai antes de o botão terminar de
        // afundar, e sem esta espera ele voltava sem ter descido (imperceptível).
        const wait = Math.max(0, PRESS_IN_MS - (Date.now() - downAt.current));
        upTimer.current = setTimeout(() => {
          Animated.timing(scale, { toValue: 1, duration: PRESS_BACK_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        }, wait);
        // Com folga: se o toque escolheu a opção, o rosa já está "ligado" pelo `selected`
        // quando o "dedo saiu" chega — ele nunca apaga e reacende.
        outTimer.current = setTimeout(() => onPressOut?.(), PRESS_OUT_FOLGA_MS);
      }}
      onPress={onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </TouchableOpacity>
  );
}

/** Rosa do botão: ao ligar, um CÍRCULO abre a partir de `touch` (o ponto do dedo) até
 *  cobrir o botão; ao desligar, fecha num círculo para o meio. O pai precisa de
 *  `overflow: 'hidden'` (raio) e o conteúdo dele, de `pointerEvents="none"`. */
export type ObFillHandle = {
  /** Começa o rosa no ponto do dedo, já no toque (thread de UI, sem render do React). */
  previa: (touch: Touch) => void;
  /** O dedo saiu sem escolher: o rosa da prévia some. */
  soltar: () => void;
};

/** Rosa do botão (16/nov/2026, refeito com Reanimated): tudo na thread de UI, e a prévia do
 *  toque é IMPERATIVA (`previa`/`soltar`) — não passa pelo React. Antes o rosa só começava
 *  depois que o JavaScript processava a escolha, e no iPhone (app de desenvolvimento, JS mais
 *  lento) dava a sensação de tela travada. Liga: um CÍRCULO abre a partir do dedo até cobrir
 *  o botão. Desliga: esmaece. O pai precisa de `overflow: 'hidden'`; o conteúdo dele, de
 *  `pointerEvents="none"`. */
export const ObFill = forwardRef<ObFillHandle, {
  on: boolean; color?: string;
  /** (opcional, 18/nov/2026) o conteúdo do botão na versão "acesa" (branca). Fica DENTRO do
   *  círculo, na mesma posição do conteúdo escuro: o texto fica branco só onde o rosa já
   *  chegou (máscara, como no Flo). Com ele, o `ObFill` vai DEPOIS do conteúdo escuro. */
  aceso?: React.ReactNode;
  /** Estilo do bloco do `aceso` (o mesmo padding/gap do botão), largura = a do botão. */
  acesoStyle?: StyleProp<ViewStyle>;
}>(function ObFill({ on, color = OB.pink, aceso, acesoStyle }, ref) {
  const p = useSharedValue(on ? 1 : 0);   // 0 = só o ponto (ou nada) … 1 = cobre o botão
  const dot = useSharedValue(0);          // ponto sob o dedo (0…1 de `DOT_R`)
  const ox = useSharedValue(-1);          // origem do círculo; -1 = meio do botão
  const oy = useSharedValue(-1);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const previaAtiva = useRef(false);
  const ligado = useRef(on);
  ligado.current = on;
  useImperativeHandle(ref, () => ({
    // Tocar de novo na opção já marcada não reinicia o rosa.
    previa: (t) => {
      if (ligado.current) return;
      previaAtiva.current = true;
      ox.value = t.x;
      oy.value = t.y;
      p.value = 0;
      dot.value = withTiming(1, { duration: DOT_MS, easing: REasing.out(REasing.quad) });
    },
    soltar: () => {
      if (!previaAtiva.current) return;
      previaAtiva.current = false;
      dot.value = withTiming(0, { duration: DOT_MS, easing: REasing.out(REasing.quad) });
    },
  }), []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (on) {
      // Do ponto do dedo; marcada por fora (sem toque), nasce do meio.
      if (!previaAtiva.current) { ox.value = -1; oy.value = -1; dot.value = 0; p.value = 0; }
      previaAtiva.current = false;
      p.value = withTiming(1, { duration: FILL_IN_MS, easing: REasing.out(REasing.quad) });
    } else {
      // Encolhe de volta para onde nasceu.
      previaAtiva.current = false;
      dot.value = 0;
      p.value = withTiming(0, { duration: FILL_OUT_MS, easing: REasing.out(REasing.quad) });
    }
  }, [on]);
  const circulo = useAnimatedStyle(() => {
    const cx = ox.value < 0 ? w.value / 2 : ox.value;
    const cy = oy.value < 0 ? h.value / 2 : oy.value;
    // Folga de altura: o card cresce (frase abrindo) depois de o círculo já cobri-lo.
    const H = Math.max(h.value, FILL_H_MIN);
    const R = Math.hypot(Math.max(cx, w.value - cx), Math.max(cy, H - cy)) + 1;
    const d = DOT_R * dot.value;
    const r = d + p.value * (R - d);
    return {
      left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, borderRadius: r,
      opacity: w.value > 0 && r > 0.5 ? 1 : 0,
    };
  });
  // O conteúdo aceso, dentro do círculo, fica parado em relação ao BOTÃO.
  const dentro = useAnimatedStyle(() => {
    const cx = ox.value < 0 ? w.value / 2 : ox.value;
    const cy = oy.value < 0 ? h.value / 2 : oy.value;
    const H = Math.max(h.value, FILL_H_MIN);
    const R = Math.hypot(Math.max(cx, w.value - cx), Math.max(cy, H - cy)) + 1;
    const d = DOT_R * dot.value;
    const r = d + p.value * (R - d);
    return { left: r - cx, top: r - cy, width: w.value };
  });
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={(e) => {
        const { width: lw, height: lh } = e.nativeEvent.layout;
        w.value = lw;
        h.value = lh;
      }}
    >
      <Reanimated.View style={[{ position: 'absolute', backgroundColor: color, overflow: 'hidden' }, circulo]}>
        {aceso != null && (
          <Reanimated.View style={[{ position: 'absolute' }, acesoStyle, dentro]}>{aceso}</Reanimated.View>
        )}
      </Reanimated.View>
    </View>
  );
});

export function ObOptionCard({
  label, sub, strong, selected, reveal, onPress, disabled,
}: { label: string; sub?: string; strong?: boolean; selected: boolean; reveal?: string; onPress: () => void; disabled?: boolean }) {
  // 16/nov/2026: o rosa segue SÓ a opção marcada (um sinal só). Antes ele ligava também com
  // o dedo encostado e depois passava a seguir a marcação — os dois sinais disputavam a mesma
  // animação e, trocando rápido, a opção travava cinza com o visto rosa. O círculo continua
  // nascendo do ponto do dedo (guardado no toque); o afundar e a vibração seguem no toque.
  const fill = useRef<ObFillHandle>(null);
  const marcada = useRef(selected);
  marcada.current = selected;
  const fillOn = selected;
  // 18/nov/2026 (réplica do Flo): o conteúdo existe nas DUAS cores. O escuro fica no card; o
  // branco vai DENTRO do círculo rosa (`ObFill aceso`), na mesma posição — o texto fica branco
  // só onde o rosa chegou. Antes a cor trocava no render, antes de o rosa chegar.
  const linha = (aceso: boolean) => (
    <View style={LINHA}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 17, lineHeight: 23, fontWeight: strong ? '600' : '400', color: aceso ? '#FFFFFF' : OB.ink }}>
          {label}
        </Text>
        {!!sub && (
          <Text style={{ fontSize: 14, lineHeight: 19, color: aceso ? 'rgba(255,255,255,0.85)' : OB.sub }}>{sub}</Text>
        )}
      </View>
      {aceso ? (
        <ObCheck size={20} bg="#FFFFFF" fg={OB.pink} stroke={2.4} />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: OB.radio }} />
      )}
    </View>
  );
  return (
    <ObPress
      onPress={onPress}
      onPressIn={(t) => fill.current?.previa(t)}
      onPressOut={() => { if (!marcada.current) fill.current?.soltar(); }}
      disabled={disabled}
      style={[OPCAO_CARD, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View pointerEvents="none">{linha(false)}</View>
      {!!reveal && <ObReveal text={reveal} open={selected} color={OB.sub} />}
      {/* Depois do conteúdo escuro: o círculo rosa (com o conteúdo branco dentro) fica por cima. */}
      <ObFill
        ref={fill}
        on={fillOn}
        acesoStyle={OPCAO_CONTEUDO}
        aceso={<>{linha(true)}{!!reveal && <ObReveal text={reveal} open={selected} color="#FFFFFF" />}</>}
      />
    </ObPress>
  );
}
const LINHA: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 };
// Padding/gap do card — o bloco branco dentro do círculo usa os MESMOS, para cair em cima do escuro.
const OPCAO_CONTEUDO: ViewStyle = { paddingHorizontal: 19, paddingVertical: 21, gap: 12 };
const OPCAO_CARD: ViewStyle = {
  ...OPCAO_CONTEUDO, backgroundColor: OB.option, borderRadius: 12, minHeight: 65, overflow: 'hidden', justifyContent: 'center',
};

// Frase revelada da opção marcada: o cartão ABRE e FECHA a altura (sem pular) e a frase
// esmaece junto (16/nov/2026, pedido do produto — antes ela aparecia/sumia de uma vez e,
// ao trocar de opção, o cartão encolhia num salto depois que o rosa fechava). Segue o
// `selected` (não o rosa do toque): abre ao escolher, fecha ao escolher outra.
// 18/nov/2026: tempos do Flo (abre/fecha em ~7 quadros a 60 fps).
const REVEAL_ABRE_MS = 120;
const REVEAL_FECHA_MS = 110;
const REVEAL_GAP = 12; // o mesmo `gap` do cartão
function ObReveal({ text, open, color = '#FFFFFF' }: { text: string; open: boolean; color?: string }) {
  // 16/nov/2026: Reanimated (thread de UI). Antes a altura animava pelo JS (`useNativeDriver:
  // false`) e travava/caía de FPS ao trocar de opção, principalmente no app de desenvolvimento.
  const h = useSharedValue(0);
  const a = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    a.value = withTiming(open ? 1 : 0, {
      duration: open ? REVEAL_ABRE_MS : REVEAL_FECHA_MS,
      easing: open ? REasing.out(REasing.cubic) : REasing.inOut(REasing.cubic),
    });
  }, [open]);
  const caixa = useAnimatedStyle(() => ({ height: a.value * (h.value + REVEAL_GAP) }));
  const frase = useAnimatedStyle(() => ({
    opacity: interpolate(a.value, [0, 0.45, 1], [0, 0.15, 1]),
    transform: [{ translateY: (1 - a.value) * -4 }],
  }));
  return (
    // marginTop negativo anula o `gap` do cartão enquanto fechada (o espaço entra na animação).
    <Reanimated.View pointerEvents="none" style={[{ marginTop: -REVEAL_GAP, overflow: 'hidden' }, caixa]}>
      <Reanimated.Text
        onLayout={(e) => { h.value = e.nativeEvent.layout.height; }}
        style={[{
          position: 'absolute', top: REVEAL_GAP, left: 0, right: 36,
          fontSize: 15, lineHeight: 21, color,
        }, frase]}
      >
        {text}
      </Reanimated.Text>
    </Reanimated.View>
  );
}

// ── Botão pílula ─────────────────────────────────────────────────────────────
// 172 × 48 pt, raio 24, #FF5EA8, "Continuar" 18/600 branco. Desabilitado = 40%
// de opacidade (nota da tela 2 do design). `bottom` posiciona no frame; sem ele o
// botão fica no fluxo (tela de nome, que centraliza o bloco acima do teclado).
/** Altura do botão rosa do onboarding ("Continuar"). Tela que reserva espaço para ele usa
 *  esta constante, nunca o número solto. 06/nov/2026, pedido do produto: o botão ficou
 *  maior (era 172 × 48, texto 18). */
export const OB_BOTAO_H = 56;

export function ObPillButton({
  label = t('Continuar'), onPress, disabled, bottom, width = 220, style,
}: { label?: string; onPress: () => void; disabled?: boolean; bottom?: number; width?: number; style?: StyleProp<ViewStyle> }) {
  const positioned: ViewStyle = bottom != null
    ? { position: 'absolute', bottom, alignSelf: 'center' }
    : { alignSelf: 'center' };
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[positioned, {
        width, height: OB_BOTAO_H, borderRadius: OB_BOTAO_H / 2, backgroundColor: OB.pink,
        alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1,
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 8,
      }, style]}
    >
      <Text style={{ fontSize: 19, fontWeight: '600', color: '#FFFFFF' }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Seletor em roda ──────────────────────────────────────────────────────────
// Réplica do seletor do design (tela 3): 7 linhas visíveis com alturas
// 26/40/56/58/56/40/26, tamanhos 20/26/30/36/30/26/20, opacidades
// .15/.35/.6/1/.6/.35/.15, números em #6E6468 e o central em #121212, sobre a
// faixa #F0F0F0 de 58 pt. Usado no ano de nascimento (tela 3) e nos horários da
// rotina (tela 13, duas rodas lado a lado sobre UMA faixa — `showBand={false}`).
//
// O gesto é de um ScrollView transparente com snap por linha; cada item é um Text
// absoluto cuja posição, escala e opacidade são INTERPOLADAS do scroll (native
// driver) — por isso as linhas mudam de tamanho continuamente enquanto rodam,
// sem pular. Abre JÁ no item inicial (sem estado "Selecione": a usuária só rola até o dela).
export const WHEEL_H = 302;       // 26+40+56+58+56+40+26
const WHEEL_STEP = 57;            // distância entre o centro da faixa e o da linha vizinha
const ROW_OFFSETS = [151, 138, 105, 57, 0, -57, -105, -138, -151]; // d = +4 … −4
const ROW_SCALES = [0.44, 20 / 36, 26 / 36, 30 / 36, 1, 30 / 36, 26 / 36, 20 / 36, 0.44];
const ROW_GRAY = [0, 0.15, 0.35, 0.6, 0, 0.6, 0.35, 0.15, 0];
const ROW_INK = [0, 0, 0, 0, 1, 0, 0, 0, 0];

/** Faixa de seleção do seletor (#F0F0F0, 58 pt, raio 12). */
export function ObWheelBand() {
  return (
    <View pointerEvents="none" style={{
      position: 'absolute', left: 17, right: 17, top: WHEEL_H / 2 - 29, height: 58,
      borderRadius: 12, backgroundColor: OB.option,
    }} />
  );
}

export function ObWheel({
  labels, initialIndex, onChange, showBand = true,
}: {
  labels: string[];
  initialIndex: number;
  onChange: (index: number) => void;
  showBand?: boolean;
}) {
  const start = Math.max(0, Math.min(labels.length - 1, initialIndex));
  const scrollY = useRef(new Animated.Value(start * WHEEL_STEP)).current;
  const lastIndex = useRef(start);

  const indexAt = (y: number) => Math.max(0, Math.min(labels.length - 1, Math.round(y / WHEEL_STEP)));

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const i = indexAt(e.nativeEvent.contentOffset.y);
        if (i !== lastIndex.current) {
          lastIndex.current = i;
          haptics.select();
          onChange(i);
        }
      },
    },
  ), [labels]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = indexAt(e.nativeEvent.contentOffset.y);
    lastIndex.current = i;
    onChange(i);
  };

  return (
    <View style={{ height: WHEEL_H }}>
      {showBand && <ObWheelBand />}

      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {labels.map((label, k) => {
          const inputRange = ROW_OFFSETS.map((_, j) => (k - 4 + j) * WHEEL_STEP);
          const translateY = scrollY.interpolate({ inputRange, outputRange: ROW_OFFSETS, extrapolate: 'clamp' });
          const scale = scrollY.interpolate({ inputRange, outputRange: ROW_SCALES, extrapolate: 'clamp' });
          const gray = scrollY.interpolate({ inputRange, outputRange: ROW_GRAY, extrapolate: 'clamp' });
          const ink = scrollY.interpolate({ inputRange, outputRange: ROW_INK, extrapolate: 'clamp' });
          const rowStyle = {
            position: 'absolute' as const, left: 0, right: 0, top: WHEEL_H / 2 - 29, height: 58,
            alignItems: 'center' as const, justifyContent: 'center' as const,
          };
          const numStyle: TextStyle = { fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] };
          return (
            <Animated.View key={label} style={[rowStyle, { transform: [{ translateY }, { scale }] }]}>
              <Animated.Text style={[numStyle, { color: OB.wheel, opacity: gray }]}>{label}</Animated.Text>
              <Animated.Text style={[numStyle, { position: 'absolute', color: OB.ink, opacity: ink }]}>{label}</Animated.Text>
            </Animated.View>
          );
        })}
      </View>

      {/* Gesto. ⚠️ Sem `overflow: 'hidden'` no pai (decisão 24 do README: no Fabric
          isso bloqueia o toque do ScrollView). */}
      <Animated.ScrollView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentOffset={{ x: 0, y: start * WHEEL_STEP }}
        contentContainerStyle={{ height: (labels.length - 1) * WHEEL_STEP + WHEEL_H }}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_STEP}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollEndDrag={settle}
        onMomentumScrollEnd={settle}
      />
    </View>
  );
}

// ── Tela de escolha única ────────────────────────────────────────────────────
// Estrutura das perguntas de escolha única: título a 118 pt, subtítulo 9 pt
// abaixo, opções 22 pt abaixo (gap 8), botão pílula fixo. A tela chamadora
// decide o que gravar (`onSelect`) e para onde ir (`onContinue`).
/** `strong`: nome em destaque (semibold), para opções com nome + descrição embaixo. */
export type ObChoice<V extends string> = { label: string; value: V; reveal?: string; sub?: string; strong?: boolean };

export function ObChoiceScreen<V extends string>({
  title, subtitle, options, initial = null, onSelect, onContinue, onBack, centerOptions = false, optionsTop,
}: {
  title: string;
  subtitle?: string;
  options: ObChoice<V>[];
  initial?: V | null;
  onSelect: (value: V) => void;
  onContinue: (value: V) => void;
  /** Sem `onBack`, a tela não mostra o voltar (ex.: 1ª pergunta da personalização). */
  onBack?: () => void;
  /** Título no topo e as opções CENTRALIZADAS na altura livre entre ele e o botão
   *  (um pouco acima do centro exato: 100 pt de folga embaixo, pedido do produto). */
  centerOptions?: boolean;
  /** Distância do título (ou subtítulo) até as opções; padrão 22 com subtítulo, 34 sem. */
  optionsTop?: number;
}) {
  const { y, buttonBottom } = useObFrame();
  const [selected, setSelected] = useState<V | null>(initial);
  const top = optionsTop ?? (subtitle ? 22 : 34);
  // Centralizadas: o bloco fica no centro medido SEM a frase revelada (`reveal`) — ao marcar
  // uma opção com frase, o cartão cresce para baixo em vez de o bloco inteiro subir.
  const [livreH, setLivreH] = useState(0);
  const [blocoH, setBlocoH] = useState(0);
  const medido = livreH > 0 && blocoH > 0;
  const cards = options.map((opt) => (
    <ObOptionCard
      key={opt.value}
      label={opt.label}
      sub={opt.sub}
      strong={opt.strong}
      reveal={opt.reveal}
      selected={selected === opt.value}
      onPress={() => { setSelected(opt.value); onSelect(opt.value); }}
    />
  ));
  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(118), paddingBottom: buttonBottom + OB_BOTAO_H + 24, flexGrow: centerOptions ? 1 : undefined }}
      >
        <ObTitle>{title}</ObTitle>
        {!!subtitle && <ObSubtitle style={{ marginTop: 9, marginHorizontal: 30 }}>{subtitle}</ObSubtitle>}
        {centerOptions ? (
          <View
            style={{ flex: 1, justifyContent: medido ? 'flex-start' : 'center', marginTop: top, marginBottom: 100 }}
            onLayout={(e) => setLivreH(e.nativeEvent.layout.height)}
          >
            <View
              style={{ marginHorizontal: 17, gap: 8, marginTop: medido ? Math.max(0, (livreH - blocoH) / 2) : 0 }}
              // Mede UMA vez, sem a frase (que nasce com altura 0 e abre animada): medindo a cada
              // quadro da animação, o bloco inteiro andaria enquanto o cartão abre/fecha.
              onLayout={(e) => { const hh = e.nativeEvent.layout.height; setBlocoH((v) => (v > 0 ? v : hh)); }}
            >
              {cards}
            </View>
          </View>
        ) : (
          <View style={{ marginTop: top, marginHorizontal: 17, gap: 8 }}>{cards}</View>
        )}
      </ScrollView>
      <ObHeader onBack={onBack} backdrop={OB.bg} />
      <ObPillButton
        disabled={!selected}
        bottom={buttonBottom}
        onPress={() => { if (!selected) return; haptics.action(); onContinue(selected); }}
      />
    </ObScreen>
  );
}

/** Idade a partir do ano de nascimento (sem mês/dia, ano cheio). */
export function ageFromYear(year: number) {
  return new Date().getFullYear() - year;
}

// ── Logo NIKS tintada ────────────────────────────────────────────────────────
// O design usa `niks-logo-FF5EA8.png` / `niks-logo-branco-v3.png`: são o mesmo
// bloom de 196 × 199 do app com a tinta trocada — aqui via `tintColor`, que é
// equivalente (recolore mantendo o alpha). ⚠️ `tintColor` não repinta com
// fast-refresh: mudou a cor, recarregue o app.
export const NIKS_LOGO = require('../../assets/home/niks-logo.png');
// PNG EXATO do design (`niks-logo-FF5EA8.png`, 196 × 199 — o "04 - Cores do Niks
// score (chapada)/niks-logo-rosa-FF5EA8.png" dos logos oficiais), não o bloom tintado.
export const NIKS_LOGO_PINK = require('../../assets/onboarding/niks-logo-FF5EA8.png');

// ── Logo com halo (telas de valor: "Entendi" e "Sua análise está pronta") ───
// Halo Ø320 (radial rgba(255,110,175) .30 → .12 → 0), anel Ø195 com traço
// rgba(255,110,175,.30), disco branco Ø137 com sombra rosa e a logo 75 × 76, tudo
// centrado. `top` = topo do halo no frame do design. `children` desenha por cima
// (etiquetas, selo de check) com coordenadas relativas ao quadro de 320 pt.
export function ObLogoHalo({ top, children }: { top: number; children?: React.ReactNode }) {
  const { y } = useObFrame();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: y(top), alignSelf: 'center', width: 320, height: 320 }}>
      {/* No CSS o raio do `circle` vai até o canto (160·√2): os stops de 45% e 70%
          caem em 0,636 e 0,99 do raio do círculo. */}
      <Svg width={320} height={320} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="obHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgb(255,110,175)" stopOpacity={0.30} />
            <Stop offset="0.636" stopColor="rgb(255,110,175)" stopOpacity={0.12} />
            <Stop offset="0.99" stopColor="rgb(255,110,175)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={160} cy={160} r={160} fill="url(#obHalo)" />
      </Svg>
      <View style={{
        position: 'absolute', left: 62.5, top: 62.5, width: 195, height: 195, borderRadius: 97.5,
        borderWidth: 1, borderColor: 'rgba(255,110,175,0.30)',
      }} />
      <View style={{
        position: 'absolute', left: 91.5, top: 91.5, width: 137, height: 137, borderRadius: 68.5,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
        shadowColor: 'rgb(255,110,175)', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.30, shadowRadius: 20,
      }}>
        <Image source={NIKS_LOGO_PINK} style={{ width: 75, height: 76 }} />
      </View>
      {children}
    </View>
  );
}

// Hook utilitário: dispara `fn` uma vez no mount (evento de Mixpanel de "viu").
export function useOnMount(fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    fn();
  }, []);
}
