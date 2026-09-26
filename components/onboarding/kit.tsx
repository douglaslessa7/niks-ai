// ─────────────────────────────────────────────────────────────────────────────
// Kit do ONBOARDING NOVO (design "NIKS Onboarding Modelos", Claude Design —
// padrão aprovado "réplica do Flo"). FONTE ÚNICA dos átomos das telas de
// pergunta: fundo, header (voltar + barra), título/subtítulo, card de opção,
// botão pílula e seletor de ano. Não duplicar estes estilos nas telas.
//
// O design é desenhado num frame de 393 × 852 pt com a status bar ocupando os
// 54 pt de cima. As posições verticais do arquivo são convertidas por `oby()`:
// `insets.top + (yDoDesign − 54)` — o que no design está a 112 pt do topo fica
// 58 pt abaixo da safe area em qualquer iPhone.
//
// Tipografia: SF Pro = fonte do sistema no iOS, por isso nenhum `fontFamily`.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Animated,
  NativeSyntheticEvent, NativeScrollEvent, StyleProp, ViewStyle, TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';

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
  blush: ['#FBEDEF', '#FAF1F2'] as const, // fundo das telas de valor
};

// ── Contadores do funil ──────────────────────────────────────────────────────
// Numeração ÚNICA do onboarding novo (Mixpanel `step_number`), na ordem nova.
// A transição "Prazer, <nome>!" não conta como passo (não tem pergunta).
export const OB_STEPS = {
  // 1 era o welcome antigo — SAIU (set/2026); o app abre direto no nome. A
  // numeração segue a das telas do design (e a calibração da barra), por isso o
  // funil do Mixpanel começa no passo 2.
  nome: 2, idade: 3, gravidez: 4, incomoda: 5, prepScan: 6, camera: 7,
  potencial: 8, tipoPele: 9, sol: 10, hidratacaoSono: 11, rotinaAtual: 12,
  horarioRotina: 13, avisoLembretes: 14, pedidoNotificacao: 15, alergias: 16,
  alergiaDetalhe: 17, objetivo: 18, comSemNiks: 19, loading: 20, relatorio: 21,
  rotinaPronta: 22, compromisso: 23,
  // Depois do paywall e do cadastro: carrossel de apresentação (última antes da home).
  apresentacao: 24,
} as const;
export const OB_STEP_TOTAL = 24;

// Barra de progresso: `(passo − 1) / 19`. O 19 foi calibrado para bater com as
// larguras do design (nome 5%, idade 10%, "o que te incomoda" 22%, sol 48%).
const BAR_TOTAL = 19;
export function obProgress(step: number) {
  return Math.max(0, Math.min(1, (step - 1) / BAR_TOTAL));
}

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
    /** Distância do botão pílula até a base (a 55 pt da base no design). */
    buttonBottom: insets.bottom + 21,
  };
}

/** Fundo da tela: branco (perguntas) ou degradê rosado (telas de valor). */
export function ObScreen({ variant = 'white', children }: { variant?: 'white' | 'blush'; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: OB.bg }}>
      {variant === 'blush' && (
        <LinearGradient colors={[...OB.blush]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      )}
      {children}
    </View>
  );
}

// ── Header: voltar + barra de progresso ─────────────────────────────────────
// Voltar: chevron 13 × 22 a 17 pt da esquerda (topo a 58 pt). Barra: 267 × 3 pt
// a 63 pt de cada lado (topo a 68 pt), trilho #DCD5D6, preenchimento #FF5EA8.
// `step` ausente = tela de valor (o design mostra só o voltar, sem barra).
export function ObHeader({
  step, onBack, backdrop,
}: { step?: number; onBack?: () => void; backdrop?: string }) {
  const { insets, y } = useObFrame();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        height: y(90), backgroundColor: backdrop,
      }}
    >
      {onBack && (
        <TouchableOpacity
          onPress={() => { haptics.tap(); onBack(); }}
          activeOpacity={0.6}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ position: 'absolute', left: 17, top: insets.top + 4, width: 13, height: 22 }}
        >
          <Svg width={13} height={22} viewBox="0 0 13 22">
            <Path d="M11 2 L2 11 L11 20" fill="none" stroke={OB.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      )}
      {step != null && (
        <View style={{
          position: 'absolute', left: 63, right: 63, top: insets.top + 14,
          height: 3, borderRadius: 2, backgroundColor: OB.track,
        }}>
          <View style={{
            width: `${obProgress(step) * 100}%`, height: 3, borderRadius: 2, backgroundColor: OB.pink,
          }} />
        </View>
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

// ── Card de opção ────────────────────────────────────────────────────────────
// Não selecionado: #F0F0F0, raio 12, mín. 67 pt, radio cinza 18 pt.
// Selecionado: card inteiro #FF5EA8, texto branco peso 400, check branco com
// visto rosa e — quando a opção tem — a frase revelada embaixo (15/21).
export function ObOptionCard({
  label, selected, reveal, onPress, disabled,
}: { label: string; selected: boolean; reveal?: string; onPress: () => void; disabled?: boolean }) {
  if (selected) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          backgroundColor: OB.pink, borderRadius: 12,
          paddingTop: 22, paddingHorizontal: 21, paddingBottom: 21, gap: 16,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <Text style={{ flex: 1, fontSize: 17, lineHeight: 25, fontWeight: '400', color: '#FFFFFF', paddingRight: 8 }}>
            {label}
          </Text>
          <View style={{ marginTop: 3 }}>
            <ObCheck size={18} bg="#FFFFFF" fg={OB.pink} stroke={2.6} />
          </View>
        </View>
        {!!reveal && (
          <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '400', color: '#FFFFFF', paddingRight: 34 }}>
            {reveal}
          </Text>
        )}
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: OB.option, borderRadius: 12, minHeight: 67, paddingHorizontal: 21,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ flex: 1, fontSize: 17, lineHeight: 25, fontWeight: '400', color: OB.ink }}>{label}</Text>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: OB.radio }} />
    </TouchableOpacity>
  );
}

// ── Botão pílula ─────────────────────────────────────────────────────────────
// 172 × 48 pt, raio 24, #FF5EA8, "Continuar" 18/600 branco. Desabilitado = 40%
// de opacidade (nota da tela 2 do design). `bottom` posiciona no frame; sem ele o
// botão fica no fluxo (tela de nome, que centraliza o bloco acima do teclado).
export function ObPillButton({
  label = 'Continuar', onPress, disabled, bottom, style,
}: { label?: string; onPress: () => void; disabled?: boolean; bottom?: number; style?: StyleProp<ViewStyle> }) {
  const positioned: ViewStyle = bottom != null
    ? { position: 'absolute', bottom, alignSelf: 'center' }
    : { alignSelf: 'center' };
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[positioned, {
        width: 172, height: 48, borderRadius: 24, backgroundColor: OB.pink,
        alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1,
        shadowColor: OB.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 8,
      }, style]}
    >
      <Text style={{ fontSize: 18, fontWeight: '600', color: '#FFFFFF' }}>{label}</Text>
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

// ── Tela de escolha única (modelo 3i) ────────────────────────────────────────
// Estrutura das perguntas de escolha única: título a 112 pt, subtítulo 11 pt
// abaixo, opções 23 pt abaixo (gap 8), botão pílula fixo. A tela chamadora
// decide o que gravar (`onSelect`) e para onde ir (`onContinue`).
export type ObChoice<V extends string> = { label: string; value: V; reveal?: string };

export function ObChoiceScreen<V extends string>({
  step, title, subtitle, options, initial = null, onSelect, onContinue, onBack,
}: {
  step: number;
  title: string;
  subtitle?: string;
  options: ObChoice<V>[];
  initial?: V | null;
  onSelect: (value: V) => void;
  onContinue: (value: V) => void;
  onBack: () => void;
}) {
  const { y, buttonBottom } = useObFrame();
  const [selected, setSelected] = useState<V | null>(initial);
  return (
    <ObScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: y(112), paddingBottom: buttonBottom + 48 + 24 }}
      >
        <ObTitle>{title}</ObTitle>
        {!!subtitle && <ObSubtitle style={{ marginTop: 11 }}>{subtitle}</ObSubtitle>}
        <View style={{ marginTop: subtitle ? 23 : 34, marginHorizontal: 17, gap: 8 }}>
          {options.map((opt) => (
            <ObOptionCard
              key={opt.value}
              label={opt.label}
              reveal={opt.reveal}
              selected={selected === opt.value}
              onPress={() => { haptics.select(); setSelected(opt.value); onSelect(opt.value); }}
            />
          ))}
        </View>
      </ScrollView>
      <ObHeader step={step} onBack={onBack} backdrop={OB.bg} />
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

// Hook utilitário: dispara `fn` uma vez no mount (evento de Mixpanel de "viu").
export function useOnMount(fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    fn();
  }, []);
}
