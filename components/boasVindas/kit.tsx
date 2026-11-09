// ─────────────────────────────────────────────────────────────────────────────
// Átomos das telas de BOAS-VINDAS pós-pagamento (design "NiksBoasVindas", Claude Design,
// projeto "NIKS home redesign"). FONTE ÚNICA: fundo rosa da home, bolhas decorativas,
// barra de progresso de 6 partes, etiqueta, título de 34 pt e o botão pílula de 50 pt.
//
// Medidas do frame do design (393 × 852, status bar nos 54 pt de cima): o Y vira tela real
// por `useObFrame().y()`; o que encosta embaixo (botão a 34 pt da base = home indicator)
// por `useBvFrame().b()`. O X é o do frame, centrado na largura real.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, BackHandler, useWindowDimensions, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import { useObFrame } from '../onboarding/kit';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { confirmPremium, pwlog } from '../../lib/subscriptionGate';
import { PULAR_PAYWALL } from '../../lib/devPaywall';
import { escolherProblema, NOME_PROBLEMA, type ProblemaId } from '../../lib/analiseRapida';

export const BV = {
  pink: '#FF5EA8',
  ink: '#121212',
  sub: '#818181',
  body: '#515151',
  dark: '#3d3d3d',
  card: 'rgba(255,255,255,0.8)',
  track: 'rgba(18,18,18,0.08)',
  line: 'rgba(18,18,18,0.06)',
  /** Fundo da home (`linear-gradient(180deg, #FCE3EE 0%, #FDD5E6 45%, #FCDFEA 72%, #F9F1F4 100%)`). */
  bg: ['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4'] as const,
  bgStops: [0, 0.45, 0.72, 1] as const,
};

export const LOGO_ROSA = require('../../assets/home/score-logo-pink.png');

/** Frame: `y()` do kit do onboarding + `b()` para o que encosta embaixo + `x()` centrado. */
export function useBvFrame() {
  const f = useObFrame();
  const { width } = useWindowDimensions();
  const dx = (width - 393) / 2;
  return {
    ...f,
    width,
    /** Distância da base: no design o botão fica a 34 pt da borda (o home indicator). */
    b: (designBottom: number) => Math.max(12, f.insets.bottom + designBottom - 34),
    /** X do frame de 393 pt, centrado na largura real. */
    x: (designX: number) => dx + designX,
  };
}

/** Fundo das 9 telas (o da home). Sem voltar: gesto desligado e o voltar do Android também. */
// Trava de pagamento das boas-vindas (08/nov/2026, pedido do produto: ninguém passa daqui sem
// ter pago). O caminho normal só chega aqui pelo paywall, depois do premium CONFIRMADO no
// RevenueCat; esta trava cobre qualquer outro jeito de abrir uma tela `bv-*` (link, estado
// velho): confere o premium de novo e, sem ele, volta ao paywall. Fail closed (sem resposta =
// sem premium). Confirmou uma vez nesta abertura do app → não pergunta de novo. Em __DEV__ o
// paywall é pulado de propósito (atalho de dev), e a trava também — igual ao cadastro.
let premiumConfirmadoBv = false;
function useTravaPagamento() {
  const router = useRouter();
  useEffect(() => {
    if (PULAR_PAYWALL || premiumConfirmadoBv) return;
    let vivo = true;
    confirmPremium({ attempts: 2, label: 'boas_vindas:abertura' }).then((ok) => {
      if (!vivo) return;
      if (ok) { premiumConfirmadoBv = true; return; }
      pwlog('boas-vindas aberta sem premium → paywall'); // TEMP-PWGUARD
      router.replace('/(onboarding)/paywall-soft' as any);
    });
    return () => { vivo = false; };
  }, []);
}

export function BvScreen({ children }: { children: React.ReactNode }) {
  useTravaPagamento();
  useEffect(() => {
    const s = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => s.remove();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: BV.bg[0] }}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <StatusBar style="dark" />
      <LinearGradient colors={[...BV.bg]} locations={[...BV.bgStops]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {children}
    </View>
  );
}

/** Bolha branca chapada (`rgba(255,255,255,.42)`), em coordenadas do frame. */
export function BolhaBranca({ size, left, top }: { size: number; left: number; top: number }) {
  const { x, y } = useBvFrame();
  return (
    <View pointerEvents="none" style={{
      position: 'absolute', left: x(left), top: y(top), width: size, height: size,
      borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.42)',
    }} />
  );
}

type StopDef = { offset: number; color: string; opacity: number };
/** Bolha em degradê radial. `cx/cy/r` em fração da caixa (o "circle at 30% 75%" do CSS
 *  mede até o canto mais distante; "closest-side" = r 0,5). */
export function BolhaRadial({
  id, size, left, top, stops, cx = 0.5, cy = 0.5, r = 0.5,
}: { id: string; size: number; left: number; top: number; stops: StopDef[]; cx?: number; cy?: number; r?: number }) {
  const { x, y } = useBvFrame();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: x(left), top: y(top), width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx={`${cx * 100}%`} cy={`${cy * 100}%`} fx={`${cx * 100}%`} fy={`${cy * 100}%`} r={`${r * 100}%`}>
            {stops.map((s, i) => <Stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />)}
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** A bolha rosa do canto de cima (telas 2 e 4): 560 pt em (190, −90). */
export function BolhaCanto({ id }: { id: string }) {
  return (
    <BolhaRadial id={id} size={560} left={190} top={-90} cx={0.3} cy={0.75} r={1.026}
      stops={[{ offset: 0, color: '#FFAACD', opacity: 0.34 }, { offset: 1, color: '#FFFFFF', opacity: 0.2 }]} />
  );
}

/** Barra de progresso das telas 2–7: 6 partes de 4 pt, 6 pt entre elas, a 64 pt do topo. */
export function BvProgresso({ feitas }: { feitas: number }) {
  const { y } = useBvFrame();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, top: y(64), flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < feitas ? BV.pink : BV.track }} />
      ))}
    </View>
  );
}

/** Etiqueta rosa em caixa alta (12/700, entreletra 1,6). `ponto` = a bolinha da tela 1/9. */
export function BvEtiqueta({ children, ponto, cor = BV.pink, style }: { children: string; ponto?: boolean; cor?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 7 }, style]}>
      {ponto && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cor }} />}
      <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', letterSpacing: 1.6, color: cor }}>{children}</Text>
    </View>
  );
}

/** Título 34/38, 800, entreletra −1,2. */
export function BvTitulo({ children, center, cor = BV.ink, style }: { children: React.ReactNode; center?: boolean; cor?: string; style?: any }) {
  return (
    <Text style={[{
      fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2, color: cor,
      textAlign: center ? 'center' : 'left',
    }, style]}>
      {children}
    </Text>
  );
}

/** Botão pílula rosa de 50 pt, 18 pt das laterais, a 34 pt da base. */
export function BvBotao({ label, onPress, seta }: { label: string; onPress: () => void; seta?: boolean }) {
  const { b } = useBvFrame();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => { haptics.action(); onPress(); }}
      style={{
        position: 'absolute', left: 18, right: 18, bottom: b(34), height: 50, borderRadius: 25,
        backgroundColor: BV.pink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        shadowColor: BV.pink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' }}>{label}</Text>
      {seta && (
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </TouchableOpacity>
  );
}

/** Check rosa 18 pt (tela 5). */
export function BvCheck({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={BV.pink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Plano: 1 MÊS (07/nov/2026, pedido do produto) ────────────────────────────
// Todas as telas falam em 4 semanas / 30 dias. Não deixar sobrar "12 semanas", "84 dias".
export const SEMANAS_ROTINA = 4;
export const DIAS_ROTINA = 30;
/** ⚠️ PROVISÓRIO — o resultado prometido: −40% da dor principal. Não vem de dado nenhum. */
export const REDUCAO_DOR_PCT = 40;

/** A DOR PRINCIPAL das boas-vindas = o mesmo incômodo da carta de alerta do onboarding
 *  (`escolherProblema`: o mais forte na foto entre os que ela marcou; nenhum aparece → o 1º
 *  marcado). `nome` é o da frase da carta ("acne", "poros dilatados"…). */
export function useDorPrincipal(): { problema: ProblemaId; nome: string; intensidade: 0 | 1 | 2 | 3 } {
  const r = useAppStore((s) => s.analiseRapida);
  const concerns = useAppStore((s) => s.onboarding.concerns);
  const p = escolherProblema(r, concerns);
  if (!p) return { problema: 'acne', nome: NOME_PROBLEMA.acne, intensidade: 0 };
  return { problema: p.problema, nome: NOME_PROBLEMA[p.problema], intensidade: p.intensidade };
}

// ── Datas (pt-BR) ────────────────────────────────────────────────────────────
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** Hoje + 30 dias (o fim da rotina de 1 mês). */
export function dataMeta(hoje = new Date()): Date {
  const d = new Date(hoje);
  d.setDate(d.getDate() + DIAS_ROTINA);
  return d;
}
/** "30 de janeiro". */
export const diaMesLongo = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]}`;
/** "30 jan". */
export const diaMesCurto = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
/** "DOM, 8 NOV". */
export const diaSemanaCurto = (d: Date) => `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3).toUpperCase()}`;
