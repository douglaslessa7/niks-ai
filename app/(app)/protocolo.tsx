// ─────────────────────────────────────────────────────────────────────────────
// Rotina de Beleza — layout fiel ao Design Component do Claude Design, com os
// DADOS REAIS do usuário (protocolo salvo em Supabase `protocolos` / cache do store).
// Fonte visual: "Rotinas de skin care/Rotina de Beleza.dc.html" + tokens do DS.
// Dois temas: Manhã (claro, sol) e Noite (escuro, lua). Os passos AM/PM, contagem e
// duração vêm da rotina real; o texto "Como fazer" usa a instruction clínica do passo.
// Medidas do frame 393px, escaladas por S = width/393 para proporção idêntica.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity, Animated,
  useWindowDimensions, LayoutAnimation, Platform, UIManager, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
  Nunito_500Medium, Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import Svg, {
  Path, Line, Circle, Rect, Defs, RadialGradient as SvgRadialGradient, Stop,
} from 'react-native-svg';
// Skia — orb com gradiente radial + numeral da cerimônia (aliased p/ não colidir com react-native-svg)
import {
  Canvas, Circle as SkiaCircle, Rect as SkiaRect, Group,
  RadialGradient as SkiaRadialGradient, vec, BlurMask, Shadow as SkiaShadow,
  Text as SkiaText, useFont,
} from '@shopify/react-native-skia';
// NightSky — céu estrelado (estrelas + estrelas cadentes) reaproveitado do modo noturno antigo
import NightSky from '../../components/ui/NightSky';
import { useAppStore, type OnboardingData, type ScanResult, type ProtocolResult } from '../../store/onboarding';
import { useFaceScan } from '../../hooks/useFaceScan';
import { supabase } from '../../lib/supabase';
import { generateAndSaveProtocol } from '../../lib/generateProtocol';
import { buildOnboardingDataFromUserRow } from '../../lib/buildOnboardingDataFromUserRow';
import { markStepCompleted } from '../../lib/routineProgress';
import { requestAppReview } from '../../lib/storeReview';
import { getSavedProducts, normStepKey, type SavedProduct } from '../../lib/savedProducts';
import { useCachedQuery } from '../../lib/cache';
import { getUserId, useUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';

// Habilita LayoutAnimation no Android (iOS já vem ligado)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Marca (override do .dc.html): --brand vira #FF9D9D em ambos os temas ────────
const BRAND = '#FF9D9D';

// ── Tokens por tema ─────────────────────────────────────────────────────────
type Theme = {
  bg: string;
  surfaceCard: string;
  surfaceSunken: string;
  textHeading: string;
  textBody: string;
  textMuted: string;
  textCaption: string;
  red200: string;   // aro do círculo do número + linha tracejada
  hairline: string;
  chevron: string;
  cardShadow: {
    shadowColor: string; shadowOpacity: number;
    shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number;
  };
  brandShadowOpacity: number;
};

const DAY: Theme = {
  bg: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceSunken: '#F4F4F4',
  textHeading: '#1A1A1A',
  textBody: '#3D3D3D',
  textMuted: '#6B6B6B',
  textCaption: '#9A9A9A',
  red200: '#FFC9C9',
  hairline: '#ECECEC',
  chevron: '#9A9A9A',
  cardShadow: { shadowColor: '#281414', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  brandShadowOpacity: 0.42,
};

const NIGHT: Theme = {
  bg: '#0F1420',
  surfaceCard: '#161E31',
  surfaceSunken: '#212B42',
  textHeading: '#F3EEE2',
  textBody: '#C6CDDD',
  textMuted: '#8B93A8',
  textCaption: '#727B90',
  red200: 'rgba(255,157,157,0.5)',
  hairline: 'rgba(255,255,255,0.09)',
  chevron: '#727B90',
  cardShadow: { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  brandShadowOpacity: 0.28,
};

// ── Tipos + mapeamento dos DADOS REAIS do usuário ───────────────────────────
// A rotina vem de `protocolos.rotina_am` / `rotina_pm` (Supabase) ou do cache do
// store (`protocolResult`). Cada passo cru tem a forma ProtocolStep; convertemos
// para o tipo Step consumido pela UI (title/ingredients/category/icon/how).
type IconName = 'sun' | 'moon' | 'drop' | 'cleanser' | 'sparkle' | 'flask' | 'shield';
type Step = { title: string; ingredients: string; category: string; icon: IconName; how: string };

// Passo cru salvo pelo generate-protocol (ver README → mapeamento generate-protocol).
type RawStep = {
  id?: number; name?: string; ingredient?: string; instruction?: string;
  steps?: string[]; color?: string; waitTime?: string | null; product_suggestions?: string[];
};

// Deriva { categoria curta, ícone } por palavras-chave do nome + ingrediente.
// Não depende do hex `color` (que a IA nem sempre acerta). Ordem = prioridade clínica.
function classifyStep(name: string, ingredient: string): { category: string; icon: IconName } {
  const t = `${name} ${ingredient}`.toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => t.includes(k));

  if (has('protetor solar', 'protetor', 'fps', 'filtro solar', 'spf')) return { category: 'Proteção', icon: 'sun' };
  if (has('limpeza', 'cleanser', 'sabonete', 'espuma de limp', 'demaquilante', 'água micelar', 'agua micelar')) {
    const oleoso = has('óleo', 'oleo', 'balm', 'bálsamo', 'balsamo', 'oil');
    return { category: 'Limpeza', icon: oleoso ? 'drop' : 'cleanser' };
  }
  if (has('tônico', 'tonico', 'essência', 'essencia', 'tônica', 'tonica')) return { category: 'Tônico', icon: 'drop' };
  if (has('barreira')) return { category: 'Barreira', icon: 'shield' };
  if (has('hidratante', 'ceramida', 'emoliente', 'gel-creme', 'gel creme', 'creme hidratante', 'hidrata')) {
    return { category: 'Hidratação', icon: 'flask' };
  }
  if (has('oclusivo', 'esqualano', 'óleo facial', 'oleo facial', 'vaselina')) return { category: 'Finalização', icon: 'drop' };
  if (has('sérum', 'serum', 'ácido', 'acido', 'retinol', 'retinoide', 'retinal', 'tretinoína', 'tretinoina',
          'vitamina c', 'niacinamida', 'azelaico', 'peptíde', 'peptide', 'antioxidante', 'aha', 'bha', 'tratamento')) {
    if (has('reparador', 'ceramida')) return { category: 'Tratamento', icon: 'flask' };
    return { category: 'Tratamento', icon: 'sparkle' };
  }
  return { category: 'Cuidado', icon: 'sparkle' };
}

// Converte um passo cru do protocolo real na forma consumida pela UI.
function mapStep(raw: RawStep): Step {
  const name = (raw?.name ?? '').trim();
  const ingredient = (raw?.ingredient ?? '').trim();
  const { category, icon } = classifyStep(name, ingredient);
  // "Como fazer": prioriza a instruction clínica; se ausente, junta os steps.
  const how = (raw?.instruction ?? '').trim()
    || (Array.isArray(raw?.steps) ? raw.steps.join(' ').trim() : '');
  return { title: name, ingredients: ingredient, category, icon, how };
}

// Reconstrói o array `dicas` a partir do store (a tabela guarda `dicas` como coluna
// `text[]`; o store guarda os campos soltos). Usado só no ramo de fallback do store.
function storeDicas(r: ProtocolResult): (string | null)[] {
  return r.dicas?.length ? r.dicas : [
    r.introduction_warnings ?? null,
    r.expected_timeline?.two_weeks ?? null,
    r.expected_timeline?.one_month ?? null,
    r.expected_timeline?.three_months ?? null,
    r.introduction_schedule ?? null,
  ];
}

// Foco continua fixo por período (rótulo editorial); passos/duração são derivados
// da rotina real do usuário.
const FOCUS: Record<'am' | 'pm', string> = {
  am: 'Proteção & antioxidação',
  pm: 'Reparação & barreira',
};

// Quebra o texto de "introdução gradual" (dicas[4]) em blocos por semana.
// Regex idêntico ao da tela antiga (ver README → parsing de dicas[4]). Suporta:
// "Semana 1:", "Semanas 1–2:", "Nas semanas 3–4,", "A partir da semana 5:".
// Se achar menos de 2 ocorrências, devolve o texto inteiro como bloco único.
function parseCronograma(raw?: string | null): { week: string; body: string }[] {
  if (!raw) return [];
  const re = /(?:(?:Nas\s+)?Semanas?\s+([\d][\d\-–—]*\+?(?:\s+em diante)?)|A partir da semana\s+(\d+))\s*[,:]/gi;
  const matches = [...raw.matchAll(re)];
  if (matches.length < 2) return [{ week: 'Introdução gradual', body: raw }];
  return matches.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = matches[i + 1]?.index ?? raw.length;
    const rawLabel = (m[1] ?? m[2] ?? '').trim().replace(/\s+em diante/, '');
    const label = m[2] ? `${m[2]}+` : rawLabel;
    return { week: `Semana ${label}`, body: raw.slice(start, end).trim().replace(/\.$/, '') + '.' };
  });
}

// ── Ícones (portados do makeIcon do .dc.html: viewBox 0 0 24 24, sw 1.9, round) ─
function Icon({ name, size, color }: { name: IconName | 'chevron' | 'play' | 'alert'; size: number; color: string }) {
  if (name === 'play') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Path d="M8 5v14l11-7z" />
      </Svg>
    );
  }
  const sw = name === 'chevron' ? 2.2 : 1.9;
  const stroke = color;
  const common = { stroke, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };
  let children: React.ReactNode = null;
  switch (name) {
    case 'chevron':
      children = <Path d="M6 9l6 6 6-6" {...common} />;
      break;
    case 'alert':
      children = (
        <>
          <Path d="M12 3L22 20H2L12 3Z" {...common} />
          <Path d="M12 10v4" {...common} />
          <Path d="M12 17h.01" {...common} />
        </>
      );
      break;
    case 'sun':
      children = (
        <>
          <Path d="M12 2v2" {...common} /><Path d="M12 20v2" {...common} />
          <Path d="M4.9 4.9l1.4 1.4" {...common} /><Path d="M17.7 17.7l1.4 1.4" {...common} />
          <Path d="M2 12h2" {...common} /><Path d="M20 12h2" {...common} />
          <Path d="M4.9 19.1l1.4-1.4" {...common} /><Path d="M17.7 6.3l1.4-1.4" {...common} />
          <Circle cx={12} cy={12} r={4} {...common} />
        </>
      );
      break;
    case 'moon':
      children = <Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" {...common} />;
      break;
    case 'drop':
      children = <Path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" {...common} />;
      break;
    case 'cleanser':
      children = (
        <>
          <Path d="M9 3h6" {...common} /><Path d="M10 3v3" {...common} /><Path d="M14 3v3" {...common} />
          <Rect x={7} y={6} width={10} height={15} rx={3} {...common} /><Path d="M7 12h10" {...common} />
        </>
      );
      break;
    case 'sparkle':
      children = <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" {...common} />;
      break;
    case 'flask':
      children = (
        <>
          <Path d="M9 3h6" {...common} />
          <Path d="M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-10V3" {...common} />
          <Path d="M7.5 14h9" {...common} />
        </>
      );
      break;
    case 'shield':
      children = (
        <>
          <Path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" {...common} />
          <Path d="M9 12l2 2 4-4" {...common} />
        </>
      );
      break;
  }
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</Svg>;
}

// ── Herói: Manhã — a MESMA logo da navbar (niks-logo.png) na cor do botão (BRAND) ──
// tintColor recolore a logo pela sua opacidade (fica suave, como a niks-logo é — foi o
// pedido do usuário: exatamente a logo da navbar, só na cor coral do botão).
function SunHero({ s }: { s: (n: number) => number }) {
  const D = s(132); // proporcional à tela — um pouco menor que a lua do modo noturno
  return (
    <View style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={require('../../assets/home/niks-logo.png')}
        style={{ width: D, height: D, tintColor: BRAND }}
        resizeMode="contain"
      />
    </View>
  );
}

// ── Herói: Lua (noite) — imagem renderizada do CSS EXATO do arquivo de design ────
// `rotina-moon.png` = render headless-Chrome do `.dc.html` (corpo com gradiente radial +
// inset box-shadow + 5 crateras + glow). É literalmente a lua do arquivo, não uma aproximação.
// Disco = 53,1% da imagem (900px) → largura s(301) rende o disco em ~160 (tamanho do design).
function MoonHero({ s }: { s: (n: number) => number }) {
  return (
    <View style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={require('../../assets/home/rotina-moon.png')}
        style={{ width: s(301), height: s(301) }}
        resizeMode="contain"
      />
    </View>
  );
}

// ── Fundo por tema ──────────────────────────────────────────────────────────
function Background({ isNight, width, height, s }: { isNight: boolean; width: number; height: number; s: (n: number) => number }) {
  if (isNight) {
    // Modo noturno antigo do protocolo: gradiente escuro + NightSky (estrelas + estrelas cadentes)
    return (
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
        <LinearGradient
          colors={['#0F1420', '#1A1F2E', '#2A1F28']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        <NightSky />
      </View>
    );
  }
  // Dia: dois glows radiais suaves de canto (top-direito + baixo-esquerdo)
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
      <Svg width={width} height={height} style={{ position: 'absolute' }}>
        <Defs>
          <SvgRadialGradient id="glowTR" cx="100%" cy="0%" r="80%">
            <Stop offset="0%" stopColor="#FD3238" stopOpacity={0.07} />
            <Stop offset="55%" stopColor="#FD3238" stopOpacity={0} />
          </SvgRadialGradient>
          <SvgRadialGradient id="glowBL" cx="0%" cy="100%" r="80%">
            <Stop offset="0%" stopColor="#FD3238" stopOpacity={0.06} />
            <Stop offset="55%" stopColor="#FD3238" stopOpacity={0} />
          </SvgRadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#glowTR)" />
        <Rect x={0} y={0} width={width} height={height} fill="url(#glowBL)" />
      </Svg>
    </View>
  );
}

// ── Card de passo (expansível inline) ───────────────────────────────────────
function StepCard({
  step, n, showLine, T, s, F, photoUrl,
}: {
  step: Step; n: number; showLine: boolean; T: Theme; s: (n: number) => number;
  F: { xbold?: string; bold?: string; semi?: string; medium?: string; regular?: string };
  photoUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [lineH, setLineH] = useState(0);
  const chev = useRef(new Animated.Value(0)).current;
  const router = useRouter();

  const toggle = () => {
    haptics.tap();
    LayoutAnimation.configureNext(LayoutAnimation.create(280, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    Animated.timing(chev, { toValue: open ? 0 : 1, duration: 220, useNativeDriver: true }).start();
    setOpen(o => !o);
  };

  const rotate = chev.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', paddingBottom: s(14) }}>
      {/* rail */}
      <View style={{ position: 'relative', width: s(32), flexShrink: 0, alignItems: 'center', marginRight: s(14) }}>
        {showLine && (
          <View
            onLayout={(e) => setLineH(e.nativeEvent.layout.height)}
            style={{ position: 'absolute', top: s(36), bottom: s(-6), left: s(16) - 1, width: 2 }}
          >
            {lineH > 0 && (
              <Svg width={2} height={lineH}>
                <Line x1={1} y1={0} x2={1} y2={lineH} stroke={T.red200} strokeWidth={2} strokeDasharray="4 4" />
              </Svg>
            )}
          </View>
        )}
        <View style={{
          zIndex: 1, width: s(32), height: s(32), borderRadius: 999,
          backgroundColor: T.surfaceCard, borderWidth: 2, borderColor: T.red200,
          alignItems: 'center', justifyContent: 'center',
          ...T.cardShadow,
        }}>
          <Text style={{ fontFamily: F.xbold, fontSize: s(14), color: BRAND }}>{n}</Text>
        </View>
      </View>

      {/* card */}
      <View style={{
        flex: 1, backgroundColor: T.surfaceCard, borderRadius: s(20),
        borderWidth: 1, borderColor: T.hairline, overflow: 'hidden', ...T.cardShadow,
      }}>
        <TouchableOpacity
          onPress={toggle} activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(14), paddingVertical: s(13) }}
        >
          <View style={{
            width: s(46), height: s(46), borderRadius: s(16), backgroundColor: T.surfaceSunken,
            alignItems: 'center', justifyContent: 'center', marginRight: s(12), flexShrink: 0, overflow: 'hidden',
          }}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Icon name={step.icon} size={s(22)} color={BRAND} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{
              fontFamily: F.bold, fontSize: s(12), color: T.textCaption,
              textTransform: 'uppercase', letterSpacing: 0.48, marginBottom: 2,
            }}>{step.category}</Text>
            <Text style={{ fontFamily: F.xbold, fontSize: s(16.5), color: T.textHeading, lineHeight: s(19) }}>{step.title}</Text>
            <Text style={{ fontFamily: F.semi, fontSize: s(12.5), color: T.textMuted, marginTop: 2 }}>{step.ingredients}</Text>
          </View>
          <Animated.View style={{ flexShrink: 0, marginLeft: s(6), transform: [{ rotate }] }}>
            <Icon name="chevron" size={s(20)} color={T.chevron} />
          </Animated.View>
        </TouchableOpacity>

        {open && (
          <View style={{ paddingLeft: s(72), paddingRight: s(16), paddingBottom: s(15) }}>
            <View style={{ height: 1, backgroundColor: T.hairline, marginBottom: s(11) }} />
            <Text style={{
              fontFamily: F.xbold, fontSize: s(12), color: BRAND,
              textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: s(5),
            }}>Como fazer</Text>
            <Text style={{ fontFamily: F.regular, fontSize: s(14), lineHeight: s(22), color: T.textBody }}>{step.how}</Text>
            {/* Atalho para a tela de recomendação de produtos */}
            <TouchableOpacity
              onPress={() => { haptics.tap(); router.push('/recomendacao-produtos' as any); }}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(6), marginTop: s(12) }}
            >
              <Text style={{ fontFamily: F.xbold, fontSize: s(13.5), color: BRAND }}>Ver produto recomendado</Text>
              <Svg width={s(16)} height={s(16)} viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M5 12h14M13 6l6 6-6 6" />
              </Svg>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Card colapsível genérico (usado nas Recomendações) ──────────────────────
function Collapsible({
  title, subtitle, T, s, F, children,
}: {
  title: string; subtitle?: string; T: Theme; s: (n: number) => number;
  F: { xbold?: string; bold?: string; semi?: string; medium?: string; regular?: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const chev = useRef(new Animated.Value(0)).current;
  const toggle = () => {
    haptics.tap();
    LayoutAnimation.configureNext(LayoutAnimation.create(280, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    Animated.timing(chev, { toValue: open ? 0 : 1, duration: 220, useNativeDriver: true }).start();
    setOpen((o) => !o);
  };
  const rotate = chev.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={{
      backgroundColor: T.surfaceCard, borderRadius: s(20), borderWidth: 1,
      borderColor: T.hairline, overflow: 'hidden', marginBottom: s(14), ...T.cardShadow,
    }}>
      <TouchableOpacity
        onPress={toggle} activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(16), paddingVertical: s(15) }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.xbold, fontSize: s(16), color: T.textHeading }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontFamily: F.semi, fontSize: s(12.5), color: T.textMuted, marginTop: 3 }}>{subtitle}</Text>
          ) : null}
        </View>
        <Animated.View style={{ flexShrink: 0, marginLeft: s(8), transform: [{ rotate }] }}>
          <Icon name="chevron" size={s(20)} color={T.chevron} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={{ paddingHorizontal: s(16), paddingBottom: s(16) }}>
          <View style={{ height: 1, backgroundColor: T.hairline, marginBottom: s(14) }} />
          {children}
        </View>
      )}
    </View>
  );
}

// ── Tela ────────────────────────────────────────────────────────────────────
export default function Protocolo() {
  const { width, height } = useWindowDimensions();
  const S = width / 393;
  const s = (n: number) => n * S;

  const [period, setPeriod] = useState<'am' | 'pm'>('am');
  const isNight = period === 'pm';
  const T = isNight ? NIGHT : DAY;

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
    Nunito_500Medium, Nunito_400Regular,
  });
  const F = {
    xbold: fontsLoaded ? 'Nunito_800ExtraBold' : undefined,
    bold: fontsLoaded ? 'Nunito_700Bold' : undefined,
    semi: fontsLoaded ? 'Nunito_600SemiBold' : undefined,
    medium: fontsLoaded ? 'Nunito_500Medium' : undefined,
    regular: fontsLoaded ? 'Nunito_400Regular' : undefined,
  };
  // Cerimônia migrada para Nunito (identidade nova) — cerimFont = ênfase/títulos, cerimFontReg = títulos/corpo
  const cerimFont = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const cerimFontReg = fontsLoaded ? 'Nunito_700Bold' : undefined;
  // Skia font para o numeral do orb — Nunito ExtraBold (era DM Serif Italic)
  const cerimSkiaFont = useFont(Nunito_800ExtraBold, 84);
  const insets = useSafeAreaInsets();

  // Sincroniza a tab bar global (GlobalBottomBar) com o tema: escura no modo Noite,
  // clara no resto e ao sair da tela. Assim o menu inferior não destoa da tela escura.
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme(isNight ? 'dark' : 'light');
      // Restaura a tab bar ao sair da tela (caso saia no meio da cerimônia).
      return () => { setTabBarTheme('light'); setTabBarVisible(true); };
    }, [isNight, setTabBarTheme, setTabBarVisible])
  );

  // ── Rotina REAL do usuário ────────────────────────────────────────────────
  const protocolResult = useAppStore((s) => s.protocolResult);
  const setProtocolResult = useAppStore((s) => s.setProtocolResult);
  const { startFaceScan } = useFaceScan();
  const [amSteps, setAmSteps] = useState<Step[]>([]);
  const [pmSteps, setPmSteps] = useState<Step[]>([]);
  // Passos crus (name/ingredient/steps[]/waitTime) — a cerimônia precisa deles.
  const [amRaw, setAmRaw] = useState<RawStep[]>([]);
  const [pmRaw, setPmRaw] = useState<RawStep[]>([]);
  // dicas[]: [0]=visão geral/aviso, [1]=2 semanas, [2]=1 mês, [3]=3 meses, [4]=cronograma
  const [dicas, setDicas] = useState<(string | null)[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'generating' | 'ready' | 'empty' | 'error'>('loading');
  // Trava: no máximo UMA geração sob demanda por montagem da tela (mesmo padrão do
  // triedGenerate da tela de recomendação). Rearmada só no toque explícito de "Tentar de novo".
  const triedGenerate = useRef(false);

  // FALLBACK do vão: o store cobre a janela em que a tabela ainda não tem o protocolo
  // — timing do onboarding (o insert roda DEPOIS do setProtocolResult) OU insert falho.
  // A FONTE DE VERDADE é a tabela `protocolos` (ver efeito abaixo). Persistido em disco
  // (`partialize`), então pinta na hora e sobrevive a restart até a tabela assumir.
  const fromStore = protocolResult?.morning?.length && protocolResult?.night?.length
    ? protocolResult
    : null;

  // FONTE DE VERDADE: tabela `protocolos`. Sempre consultada e revalidada A CADA FOCO
  // (staleMs:0) — é isso que faz uma alteração feita no servidor (card do Coach,
  // aprovação por texto, etc.) aparecer ao voltar para a aba. Stale-while-revalidate:
  // pinta do cache na hora e atualiza em silêncio, sem piscar.
  const userId = useUserId();
  const fetchProtocolo = useCallback(async () => {
    const uid = await getUserId();
    if (!uid) return null;
    const { data, error } = await supabase
      .from('protocolos')
      .select('rotina_am, rotina_pm, dicas')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }, []);

  const { data: saved, state: savedState, refresh: refreshProtocolo } = useCachedQuery(
    userId ? `protocolo:${userId}` : null,
    fetchProtocolo,
    { enabled: Boolean(userId), staleMs: 0 },
  );

  // ── Geração SOB DEMANDA do protocolo — usuária legada ─────────────────────────
  // Espelha o generateOnDemand da tela de recomendação: só dispara se a usuária CHEGAR
  // nesta tela e não houver protocolo salvo — nunca em background, pra não gastar IA com
  // quem não abrir. A base clínica vem do SCAN (skin_scans.full_result); o onboardingData
  // é reconstruído da linha em `users` no mesmo formato que o signup manda.
  //
  // Piso mínimo: exige um scan aproveitável — full_result com skin_score (número) +
  // skin_type_detected (texto). Sem isso não há base clínica e gerar seria lixo → 'sem-scan'
  // (a tela mostra o CTA de escanear). O tipo_pele declarado, se nulo na linha legada, cai no
  // detectado pelo scan — nunca geramos com skin_type vazio.
  //
  // 'ok' SÓ quando o protocolo foi lido de volta em `protocolos` — o insert do supabase-js
  // não lança em falha de RLS, então a leitura de volta é o que garante que salvou de fato.
  // Só então o resultado é comprometido no store (evita pintar um protocolo fantasma).
  const generateOnDemand = useCallback(
    async (uid: string): Promise<'ok' | 'sem-scan' | 'falhou'> => {
      const { data: scan, error: scanErr } = await supabase
        .from('skin_scans')
        .select('id, full_result')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (scanErr) return 'falhou';

      const scanResult = scan?.full_result as ScanResult | undefined;
      if (
        !scanResult ||
        typeof scanResult.skin_score !== 'number' ||
        !(scanResult.skin_type_detected ?? '').trim()
      ) {
        return 'sem-scan';
      }

      // Perfil da usuária → OnboardingData (reverso do saveToSupabase do store).
      const { data: urow } = await supabase
        .from('users')
        .select(
          'genero, pregnancy_status, skincare_routine_type, skincare_routine_description, allergy_type, allergy_description, tipo_pele, concerns, sun_exposure, hydration, sleep, birthday',
        )
        .eq('id', uid)
        .maybeSingle();

      const onboardingData: OnboardingData = buildOnboardingDataFromUserRow(urow, scanResult);

      // Gera + salva com a lib COMO ESTÁ (fetch direto, insert em `protocolos`, encadeia a
      // recomendação). Guarda o resultado, mas ainda NÃO o compromete no store.
      let produced: ProtocolResult | null = null;
      await new Promise<void>((resolve) => {
        generateAndSaveProtocol({
          scanResult,
          onboardingData,
          skinScanId: scan!.id,
          userId: uid,
          onSuccess: (result) => { produced = result; },
          onFinally: () => resolve(),
        });
      });
      if (!produced) return 'falhou';

      // Leitura de volta: 'ok' só se a linha existe MESMO em `protocolos`.
      const { data: savedRow } = await supabase
        .from('protocolos')
        .select('id')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle();
      if (!savedRow) return 'falhou';

      setProtocolResult(produced);
      void refreshProtocolo(); // a tabela vira a verdade dentro do mesmo mount
      return 'ok';
    },
    [setProtocolResult, refreshProtocolo],
  );

  // Dispara a geração sob demanda uma vez (trava). Mostra 'generating' enquanto roda.
  const runOnDemandGeneration = useCallback(async () => {
    if (!userId) return;
    triedGenerate.current = true;
    setLoadState('generating');
    const gen = await generateOnDemand(userId);
    if (gen === 'sem-scan') { setLoadState('empty'); return; }
    // Falha de rede/função/escrita: rearma a trava e cai no erro (com "Tentar de novo").
    // NUNCA no empty de "faça a avaliação" — seria mentira com quem já escaneou.
    if (gen === 'falhou') { triedGenerate.current = false; setLoadState('error'); return; }
    // 'ok' → setProtocolResult já povoou o store; o efeito reativo (fromStore) mostra a rotina.
  }, [userId, generateOnDemand]);

  // Aplica um par de rotinas cru no estado de render (title/ingredients via mapStep +
  // crus para a cerimônia + dicas).
  const aplica = useCallback((am: RawStep[], pm: RawStep[], ds: (string | null)[]) => {
    setAmRaw(am); setPmRaw(pm);
    setAmSteps(am.map(mapStep));
    setPmSteps(pm.map(mapStep));
    setDicas(ds);
  }, []);

  useEffect(() => {
    if (!userId) return;              // ainda resolvendo a sessão

    // FONTE DE VERDADE: a tabela ganha quando QUALQUER período tem dado (||, não &&) —
    // exigir os dois faria uma linha com um período vazio cair no store e voltar a mentir.
    const am = (saved?.rotina_am as RawStep[]) ?? [];
    const pm = (saved?.rotina_pm as RawStep[]) ?? [];
    if (am.length || pm.length) {
      aplica(am, pm, Array.isArray(saved?.dicas) ? saved!.dicas : []);
      setLoadState('ready');
      return;
    }

    // VÃO — tabela vazia por timing do onboarding OU por insert falho (indistinguíveis):
    // o store cobre os dois, a tela NUNCA fica em branco.
    if (fromStore) {
      aplica(fromStore.morning as RawStep[], fromStore.night as RawStep[], storeDicas(fromStore));
      setLoadState('ready');
      return;
    }

    // Nem tabela nem store:
    if (savedState === 'error') { setLoadState('error'); return; }
    if (savedState === 'loading') return; // tabela ainda resolvendo, sem store → mantém 'loading'
    if (!triedGenerate.current) {
      // Usuária legada (tem scan, nunca teve protocolo) → gera sob demanda UMA vez por
      // montagem. A trava evita laço se a geração responder mas a linha continuar vazia.
      void runOnDemandGeneration();
    } else {
      // Já tentamos gerar nesta montagem e ainda vazio → empty legítimo (sem scan aproveitável).
      setLoadState('empty');
    }
  }, [fromStore, saved, savedState, userId, runOnDemandGeneration, aplica]);

  // Sincroniza o store a partir da tabela (fonte de verdade) — mantém o cold-start
  // mostrando a última versão e o store consistente. Preserva os campos soltos do store
  // (a tabela não os guarda como colunas). Guard de igualdade em morning/night evita laço.
  useEffect(() => {
    const am = (saved?.rotina_am as RawStep[]) ?? [];
    const pm = (saved?.rotina_pm as RawStep[]) ?? [];
    if (!am.length && !pm.length) return;
    const same = protocolResult
      && JSON.stringify(protocolResult.morning) === JSON.stringify(am)
      && JSON.stringify(protocolResult.night) === JSON.stringify(pm);
    if (same) return;
    setProtocolResult({
      ...(protocolResult ?? ({} as ProtocolResult)),
      morning: am as unknown as ProtocolResult['morning'],
      night: pm as unknown as ProtocolResult['night'],
      dicas: Array.isArray(saved?.dicas) ? saved!.dicas : [],
    });
  }, [saved, protocolResult, setProtocolResult]);

  // Produtos salvos na rotina (via "Salvar na minha rotina" na tela de Produtos).
  // A foto salva substitui o ícone do passo. Recarrega ao focar a tela — assim um
  // produto recém-salvo já aparece ao voltar.
  const [savedProducts, setSavedProducts] = useState<Record<string, SavedProduct>>({});
  useFocusEffect(useCallback(() => {
    let active = true;
    getSavedProducts().then((m) => { if (active) setSavedProducts(m); });
    return () => { active = false; };
  }, []));

  // ── Cerimônia (ritual passo a passo) — portada da produção ──────────────────
  const [ritualOpen, setRitualOpen] = useState(false);
  const [ritualStep, setRitualStep] = useState(0);
  const [ritualDone, setRitualDone] = useState(false);
  const player = useAudioPlayer(require('../../assets/sounds/check.mp3'));

  // Toca o som mesmo com o iPhone no silencioso (default do expo-audio é NÃO tocar).
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Anéis respiratórios do orb
  const orbBreath1 = useRef(new Animated.Value(1)).current;
  const orbBreath2 = useRef(new Animated.Value(1)).current;
  // Entradas escalonadas da tela de celebração
  const celebScreenOpacity = useRef(new Animated.Value(0)).current;
  const celebScreenScale = useRef(new Animated.Value(0.96)).current;
  const celebOrbScale = useRef(new Animated.Value(0.5)).current;
  const celebOrbOpacity = useRef(new Animated.Value(0)).current;
  const celebEyebrowAnim = useRef(new Animated.Value(0)).current;
  const celebTitleAnim = useRef(new Animated.Value(0)).current;
  const celebSubtextoAnim = useRef(new Animated.Value(0)).current;
  const celebFooterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const breathe = (anim: Animated.Value, delay: number) => {
      Animated.loop(Animated.sequence([
        Animated.timing(anim, { toValue: 1.08, duration: 3000, useNativeDriver: true, delay }),
        Animated.timing(anim, { toValue: 1, duration: 3000, useNativeDriver: true, delay: 0 }),
      ])).start();
    };
    breathe(orbBreath1, 0);
    breathe(orbBreath2, 300);
  }, []);

  // Celebration screen — entradas escalonadas quando ritualDone vira true
  useEffect(() => {
    if (!ritualDone) return;
    celebScreenOpacity.setValue(0); celebScreenScale.setValue(0.96);
    celebOrbScale.setValue(0.5); celebOrbOpacity.setValue(0);
    celebEyebrowAnim.setValue(0); celebTitleAnim.setValue(0);
    celebSubtextoAnim.setValue(0); celebFooterAnim.setValue(0);
    Animated.parallel([
      Animated.timing(celebScreenOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(celebScreenScale, { toValue: 1, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.spring(celebOrbScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(celebOrbOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(celebEyebrowAnim, { toValue: 1, duration: 700, delay: 400, useNativeDriver: true }),
      Animated.timing(celebTitleAnim, { toValue: 1, duration: 700, delay: 550, useNativeDriver: true }),
      Animated.timing(celebSubtextoAnim, { toValue: 1, duration: 700, delay: 700, useNativeDriver: true }),
      Animated.timing(celebFooterAnim, { toValue: 1, duration: 700, delay: 850, useNativeDriver: true }),
    ]).start();
  }, [ritualDone]);

  // Feedback tátil + som ao concluir um passo + persiste o progresso (índice do passo
  // no período atual) para o card "Cuidados diários" da home refletir a conclusão.
  const toggleStepCompletion = (index: number) => {
    haptics.action();
    try { player.seekTo(0); player.play(); } catch {}
    markStepCompleted(period, index);
  };

  const openRitual = () => {
    haptics.action();
    setRitualStep(0); setRitualDone(false);
    setTabBarVisible(false); setRitualOpen(true);
  };
  const closeRitual = () => {
    setTabBarVisible(true); setRitualOpen(false); setRitualDone(false);
  };

  const steps = isNight ? pmSteps : amSteps;
  const rawSteps = isNight ? pmRaw : amRaw;
  const meta = {
    focus: FOCUS[period],
    passos: `${steps.length} ${steps.length === 1 ? 'passo' : 'passos'}`,
    duracao: `~${Math.max(5, steps.length * 3)} minutos`,
  };

  // ── Recomendações derivadas das dicas (globais, iguais em AM/PM) ────────────
  const visaoGeral = (dicas[0] ?? '').trim() || null;
  const marcos = [
    dicas[1] ? { label: 'Em 2 semanas', body: dicas[1] } : null,
    dicas[2] ? { label: 'Em 1 mês', body: dicas[2] } : null,
    dicas[3] ? { label: 'Em 3 meses', body: dicas[3] } : null,
  ].filter((m): m is { label: string; body: string } => m !== null);
  const cronograma = parseCronograma(dicas[4]);
  const hasPrognostico = !!visaoGeral || marcos.length > 0;
  const hasRecomendacoes = hasPrognostico || cronograma.length > 0;

  // ── Cerimônia — tokens de cor/layout (idênticos à produção; usa teal + coral) ─
  const isPM = isNight;
  const accent = '#FF9D9D';
  // Gradientes do modo DIA — recoloridos de pêssego para rosa suave (identidade nova #FF9D9D)
  const dayGradients: string[][] = [
    ['#FFF1F2', '#FFE0E4', '#FFC4CB'],
    ['#FFF3F4', '#FFDCE1', '#FFB9C1'],
    ['#FFEFF1', '#FFD6DC', '#FFAEB7'],
    ['#FFF2F3', '#FFDBE0', '#FFB3BB'],
    ['#FFECEF', '#FFD0D6', '#FCA8B0'],
  ];
  const currentDayColors = dayGradients[ritualStep % dayGradients.length];
  const rtInk = isPM ? '#FFFFFF' : '#121212';
  const rtInkSoft = isPM ? 'rgba(255,255,255,0.65)' : '#515151';
  const rtInkHair = isPM ? 'rgba(255,255,255,0.18)' : 'rgba(18,18,18,0.2)';
  const chipBg = isPM ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)';
  const chipBorder = isPM ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)';
  const ritualCurrentStep = rawSteps[ritualStep] ?? rawSteps[rawSteps.length - 1];
  const isRitualLast = ritualStep === rawSteps.length - 1;
  // Posicionamento do numeral Skia dentro do Canvas 200×200 (cx=100, cy=100)
  const stepText = String(ritualStep + 1).padStart(2, '0');
  const skiaTextW = cerimSkiaFont?.measureText(stepText).width ?? 95;
  const skiaTextX = (200 - skiaTextW) / 2;
  // capHeight existe em runtime mas não está tipado na FontMetrics do Skia 2.4 → cast
  const rawCapH = cerimSkiaFont ? ((cerimSkiaFont.getMetrics() as any).capHeight ?? 0) : 0;
  const skiaCapH = rawCapH ? Math.abs(rawCapH) : 84 * 0.70;
  const skiaTextY = 100 + skiaCapH / 2;
  // Título partido: 1ª palavra italic + restante normal
  const cerimTitleParts = (ritualCurrentStep?.name ?? '').split(' ');
  const cerimTitleFirst = cerimTitleParts[0] ?? '';
  const cerimTitleRest = cerimTitleParts.slice(1).join(' ');
  // Tema da tela de celebração
  const celebTextColor = isPM ? '#F5E6D3' : '#121212';
  const celebSubtleColor = isPM ? 'rgba(245,230,211,0.6)' : 'rgba(18,18,18,0.55)';
  const celebRuleColor = isPM ? 'rgba(245,230,211,0.25)' : 'rgba(18,18,18,0.2)';
  const celebCtaBg = isPM ? '#F5E6D3' : '#FF9D9D';
  const celebCtaText = isPM ? '#0a1420' : '#FFFFFF';

  const brandShadow = {
    shadowColor: BRAND, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: T.brandShadowOpacity, shadowRadius: 12, elevation: 6,
  };

  const MetaRow = ({ label, value }: { label: string; value: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(9) }}>
      <Text style={{ fontFamily: F.semi, fontSize: s(16), color: T.textMuted, marginRight: s(8) }}>{label}</Text>
      <Text style={{ fontFamily: F.xbold, fontSize: s(16), color: T.textHeading }}>{value}</Text>
    </View>
  );

  // Segmento do toggle
  const Segment = ({ value, label, icon }: { value: 'am' | 'pm'; label: string; icon: IconName }) => {
    const active = period === value;
    return (
      <TouchableOpacity
        onPress={() => { haptics.select(); setPeriod(value); }} activeOpacity={0.85}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: s(20), height: s(40), borderRadius: 999,
          backgroundColor: active ? BRAND : 'transparent',
          ...(active ? brandShadow : {}),
        }}
      >
        <Icon name={icon} size={s(16)} color={active ? '#FFFFFF' : T.textMuted} />
        <Text style={{
          marginLeft: s(7), fontFamily: active ? F.xbold : F.semi,
          fontSize: s(15), color: active ? '#FFFFFF' : T.textMuted,
        }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <Background isNight={isNight} width={width} height={height} s={s} />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: s(20), paddingTop: s(8), paddingBottom: s(120) }}
          showsVerticalScrollIndicator={false}
        >
          {/* herói — altura ajustada ao conteúdo: a lua (s301, disco ~s160) precisa de mais
              espaço; a logo da manhã (s132) fica encaixada num container menor p/ não deixar
              vão grande até o título nem até o topo. */}
          <View style={{ height: isNight ? s(200) : s(140), justifyContent: 'center', alignItems: 'center', marginTop: isNight ? 0 : s(22), marginBottom: s(4) }}>
            {isNight ? <MoonHero s={s} /> : <SunHero s={s} />}
          </View>

          {/* título + squiggle */}
          <View style={{ alignItems: 'center', marginBottom: s(16) }}>
            <Text style={{ fontFamily: F.xbold, fontSize: s(30), color: T.textHeading, letterSpacing: -0.3 }}>Rotina de Skincare</Text>
            <Svg width={s(176)} height={s(10)} viewBox="0 0 150 10" preserveAspectRatio="none" style={{ marginTop: s(7) }}>
              <Path d="M2 6 Q 14 1, 26 6 T 50 6 T 74 6 T 98 6 T 122 6 T 148 6" stroke={BRAND} strokeWidth={3.2} strokeLinecap="round" fill="none" />
            </Svg>
            <Text style={{ fontFamily: F.semi, fontSize: s(14), color: T.textMuted, marginTop: s(9) }}>Feita para a sua pele</Text>
          </View>

          {/* toggle Manhã / Noite */}
          <View style={{ alignItems: 'center', marginBottom: s(18) }}>
            <View style={{
              flexDirection: 'row', alignSelf: 'center', padding: s(4),
              backgroundColor: T.surfaceSunken, borderRadius: 999,
            }}>
              <Segment value="am" label="Manhã" icon="sun" />
              <View style={{ width: s(4) }} />
              <Segment value="pm" label="Noite" icon="moon" />
            </View>
          </View>

          {loadState === 'loading' || loadState === 'generating' ? (
            /* carregando a rotina real — ou montando sob demanda p/ usuária legada */
            <View style={{ paddingTop: s(48), alignItems: 'center' }}>
              <ActivityIndicator size="large" color={BRAND} />
              <Text style={{ fontFamily: F.semi, fontSize: s(14), color: T.textMuted, marginTop: s(14) }}>
                {loadState === 'generating' ? 'Montando seu protocolo…' : 'Carregando sua rotina…'}
              </Text>
            </View>
          ) : loadState === 'ready' && steps.length > 0 ? (
            <>
              {/* meta */}
              <View style={{ marginHorizontal: s(2), marginBottom: s(20) }}>
                <MetaRow label="Foco:" value={meta.focus} />
                <MetaRow label="Passos:" value={meta.passos} />
                <MetaRow label="Duração:" value={meta.duracao} />
              </View>

              {/* botão Iniciar rotina — abre a cerimônia */}
              <TouchableOpacity
                onPress={openRitual}
                disabled={rawSteps.length === 0}
                activeOpacity={0.9}
                style={{
                  height: s(56), borderRadius: 999, backgroundColor: BRAND,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  marginBottom: s(26), ...brandShadow,
                }}
              >
                <Icon name="play" size={s(20)} color="#FFFFFF" />
                <Text style={{ fontFamily: F.xbold, fontSize: s(17), color: '#FFFFFF', marginLeft: s(8) }}>Iniciar rotina</Text>
              </TouchableOpacity>

              {/* timeline de passos */}
              <View>
                {steps.map((step, i) => (
                  <StepCard
                    key={`${period}-${i}`}
                    step={step} n={i + 1} showLine={i < steps.length - 1}
                    T={T} s={s} F={F}
                    photoUrl={savedProducts[normStepKey(step.title)]?.imageUrl}
                  />
                ))}
              </View>

              <Text style={{ textAlign: 'center', fontFamily: F.semi, fontSize: s(13), color: T.textCaption, marginTop: s(8) }}>
                Toque em um passo para ver como fazer
              </Text>

              {/* ═══ RECOMENDAÇÕES (globais — vindas das dicas da IA) ═══ */}
              {hasRecomendacoes && (
                <View style={{ marginTop: s(38) }}>
                  {/* header da seção */}
                  <View style={{ alignItems: 'center', marginBottom: s(18) }}>
                    <Text style={{
                      fontFamily: F.bold, fontSize: s(11), letterSpacing: 2.4,
                      color: BRAND, textTransform: 'uppercase',
                    }}>Recomendações</Text>
                    <Text style={{
                      fontFamily: F.xbold, fontSize: s(22), color: T.textHeading,
                      marginTop: s(6), textAlign: 'center', letterSpacing: -0.3,
                    }}>O que esperar do seu protocolo</Text>
                  </View>

                  {/* Prognóstico — visão geral + marcos de evolução */}
                  {hasPrognostico && (
                    <Collapsible
                      title="Prognóstico"
                      subtitle="Marcos de evolução e um aviso importante"
                      T={T} s={s} F={F}
                    >
                      {visaoGeral && (
                        <View style={{
                          flexDirection: 'row', gap: s(10), backgroundColor: T.surfaceSunken,
                          borderRadius: s(14), padding: s(13), marginBottom: marcos.length ? s(18) : 0,
                        }}>
                          <View style={{ marginTop: s(1), flexShrink: 0 }}>
                            <Icon name="alert" size={s(18)} color={BRAND} />
                          </View>
                          <Text style={{ flex: 1, fontFamily: F.regular, fontSize: s(13), lineHeight: s(20), color: T.textBody }}>
                            {visaoGeral}
                          </Text>
                        </View>
                      )}
                      {marcos.map((m, i) => (
                        <View key={i} style={{ marginBottom: i < marcos.length - 1 ? s(16) : 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: s(5) }}>
                            <View style={{ width: s(7), height: s(7), borderRadius: 999, backgroundColor: BRAND, marginRight: s(9) }} />
                            <Text style={{ fontFamily: F.xbold, fontSize: s(14), color: T.textHeading }}>{m.label}</Text>
                          </View>
                          <Text style={{
                            fontFamily: F.regular, fontSize: s(13.5), lineHeight: s(21),
                            color: T.textBody, marginLeft: s(16),
                          }}>{m.body}</Text>
                        </View>
                      ))}
                    </Collapsible>
                  )}

                  {/* Cronograma de introdução gradual */}
                  {cronograma.length > 0 && (
                    <Collapsible
                      title="Cronograma de introdução"
                      subtitle="Como introduzir os ativos sem agredir a pele"
                      T={T} s={s} F={F}
                    >
                      {/* mini timeline de bolinhas */}
                      {cronograma.length > 1 && (
                        <View style={{ paddingTop: s(2), paddingBottom: s(10) }}>
                          <View style={{ position: 'absolute', left: s(24), right: s(24), top: s(6), height: 1, backgroundColor: T.hairline }} />
                          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                            {cronograma.map((c, i) => (
                              <View key={i} style={{ alignItems: 'center' }}>
                                <View style={{ width: s(9), height: s(9), borderRadius: 999, backgroundColor: BRAND, marginBottom: s(8) }} />
                                <Text style={{ fontFamily: F.bold, fontSize: s(11.5), color: BRAND }}>{c.week}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                      {/* lista detalhada */}
                      {cronograma.map((c, i) => (
                        <View key={i} style={{
                          flexDirection: 'row', gap: s(12), paddingVertical: s(13),
                          borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.hairline,
                        }}>
                          <Text style={{ fontFamily: F.xbold, fontSize: s(13.5), color: BRAND, width: s(72), flexShrink: 0 }}>{c.week}</Text>
                          <Text style={{ flex: 1, fontFamily: F.regular, fontSize: s(13), lineHeight: s(20), color: T.textBody }}>{c.body}</Text>
                        </View>
                      ))}
                    </Collapsible>
                  )}
                </View>
              )}
            </>
          ) : (
            /* sem protocolo salvo ou erro de carregamento */
            <View style={{ paddingTop: s(24), alignItems: 'center', paddingHorizontal: s(10) }}>
              <Text style={{ fontFamily: F.xbold, fontSize: s(20), color: T.textHeading, textAlign: 'center' }}>
                {loadState === 'error' ? 'Não conseguimos carregar sua rotina' : 'Sua rotina ainda não está pronta'}
              </Text>
              <Text style={{ fontFamily: F.semi, fontSize: s(14), color: T.textMuted, textAlign: 'center', marginTop: s(8), lineHeight: s(21) }}>
                {loadState === 'error'
                  ? 'Verifique sua conexão e tente novamente.'
                  : 'Faça uma análise de pele para gerar seu protocolo de skincare personalizado.'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  haptics.action();
                  if (loadState !== 'error') { startFaceScan(); return; }
                  // "Tentar de novo": rearma a trava e re-lê da rede. Se ainda não houver
                  // protocolo (usuária legada), o efeito re-dispara a geração — uma vez por
                  // toque, nunca em cadeia automática. Re-ler antes de gerar evita protocolo
                  // duplicado caso a falha tenha sido só na leitura de volta.
                  triedGenerate.current = false;
                  setLoadState('loading');
                  void refreshProtocolo(); // ignora o frescor do cache e vai à rede
                }}
                activeOpacity={0.9}
                style={{
                  marginTop: s(22), height: s(52), paddingHorizontal: s(28), borderRadius: 999,
                  backgroundColor: BRAND, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...brandShadow,
                }}
              >
                <Text style={{ fontFamily: F.xbold, fontSize: s(16), color: '#FFFFFF' }}>
                  {loadState === 'error' ? 'Tentar novamente' : 'Escanear minha pele'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ═══ CERIMÔNIA (ritual passo a passo) — portada da produção ═══ */}
      {ritualOpen && (
        ritualDone ? (
          <Animated.View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60,
            overflow: 'hidden',
            opacity: celebScreenOpacity,
            transform: [{ scale: celebScreenScale }],
          }}>
            {isPM ? (
              <Canvas style={StyleSheet.absoluteFill}>
                <SkiaRect x={0} y={0} width={width} height={height}>
                  <SkiaRadialGradient
                    c={vec(width * 0.5, height * 0.3)}
                    r={width * 1.5}
                    colors={['#1a2332', '#0a1420', '#050a12']}
                    positions={[0, 0.6, 1]}
                  />
                </SkiaRect>
              </Canvas>
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />
            )}
            {isPM && <NightSky />}

            {/* Masthead */}
            <View style={{
              paddingTop: insets.top + 20, paddingHorizontal: 28,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              zIndex: 2,
            }}>
              <Text style={{ fontFamily: cerimFont, fontSize: 12, letterSpacing: 1.2, color: celebSubtleColor }}>
                niks · {isPM ? 'noite' : 'manhã'}
              </Text>
              <Text style={{ fontFamily: cerimFontReg, fontSize: 12, letterSpacing: 1.92, color: celebSubtleColor, textTransform: 'uppercase' }}>
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {/* Centro: orb + texto */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, zIndex: 2 }}>
              <Animated.View style={{
                width: 220, height: 220, marginBottom: 48,
                alignItems: 'center', justifyContent: 'center',
                opacity: celebOrbOpacity,
                transform: [{ scale: celebOrbScale }],
              }}>
                {/* Glow radial */}
                <Canvas style={{ position: 'absolute', width: 300, height: 300, top: -40, left: -40 }}>
                  <SkiaCircle cx={150} cy={150} r={130}>
                    <SkiaRadialGradient
                      c={vec(150, 150)} r={130}
                      colors={isPM
                        ? ['rgba(245,230,211,0.25)', 'rgba(245,230,211,0)']
                        : ['rgba(255,157,157,0.14)', 'rgba(255,157,157,0)']}
                    />
                    <BlurMask blur={24} style="normal" />
                  </SkiaCircle>
                </Canvas>
                {/* Outer ring */}
                <View style={{
                  position: 'absolute', width: 252, height: 252, borderRadius: 126,
                  top: -16, left: -16, borderWidth: 1,
                  borderColor: isPM ? 'rgba(245,230,211,0.18)' : 'rgba(255,157,157,0.18)',
                }} />
                {/* Orb body */}
                <Canvas style={{ width: 220, height: 220, position: 'absolute' }}>
                  <SkiaCircle cx={110} cy={110} r={110}>
                    <SkiaRadialGradient
                      c={vec(77, 77)} r={198}
                      colors={isPM
                        ? ['#FAF3E3', '#E8D9B8', '#B8A685']
                        : ['#FFFFFF', '#FFC4C6', '#FF9D9D']}
                    />
                  </SkiaCircle>
                  {isPM && (
                    <>
                      <SkiaCircle cx={90.6} cy={68.6} r={7}>
                        <SkiaRadialGradient c={vec(85.7, 63.7)} r={7}
                          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                      <SkiaCircle cx={141.4} cy={119.4} r={5}>
                        <SkiaRadialGradient c={vec(137.9, 115.9)} r={5}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                      <SkiaCircle cx={70} cy={153.6} r={4}>
                        <SkiaRadialGradient c={vec(67.2, 150.8)} r={4}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                      <SkiaCircle cx={58} cy={95.4} r={3}>
                        <SkiaRadialGradient c={vec(55.9, 93.3)} r={3}
                          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                    </>
                  )}
                </Canvas>
                {/* Checkmark sobreposto */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <Svg width={48} height={48} viewBox="0 0 48 48" fill="none">
                    <Path d="M14 24.5L21 31.5L34 17"
                      stroke={isPM ? '#121212' : '#FFFFFF'}
                      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
              </Animated.View>

              {/* Eyebrow */}
              <Animated.View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
                opacity: celebEyebrowAnim,
                transform: [{ translateY: celebEyebrowAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              }}>
                <View style={{ width: 28, height: 1, backgroundColor: celebRuleColor }} />
                <Text style={{ fontFamily: cerimFont, fontSize: 13, letterSpacing: 1.04, color: celebSubtleColor, textTransform: 'lowercase' }}>
                  rotina concluída
                </Text>
                <View style={{ width: 28, height: 1, backgroundColor: celebRuleColor }} />
              </Animated.View>

              {/* Título */}
              <Animated.Text style={{
                fontFamily: cerimFontReg, fontSize: 44, lineHeight: 46,
                color: celebTextColor, textAlign: 'center', letterSpacing: -0.88, marginBottom: 20,
                opacity: celebTitleAnim,
                transform: [{ translateY: celebTitleAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              }}>
                <Text style={{ fontFamily: cerimFont }}>{isPM ? 'Boa' : 'Bem'}</Text>
                {isPM ? ' noite,\n' : ' feita,\n'}
                <Text>{isPM ? 'sua pele descansa.' : 'sua pele agradece.'}</Text>
              </Animated.Text>

              {/* Subtexto */}
              <Animated.Text style={{
                fontFamily: F.medium, fontSize: 15, lineHeight: 23.25,
                color: celebSubtleColor, textAlign: 'center', maxWidth: 280,
                opacity: celebSubtextoAnim,
                transform: [{ translateY: celebSubtextoAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              }}>
                {isPM
                  ? 'Quatro gestos para selar o dia. Agora é a noite que cuida — descanse.'
                  : 'Quatro gestos simples, feitos com intenção. Leve essa calma pro resto do dia.'}
              </Animated.Text>
            </View>

            {/* Rodapé */}
            <Animated.View style={{
              paddingHorizontal: 28, paddingBottom: insets.bottom + 40, zIndex: 2,
              opacity: celebFooterAnim,
              transform: [{ translateY: celebFooterAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}>
              <Text style={{
                fontFamily: cerimFont, fontSize: 13, letterSpacing: 0.13,
                color: celebSubtleColor, textAlign: 'center', marginBottom: 20, textTransform: 'lowercase',
              }}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <TouchableOpacity
                onPress={() => { haptics.success(); requestAppReview(); closeRitual(); }}
                activeOpacity={0.88}
                style={{
                  backgroundColor: celebCtaBg, borderRadius: 100,
                  paddingVertical: 20, paddingHorizontal: 24,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                  shadowColor: isPM ? '#000' : '#FF9D9D', shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: isPM ? 0.4 : 0.35, shadowRadius: isPM ? 40 : 24,
                }}
              >
                <Text style={{ color: celebCtaText, fontFamily: cerimFont, fontSize: 15, letterSpacing: -0.075 }}>
                  voltar ao protocolo
                </Text>
                <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                  <Path d="M6 3L11 8L6 13" stroke={celebCtaText} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        ) : (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, overflow: 'hidden' }}>
            {isPM ? (
              <LinearGradient
                colors={['#0F1420', '#1A1F2E', '#2A1F28']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <Canvas style={StyleSheet.absoluteFill}>
                <Group transform={[{ scaleY: (height * 0.7) / (width * 0.5) }]}>
                  <SkiaRect x={0} y={0} width={width} height={(width * 0.5 * height) / (height * 0.7)}>
                    <SkiaRadialGradient
                      c={vec(width * 0.5, (height * 0.3 * width * 0.5) / (height * 0.7))}
                      r={width * 0.5}
                      colors={currentDayColors}
                      positions={[0, 0.35, 1]}
                    />
                  </SkiaRect>
                </Group>
                <Group transform={[{ scaleY: (height * 1.1) / (width * 0.5) }]}>
                  <SkiaRect x={0} y={0} width={width} height={(width * 0.5 * height) / (height * 1.1)}>
                    <SkiaRadialGradient
                      c={vec(width * 0.5, width * 0.5)}
                      r={width * 0.5}
                      colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
                      positions={[0, 0.6]}
                    />
                  </SkiaRect>
                </Group>
              </Canvas>
            )}
            {isPM && <NightSky />}

            {/* Masthead: fechar + chip período + som */}
            <View style={{
              paddingTop: insets.top + 20, paddingHorizontal: 24,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 5,
            }}>
              <TouchableOpacity
                onPress={() => { haptics.tap(); closeRitual(); }}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M18 6L6 18M6 6l12 12" stroke={rtInk} strokeWidth={2} strokeLinecap="round" />
                </Svg>
              </TouchableOpacity>

              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100,
                backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
              }}>
                {isPM ? (
                  <Svg width={12} height={12} viewBox="0 0 14 14" fill="none">
                    <Path d="M11 8.5 A 5 5 0 1 1 5.5 3 A 4 4 0 0 0 11 8.5 Z" stroke={rtInk} strokeWidth={0.8} strokeLinejoin="round" />
                  </Svg>
                ) : (
                  <Svg width={12} height={12} viewBox="0 0 14 14" fill="none">
                    <Circle cx={7} cy={7} r={2.4} stroke={rtInk} strokeWidth={0.8} />
                    <Line x1={7} y1={1} x2={7} y2={2.8} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <Line x1={7} y1={11.2} x2={7} y2={13} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <Line x1={1} y1={7} x2={2.8} y2={7} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <Line x1={11.2} y1={7} x2={13} y2={7} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <Line x1={2.76} y1={2.76} x2={4.04} y2={4.04} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <Line x1={9.96} y1={9.96} x2={11.24} y2={11.24} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <Line x1={11.24} y1={2.76} x2={9.96} y2={4.04} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                    <Line x1={4.04} y1={9.96} x2={2.76} y2={11.24} stroke={rtInk} strokeWidth={0.8} strokeLinecap="round" />
                  </Svg>
                )}
                <Text style={{ fontFamily: cerimFont, fontSize: 13, color: rtInk, letterSpacing: -0.07 }}>
                  {isPM ? 'rotina da noite' : 'rotina da manhã'}
                </Text>
              </View>

              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M11 5L6 9H2v6h4l5 4V5z" stroke={rtInk} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke={rtInk} strokeWidth={1.5} strokeLinecap="round" />
                </Svg>
              </View>
            </View>

            {/* Progresso segmentado */}
            <View style={{ paddingTop: 24, paddingHorizontal: 48, flexDirection: 'row', gap: 10, zIndex: 5 }}>
              {rawSteps.map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => { haptics.select(); setRitualStep(i); }}
                  style={{
                    flex: 1, height: 1.5, borderRadius: 1,
                    backgroundColor: i <= ritualStep ? rtInk : rtInkHair,
                    opacity: i === ritualStep ? 1 : (i < ritualStep ? 0.9 : 0.4),
                  }}
                />
              ))}
            </View>

            {/* Label do passo */}
            <View style={{ paddingTop: 28, paddingHorizontal: 24, alignItems: 'center', zIndex: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 24, height: 0.5, backgroundColor: rtInkHair }} />
                <Text style={{
                  fontFamily: F.semi, fontSize: 10, fontWeight: '500', letterSpacing: 2.5,
                  color: rtInkSoft, textTransform: 'uppercase',
                }}>
                  Passo {ritualStep + 1} · {rawSteps.length}{ritualCurrentStep?.waitTime ? `  ·  ${ritualCurrentStep.waitTime}` : ''}
                </Text>
                <View style={{ width: 24, height: 0.5, backgroundColor: rtInkHair }} />
              </View>
            </View>

            {/* Orb com numeral */}
            <View style={{ paddingTop: 18, alignItems: 'center', zIndex: 5 }}>
              <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View style={{
                  position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 0.5,
                  borderColor: isPM ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                  transform: [{ scale: orbBreath1 }],
                }} />
                <Animated.View style={{
                  position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 0.5,
                  borderColor: isPM ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.3)',
                  transform: [{ scale: orbBreath2 }],
                }} />
                <Canvas style={{ width: 200, height: 200, position: 'absolute' }}>
                  <SkiaCircle cx={100} cy={100} r={100}>
                    <SkiaRadialGradient
                      c={vec(70, 60)} r={180}
                      colors={isPM
                        ? ['#FFFFFF', '#F4EEE4', '#D8CDB8', '#A89676']
                        : ['rgba(255,255,255,0.9)', 'rgba(255,224,228,0.7)', 'rgba(255,157,157,0.4)']}
                    />
                  </SkiaCircle>
                  {isPM && (
                    <>
                      <SkiaCircle cx={141} cy={71} r={11}>
                        <SkiaRadialGradient c={vec(133.3, 63.3)} r={11}
                          colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                      <SkiaCircle cx={68} cy={123} r={8}>
                        <SkiaRadialGradient c={vec(62.4, 117.4)} r={8}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                      <SkiaCircle cx={165.5} cy={95.5} r={5.5}>
                        <SkiaRadialGradient c={vec(161.65, 91.65)} r={5.5}
                          colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                      <SkiaCircle cx={119.5} cy={152.5} r={4.5}>
                        <SkiaRadialGradient c={vec(116.35, 149.35)} r={4.5}
                          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                      <SkiaCircle cx={88.5} cy={53.5} r={3.5}>
                        <SkiaRadialGradient c={vec(86.05, 51.05)} r={3.5}
                          colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0)']} />
                      </SkiaCircle>
                    </>
                  )}
                  {cerimSkiaFont && (
                    <SkiaText
                      x={skiaTextX}
                      y={skiaTextY}
                      text={stepText}
                      font={cerimSkiaFont}
                      color={isPM ? '#3D2F1F' : '#FFFFFF'}
                    >
                      {!isPM && (
                        <SkiaShadow dx={0} dy={2} blur={5} color="rgba(180,60,80,0.55)" />
                      )}
                    </SkiaText>
                  )}
                </Canvas>
              </View>
            </View>

            {/* Título + instrução + chip — área ROLÁVEL (flex:1) que reserva o espaço do CTA.
                O texto da IA varia de tamanho: curto fica centralizado (igual antes), longo rola,
                nunca sendo cortado nem colando no botão "Concluir este passo". */}
            <View style={{ flex: 1, zIndex: 5 }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  flexGrow: 1, justifyContent: 'center', alignItems: 'center',
                  paddingTop: 28, paddingHorizontal: 24, paddingBottom: 16,
                }}
              >
                <Text style={{
                  fontFamily: cerimFontReg, fontSize: 38, fontWeight: '400',
                  color: isPM ? rtInk : '#FFFFFF', letterSpacing: -0.95, textAlign: 'center', lineHeight: 42,
                  ...(isPM ? {} : {
                    textShadowColor: 'rgba(180,60,80,0.45)',
                    textShadowOffset: { width: 0, height: 1.5 },
                    textShadowRadius: 5,
                  }),
                }}>
                  <Text style={{ fontFamily: cerimFont }}>{cerimTitleFirst}</Text>
                  {cerimTitleRest ? ` ${cerimTitleRest}` : ''}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
                  <View style={{ width: 30, height: 0.5, backgroundColor: rtInkHair }} />
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: accent }} />
                  <View style={{ width: 30, height: 0.5, backgroundColor: rtInkHair }} />
                </View>

                <Text style={{
                  fontFamily: F.regular, fontSize: 14, color: rtInkSoft,
                  textAlign: 'center', lineHeight: 21.7, marginTop: 16, maxWidth: 340,
                }}>{(ritualCurrentStep?.steps ?? []).join(' ') + (ritualCurrentStep?.waitTime ? ` Aguardar ${ritualCurrentStep.waitTime} com o produto aplicado antes de passar para o próximo passo.` : '')}</Text>

                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingVertical: 7, paddingHorizontal: 13, marginTop: 18, borderRadius: 100,
                  backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
                }}>
                  <Svg width={11} height={11} viewBox="0 0 11 11" fill="none">
                    <Path d="M5.5 1.5C5.5 1.5 2.5 5 2.5 7a3 3 0 1 0 6 0C8.5 5 5.5 1.5 5.5 1.5z"
                      stroke={rtInk} strokeWidth={0.9} fill="none" strokeLinejoin="round" />
                  </Svg>
                  <Text style={{ fontFamily: cerimFont, fontSize: 11, letterSpacing: 0.3, color: rtInk }}>
                    {ritualCurrentStep?.ingredient ?? ''}
                  </Text>
                </View>
              </ScrollView>
            </View>

            {/* Controles: anterior + CTA principal — EM FLUXO (não absoluto), logo abaixo da
                área rolável. Isso garante que a rolagem termine onde o botão começa: o texto
                nunca cola nem passa por baixo do botão, em qualquer tamanho. */}
            <View style={{
              paddingHorizontal: 24, paddingTop: 6, paddingBottom: insets.bottom + 16, zIndex: 10,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    // O botão fica só esmaecido (opacity 0.35) no primeiro passo, não
                    // desabilitado — então a guarda evita vibrar sem ter para onde voltar.
                    if (ritualStep > 0) haptics.tap();
                    setRitualStep((prev) => Math.max(0, prev - 1));
                  }}
                  activeOpacity={0.75}
                  style={{
                    width: 54, height: 54, borderRadius: 27, flexShrink: 0,
                    backgroundColor: chipBg, borderWidth: 0.5, borderColor: chipBorder,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: ritualStep === 0 ? 0.35 : 1,
                  }}
                >
                  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                    <Path d="M10 3L5 8L10 13" stroke={rtInk} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    toggleStepCompletion(ritualStep);
                    if (isRitualLast) {
                      setRitualDone(true);
                    } else {
                      setRitualStep((prev) => prev + 1);
                    }
                  }}
                  activeOpacity={0.88}
                  style={{
                    flex: 1,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 100, paddingVertical: 18, paddingHorizontal: 20,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: isPM ? 0.4 : 0.25, shadowRadius: isPM ? 32 : 20,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 14, backgroundColor: accent,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                        <Path d="M3 7L5.8 9.5L11 4.5" stroke="#fff" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                    <Text style={{
                      fontFamily: cerimFont, fontSize: 14,
                      color: '#121212', letterSpacing: -0.07,
                    }}>
                      {isRitualLast ? 'Finalizar rotina' : 'Concluir este passo'}
                    </Text>
                  </View>
                  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                    <Path d="M6 3L11 8L6 13" stroke="#121212" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )
      )}
    </View>
  );
}
