import { memo, useEffect, useState, type ReactNode } from 'react';
import { useTelaFocada } from '../../hooks/useTelaFocada';
import { View, Text, Image, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import Animated, {
  Easing, Keyframe, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { haptics } from '../../lib/haptics';
import BalancedText from '../BalancedText';
import type { CartaGanha, EstadoPoder } from '../../lib/cartasServidor';

// ─────────────────────────────────────────────────────────────────────────────
// A carta do NIKS — réplica da rodada 84 do Claude Design ("NIKS home redesign",
// NiksCartaFlo.dc.html): todas partem do verso (borda branca de 3, fio branco por
// dentro a 9, degradê perolado).
//   84a · verso (para raspar), colecionável (a flor + "Carta colecionável") e rara
//         (moldura dourada, holográfico que corre em 3,6 s, faíscas que piscam em
//         2,2 s, "Carta rara" e o título: "Campeã da semana" / "N dias seguidos").
//   84b · os 5 poderes (mesma moldura, muda o ícone, a cor e o estado embaixo — Ativo
//         até …, Armado, Usado em …) e a "Carta misteriosa" (Sequência em dobro de volta).
//   84c · as 3 cartas da convidada (produto, idade da pele, rotina) — só o visual; o
//         fluxo entra na Parte B.
// Medidas do design numa carta de 220 × 308; em outro tamanho tudo escala (x pela
// largura, y pela altura, fontes pela largura). "Reduzir movimento": sem holográfico
// correndo e sem faíscas piscando (ficam paradas).
// ─────────────────────────────────────────────────────────────────────────────

// Produto da carta de conversão: aparece só como sombra, sem dar para ver qual é.
const PRODUTO_CAMUFLADO = require('../../assets/onboarding/demo-produto-recorte.png');

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const LOGO = require('../../assets/home/score-logo-pink.png');
const BW = 220;
const BH = 308;
const STAR = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';
const BG_BASE = 'linear-gradient(165deg, #FFE6F1 0%, #FCD6E8 48%, #EFDDFB 100%)';
const BG_RARA = 'linear-gradient(165deg, #FFE9DC 0%, #FFD0E4 45%, #E9D6FF 100%)';
const HOLO = 'linear-gradient(115deg, rgba(255,255,255,0) 10%, rgba(255,214,170,0.95) 26%, rgba(255,160,210,0.95) 38%, rgba(255,255,255,1) 48%, rgba(195,175,255,0.95) 58%, rgba(160,225,255,0.85) 70%, rgba(255,255,255,0) 86%)';
const SOMBRA_BASE = '0px 16px 34px rgba(255,94,168,0.20), 0px 2px 6px rgba(255,94,168,0.10)';
const SOMBRA_PODER = '0px 16px 34px rgba(255,94,168,0.18), 0px 2px 6px rgba(255,94,168,0.10)';
const SOMBRA_RARA = '0px 0px 0px 1px rgba(245,180,74,0.45), 0px 0px 34px rgba(255,170,130,0.45), 0px 16px 36px rgba(240,140,100,0.28)';
// Carta de ALERTA do onboarding (Carta 2, 06/nov/2026, pedido do produto: "mais vermelha").
// O vermelho é o do próprio app — o do Niks score na faixa 0–25 (`lib/scoreTheme.ts`: #FD3A42,
// claro #FBD4D4) —, não um vermelho novo. Fundo blush avermelhado (no lugar do pêssego/lilás
// da rara), número e pílula no vermelho, sem holográfico nem faíscas (alerta não é prêmio).
export const VERMELHO_ALERTA = '#FD3A42';
const VERMELHO_ESCURO = '#C81E36';
const BG_ALERTA = 'linear-gradient(165deg, #FFF3F2 0%, #FFDADB 50%, #FFE7EA 100%)';
const SOMBRA_ALERTA = '0px 0px 0px 1px rgba(253,58,66,0.30), 0px 0px 30px rgba(253,58,66,0.30), 0px 16px 36px rgba(140,16,36,0.32)';

const IC = {
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
  shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12l2 2 4-4',
  extra: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z M15 12v6 M12 15h6 M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  coins: 'M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z M18.09 10.37A6 6 0 1 1 10.34 18 M7 6h1v4 M16.71 13.88l.7.71-2.82 2.82',
};
const SHIELD_FILL = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';
const LOCK = ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'];

type Poder = { icone: string; cor: string; brilho: string; bg: string; titulo: string; texto: string; selo?: boolean };
const PODERES: Record<string, Poder> = {
  sequencia_dobro: { icone: IC.flame, cor: '#F7833A', brilho: 'rgba(247,131,58,0.30)', bg: 'linear-gradient(165deg, #FFE9DD 0%, #FFDCCF 45%, #F6DDF5 100%)', titulo: 'Sequência em dobro', texto: 'Nos próximos 2 dias, cada dia vale +2' },
  protecao_sequencia: { icone: IC.shield, cor: '#8E6CEB', brilho: 'rgba(142,108,235,0.30)', bg: 'linear-gradient(165deg, #F3E9FF 0%, #E6DAFF 50%, #FCE0EF 100%)', titulo: 'Proteção de sequência', texto: 'Se você falhar 1 dia, sua sequência não zera', selo: true },
  carta_extra: { icone: IC.extra, cor: '#FF5EA8', brilho: 'rgba(255,94,168,0.30)', bg: 'linear-gradient(165deg, #FFE6F1 0%, #FFD1E5 50%, #F3DDF8 100%)', titulo: 'Carta extra', texto: 'Amanhã você ganha uma carta a mais' },
  scan_antecipado: { icone: IC.scan, cor: '#F2577A', brilho: 'rgba(242,87,122,0.28)', bg: 'linear-gradient(165deg, #FFE8EA 0%, #FFD8DE 50%, #F6DEF3 100%)', titulo: 'Scan antecipado', texto: 'Seu próximo scan de rosto já está liberado' },
  pontos_dobro: { icone: IC.coins, cor: '#E39A12', brilho: 'rgba(233,162,30,0.30)', bg: 'linear-gradient(165deg, #FFF3DA 0%, #FFE5C4 45%, #FFDCEB 100%)', titulo: 'Pontos em dobro', texto: 'Por 2 dias, todos os seus pontos valem o dobro' },
};
const MISTERIOSA: Poder = { ...PODERES.sequencia_dobro, icone: IC.help, brilho: 'rgba(169,121,240,0.32)', bg: 'linear-gradient(165deg, #FFE6F1 0%, #F1DAFA 50%, #E3D6FF 100%)' };

export type PassoPrevia = { nome: string; sub: string; foto?: string | null };
export type VisualCarta =
  | { k: 'verso' }
  /** Comum (regras novas, 05/nov/2026): a flor e os NIKS Points em destaque (`pontos`; contando com `contar`). */
  | { k: 'colecionavel'; pontos?: number | null; contar?: boolean }
  /** `faiscas`: o desenho das faíscas (0 = campeã, 1 = dias seguidos — o design muda as posições). */
  | { k: 'rara'; titulo: string; faiscas?: 0 | 1 }
  | { k: 'poder'; subtipo: string; misteriosa: boolean; estado: EstadoPoder | null }
  | { k: 'conhecimento'; titulo: string; texto: string | null }
  | { k: 'convidada'; tipo: 'produto'; foto?: any }
  | { k: 'convidada'; tipo: 'idade'; foto?: any; idade?: number | null }
  | { k: 'convidada'; tipo: 'rotina'; passos: PassoPrevia[]; titulo?: string }
  | { k: 'convidada'; tipo: 'chat' }
  | { k: 'convidada'; tipo: 'produto2' }
  /** A carta do onboarding (03/nov/2026): a idade da pele do scan, na identidade da rara.
   *  `numero` null = ainda não revelada (nada do número aparece). `contar`: ao aparecer, o
   *  número sobe de 0 até `numero` (`Contador`); sem ele, aparece pronto. */
  | { k: 'idade'; numero: number | null; chip: string; contar?: boolean }
  /** A carta de alerta do onboarding (06/nov/2026, a única no onboarding por enquanto): "Você
   *  tem N% mais [problema] do que a usuária padrão" — `problema` é um dos que ela marcou em "O
   *  que mais te incomoda" (`lib/cartaOnboarding.ts`). Número fixo por decisão do produto (sem
   *  dado do scan). `numero` null = não revelada. `semNumero` (versão pronta e DESLIGADA):
   *  "Encontramos sinais de [problema]" + a região na pílula. Era a carta "N% mais acne". */
  | { k: 'alerta'; numero: number | null; contar?: boolean; problema: string; semNumero?: boolean; regiaoTexto?: string | null }
  /** A Carta 1 do onboarding, a notícia boa (06/nov/2026): "Você tem menos [problema] do que
   *  N% das usuárias" — um problema que ela NÃO marcou e que a foto quase não mostrou
   *  (`lib/cartaOnboarding.ts` › `pontoForteDoOnboarding`). N fixo e PROVISÓRIO. `numero` null =
   *  não revelada (a pílula com o número fica invisível, sem mudar o desenho). */
  | { k: 'pontoForte'; numero: number | null; problema: string }
  /** Demonstração do scan de produto no onboarding (04/nov/2026, `(scan)/demo-scan`): resultado
   *  FIXO e igual para todas — foto do produto (vazia por enquanto), N% de compatibilidade e,
   *  com `resultado`, a pílula "Não recomendado" (sem o selo "Exemplo", tirado a pedido do
   *  produto). `numero` null = ainda não contou. Sem marca nem nome de produto real. */
  | { k: 'produtoExemplo'; numero: number | null; contar?: boolean; resultado?: boolean; foto?: any; nome?: string };

/** O visual de uma carta do servidor (família, subtipo, rara, origem e o estado do poder). */
export function visualDe(c: Pick<CartaGanha, 'origem' | 'conteudo'> & { carta: CartaGanha['carta'] }, estado?: EstadoPoder | null): VisualCarta {
  const cat = c.carta;
  if (c.origem === 'convidada') {
    const q = (c.conteudo ?? {}) as { tipo?: string; idade?: number | null; preocupacoes?: string[] | null };
    if (q.tipo === 'produto') return { k: 'convidada', tipo: 'produto', foto: PRODUTO_CAMUFLADO };
    if (q.tipo === 'idade') return { k: 'convidada', tipo: 'idade', idade: q.idade ?? null };
    if (q.tipo === 'chat') return { k: 'convidada', tipo: 'chat' };
    if (q.tipo === 'produto2') return { k: 'convidada', tipo: 'produto2' };
    const lista = (q.preocupacoes ?? []).slice(0, 3).map((p) => p.toLocaleLowerCase('pt-BR'));
    return {
      k: 'convidada', tipo: 'rotina', titulo: lista.length ? `Sua rotina para ${lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista[0]} está pronta.` : 'Sua rotina está pronta.',
      passos: [{ nome: 'Limpeza', sub: 'Primeiro passo' }, { nome: 'Tratamento', sub: 'Segundo passo' }, { nome: 'Proteção', sub: 'Terceiro passo' }],
    };
  }
  if (cat?.familia === 'poder') {
    // Regras novas: a "Carta misteriosa" deixou de existir como tipo na tela (a Carta de volta é um Pontos em dobro).
    return { k: 'poder', subtipo: cat.subtipo ?? 'pontos_dobro', misteriosa: false, estado: estado ?? null };
  }
  if (cat?.familia === 'conhecimento') {
    return { k: 'conhecimento', titulo: String((c.conteudo as any)?.titulo ?? cat.nome), texto: ((c.conteudo as any)?.texto ?? cat.texto ?? null) as string | null };
  }
  if (c.origem === 'campea') return { k: 'rara', titulo: 'Campeã da semana' };
  // A rara das missões do tutorial (06/nov/2026, `lib/missoes.ts`).
  if (c.origem === 'missoes') return { k: 'rara', titulo: 'Missões concluídas' };
  if (c.origem === 'marco') {
    const n = Number((c.conteudo as any)?.marco);
    return { k: 'rara', titulo: Number.isFinite(n) && n > 0 ? `${n} dias seguidos` : 'Carta rara', faiscas: 1 };
  }
  if (cat?.raridade === 'rara') return { k: 'rara', titulo: cat.nome };
  return { k: 'colecionavel' };
}

function Faisca({ size, color, style, i, parado }: { size: number; color: string; style: ViewStyle; i: number; parado: boolean }) {
  const p = useSharedValue(parado ? 1 : 0);
  const focada = useTelaFocada();
  useEffect(() => {
    if (parado || !focada) { cancelAnimation(p); p.set(1); return; }
    p.set(0);
    p.set(withDelay(i * 260, withRepeat(withSequence(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
    ), -1, false)));
    return () => cancelAnimation(p);
  }, [parado, i, p, focada]);
  const st = useAnimatedStyle(() => ({ opacity: 0.25 + 0.75 * p.get(), transform: [{ scale: 0.7 + 0.3 * p.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style, st]}>
      <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={STAR} fill={color} /></Svg>
    </Animated.View>
  );
}

// Holográfico da rara: camada de 260% que corre de 0% a 100% (background-position) e volta, 3,6 s.
function Holo({ w, h, parado }: { w: number; h: number; parado: boolean }) {
  const p = useSharedValue(0);
  const focada = useTelaFocada();
  useEffect(() => {
    if (parado || !focada) { cancelAnimation(p); p.set(0); return; }
    p.set(withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(p);
  }, [parado, p, focada]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -1.6 * w * p.get() }, { translateY: -0.8 * h }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: w * 2.6, height: h * 2.6, mixBlendMode: 'overlay', opacity: 0.95, experimental_backgroundImage: HOLO }, st]}
    />
  );
}

// O número que conta de 0 até o valor (idade da pele / % da acne do onboarding). Fica num
// componente só dele: cada passo redesenha SÓ este texto — antes cada número novo
// redesenhava a tela inteira da carta no meio do flash e das partículas, e travava.
// Desacelera em ease-out quártico: os primeiros números passam rápido e os últimos assentam.
export const CONTA_MS = 1300;
// Exportado também para o resultado da demonstração do scan de produto (`(scan)/demo-scan`).
export function Contador({ alvo, contar, style, duracao = CONTA_MS }: { alvo: number; contar: boolean; style: any; duracao?: number }) {
  const [n, setN] = useState(contar ? 0 : alvo);
  useEffect(() => {
    if (!contar) { setN(alvo); return; }
    let raf = 0;
    let shown = -1;
    const t0 = performance.now();
    const f = (now: number) => {
      const t = Math.min(1, (now - t0) / duracao);
      const v = Math.round(alvo * (1 - Math.pow(1 - t, 4)));
      if (v !== shown) { shown = v; setN(v); }
      if (t < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [alvo, contar, duracao]);
  return <Text style={style}>{String(n)}</Text>;
}

// Pílula "Não recomendado" da carta de exemplo: esmaece e cresce de 92% (nunca de 0), 240 ms,
// ease-out forte. Com "Reduzir movimento" o Reanimated a mostra pronta.
const RESULTADO_ENTRA = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.92 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(0.23, 1, 0.32, 1) },
}).duration(240);

function Pilula({ s, children, style }: { s: number; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ height: 26 * s, paddingLeft: 9 * s, paddingRight: 11 * s, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.9)', flexDirection: 'row', alignItems: 'center', gap: 5 * s }, style]}>
      {children}
    </View>
  );
}

type Props = {
  v: VisualCarta;
  w: number;
  h?: number;
  /** NIKS Points da carta (pílula branca embaixo). Ignorado se `selo` vier. */
  pontos?: number | null;
  /** Selo próprio no lugar da pílula de pontos (ex.: o que conta na revelação). */
  selo?: ReactNode;
  /** Sem sombra (quando quem chama desenha a sombra por fora). */
  semSombra?: boolean;
  /** Faíscas de fora da carta (a rara, como no design). */
  faiscasFora?: boolean;
  parado?: boolean;
  /** Botão da carta da convidada (abre o paywall — Parte B). */
  onBotao?: () => void;
  /** Só as faíscas de fora (para quem recorta a carta e desenha as faíscas por cima). */
  apenasFaiscas?: boolean;
};

/** Sombra da carta (para quem recorta a carta e desenha a sombra por fora). */
export function sombraCarta(v: VisualCarta): string {
  if (v.k === 'alerta') return SOMBRA_ALERTA;
  return v.k === 'rara' || v.k === 'idade' || v.k === 'pontoForte' ? SOMBRA_RARA : v.k === 'poder' ? SOMBRA_PODER : SOMBRA_BASE;
}

function CartaBase({ v, w, h: hProp, pontos, selo, semSombra, faiscasFora = true, parado: paradoProp, onBotao, apenasFaiscas }: Props) {
  const rmSys = useReducedMotion();
  const parado = Boolean(paradoProp || rmSys);
  const h = hProp ?? (w * BH) / BW;
  const sx = w / BW;
  const sy = h / BH;
  const s = sx;
  const X = (n: number) => n * sx;
  const Y = (n: number) => n * sy;
  // As do onboarding (idade e acne) usam a identidade da rara: fundo, sombra, fio e faíscas de fora.
  // A de alerta tem a própria identidade (vermelha): fora da família da rara.
  const rara = v.k === 'rara' || v.k === 'idade' || v.k === 'pontoForte';
  const alerta = v.k === 'alerta';
  const poder = v.k === 'poder' ? (v.misteriosa ? MISTERIOSA : PODERES[v.subtipo] ?? PODERES.sequencia_dobro) : null;
  const bg = alerta ? BG_ALERTA : rara ? BG_RARA : poder ? poder.bg : BG_BASE;
  const sombra = semSombra ? undefined : alerta ? SOMBRA_ALERTA : rara ? SOMBRA_RARA : poder ? SOMBRA_PODER : SOMBRA_BASE;
  const borda = Math.max(1.5, 3 * s);
  // Como no CSS do design, as camadas se posicionam DENTRO da borda (padding box).
  const wi = w - 2 * borda;
  const hi = h - 2 * borda;
  const inset = 9 * s;
  const fio = rara || alerta ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.85)';
  const usado = v.k === 'poder' && v.estado?.st === 'used';

  const pilulaPontos = (cor: string) => (selo ?? (pontos != null ? (
    <View style={{ height: 30 * s, paddingHorizontal: 13 * s, borderRadius: 100, backgroundColor: '#fff', boxShadow: `0px ${4 * s}px ${10 * s}px ${cor}`, flexDirection: 'row', alignItems: 'center', gap: 4 * s }}>
      <Text style={{ fontSize: 13 * s, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] }}>{`+${pontos}`}</Text>
      <Text style={{ fontSize: 13 * s, color: INK }}>NIKS Points</Text>
    </View>
  ) : null));
  const temRodape = Boolean(selo) || pontos != null;

  const logo = (top: number, lw: number, lh: number, glow: string) => (
    <Image source={LOGO} style={{ position: 'absolute', left: (wi - lw * s) / 2, top: top - (lh * s) / 2, width: lw * s, height: lh * s, filter: [{ dropShadow: { offsetX: 0, offsetY: 6 * s, standardDeviation: 6 * s, color: glow } }] } as any} />
  );

  let corpo: ReactNode = null;
  if (v.k === 'verso') {
    corpo = (
      <>
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'radial-gradient(55% 40% at 50% 46%, rgba(255,255,255,0.85), rgba(255,255,255,0))' }]} />
        {logo(hi * 0.46, 78, 79, 'rgba(255,94,168,0.35)')}
      </>
    );
  } else if (v.k === 'colecionavel') {
    // Comum (regras novas): a flor em cima e os NIKS Points em destaque embaixo (o número
    // grande conta de 0 até o valor na revelação). Sem pontos ainda: só a flor.
    const pts = v.pontos ?? pontos ?? null;
    corpo = (
      <>
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'radial-gradient(55% 38% at 50% 36%, rgba(255,255,255,0.9), rgba(255,255,255,0))' }]} />
        {logo(hi * (pts != null ? 0.34 : 0.42), 84, 85, 'rgba(255,94,168,0.35)')}
        {pts != null && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: Y(30), alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 30 * s, lineHeight: 52 * s, fontWeight: '800', color: PINK, letterSpacing: -1 * s }}>+</Text>
              <Contador alvo={pts} contar={Boolean(v.contar) && !parado} duracao={900} style={{ fontSize: 48 * s, lineHeight: 52 * s, fontWeight: '800', color: INK, letterSpacing: -1.6 * s, fontVariant: ['tabular-nums'] }} />
            </View>
            <Text style={{ marginTop: 2 * s, fontSize: 14 * s, lineHeight: 18 * s, fontWeight: '600', color: INK, letterSpacing: -0.2 * s }}>NIKS Points</Text>
          </View>
        )}
      </>
    );
  } else if (v.k === 'conhecimento') {
    // O design 84 não tem a de conhecimento: a moldura do verso com o título e o texto.
    corpo = (
      <>
        <View style={{ position: 'absolute', left: X(20), right: X(20), top: Y(26), bottom: Y(temRodape ? 62 : 26), justifyContent: 'center' }}>
          <Text style={{ textAlign: 'center', fontSize: 18 * s, lineHeight: 23 * s, fontWeight: '700', letterSpacing: -0.4 * s, color: INK }}>{v.titulo}</Text>
          {!!v.texto && <Text style={{ marginTop: 8 * s, textAlign: 'center', fontSize: 13 * s, lineHeight: 18 * s, color: '#3d3d3d' }}>{v.texto}</Text>}
        </View>
        {temRodape && <View style={[styles.rodape, { bottom: Y(20) }]}>{pilulaPontos('rgba(255,94,168,0.22)')}</View>}
      </>
    );
  } else if (v.k === 'idade') {
    // "Idade da sua pele", o número grande em rosa, "anos" e a frase que compara com a
    // idade dela — um bloco só, centrado na carta (sem o selo "Carta rara", pedido do
    // produto; a frase em 1 ou 2 linhas não desalinha nada). Holográfico e faíscas da rara.
    corpo = (
      <>
        <Holo w={wi} h={hi} parado={parado} />
        <Faisca i={4} parado={parado} size={10 * s} color="#FFFFFF" style={{ left: X(24), top: Y(40) }} />
        <Faisca i={5} parado={parado} size={13 * s} color="#FFFFFF" style={{ right: X(24), top: Y(150) }} />
        <View style={{ position: 'absolute', left: (wi - 180 * s) / 2, top: hi * 0.42 - 90 * s, width: 180 * s, height: 180 * s, borderRadius: 90 * s, experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,250,240,0.95), rgba(255,200,150,0.35) 60%, rgba(255,200,150,0))' }} />
        <View style={{ position: 'absolute', left: X(16), right: X(16), top: Y(18), bottom: Y(18), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '600', letterSpacing: -0.2 * s, color: INK, textAlign: 'center' }}>Idade da sua pele</Text>
          {v.numero != null
            ? <Contador alvo={v.numero} contar={!!v.contar} style={{ marginTop: 4 * s, fontSize: 96 * s, lineHeight: 102 * s, fontWeight: '800', letterSpacing: -3 * s, color: PINK, fontVariant: ['tabular-nums'], textAlign: 'center' }} />
            : <Text style={{ marginTop: 4 * s, fontSize: 96 * s, lineHeight: 102 * s }}> </Text>}
          <Text style={{ fontSize: 17 * s, lineHeight: 21 * s, fontWeight: '500', letterSpacing: -0.2 * s, color: INK, textAlign: 'center' }}>anos</Text>
          {/* A frase de baixo em tamanho de leitura (16): cabe em 1 linha ou quebra em 2. */}
          <View style={{ marginTop: 22 * s, minHeight: 34 * s, paddingVertical: 6 * s, paddingHorizontal: 14 * s, borderRadius: 17 * s, backgroundColor: PINK, justifyContent: 'center', boxShadow: `0px ${4 * s}px ${10 * s}px rgba(240,140,100,0.25)` }}>
            <Text style={{ color: '#fff', fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '700', letterSpacing: -0.2 * s, textAlign: 'center' }}>{v.chip}</Text>
          </View>
        </View>
      </>
    );
  } else if (v.k === 'alerta') {
    // "Você tem" · "40%" (o % menor, na mesma linha de base) · "mais [problema]" · pílula rosa
    // "do que a usuária padrão" (06/nov/2026; era "Detectamos que você tem · 40% · mais acne ·
    // que uma mulher comum da sua idade"). Mesmo fundo, holo e faíscas da carta da idade.
    // `semNumero` (desligada): "Encontramos sinais de" · [problema] grande · pílula com a região.
    const fraseBaixo = v.semNumero ? v.regiaoTexto ?? null : 'do que a usuária padrão';
    corpo = (
      <>
        <View style={{ position: 'absolute', left: (wi - 180 * s) / 2, top: hi * 0.4 - 90 * s, width: 180 * s, height: 180 * s, borderRadius: 90 * s, experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,0.95), rgba(255,190,192,0.35) 60%, rgba(255,190,192,0))' }} />
        <View style={{ position: 'absolute', left: X(16), right: X(16), top: Y(18), bottom: Y(18), alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ alignSelf: 'stretch', fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '600', letterSpacing: -0.4 * s, color: INK, textAlign: 'center' }}>
            {v.semNumero ? 'Encontramos sinais de' : 'Você tem'}
          </Text>
          {v.semNumero ? (
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ alignSelf: 'stretch', marginTop: 8 * s, fontSize: 44 * s, lineHeight: 48 * s, fontWeight: '800', letterSpacing: -1.2 * s, color: VERMELHO_ALERTA, textAlign: 'center' }}>{v.problema}</Text>
          ) : (
            <>
              <View style={{ marginTop: 4 * s, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
                {v.numero != null
                  ? <Contador alvo={v.numero} contar={!!v.contar} style={{ fontSize: 96 * s, lineHeight: 102 * s, fontWeight: '800', letterSpacing: -3 * s, color: VERMELHO_ALERTA, fontVariant: ['tabular-nums'] }} />
                  : <Text style={{ fontSize: 96 * s, lineHeight: 102 * s }}> </Text>}
                {v.numero != null && (
                  <Text style={{ marginLeft: 2 * s, fontSize: 40 * s, lineHeight: 44 * s, fontWeight: '800', color: VERMELHO_ALERTA }}>%</Text>
                )}
              </View>
              <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} style={{ alignSelf: 'stretch', fontSize: 21 * s, lineHeight: 26 * s, fontWeight: '700', letterSpacing: -0.4 * s, color: INK, textAlign: 'center' }}>{`mais ${v.problema}`}</Text>
            </>
          )}
          {!!fraseBaixo && (
            <View style={{ marginTop: 22 * s, alignSelf: 'stretch', paddingVertical: 10 * s, paddingHorizontal: 14 * s, borderRadius: 24 * s, backgroundColor: VERMELHO_ALERTA, justifyContent: 'center', boxShadow: `0px ${4 * s}px ${10 * s}px rgba(200,30,54,0.28)` }}>
              <Text style={{ color: '#fff', fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '700', letterSpacing: -0.2 * s, textAlign: 'center' }}>{fraseBaixo}</Text>
            </View>
          )}
        </View>
      </>
    );
  } else if (v.k === 'pontoForte') {
    // "Você tem" · "menos" · [problema] grande em rosa · pílula "do que N% das usuárias". Mesmo
    // fundo, holo e faíscas da carta de alerta (as duas cartas do onboarding são da mesma família).
    corpo = (
      <>
        <Holo w={wi} h={hi} parado={parado} />
        <Faisca i={4} parado={parado} size={10 * s} color="#FFFFFF" style={{ left: X(24), top: Y(40) }} />
        <Faisca i={5} parado={parado} size={13 * s} color="#FFFFFF" style={{ right: X(24), top: Y(150) }} />
        <View style={{ position: 'absolute', left: (wi - 180 * s) / 2, top: hi * 0.4 - 90 * s, width: 180 * s, height: 180 * s, borderRadius: 90 * s, experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,250,240,0.95), rgba(255,200,150,0.35) 60%, rgba(255,200,150,0))' }} />
        <View style={{ position: 'absolute', left: X(16), right: X(16), top: Y(18), bottom: Y(18), alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ alignSelf: 'stretch', fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '600', letterSpacing: -0.4 * s, color: INK, textAlign: 'center' }}>
            Você tem
          </Text>
          <Text style={{ marginTop: 6 * s, fontSize: 21 * s, lineHeight: 26 * s, fontWeight: '700', letterSpacing: -0.4 * s, color: INK, textAlign: 'center' }}>menos</Text>
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ alignSelf: 'stretch', marginTop: 2 * s, fontSize: 44 * s, lineHeight: 48 * s, fontWeight: '800', letterSpacing: -1.2 * s, color: PINK, textAlign: 'center' }}>{v.problema}</Text>
          <View style={{ opacity: v.numero != null ? 1 : 0, marginTop: 22 * s, alignSelf: 'stretch', paddingVertical: 10 * s, paddingHorizontal: 14 * s, borderRadius: 24 * s, backgroundColor: PINK, justifyContent: 'center', boxShadow: `0px ${4 * s}px ${10 * s}px rgba(240,140,100,0.25)` }}>
            <Text style={{ color: '#fff', fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '700', letterSpacing: -0.2 * s, textAlign: 'center' }}>{`do que ${v.numero ?? 0}% das usuárias`}</Text>
          </View>
        </View>
      </>
    );
  } else if (v.k === 'produtoExemplo') {
    // Design 86a do Claude Design (`NiksCartaFlo.dc.html`, rodada 86 · "Compatibilidade com
    // produto", 04/nov/2026): moldura e fundo da carta base, sem etiqueta no topo. A foto do
    // produto abre a carta (quadrado 92 com borda branca de 3 e a foto ampliada 112%), o nome
    // embaixo dela, o brilho branco atrás do número, "22%" em rosa (o herói, contando),
    // "de compatibilidade" e, no selo branco de baixo, "Não recomendado" com o X no círculo
    // vermelho (entra ao fim da contagem). Posições do design (camadas dentro da borda), em
    // escala; tudo absoluto, então nada pula quando o número e o selo aparecem.
    const foto = 92 * s;
    const fotoDentro = foto - 2 * borda;
    const fotoZoom = fotoDentro * 1.12;
    corpo = (
      <>
        <View style={{ position: 'absolute', left: (wi - foto) / 2, top: Y(26), width: foto, height: foto, borderRadius: 22 * s, borderWidth: borda, borderColor: '#fff', backgroundColor: '#F4F4F4', overflow: 'hidden', boxShadow: `0px ${8 * s}px ${18 * s}px rgba(255,94,168,0.18)` }}>
          {v.foto ? (
            <Image source={v.foto} resizeMode="cover" style={{ position: 'absolute', left: (fotoDentro - fotoZoom) / 2, top: (fotoDentro - fotoZoom) / 2, width: fotoZoom, height: fotoZoom }} />
          ) : null}
        </View>
        {!!v.nome && (
          <Text numberOfLines={1} style={[styles.centro, { top: Y(130), fontSize: 13 * s, lineHeight: 17 * s, fontWeight: '600', color: '#3d3d3d' }]}>{v.nome}</Text>
        )}
        <View style={{ position: 'absolute', left: wi / 2 - 75 * s, top: Y(196) - 60 * s, width: 150 * s, height: 120 * s, borderRadius: 75 * s, experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,255,255,0.9), rgba(255,255,255,0))' }} />
        {v.numero != null && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: Y(150), flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' }}>
            <Contador alvo={v.numero} contar={!!v.contar} style={[styles.numeroProduto, { fontSize: 72 * s, lineHeight: 76 * s, letterSpacing: -3 * s, textShadowOffset: { width: 0, height: 6 * s }, textShadowRadius: 16 * s }]} />
            <Text style={[styles.numeroProduto, { marginTop: 12 * s, marginLeft: 2 * s, fontSize: 26 * s, lineHeight: 28 * s, textShadowOffset: { width: 0, height: 6 * s }, textShadowRadius: 16 * s }]}>%</Text>
          </View>
        )}
        <Text style={[styles.centro, { top: Y(226), fontSize: 14 * s, lineHeight: 18 * s, fontWeight: '600', letterSpacing: -0.2 * s }]}>de compatibilidade</Text>
        {v.resultado && (
          <View style={[styles.rodape, { bottom: Y(20) }]}>
            <Animated.View
              entering={RESULTADO_ENTRA}
              style={{ height: 30 * s, paddingLeft: 6 * s, paddingRight: 13 * s, borderRadius: 100, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 6 * s, boxShadow: `0px ${4 * s}px ${10 * s}px rgba(255,94,168,0.18)` }}
            >
              <View style={{ width: 19 * s, height: 19 * s, borderRadius: 9.5 * s, backgroundColor: '#FD3A42', alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={9 * s} height={9 * s} viewBox="0 0 24 24"><Path d="M5 5l14 14M19 5L5 19" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" /></Svg>
              </View>
              <Text style={{ fontSize: 13 * s, fontWeight: '700', color: INK }}>Não recomendado</Text>
            </Animated.View>
          </View>
        )}
      </>
    );
  } else if (rara) {
    corpo = (
      <>
        <Holo w={wi} h={hi} parado={parado} />
        {(v as { faiscas?: number }).faiscas === 1 ? (
          <>
            <Faisca i={3} parado={parado} size={12 * s} color="#FFFFFF" style={{ right: X(34), top: Y(70) }} />
            <Faisca i={4} parado={parado} size={9 * s} color="#FFFFFF" style={{ left: X(34), top: Y(160) }} />
          </>
        ) : (
          <>
            <Faisca i={4} parado={parado} size={10 * s} color="#FFFFFF" style={{ left: X(30), top: Y(64) }} />
            <Faisca i={5} parado={parado} size={13 * s} color="#FFFFFF" style={{ right: X(30), top: Y(150) }} />
          </>
        )}
        <View style={[styles.rodape, { top: Y(20) }]}>
          <Pilula s={s}>
            <Svg width={12 * s} height={12 * s} viewBox="0 0 24 24"><Path d={STAR} fill="#F5B44A" /></Svg>
            <Text style={{ fontSize: 12 * s, fontWeight: '600', color: INK }}>Carta rara</Text>
          </Pilula>
        </View>
        <View style={{ position: 'absolute', left: (wi - 150 * s) / 2, top: hi * 0.42 - 75 * s, width: 150 * s, height: 150 * s, borderRadius: 75 * s, experimental_backgroundImage: 'radial-gradient(closest-side, rgba(255,250,240,0.95), rgba(255,200,150,0.35) 60%, rgba(255,200,150,0))' }} />
        {logo(hi * 0.42, 84, 85, 'rgba(240,140,100,0.5)')}
        <BalancedText text={(v as { titulo: string }).titulo} numberOfLines={2} style={[styles.centro, { top: Y(204), fontSize: 18 * s, lineHeight: 22 * s, fontWeight: '700', letterSpacing: -0.4 * s }]} />
        {temRodape && <View style={[styles.rodape, { bottom: Y(20) }]}>{pilulaPontos('rgba(240,140,100,0.22)')}</View>}
      </>
    );
  } else if (poder && v.k === 'poder') {
    const est = v.estado;
    corpo = (
      <>
        <View style={{ position: 'absolute', left: (wi - 170 * s) / 2, top: Y(104) - 85 * s, width: 170 * s, height: 170 * s, borderRadius: 85 * s, experimental_backgroundImage: `radial-gradient(closest-side, ${poder.brilho}, rgba(255,255,255,0))` }} />
        <View style={[styles.rodape, { top: Y(20) }]}>
          <Pilula s={s} style={{ gap: 6 * s }}>
            <View style={{ width: 7 * s, height: 7 * s, borderRadius: 3.5 * s, backgroundColor: poder.cor }} />
            <Text style={{ fontSize: 12 * s, fontWeight: '600', color: INK }}>{v.misteriosa ? 'Carta misteriosa' : 'Carta de poder'}</Text>
          </Pilula>
        </View>
        <View style={{ position: 'absolute', left: (wi - 84 * s) / 2, top: Y(104) - 42 * s, width: 84 * s, height: 84 * s, borderRadius: 42 * s, backgroundColor: '#fff', boxShadow: `0px ${8 * s}px ${20 * s}px ${poder.brilho}`, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={40 * s} height={40 * s} viewBox="0 0 24 24"><Path d={poder.icone} fill="none" stroke={poder.cor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </View>
        {poder.selo && (
          <View style={{ position: 'absolute', left: wi / 2 + 18 * s, top: Y(130), width: 30 * s, height: 30 * s, borderRadius: 15 * s, borderWidth: 2.5 * s, borderColor: '#fff', backgroundColor: poder.cor, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={14 * s} height={14 * s} viewBox="0 0 24 24"><Path d={SHIELD_FILL} fill="#fff" /></Svg>
          </View>
        )}
        <View style={{ position: 'absolute', left: X(14), right: X(14), top: Y(160) }}>
          <BalancedText text={poder.titulo} style={{ textAlign: 'center', fontSize: 17 * s, lineHeight: 21 * s, fontWeight: '700', letterSpacing: -0.4 * s, color: INK }} />
          <BalancedText text={poder.texto} style={{ marginTop: 4 * s, textAlign: 'center', fontSize: 13 * s, lineHeight: 17 * s, color: '#3d3d3d' }} />
        </View>
        {usado && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: 0.38 }]} />}
        {temRodape && <View style={[styles.rodape, { bottom: Y(est ? 54 : 18) }]}>{pilulaPontos('rgba(200,60,120,0.18)')}</View>}
        {est && (
          <View style={[styles.rodape, { bottom: Y(18) }]}>
            <View style={{ height: 28 * s, paddingLeft: 10 * s, paddingRight: 12 * s, borderRadius: 100, backgroundColor: usado ? 'rgba(255,255,255,0.6)' : '#fff', boxShadow: `0px ${3 * s}px ${8 * s}px rgba(200,60,120,0.10)`, flexDirection: 'row', alignItems: 'center', gap: 6 * s }}>
              <View style={{ width: 7 * s, height: 7 * s, borderRadius: 3.5 * s, backgroundColor: usado ? '#B5B5B5' : poder.cor }} />
              <Text style={{ fontSize: 12 * s, fontWeight: '600', color: usado ? MUTE : INK }}>{est.texto}</Text>
            </View>
          </View>
        )}
      </>
    );
  } else if (v.k === 'convidada') {
    const botao = (rotulo: string, st: ViewStyle, fs: number) => (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={!onBotao}
        onPress={() => { haptics.action(); onBotao?.(); }}
        style={[{ height: 44 * s, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center', boxShadow: `0px ${8 * s}px ${18 * s}px rgba(255,94,168,0.35)` }, st]}
      >
        <Text style={{ color: '#fff', fontSize: fs * s, fontWeight: '600', letterSpacing: -0.3 * s }}>{rotulo}</Text>
      </TouchableOpacity>
    );
    if (v.tipo === 'produto') {
      corpo = (
        <>
          <BalancedText text="Achamos o produto perfeito para sua pele." style={[styles.centro, { left: X(20), right: X(20), top: Y(26), fontSize: 17 * s, lineHeight: 21 * s, fontWeight: '700', letterSpacing: -0.4 * s }]} />
          {v.foto && (
            <Image source={v.foto} resizeMode="contain" style={{ position: 'absolute', left: 0, right: 0, alignSelf: 'center', top: Y(160) - 72 * s, height: 144 * s, width: wi, opacity: 0.2, tintColor: '#000' }} />
          )}
          {botao('Ver produto', { position: 'absolute', left: X(18), right: X(18), bottom: Y(20) }, 15)}
        </>
      );
    } else if (v.tipo === 'idade') {
      corpo = (
        <>
          <BalancedText text="Sabemos exatamente a idade da sua pele" style={[styles.centro, { left: X(20), right: X(20), top: Y(26), fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '700', letterSpacing: -0.3 * s }]} />
          {/* Número camuflado: dá para ver que há um número, mas não dá para ler. */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: Y(92), height: Y(130), alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={{ paddingHorizontal: 24 * s, borderRadius: 44 * s, overflow: 'hidden' }}>
              <Text allowFontScaling={false} style={{ fontSize: 76 * s, lineHeight: 88 * s, fontWeight: '800', color: PINK }}>{v.idade != null ? String(v.idade) : '28'}</Text>
              <BlurView intensity={58} tint="light" style={[StyleSheet.absoluteFill, { margin: -12 * s }]} />
            </View>
          </View>
          {botao('Descobrir', { position: 'absolute', left: X(18), right: X(18), bottom: Y(20) }, 15)}
        </>
      );
    } else if (v.tipo === 'produto2') {
      corpo = (
        <>
          <BalancedText text="Esse produto pode deixar sua pele com aparência mais jovem." style={[styles.centro, { left: X(20), right: X(20), top: Y(26), fontSize: 17 * s, lineHeight: 21 * s, fontWeight: '700', letterSpacing: -0.3 * s, color: INK }]} />
          {/* Silhueta de um sérum com conta-gotas: outro formato, sem dar para ver qual é. */}
          <View style={{ position: 'absolute', left: 0, right: 0, top: Y(170) - 50 * s, alignItems: 'center', opacity: 0.2 }}>
            <Svg width={67 * s} height={100 * s} viewBox="0 0 100 150">
              <Path d="M38 12a12 12 0 0 1 24 0v22H38z" fill="#000" />
              <Path d="M33 37h34a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H33a3 3 0 0 1-3-3V40a3 3 0 0 1 3-3z" fill="#000" />
              <Path d="M30 62h40c11 0 18 8 18 18v58a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12V80c0-10 7-18 18-18z" fill="#000" />
            </Svg>
          </View>
          {botao('Ver produto', { position: 'absolute', left: X(18), right: X(18), bottom: Y(20) }, 15)}
        </>
      );
    } else if (v.tipo === 'chat') {
      // Mensagens camufladas: só a forma das bolhas, sem dar para ler.
      const bolha = (texto: string, top: number, sua: boolean) => (
        <View style={{ position: 'absolute', top: Y(top), ...(sua ? { right: X(22) } : { left: X(22) }), maxWidth: wi * 0.68, borderRadius: 14 * s, overflow: 'hidden', backgroundColor: sua ? 'rgba(255,94,168,0.28)' : '#fff', paddingVertical: 8 * s, paddingHorizontal: 12 * s }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text numberOfLines={2} style={{ fontSize: 11 * s, lineHeight: 14 * s, color: INK }}>{texto}</Text>
          <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
        </View>
      );
      corpo = (
        <>
          <BalancedText text="O NIKS Chat quer enviar uma mensagem pra você" style={[styles.centro, { left: X(20), right: X(20), top: Y(26), fontSize: 17 * s, lineHeight: 21 * s, fontWeight: '700', letterSpacing: -0.3 * s, color: INK }]} />
          {bolha('Olhei a sua pele e separei uma dica para você', 104, false)}
          {bolha('Me conta o que você viu', 160, true)}
          {botao('Ver mensagem', { position: 'absolute', left: X(18), right: X(18), bottom: Y(20) }, 15)}
        </>
      );
    } else {
      corpo = (
        <>
          <View style={{ position: 'absolute', left: X(18), right: X(18), top: Y(24) }}>
            <BalancedText text={v.titulo ?? 'Já temos sua rotina completa de skincare.'} style={{ textAlign: 'center', fontSize: 16 * s, lineHeight: 20 * s, fontWeight: '700', letterSpacing: -0.3 * s, color: INK }} />
            <Text style={{ marginTop: 3 * s, textAlign: 'center', fontSize: 13 * s, lineHeight: 17 * s, color: '#3d3d3d' }}>Toque para ver</Text>
          </View>
          <View style={{ position: 'absolute', left: X(26), right: X(26), top: Y(106), paddingVertical: 8 * s, paddingHorizontal: 10 * s, borderRadius: 14 * s, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', gap: 4 * s }}>
            {v.passos.slice(0, 3).map((p, i) => (
              <View key={i} style={{ height: 30 * s, flexDirection: 'row', alignItems: 'center', gap: 8 * s }}>
                <View style={{ width: 26 * s, height: 26 * s, borderRadius: 8 * s, backgroundColor: '#F4F4F4', overflow: 'hidden', padding: 3 * s }}>
                  {p.foto ? <Image source={{ uri: p.foto }} blurRadius={1.5} resizeMode="contain" style={{ width: '100%', height: '100%' }} /> : null}
                </View>
                {/* Nome e passo borrados (só a forma): o desfoque de 3,5 do design é um BlurView por cima. */}
                <View style={{ flex: 1, minWidth: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Text numberOfLines={1} style={{ fontSize: 11 * s, lineHeight: 14 * s, fontWeight: '600', color: INK }}>{p.nome}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 9 * s, lineHeight: 12 * s, color: MUTE }}>{p.sub}</Text>
                  <BlurView intensity={14} tint="light" style={[StyleSheet.absoluteFill, { margin: -4 * s }]} />
                </View>
              </View>
            ))}
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <View style={{ width: 34 * s, height: 34 * s, borderRadius: 17 * s, backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(255,94,168,0.35)', boxShadow: `0px ${6 * s}px ${16 * s}px rgba(255,94,168,0.30)`, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={15 * s} height={15 * s} viewBox="0 0 24 24">{LOCK.map((d) => <Path key={d} d={d} fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />)}</Svg>
              </View>
            </View>
          </View>
          {botao('Ver minha rotina', { position: 'absolute', left: X(18), right: X(18), bottom: Y(20) }, 15)}
        </>
      );
    }
  }

  const fora = rara && faiscasFora;
  return (
    <View pointerEvents={apenasFaiscas ? 'none' : 'auto'} style={{ width: w, height: h }}>
      {fora && (v as { faiscas?: number }).faiscas === 1 && (
        <>
          <Faisca i={0} parado={parado} size={16 * s} color="#F5B44A" style={{ left: -18 * s, top: Y(30) }} />
          <Faisca i={1} parado={parado} size={12 * s} color={PINK} style={{ right: -16 * s, top: Y(110) }} />
          <Faisca i={2} parado={parado} size={14 * s} color="#C9B6FF" style={{ left: -12 * s, bottom: Y(56) }} />
        </>
      )}
      {fora && (v as { faiscas?: number }).faiscas !== 1 && (
        <>
          <Faisca i={0} parado={parado} size={18 * s} color="#F5B44A" style={{ right: -18 * s, top: Y(18) }} />
          <Faisca i={1} parado={parado} size={12 * s} color={PINK} style={{ left: -16 * s, top: Y(96) }} />
          <Faisca i={2} parado={parado} size={14 * s} color="#C9B6FF" style={{ right: -14 * s, bottom: Y(60) }} />
          <Faisca i={3} parado={parado} size={10 * s} color="#F5B44A" style={{ left: -10 * s, bottom: Y(24) }} />
        </>
      )}
      {!apenasFaiscas && <View style={[StyleSheet.absoluteFill, { borderRadius: 22 * s, boxShadow: sombra }]}>
        <View style={{ flex: 1, borderRadius: 22 * s, borderWidth: borda, borderColor: '#fff', overflow: 'hidden', experimental_backgroundImage: bg }}>
          <View style={StyleSheet.absoluteFill}>
            {corpo}
            <View pointerEvents="none" style={{ position: 'absolute', left: inset, top: inset, right: inset, bottom: inset, borderRadius: 15 * s, borderWidth: Math.max(1, 1.5 * s), borderColor: fio }} />
          </View>
        </View>
      </View>}
    </View>
  );
}

const Carta = memo(CartaBase);
export default Carta;

const styles = StyleSheet.create({
  centro: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: INK },
  rodape: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // O "22%" da carta de produto (design 86a): rosa, extranegrito, algarismos de mesma largura e
  // a sombra rosa suave do design (`text-shadow: 0 6px 16px`; deslocamento e raio em escala).
  numeroProduto: { fontWeight: '800', color: PINK, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(255,94,168,0.22)' },
});
