import { useAcesso } from '../../lib/acesso';
import { paywallDaMedalha } from '../../lib/trava';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTelaFocada } from '../../hooks/useTelaFocada';
import { View, Text, TextInput, Image, StyleSheet, TouchableOpacity, Pressable, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing, ReduceMotion, cancelAnimation, interpolateColor, scrollTo, useAnimatedReaction, useAnimatedRef,
  useAnimatedProps, useAnimatedScrollHandler, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withDelay,
  withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import { useUserId } from '../../lib/currentUser';
import { peekCache, writeCache } from '../../lib/cache';
import {
  estadoCartas, marcarNivelVisto, chaveEstado, useEstadoCartas, PODER_INFO, type EstadoCartas,
} from '../../lib/cartasServidor';
import { nivelDe, type Nivel } from '../../lib/niveis';
import Medalha from '../../components/medalhas/Medalha';
import CartaNivel from '../../components/caminhada/CartaNivel';
import Faiscas, { type FaiscasRef } from '../../components/caminhada/Faiscas';
import {
  CARD_LEFT, CONTENT_H, EIO, EO, GAVETA, INK, MUTE, NIVEIS_TRILHA, PAD_TOP, PINK, ROW,
  cardTop, dotY, fmt, railK, sCard, sMark, xpY, type Icone, type Limites,
} from '../../components/caminhada/geometria';
import { voltar as voltarOu } from '../../lib/navegar';
import { usePuxarParaAtualizar } from '../../hooks/usePuxarParaAtualizar';

// ─────────────────────────────────────────────────────────────────────────────
// "Sua caminhada" — réplica do design 68a–68f do Claude Design (projeto "NIKS home
// redesign", NiksCaminhada.dc.html), com "XP" trocado por "NIKS Points":
//   68b · abrir: entra da direita (420 ms, gaveta) já no "Você está aqui"; 350 ms depois
//         a trilha sobe até o NIKS (mola ζ1 .6 s) e volta (ζ1 .75 s); o marcador pulsa.
//         O passeio só acontece na PRIMEIRA abertura (`caminhada:passeio_visto:<uid>`);
//         depois, só o pulso do marcador. Qualquer toque interrompe o passeio.
//   68c · tocar numa carta trancada: tremida de 380 ms e, 220 ms depois, a folha
//         "quanto falta" (gaveta 420 ms + véu).
//   68d · ganhar pontos: o selo "+N NIKS Points" sai do rodapé e voa em arco até a barra
//         (molas x/y ζ1 .55 s, y com impulso para cima), solta brilho, e a barra, o número,
//         o marcador e o trilho sobem juntos (mola ζ.8 .55 s).
//   68e · subir de nível: a trilha rola até a carta nova, o cadeado se parte, faíscas, e
//         "Você agora é <título>" em tela cheia; o fundo fica mais rosado a cada nível.
// MEDALHAS (08/nov/2026, pedido do produto): os níveis são as 13 medalhas (Bronze 1 … NIKS,
// `lib/niveis.ts`); a medalha (`components/medalhas/Medalha`, desenho do NiksMolduras 3a)
// substitui a logo nas cartas da trilha, no cabeçalho, na folha "quanto falta" e no "Você
// agora é". "Você agora é Prata 1".
// Dados reais (servidor): total, nível, a tabela dos 13 níveis e as faixas de pontos.
// O ganho anima a diferença entre o total que ela viu da última vez (AsyncStorage, por
// conta) e o de agora — é assim que a carta raspada vira 68d/68e aqui. Celebração dos
// pontos retroativos = 68e com "Você já é" (uma vez; confirmada no servidor).
// No NIKS (o último) não há próximo nível: os pontos continuam somando, o cabeçalho mostra
// o total e "Nível máximo", e a subida não tenta cruzar um teto que não existe. Reduzir movimento: sem passeio, tremida, voo ou
// faíscas — trocas em fade, o cadeado some em 220 ms e a barra enche direto.
// Frame de 393 × 852, barra de status de 54: Y do design → tela = insets.top + y − 54.
// ─────────────────────────────────────────────────────────────────────────────

const LOGO = require('../../assets/home/score-logo-pink.png');
const eo = Easing.bezier(...EO);
const eio = Easing.bezier(...EIO);
const gaveta = Easing.bezier(...GAVETA);
const VISTO_KEY = (uid: string) => `caminhada:total_visto:${uid}`;

// Mola do design (ζ, resposta em s) → física do Reanimated.
function spr(z: number, r: number, velocity = 0, eps = 0.5) {
  'worklet';
  return {
    stiffness: Math.pow((2 * Math.PI) / r, 2), damping: (4 * Math.PI * z) / r, mass: 1, velocity,
    restDisplacementThreshold: eps, restSpeedThreshold: eps * 2, reduceMotion: ReduceMotion.Never,
  };
}

/**
 * Texto que acompanha os pontos animados. Desenhado no UI thread (12/nov/2026): antes cada
 * número novo virava um `setState` no JS — 3 contadores, quadro a quadro, justo na subida de
 * nível — e a tela engasgava. `fmtFn` é um worklet.
 */
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
function Vivo({ xp, fmtFn, style }: { xp: SharedValue<number>; fmtFn: (v: number) => string; style: any }) {
  const props = useAnimatedProps(() => {
    const t = fmtFn(Math.round(xp.get()));
    return { text: t, defaultValue: t } as any;
  });
  return (
    <AnimatedTextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={fmtFn(Math.round(xp.get()))}
      animatedProps={props}
      style={[{ padding: 0, margin: 0 }, style]}
    />
  );
}

type Cel = { nivel: Nivel; retro: boolean };

export default function Caminhada() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const rm = useReducedMotion();
  const uid = useUserId();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const { data: cached, refresh: recarregarEstado } = useEstadoCartas();

  // Geometria na tela.
  const y = useCallback((v: number) => insets.top + v - 54, [insets.top]);
  const ox = (W - 393) / 2;                             // a trilha fica no centro do frame
  const footerH = 94 + Math.max(insets.bottom, 0);      // 128 no frame (94 + indicador de 34)
  const vpTop = y(216);
  const vph = Math.max(200, H - vpTop - footerH);
  const barX0 = 31;
  const barW = W - 62;
  const barY = y(194);

  // ── Dados ───────────────────────────────────────────────────────────────────
  const [estado, setEstado] = useState<EstadoCartas | null>(null);
  const base = estado ?? cached ?? null;
  const tabela = useMemo(() => base?.niveis ?? [], [base?.niveis]);
  const lim: Limites = useMemo(() => tabela.map((l) => l.pontos), [tabela]);
  const ic: Icone = useMemo(() => base?.icone ?? { passo: 945, incremento: 45 }, [base?.icone]);
  const rot = base?.faixas?.rotina ?? { min: 15, max: 30 };
  const scan = base?.faixas?.scan_rosto ?? { min: 40, max: 60 };
  // Pontos diretos (20261204): no modo pontos o 1º skincare do dia vale a faixa da Comum.
  const prim = base?.modo_pontos ? (base?.faixas?.skincare_dia ?? { min: 10, max: 50 }) : null;
  const mediaRotina = (rot.min + rot.max) / 2;
  // As animações rodam em timers: leem a tabela daqui (sempre a última), não do fechamento
  // do render em que foram agendadas (que podia ser de antes de o estado chegar).
  const D = useRef({ tab: tabela, lim, ic });
  D.current = { tab: tabela, lim, ic };
  // A trilha já NASCE na posição dela (12/nov/2026): o `scrollTo` depois de montar era ignorado na
  // 1ª abertura do app (a lista ainda sem tamanho), a tela mostrava o topo (NIKS) até a rede
  // responder e então saltava. Calculado uma vez, com os pontos guardados no aparelho.
  const offsetInicial = useRef<number | null>(null);
  if (offsetInicial.current == null && base?.pontos && lim.length) {
    offsetInicial.current = sMark(base.pontos.total, lim, ic, vph);
  }

  // ── Estado da animação ──────────────────────────────────────────────────────
  const [nivel, setNivel] = useState<Nivel | null>(null);   // nível exibido (sobe durante a subida)
  const [xpJS, setXpJS] = useState(0);                      // pontos exibidos (fora das animações)
  const [sheetN, setSheetN] = useState<number | null>(null);
  const [lastSheet, setLastSheet] = useState(5);
  const [cel, setCel] = useState<Cel | null>(null);
  // Montagem em etapas (12/nov/2026, medido no simulador: abrir a caminhada travava o JS por
  // ~730 ms e o desenho por ~170 ms — 13 cartas de nível com 9 valores e 8 estilos animados
  // cada, todas montadas no 1º quadro). Abre só com os níveis em volta do dela (o que aparece
  // na tela, ±2) e, depois da transição de entrada, monta os outros de 2 em 2, um por quadro.
  const [raio, setRaio] = useState(2);
  useEffect(() => {
    let r = 2;
    let cancelado = false;
    const passo = () => {
      if (cancelado) return;
      r += 2;
      setRaio(r);
      if (r < NIVEIS_TRILHA) requestAnimationFrame(passo);
    };
    const t = setTimeout(passo, 450);
    return () => { cancelado = true; clearTimeout(t); };
  }, []);
  const [shakes, setShakes] = useState<Record<number, number>>({});
  const [breaks, setBreaks] = useState<Record<number, number>>({});
  const [chipTxt, setChipTxt] = useState('');
  const [chipW, setChipW] = useState(140);
  const busy = useRef(false);
  const { de } = useLocalSearchParams<{ de?: string }>();
  const touring = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const afterCel = useRef<(() => void) | null>(null);
  const fx = useRef<FaiscasRef>(null);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const xp = useSharedValue(0);
  const pisoSV = useSharedValue(0);
  const tetoSV = useSharedValue(1);
  const scrollY = useSharedValue(0);
  const scrollAnim = useSharedValue(-1);
  const enter = useSharedValue(0);
  const bgT = useSharedValue(0);
  const pulse = useSharedValue(1);
  const barGlow = useSharedValue(0);
  const chipX = useSharedValue(0), chipY = useSharedValue(0), chipS = useSharedValue(0.7), chipO = useSharedValue(0);
  const flying = useSharedValue(false);
  const scrimO = useSharedValue(0), sheetY = useSharedValue(1);
  const celO = useSharedValue(0), celIn = useSharedValue(0);
  const aref = useAnimatedRef<Animated.ScrollView>();
  // Puxar para atualizar (10/nov/2026): o estado das cartas (pontos e nível).
  // O cabeçalho fixo (card do nível) cobre o topo da lista: o vão do puxão abre atrás dele e o
  // indicador do sistema não aparece. Um indicador próprio, logo abaixo do cabeçalho, mostra o
  // "atualizando" (o do sistema continua, invisível, só para o gesto).
  const puxar = usePuxarParaAtualizar([recarregarEstado]);
  const arrastou = useRef(false); // ela já mexeu na lista nesta visita

  const rolando = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.set(e.contentOffset.y); },
    onBeginDrag: () => { rolando.set(true); },
    onEndDrag: (e) => { if (Math.abs(e.velocity?.y ?? 0) < 0.01) rolando.set(false); },
    onMomentumBegin: () => { rolando.set(true); },
    onMomentumEnd: () => { rolando.set(false); },
  });
  useAnimatedReaction(() => scrollAnim.get(), (v) => { if (v >= 0) scrollTo(aref, 0, v, false); });

  const aplicarNivel = useCallback((n: Nivel) => {
    setNivel(n);
    pisoSV.set(n.piso);
    tetoSV.set(n.teto);
    const t = Math.min(1, Math.max(0, (Math.min(n.nivel, NIVEIS_TRILHA) - 1) / (NIVEIS_TRILHA - 1)));
    bgT.set(rm ? t : withTiming(t, { duration: 800, easing: Easing.ease }));
  }, [pisoSV, tetoSV, bgT, rm]);

  // ── Rolagem com mola ────────────────────────────────────────────────────────
  const pararRolagem = useCallback(() => {
    cancelAnimation(scrollAnim);
    scrollAnim.set(-1);
    touring.current = false;
  }, [scrollAnim]);
  const rolar = useCallback((to: number, z: number, r: number, done?: () => void) => {
    if (rm) {
      scheduleOnUI(() => { 'worklet'; scrollTo(aref, 0, to, false); scrollY.set(to); });
      done?.();
      return;
    }
    cancelAnimation(scrollAnim);
    scrollAnim.set(scrollY.get());
    scrollAnim.set(withSpring(to, spr(z, r, 0, 0.6), (fim) => {
      'worklet';
      scrollAnim.set(-1);
      if (fim && done) scheduleOnRN(done);
    }));
  }, [rm, aref, scrollAnim, scrollY]);
  const pularPara = useCallback((to: number) => {
    scheduleOnUI(() => { 'worklet'; scrollTo(aref, 0, to, false); scrollY.set(to); });
  }, [aref, scrollY]);

  const pulsar = useCallback(() => {
    if (rm) return;
    pulse.set(0);
    pulse.set(withTiming(1, { duration: 760, easing: eo }));
  }, [rm, pulse]);

  // 68b · passeio de abertura — só na PRIMEIRA vez que ela abre a tela (por conta).
  // Nas outras, abre direto no "Você está aqui" e só o marcador pulsa.
  // ⚠️ Desligado (12/nov/2026, pedido do produto): o passeio subia até o NIKS e voltava, e na
  // prática rodava a cada abertura do app — parecia a tela "começando no topo e descendo
  // travada". Agora a caminhada abre direto no "Você está aqui" e só o marcador pulsa.
  const passeio = useCallback(async () => { pulsar(); }, [pulsar]);

  // ── 68e · celebração ───────────────────────────────────────────────────────
  const mostrarCel = useCallback((c: Cel, done?: () => void) => {
    afterCel.current = done ?? null;
    setCel(c);
    setTabBarVisible(false);
    haptics.success();
    celO.set(withTiming(1, { duration: 280, easing: Easing.ease }));
    celIn.set(0);
    celIn.set(rm ? 1 : withDelay(60, withTiming(1, { duration: 520, easing: eo })));
    if (!rm) {
      later(260, () => fx.current?.burst(ox + 196, y(395), 30, 150));
    }
  }, [celO, celIn, rm, later, ox, y, setTabBarVisible]);

  const continuarCel = useCallback(() => {
    if (!cel) return;
    haptics.action();
    const visto = cel.nivel.nivel;
    celO.set(withTiming(0, { duration: 280, easing: Easing.ease }));
    later(280, () => setCel(null));
    const d = afterCel.current;
    afterCel.current = null;
    later(rm ? 60 : 300, () => rolar(sMark(xp.get(), D.current.lim, D.current.ic, vph), 1, 0.6, () => { pulsar(); d?.(); }));
    // Celebrou o último nível que ela tem: o servidor para de pedir a celebração.
    if (!d) {
      marcarNivelVisto(visto).catch(() => {});
      if (useAcesso.getState().estado === 'convidada') void paywallDaMedalha(visto);
    }
  }, [cel, celO, later, rm, rolar, xp, vph, pulsar]);

  // ── 68d · ganhar pontos e subir ────────────────────────────────────────────
  const salvarVisto = useCallback((total: number) => {
    if (uid) AsyncStorage.setItem(VISTO_KEY(uid), String(total)).catch(() => {});
  }, [uid]);

  const terminar = useCallback((to: number, n: Nivel, subiu: boolean) => {
    xp.set(to);
    setXpJS(to);
    busy.current = false;
    salvarVisto(to);
    if (subiu) marcarNivelVisto(n.nivel).catch(() => {});
  }, [xp, salvarVisto]);

  const subirNivel = useCallback((de: Nivel, done: (novo: Nivel) => void) => {
    const novo = nivelDe(de.teto, D.current.tab, D.current.ic);
    const naTrilha = Math.min(novo.nivel, NIVEIS_TRILHA);
    rolar(sCard(naTrilha, vph), 1, 0.5);
    if (novo.nivel <= NIVEIS_TRILHA) {
      later(rm ? 80 : 560, () => {
        setBreaks((b) => ({ ...b, [novo.nivel]: (b[novo.nivel] ?? 0) + 1 }));
        if (!rm) {
          const cy = vpTop + cardTop(novo.nivel) + 92 - scrollY.get();
          fx.current?.burst(ox + CARD_LEFT + 66, cy, 26, 110);
        }
      });
    }
    later(rm ? 520 : 1300, () => {
      aplicarNivel(novo);
      setXpJS(Math.round(xp.get()));
      mostrarCel({ nivel: novo, retro: false }, () => done(novo));
    });
  }, [rolar, vph, later, rm, vpTop, scrollY, ox, aplicarNivel, xp, mostrarCel]);

  const subir = useCallback((to: number, n: Nivel, subiu: boolean) => {
    // No último nível (NIKS, teto === piso) não há o que cruzar: os pontos só somam.
    const ultimo = n.teto <= n.piso;
    const seg = ultimo ? to : Math.min(to, n.teto);
    const cruza = !ultimo && seg >= n.teto;
    xp.set(withSpring(seg, rm ? spr(1, 0.25, 0, 0.4) : spr(cruza ? 1 : 0.8, 0.55, 0, 0.4), (fim) => {
      'worklet';
      if (!fim) return;
      if (cruza) scheduleOnRN(subirDepois, to, n);
      else scheduleOnRN(terminarJS, to, n, subiu);
    }));
    // (as duas funções abaixo são chamadas do UI thread pelo callback da mola)
    function subirDepois(t: number, nv: Nivel) {
      later(220, () => subirNivel(nv, (novo) => (t > novo.piso ? subir(t, novo, true) : terminar(t, novo, true))));
    }
    function terminarJS(t: number, nv: Nivel, s: boolean) { terminar(t, nv, s); }
  }, [xp, rm, later, subirNivel, terminar]);

  const voar = useCallback((texto: string, kDepois: number, done: () => void) => {
    setChipTxt(texto);
    // O selo ("+N NIKS Points") é mais largo que o "+25 XP" do design: o centro fica
    // longe o bastante da borda para ele pousar inteiro na tela.
    const ex = Math.min(barX0 + barW * Math.min(1, Math.max(0.08, kDepois)), W - 12 - chipW / 2);
    const ey = barY;
    const chegar = () => {
      chipO.set(withTiming(0, { duration: 180, easing: eo }));
      fx.current?.burst(ex, ey, 9, 34);
      if (!rm) {
        barGlow.set(0);
        barGlow.set(withTiming(1, { duration: 600, easing: eo }));
      }
      done();
    };
    if (rm) {
      chipX.set(ex); chipY.set(ey + 30); chipS.set(1);
      chipO.set(0);
      chipO.set(withTiming(1, { duration: 192 }, () => { chipO.set(withDelay(256, withTiming(0, { duration: 192 }))); }));
      later(380, done);
      return;
    }
    // Saída: o "+" do rodapé (frame: 34, 766).
    chipX.set(34); chipY.set(H - footerH + 42); chipS.set(0.7); chipO.set(1);
    chipS.set(withSpring(1, spr(0.7, 0.3, 0, 0.002)));
    chipX.set(withSpring(ex, spr(1, 0.55, 0, 0.6)));
    flying.set(true);
    chipY.set(withSpring(ey, spr(1, 0.55, -1500, 0.6), (fim) => {
      'worklet';
      flying.set(false);
      if (fim) scheduleOnRN(chegar);
    }));
  }, [barW, barY, chipO, chipX, chipY, chipS, flying, barGlow, rm, later, H, W, chipW, footerH]);

  // Rastro de brilho do selo (a cada 3 quadros, como no design).
  const tick = useSharedValue(0);
  const rastro = useCallback((x: number, yy: number) => {
    fx.current?.spark(x, yy + 10, (Math.random() - 0.5) * 24, 20 + Math.random() * 20, 520);
  }, []);
  const focada = useTelaFocada(); // o quadro a quadro só existe com a tela à vista

  const ganhar = useCallback((de: number, para: number) => {
    if (busy.current || para <= de) return;
    busy.current = true;
    pararRolagem();
    const { tab, lim: lm, ic: icn } = D.current;
    const n = nivelDe(de, tab, icn);
    rolar(sMark(de, lm, icn, vph), 1, 0.4);
    const k = (Math.min(para, n.teto) - n.piso) / Math.max(1, n.teto - n.piso);
    voar(`+${fmt(para - de)} NIKS Points`, k, () => subir(para, n, false));
  }, [pararRolagem, rolar, vph, voar, subir]);

  // Conteúdo já visível: mostra o último estado guardado na hora, sem esperar a função `cartas`
  // (~1 s). O que vem da rede só anima se os pontos mudaram.
  const mostrarGuardado = useCallback((e: EstadoCartas) => {
    const p = e.pontos;
    if (!p || !e.niveis?.length) return;
    const icn = e.icone ?? { passo: 945, incremento: 45 };
    const limites = e.niveis.map((l) => l.pontos);
    D.current = { tab: e.niveis, lim: limites, ic: icn };
    const n = nivelDe(p.total, e.niveis, icn);
    xp.set(p.total);
    setXpJS(p.total);
    aplicarNivel(n);
    pularPara(sMark(p.total, limites, icn, vph));
  }, [xp, aplicarNivel, pularPara, vph]);

  // ── Abrir (cada foco: a aba fica montada) ──────────────────────────────────
  const iniciar = useCallback(async (e: EstadoCartas) => {
    const p = e.pontos;
    if (!p || !e.niveis?.length) return;
    const tab = e.niveis;
    const icn = e.icone ?? { passo: 945, incremento: 45 };
    const limites = tab.map((l) => l.pontos);
    D.current = { tab, lim: limites, ic: icn };
    const visto = uid ? Number(await AsyncStorage.getItem(VISTO_KEY(uid)).catch(() => null)) : NaN;
    const temVisto = Number.isFinite(visto) && visto > 0;

    const comecar = (total: number) => {
      const n = nivelDe(total, tab, icn);
      xp.set(total);
      setXpJS(total);
      aplicarNivel(n);
      bgT.set(Math.min(1, Math.max(0, (Math.min(n.nivel, NIVEIS_TRILHA) - 1) / (NIVEIS_TRILHA - 1))));
      // Já rolando (o conteúdo aparece antes da rede): não puxa de volta.
      if (!arrastou.current) pularPara(sMark(total, limites, icn, vph));
      return n;
    };

    if (p.retro && p.celebrar) {
      // Pontos retroativos: "Você já é <título>", uma vez.
      const n = comecar(p.total);
      salvarVisto(p.total);
      later(rm ? 120 : 460, () => mostrarCel({ nivel: n, retro: true }));
    } else if (temVisto && visto < p.total) {
      // Ganhou pontos desde a última visita (ex.: carta raspada): 68d/68e.
      comecar(visto);
      later(rm ? 200 : 520, () => ganhar(visto, p.total));
    } else {
      const n = comecar(p.total);
      salvarVisto(p.total);
      if (p.celebrar) later(rm ? 120 : 460, () => mostrarCel({ nivel: n, retro: false }));
      else later(rm ? 120 : 460, passeio);
    }
  }, [uid, xp, aplicarNivel, bgT, pularPara, vph, salvarVisto, later, rm, mostrarCel, ganhar, passeio]);

  useFocusEffect(useCallback(() => {
    setTabBarVisible(false);
    enter.set(0);
    enter.set(withTiming(1, { duration: rm ? 220 : 420, easing: rm ? Easing.ease : gaveta }));
    let vivo = true;
    arrastou.current = false;
    const guardado = uid ? peekCache<EstadoCartas>(chaveEstado(uid))?.data : null;
    if (guardado) { setEstado(guardado); mostrarGuardado(guardado); }
    // Sempre o estado fresco (a carta raspada acabou de mudar o total).
    estadoCartas()
      .then((e) => {
        if (!vivo) return;
        setEstado(e);
        if (uid) writeCache(chaveEstado(uid), e).catch(() => {});
        void iniciar(e);
      })
      .catch(() => { if (vivo && cached) { setEstado(cached); void iniciar(cached); } });
    return () => {
      vivo = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      pararRolagem();
      busy.current = false;
      afterCel.current = null;
      setCel(null); celO.set(0);
      setSheetN(null); scrimO.set(0); sheetY.set(1);
      chipO.set(0);
      setTabBarVisible(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]));

  // ── Ações ───────────────────────────────────────────────────────────────────
  // Volta para a tela de trás (pilha nativa, igual ao gesto). Sem tela de trás: a aba Grupos
  // (`de=grupos`) ou a Home.
  const voltar = (comToque = true) => {
    if (busy.current) return;
    if (comToque) haptics.tap();
    pararRolagem();
    voltarOu(de === 'grupos' ? '/grupos' : '/home');
  };

  const tocarCarta = (n: number) => {
    if (busy.current || !nivel || n <= nivel.nivel) return;
    haptics.tap();
    pararRolagem();
    setShakes((s) => ({ ...s, [n]: (s[n] ?? 0) + 1 }));
    setLastSheet(n);
    later(rm ? 60 : 220, () => {
      setSheetN(n);
      scrimO.set(withTiming(1, { duration: 280, easing: Easing.ease }));
      sheetY.set(rm ? 0 : withTiming(0, { duration: 420, easing: gaveta }));
    });
  };
  // Estável entre renders (12/nov/2026): uma função nova a cada render desfazia o `memo` das 13
  // cartas e cada passo da subida de nível re-renderizava a trilha inteira.
  const tocarRef = useRef(tocarCarta);
  tocarRef.current = tocarCarta;
  const tocarEstavel = useCallback((n: number) => tocarRef.current(n), []);
  const fecharFolha = () => {
    haptics.tap();
    scrimO.set(withTiming(0, { duration: 280, easing: Easing.ease }));
    sheetY.set(rm ? 1 : withTiming(1, { duration: 420, easing: gaveta }));
    later(rm ? 0 : 420, () => setSheetN(null));
  };

  // ── Estilos animados ──────────────────────────────────────────────────────
  const rootSt = useAnimatedStyle(() => (rm
    ? { opacity: enter.get() }
    : { transform: [{ translateX: (1 - enter.get()) * W }] }), [rm, W]);
  const bgSt = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(bgT.get(), [0, 1], ['#FFF5F9', '#FFC6DF']) }));
  const glowSt = useAnimatedStyle(() => ({ opacity: 0.2 + 0.8 * bgT.get() }));
  const barSt = useAnimatedStyle(() => {
    const k = Math.min(1, Math.max(0, (xp.get() - pisoSV.get()) / Math.max(1, tetoSV.get() - pisoSV.get())));
    return { transform: [{ scaleX: k }] };
  });
  const barGlowSt = useAnimatedStyle(() => {
    const g = barGlow.get();
    return { opacity: g <= 0 || g >= 1 ? 0 : g < 0.5 ? g * 2 : (1 - g) * 2 };
  });
  const markerSt = useAnimatedStyle(() => ({ transform: [{ translateY: lim.length ? xpY(xp.get(), lim, ic) : dotY(1) }] }), [lim, ic]);
  const railSt = useAnimatedStyle(() => ({ transform: [{ scaleY: lim.length ? Math.max(0, railK(xp.get(), lim, ic)) : 0 }] }), [lim, ic]);
  const pulseSt = useAnimatedStyle(() => {
    const p = pulse.get();
    return { opacity: p >= 1 ? 0 : 0.8 * (1 - p), transform: [{ scale: 1 + 2.4 * p }] };
  });
  const chipSt = useAnimatedStyle(() => ({
    opacity: chipO.get(),
    transform: [{ translateX: chipX.get() - chipW / 2 }, { translateY: chipY.get() - 17 }, { scale: chipS.get() }],
  }), [chipW]);
  const scrimSt = useAnimatedStyle(() => ({ opacity: scrimO.get() }));
  const sheetSt = useAnimatedStyle(() => (rm
    ? { opacity: 1 - sheetY.get() }
    : { transform: [{ translateY: sheetY.get() * 520 }] }), [rm]);
  const celSt = useAnimatedStyle(() => ({ opacity: celO.get() }));
  const celInSt = useAnimatedStyle(() => {
    const p = celIn.get();
    return { transform: [{ translateY: 14 * (1 - p) }, { scale: 0.96 + 0.04 * p }] };
  });

  // ── Textos ────────────────────────────────────────────────────────────────
  const L = nivel?.nivel ?? 1;
  const naTrilha = Math.min(L, NIVEIS_TRILHA);
  const teto = nivel?.teto ?? 0;
  const ultimoNivel = !!nivel && nivel.teto <= nivel.piso;
  const shL = sheetN ?? lastSheet;
  const shLv = tabela[shL - 1];
  const shFalta = shLv ? Math.max(0, shLv.pontos - xpJS) : 0;
  const shRot = Math.ceil(shFalta / mediaRotina);

  return (
    <View style={{ flex: 1 }}>
    <Animated.View style={[styles.root, bgSt, rootSt]}>
      <StatusBar style="dark" />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glow, glowSt]} />

      {/* Voltar + título */}
      <TouchableOpacity activeOpacity={0.7} onPress={() => voltar()} style={[styles.back, { top: y(58) }]} accessibilityLabel="Voltar">
        <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m15 18-6-6 6-6" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </TouchableOpacity>
      <View pointerEvents="none" style={[styles.titleRow, { top: y(58) }]}><Text style={styles.title}>Sua caminhada</Text></View>

      {/* Cabeçalho: nível, título, pontos e barra até o próximo */}
      <View style={[styles.hdr, { top: y(104) }]}>
        <View style={{ opacity: nivel ? 1 : 0 }}>
        <View style={styles.hdrRow}>
          <View style={styles.thumb}>
            <Medalha nivel={L} tamanho={56} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.hdrLvl}>{nivel ? `Nível ${L}` : ' '}</Text>
            {/* O nome da medalha ("Diamante 3") encolhe até 78% se não couber ao lado de
                "faltam N NIKS Points" (o design tinha "XP", mais curto). */}
            <Text style={styles.hdrName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{nivel?.titulo ?? ' '}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {/* "NIKS Points" só na linha de baixo (com a unidade nas duas, o nome não cabia).
                No NIKS (último nível) não há próximo: só o total e "Nível máximo". */}
            <Vivo xp={xp} fmtFn={(v) => { 'worklet'; return nivel ? (ultimoNivel ? fmt(v) : `${fmt(v)} / ${fmt(teto)}`) : ' '; }} style={styles.hdrXp} />
            <Vivo xp={xp} fmtFn={(v) => { 'worklet'; return nivel ? (ultimoNivel ? 'Nível máximo' : `faltam ${fmt(Math.max(0, teto - v))} NIKS Points`) : ' '; }} style={styles.hdrFalta} />
          </View>
        </View>
        <View style={styles.barWrap}>
          <Animated.View pointerEvents="none" style={[styles.barGlow, barGlowSt]} />
          <View style={styles.barTrack}><Animated.View style={[styles.barFill, barSt]} /></View>
        </View>
        </View>
      </View>

      {/* Trilha */}
      <View style={[styles.vp, { top: vpTop, height: vph, opacity: nivel ? 1 : 0 }]}>
        <Animated.ScrollView
          ref={aref}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => { arrastou.current = true; pararRolagem(); }}
          onTouchStart={() => { if (touring.current) pararRolagem(); }}
          refreshControl={puxar}
          contentOffset={{ x: 0, y: offsetInicial.current ?? 0 }}
          contentContainerStyle={{ height: CONTENT_H }}
        >
          <View style={{ position: 'absolute', left: ox, top: 0, width: 393, height: CONTENT_H }}>
            <Image source={LOGO} style={{ position: 'absolute', left: 23, top: 28, width: 22, height: 22 }} />
            <View style={styles.railBase} />
            <Animated.View style={[styles.rail, railSt]} />
            {tabela.slice(0, NIVEIS_TRILHA).map((lv) => {
              if (Math.abs(lv.n - naTrilha) > raio) return null; // ainda não montado (ver `raio`)
              const locked = lv.n > L;
              const isIcon = lv.n === NIVEIS_TRILHA;
              return (
                <View key={lv.n} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  <View style={[styles.dot, { top: dotY(lv.n) - 5.5, backgroundColor: locked ? '#FFFFFF' : PINK, borderColor: locked ? 'rgba(255,94,168,0.45)' : '#FFFFFF' }]} />
                  <RotuloNivel n={lv.n} texto={`${fmt(lv.pontos)} NIKS Points`} cor={locked ? MUTE : INK} xp={xp} lim={lim} ic={ic} />
                  <CartaNivel
                    n={lv.n} locked={locked} isCurrent={lv.n === naTrilha} isIcon={isIcon}
                    left={CARD_LEFT} top={cardTop(lv.n)} rolando={rolando} vph={vph}
                    shakeKey={shakes[lv.n] ?? 0} breakKey={breaks[lv.n] ?? 0} rm={rm}
                    onTap={locked ? tocarEstavel : undefined}
                  />
                  <View pointerEvents="none" style={[styles.nameBlock, { top: cardTop(lv.n) + 192 }]}>
                    <Text style={[styles.lvName, { color: locked ? MUTE : INK }]}>{lv.titulo}</Text>
                    <Text style={styles.lvSub}>{`Nível ${lv.n} · ${fmt(lv.pontos)} NIKS Points`}</Text>
                  </View>
                </View>
              );
            })}
            {/* Você está aqui */}
            <Animated.View pointerEvents="none" style={[styles.marker, markerSt]}>
              <Animated.View style={[styles.pulse, pulseSt]} />
              <View style={styles.markerDot} />
              <View style={styles.bubble}>
                <Text style={styles.bubbleTop}>Você está aqui</Text>
                <Vivo xp={xp} fmtFn={(v) => { 'worklet'; return `${fmt(v)} NIKS Points`; }} style={styles.bubbleXp} />
              </View>
            </Animated.View>
          </View>
        </Animated.ScrollView>
        {puxar.props.refreshing && (
          <ActivityIndicator color="#FF5EA8" pointerEvents="none" style={{ position: 'absolute', top: y(232), alignSelf: 'center' }} />
        )}
      </View>

      {/* Rodapé: como ganhar */}
      <View style={[styles.footer, { height: footerH }]}>
        <Text style={styles.footTitle}>Como ganhar NIKS Points</Text>
        <View style={{ marginTop: 10, gap: 6 }}>
          <View style={styles.footRow}>
            <View style={styles.footIcon}><Svg width={15} height={15} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" /></Svg></View>
            {prim ? (
              <Text style={styles.footText}>
                <Text style={{ fontWeight: '600' }}>{`+${prim.min} a ${prim.max}`}</Text> no 1º skincare do dia, <Text style={{ fontWeight: '600' }}>{`+${rot.min} a ${rot.max}`}</Text> no 2º
              </Text>
            ) : (
              <Text style={styles.footText}><Text style={{ fontWeight: '600' }}>{`+${rot.min} a ${rot.max} NIKS Points`}</Text> por rotina concluída</Text>
            )}
          </View>
          <View style={styles.footRow}>
            <View style={styles.footIcon}><Svg width={15} height={15} viewBox="0 0 24 24"><Path d={PODER_INFO.scan_antecipado.icone} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg></View>
            <Text style={styles.footText}><Text style={{ fontWeight: '600' }}>{`+${scan.min} a ${scan.max}`}</Text> por scan de rosto, 1 por semana</Text>
          </View>
        </View>
      </View>

      {/* Selo "+N NIKS Points" voando */}
      <Animated.View pointerEvents="none" onLayout={(e) => setChipW(e.nativeEvent.layout.width)} style={[styles.chip, chipSt]}>
        <Text style={styles.chipText}>{chipTxt}</Text>
      </Animated.View>

      {focada && <Faiscas ref={fx} off={rm} />}
      {focada && <RastroDoVoo flying={flying} tick={tick} chipX={chipX} chipY={chipY} rastro={rastro} />}

      {/* 68c · folha "quanto falta" */}
      {sheetN != null && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimSt]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={fecharFolha} accessibilityLabel="Fechar" />
          </Animated.View>
          <Animated.View style={[styles.sheet, { paddingBottom: 40 }, sheetSt]}>
            <View style={styles.handle} />
            <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View style={styles.shThumb}>
                <Medalha nivel={shL} tamanho={88} />
                <View style={styles.shLock}>
                  <Svg width={12} height={12} viewBox="0 0 24 24">
                    <Path d="M6 11h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" fill="none" stroke={PINK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                    <Path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke={PINK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.hdrLvl}>{`Nível ${shL}`}</Text>
                <Text style={styles.shName}>{shLv?.titulo ?? ''}</Text>
                <Text style={styles.shFalta}>{`faltam ${fmt(shFalta)} NIKS Points`}</Text>
              </View>
            </View>
            <View style={[styles.barTrack, { marginTop: 22 }]}>
              <View style={[styles.barFill, { transform: [{ scaleX: shLv ? Math.min(1, xpJS / Math.max(1, shLv.pontos)) : 0 }] }]} />
            </View>
            <View style={styles.shRange}>
              <Text style={styles.shRangeText}>{`${fmt(xpJS)} NIKS Points`}</Text>
              <Text style={styles.shRangeText}>{`${fmt(shLv?.pontos ?? 0)} NIKS Points`}</Text>
            </View>
            <View style={styles.shCard}>
              <View style={styles.shCheck}>
                <Svg width={19} height={19} viewBox="0 0 24 24"><Path d="M20 6 9 17l-5-5" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" /></Svg>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.shRot}>{shRot === 1 ? 'Cerca de 1 rotina concluída' : `Cerca de ${shRot} rotinas concluídas`}</Text>
                <Text style={styles.shRotSub}>{`+${rot.min} a ${rot.max} NIKS Points por rotina`}</Text>
              </View>
            </View>
            <TouchableOpacity activeOpacity={0.85} onPress={fecharFolha} style={[styles.pinkBtn, { marginTop: 18, height: 54 }]}>
              <Text style={styles.pinkBtnText}>Entendi</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      {/* 68e · "Você agora é" / "Você já é" */}
      {cel && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.celBg, celSt]}>
          <Animated.View style={[styles.celContent, { top: y(128) }, celInSt]}>
            <Text style={styles.celPre}>{cel.retro ? 'Você já é' : 'Você agora é'}</Text>
            <Text style={styles.celName}>{cel.nivel.titulo}</Text>
            <View style={styles.celMedalha}><Medalha nivel={cel.nivel.nivel} tamanho={240} /></View>
            <Text style={styles.celSub}>{`Nível ${cel.nivel.nivel} · ${fmt(cel.nivel.piso)} NIKS Points`}</Text>
          </Animated.View>
          <TouchableOpacity activeOpacity={0.85} onPress={continuarCel} style={[styles.pinkBtn, styles.celBtn, { bottom: 40 }]}>
            <Text style={styles.pinkBtnText}>Continuar</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
    </View>
  );
}

/** Rótulo de pontos ao lado do ponto do nível; some quando o marcador passa perto. */
// Rastro de brilho do selo voando. Componente à parte para o callback de quadro nascer e morrer
// com a tela: não usar `setActive`, que corre contra o registro assíncrono da Reanimated.
const RastroDoVoo = memo(function RastroDoVoo({ flying, tick, chipX, chipY, rastro }: {
  flying: SharedValue<boolean>; tick: SharedValue<number>; chipX: SharedValue<number>; chipY: SharedValue<number>;
  rastro: (x: number, y: number) => void;
}) {
  useFrameCallback(() => {
    if (!flying.get()) return;
    tick.set(tick.get() + 1);
    if (tick.get() % 3 === 0) scheduleOnRN(rastro, chipX.get(), chipY.get());
  });
  return null;
});

const RotuloNivel = memo(function RotuloNivel({ n, texto, cor, xp, lim, ic }: { n: number; texto: string; cor: string; xp: SharedValue<number>; lim: Limites; ic: Icone }) {
  const st = useAnimatedStyle(() => ({ opacity: lim.length && Math.abs(xpY(xp.get(), lim, ic) - dotY(n)) < 34 ? 0 : 1 }), [lim, ic, n]);
  return <Animated.Text style={[styles.dotLabel, { top: dotY(n) - 7, color: cor }, st]}>{texto}</Animated.Text>;
});


const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { experimental_backgroundImage: 'radial-gradient(90% 46% at 50% 34%, rgba(255,255,255,0.9), rgba(255,255,255,0))' },
  back: {
    position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19, zIndex: 5,
    backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  titleRow: { position: 'absolute', left: 0, right: 0, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },

  hdr: {
    position: 'absolute', left: 16, right: 16, height: 102, paddingTop: 14, paddingHorizontal: 14, zIndex: 4,
    borderWidth: 1.5, borderColor: PINK, borderRadius: 20, backgroundColor: '#fff', boxShadow: '0px 6px 18px rgba(255,94,168,0.12)',
  },
  hdrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Só a medalha, sem carta atrás. O desenho tem folga nas laterais, por isso a margem negativa.
  thumb: { width: 56, height: 56, marginHorizontal: -4, alignItems: 'center', justifyContent: 'center' },
  hdrLvl: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: PINK },
  hdrName: { marginTop: 2, fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: INK },
  hdrXp: { fontSize: 14, lineHeight: 18, fontWeight: '600', letterSpacing: -0.2, color: INK, fontVariant: ['tabular-nums'] },
  hdrFalta: { marginTop: 2, fontSize: 12, lineHeight: 16, color: MUTE, fontVariant: ['tabular-nums'] },
  barWrap: { marginTop: 10, height: 8 },
  barGlow: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderRadius: 100, backgroundColor: 'rgba(255,94,168,0.22)' },
  barTrack: { height: 8, borderRadius: 100, backgroundColor: '#F0F0F0', overflow: 'hidden' },
  barFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },

  vp: { position: 'absolute', left: 0, right: 0 },
  // A altura acompanha o número de níveis: a base do trilho é o ponto do nível 1 (dotY(1)).
  railBase: { position: 'absolute', left: 32, top: PAD_TOP, width: 3, height: NIVEIS_TRILHA * ROW, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.95)' },
  rail: { position: 'absolute', left: 32, top: PAD_TOP, width: 3, height: NIVEIS_TRILHA * ROW, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'center bottom' },
  dot: { position: 'absolute', left: 28, width: 11, height: 11, borderRadius: 5.5, borderWidth: 2 },
  dotLabel: { position: 'absolute', left: 46, fontSize: 11, lineHeight: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  nameBlock: { position: 'absolute', left: 116, width: 220, alignItems: 'center' },
  lvName: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  lvSub: { marginTop: 2, fontSize: 13, lineHeight: 17, color: MUTE, textAlign: 'center' },
  marker: { position: 'absolute', left: 0, top: 0, zIndex: 3 },
  pulse: { position: 'absolute', left: 26.5, top: -7, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: PINK },
  markerDot: {
    position: 'absolute', left: 26.5, top: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: PINK,
    borderWidth: 3, borderColor: '#fff', boxShadow: '0px 2px 8px rgba(255,94,168,0.45)',
  },
  bubble: {
    position: 'absolute', left: 46, top: -19, paddingTop: 5, paddingHorizontal: 10, paddingBottom: 6, borderRadius: 12,
    backgroundColor: PINK, boxShadow: '0px 6px 14px rgba(255,94,168,0.32)',
  },
  bubbleTop: { fontSize: 11, lineHeight: 13, fontWeight: '600', color: '#fff' },
  bubbleXp: { fontSize: 13, lineHeight: 16, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14, paddingHorizontal: 20, zIndex: 6,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0px -6px 24px rgba(190,70,120,0.10)',
  },
  footTitle: { fontSize: 15, lineHeight: 18, fontWeight: '700', letterSpacing: -0.2, color: INK },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  footText: { fontSize: 14, letterSpacing: -0.2, color: INK },

  chip: {
    position: 'absolute', left: 0, top: 0, zIndex: 60, height: 34, paddingHorizontal: 14, borderRadius: 100,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: PINK, boxShadow: '0px 8px 18px rgba(255,94,168,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  chipText: { color: PINK, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },

  scrim: { zIndex: 70, backgroundColor: 'rgba(70,20,45,0.22)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 71, paddingTop: 10, paddingHorizontal: 20,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, boxShadow: '0px -10px 30px rgba(190,70,120,0.14)',
  },
  handle: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#F0F0F0', alignSelf: 'center' },
  shThumb: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  shLock: {
    position: 'absolute', left: 88 / 2 - 12, bottom: -2, width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: PINK, alignItems: 'center', justifyContent: 'center',
  },
  shName: { marginTop: 2, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.7, color: INK },
  shFalta: { marginTop: 2, fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: -0.2, color: PINK },
  shRange: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-between' },
  shRangeText: { fontSize: 12, color: MUTE, fontVariant: ['tabular-nums'] },
  shCard: {
    marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: PINK, borderRadius: 16, backgroundColor: '#fff',
  },
  shCheck: { width: 37, height: 37, borderRadius: 18.5, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  shRot: { fontSize: 15, lineHeight: 19, fontWeight: '600', letterSpacing: -0.3, color: INK },
  shRotSub: { marginTop: 2, fontSize: 13, lineHeight: 17, color: MUTE },
  pinkBtn: {
    borderRadius: 100, backgroundColor: PINK, boxShadow: '0px 6px 12px rgba(255,94,168,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  pinkBtnText: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },

  celBg: { zIndex: 80, backgroundColor: 'rgba(255,246,250,0.94)' },
  celContent: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  celPre: { fontSize: 17, lineHeight: 22, color: MUTE, letterSpacing: -0.2, textAlign: 'center' },
  celName: { marginTop: 4, fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1.3, color: INK, textAlign: 'center' },
  // Só a medalha do nível novo, sem carta em volta (08/nov/2026, pedido do produto).
  celMedalha: { marginTop: 18, width: 240, height: 240, alignItems: 'center', justifyContent: 'center' },
  celSub: { marginTop: 16, fontSize: 14, lineHeight: 18, color: MUTE, textAlign: 'center' },
  celBtn: { position: 'absolute', left: 24, right: 24, height: 56 },
});
