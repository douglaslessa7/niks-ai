import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TouchableOpacity, ScrollView, StyleSheet, BackHandler, ActivityIndicator, useWindowDimensions,
  type StyleProp, type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path, Defs, RadialGradient, Stop, Ellipse, Circle } from 'react-native-svg';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSpring, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useTelaFocada } from '../../hooks/useTelaFocada';
import { abrirCartasEDepois, cartaARasparAgora, concluirSkincare } from '../../lib/concluirSkincare';
import { estadoCartas } from '../../lib/cartasServidor';
import { verificarDesafios } from '../../lib/missoes';
import { useMeusGrupos } from '../../lib/gruposServidor';
import { consumirVoltaDoCheckin, descricaoDoCheckin, duracaoPorExtenso, encerrarSessao, guardarUltimoSkincare, formatarCronometro, sessaoAtual, type PassoSessao } from '../../lib/sessaoSkincare';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import FolhaCompartilhar from '../../components/grupos/FolhaCompartilhar';
import SkincareConcluido, { type PontosConcluido } from '../../components/skincare/SkincareConcluido';
import StepIcon from '../../components/rotina/StepIcon';
import { voltar as voltarOu } from '../../lib/navegar';
import { BG_STOPS, homeTheme } from '../../lib/homeTheme';
import { fraseFrequencia } from '../../lib/frequencia';

// ─────────────────────────────────────────────────────────────────────────────
// Sessão de skincare — réplica das telas 88a1, 88b e 88c do Claude Design (projeto "NIKS home
// redesign — rotina skincare", `NiksSessaoSkincare.dc.html`, rodada 88; 12/nov/2026, build 1.62).
// Entre a lista do período (`(app)/skincare`, "Iniciar skincare") e o fim de sempre.
//   · 88a1: fundo em degradê vertical (172°) com luz branca no topo; X, o período e o
//     cronômetro; no centro o botão "Concluir" (196 pt) que flutua (sobe 12 pt e cresce 2,5%),
//     com a sombra embaixo encolhendo e um halo branco pulsando no mesmo ritmo (3,2 s, ida e
//     volta, cubic-bezier .37 0 .63 1); embaixo, os passos do período — só a lista rola.
//   · 88b: "Terminou seu skincare?" + "Tempo da sessão" (congelado) + Concluir / Continuar.
//     Concluir = o mesmo `concluirSkincare()` de antes (sequência, carta do dia, pontos,
//     lembretes, desafio 4) e o fluxo de sempre: "Compartilhar com o grupo?" → câmera do
//     check-in → Novo check-in (com a descrição automática: tempo + rotina, editável) → carta
//     → mural; "Agora não" → carta → home; sem grupo, o convite. A carta só abre no fim.
//   · 88c: o X (ou o voltar do Android) → "Você tem certeza que deseja sair?" → "Excluir
//     sessão" (sai, nada é gravado) / "Continuar sessão".
// Tema (12/nov/2026, pedido do produto): skincare MATINAL = o rosa da 88a1; skincare NOTURNO =
// o degradê do fundo noturno da home (as cores de `homeTheme(true)` em `lib/homeTheme`, lilás
// claro; sem os círculos da home), com textos e cartões escuros por cima. O design não tem a versão noturna;
// ela segue o período da sessão, não o relógio.
// Entrada (fora do design; refeita em 12/nov/2026 — o círculo que nascia do botão era brusco):
// a tela entra com o esmaecimento nativo (`_layout`, 380 ms) e o conteúdo chega em sequência,
// sem quique: o topo desce 12 pt e aparece (560 ms, 80 ms depois), o botão cresce de 0,9 numa
// mola sem overshoot (700 ms, 160 ms depois), a lista sobe 16 pt por último (560 ms, 300 ms
// depois). O flutuar do botão só começa quando a entrada acaba (1 s), para não somar movimento.
// "Reduzir movimento": só esmaece (200 ms), sem deslocar, e o botão fica parado.
// Medidas do frame 393×852 (barra de status de 54 pt → `insets.top − 54`).
// ─────────────────────────────────────────────────────────────────────────────

const PINK = '#FF5EA8';
const INK = '#121212';
const MUTE = '#818181';
const BODY = '#515151';
const RED = '#FD3A42';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// Entrada: um ease-out mais longo e macio que o de toque (chega devagar, sem freada seca).
const EASE_SUAVE = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_FLUTUA = Easing.bezier(0.37, 0, 0.63, 1);
// 88a1: linear-gradient(172deg, …) num frame 393×852 → início/fim em fração da caixa.
const FUNDO_PARADAS = [0, 0.26, 0.5, 0.76, 1] as const;
const FUNDO_INICIO = { x: 0.341, y: -0.022 };
const FUNDO_FIM = { x: 0.659, y: 1.022 };
const BOTAO = 196;

type Tema = {
  /** true = o fundo noturno da home (claro, lilás): textos e cartões escuros. */
  noite: boolean;
  /** Fundo da 88a1 (só de dia; à noite vem de `homeTheme(true)`). */
  fundo: readonly [string, string, string, string, string];
  /** Cor de baixo, por trás do fundo. */
  base: string;
  /** Texto do topo (X, período, cronômetro) e da lista. */
  texto: string;
  /** Texto pequeno da lista (o nome do passo). */
  textoSuave: string;
  /** Cartão de cada passo. */
  cartao: string;
  cartaoBorda: string;
  /** Cor do ✓ e do "Concluir" no botão branco. */
  acento: string;
  /** Fim do degradê radial do botão (88a1: #FFF0F7). */
  botaoFim: string;
  botaoSombra: string;
  /** Sombra desfocada embaixo do botão (88a1: rgba(140,10,70,.28)). */
  chao: string;
  /** Halo que pulsa em volta do botão (88a1: branco). */
  halo: string;
};
const NOITE = homeTheme(true);
const TEMAS: Record<'am' | 'pm', Tema> = {
  // 88a1, igual ao design.
  am: {
    noite: false,
    fundo: ['#FF8CC4', '#FF72B5', '#FF5EA8', '#E73C8E', '#C42373'], base: '#C42373',
    texto: '#FFFFFF', textoSuave: '#FFFFFF', cartao: 'rgba(255,255,255,0.18)', cartaoBorda: 'rgba(255,255,255,0.30)',
    acento: PINK, botaoFim: '#FFF0F7', botaoSombra: 'rgba(170,20,95,0.30)', chao: '#8C0A46', halo: '#FFFFFF',
  },
  // Noite (12/nov/2026, pedido do produto): o DEGRADÊ do fundo noturno da home — as cores de
  // `homeTheme(true)` (BG_NIGHT, de cima para baixo, com as paradas da home) — SEM os círculos
  // decorativos da home (só a textura do degradê). Fundo claro → textos e cartões escuros, o
  // rosa do app nos botões (como a home de noite) e um halo lilás (o branco sumiria no fundo).
  pm: {
    noite: true,
    fundo: ['#FF8CC4', '#FF72B5', '#FF5EA8', '#E73C8E', '#C42373'], base: NOITE.base,
    texto: INK, textoSuave: MUTE, cartao: 'rgba(255,255,255,0.62)', cartaoBorda: 'rgba(255,255,255,0.9)',
    acento: PINK, botaoFim: '#FBF3FA', botaoSombra: 'rgba(120,80,160,0.22)', chao: '#7A5AA8', halo: '#D9C6F2',
  },
};

// O fundo. Dia: a 88a1 (o degradê e a luz em elipse: left/right −60, top 120, altura 420).
// Noite: só o degradê do fundo noturno da home (`homeTheme(true)`), sem os círculos.
function Fundo({ W, H, y, tema }: { W: number; H: number; y: (v: number) => number; tema: Tema }) {
  if (tema.noite) {
    return (
      <View style={{ width: W, height: H, backgroundColor: NOITE.base }} pointerEvents="none">
        <LinearGradient colors={NOITE.bg} locations={BG_STOPS} style={StyleSheet.absoluteFill} />
      </View>
    );
  }
  return (
    <View style={{ width: W, height: H }} pointerEvents="none">
      <LinearGradient colors={tema.fundo} locations={FUNDO_PARADAS} start={FUNDO_INICIO} end={FUNDO_FIM} style={StyleSheet.absoluteFill} />
      <Svg width={W + 120} height={420} style={{ position: 'absolute', left: -60, top: y(120) }}>
        <Defs>
          <RadialGradient id="luz" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#fff" stopOpacity={0.34} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={(W + 120) / 2} cy={210} rx={(W + 120) / 2} ry={210} fill="url(#luz)" />
      </Svg>
    </View>
  );
}

export default function SkincareSessao() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const rm = useReducedMotion();
  const focada = useTelaFocada();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const [sessao] = useState(() => sessaoAtual());
  const y = (v: number) => insets.top + v - 54;

  // Sem sessão (ex.: a tela recriada sem passar pela lista): volta.
  useEffect(() => {
    if (!sessao) voltarOu('/home');
  }, [sessao]);

  // ── Cronômetro ────────────────────────────────────────────────────────────────
  // O tique de cada segundo mora no `<Cronometro>` (só o número redesenha). Antes ficava aqui
  // e redesenhava a TELA INTEIRA a cada segundo (SVGs do botão, lista, folha) — um tique no
  // meio da subida da folha engasgava a animação (12/nov/2026). `fim` = congelado com um
  // pop-up aberto (o tempo que os pop-ups mostram).
  const [fim, setFim] = useState<number | null>(null);
  const tempoParado = sessao && fim != null ? fim - sessao.inicio : 0;

  // ── Instruções do passo (folha de baixo) ──────────────────────────────────────
  // Tocar num passo abre a folha com o que a aba Rotina mostra ao abrir o passo; tocar de
  // novo (na folha ou fora) fecha e a lista continua onde estava (ela não é recriada).
  const [passoAberto, setPassoAberto] = useState<number | null>(null);
  const abrirPasso = (i: number) => { haptics.tap(); setPassoAberto(i); };
  const fecharPasso = () => setPassoAberto(null);
  const folhaAberta = passoAberto != null;
  // Depois de "Concluir": a tela 90a (Skincare concluído) por cima da sessão.
  const [concluido, setConcluido] = useState<{ duracao: number; pontos: PontosConcluido } | null>(null);

  // ── Entrada: o conteúdo chega em sequência, macio e sem quique ─────────────────────
  // (a tela em si entra com o esmaecimento nativo da pilha — `_layout`).
  const topo = useSharedValue(0);
  const centro = useSharedValue(0);
  const lista = useSharedValue(0);
  useEffect(() => {
    if (rm) {
      topo.set(withTiming(1, { duration: 200 }));
      centro.set(withTiming(1, { duration: 200 }));
      lista.set(withTiming(1, { duration: 200 }));
      return;
    }
    topo.set(withDelay(80, withTiming(1, { duration: 560, easing: EASE_SUAVE })));
    centro.set(withDelay(160, withSpring(1, { duration: 700, dampingRatio: 1 })));
    lista.set(withDelay(300, withTiming(1, { duration: 560, easing: EASE_SUAVE })));
  }, [rm]); // eslint-disable-line react-hooks/exhaustive-deps
  const topoSt = useAnimatedStyle(() => ({
    opacity: topo.get(),
    transform: [{ translateY: rm ? 0 : (1 - topo.get()) * -12 }],
  }), [rm]);
  const centroSt = useAnimatedStyle(() => ({
    opacity: Math.min(1, centro.get() * 1.4),
    transform: [{ scale: rm ? 1 : 0.9 + 0.1 * centro.get() }],
  }), [rm]);
  const listaSt = useAnimatedStyle(() => ({
    opacity: lista.get(),
    transform: [{ translateY: rm ? 0 : (1 - lista.get()) * 16 }],
  }), [rm]);

  // ── 88a1: o botão flutua, a sombra encolhe e o halo pulsa (só com a tela à vista) ───────
  // Começa depois da entrada (1 s): flutuar durante a chegada somava movimento. Com a folha
  // das instruções aberta, para (assenta em 400 ms): ela fica por baixo do véu e só disputaria
  // quadros com a folha; volta 300 ms depois de a folha fechar.
  const f = useSharedValue(0);
  const flutuouAntes = useRef(false);
  useEffect(() => {
    if (rm || !focada || folhaAberta || concluido) {
      cancelAnimation(f);
      f.set(withTiming(0, { duration: 400, easing: EASE_FLUTUA }));
      return;
    }
    const espera = flutuouAntes.current ? 300 : 1000;   // 1ª vez: depois da entrada da tela
    flutuouAntes.current = true;
    f.set(withDelay(espera, withRepeat(withTiming(1, { duration: 3200, easing: EASE_FLUTUA }), -1, true)));
    return () => cancelAnimation(f);
  }, [rm, focada, folhaAberta, !!concluido]); // eslint-disable-line react-hooks/exhaustive-deps
  const flutuaSt = useAnimatedStyle(() => ({ transform: [{ translateY: 4 - 12 * f.get() }, { scale: 1 + 0.025 * f.get() }] }));
  const sombraSt = useAnimatedStyle(() => ({ opacity: 1 - 0.45 * f.get(), transform: [{ scale: 1 - 0.18 * f.get() }] }));
  const haloSt = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * f.get(), transform: [{ scale: 0.94 + 0.12 * f.get() }] }));

  // ── Pop-ups, conclusão e o fim de sempre ──────────────────────────────────────
  const [popup, setPopup] = useState<'nenhum' | 'concluir' | 'sair'>('nenhum');
  const [concluindo, setConcluindo] = useState(false);
  const descricao = useRef('');
  // Depois de concluir: a folha "Compartilhar com o grupo?" (ou o convite, sem grupo). Só abre
  // com a lista de grupos já carregada — antes disso a folha mostraria o convite por engano.
  const { data: grupos, state: estadoGrupos } = useMeusGrupos();
  const [folha, setFolha] = useState<'fechada' | 'esperando' | 'aberta'>('fechada');
  const saindo = useRef(false);
  const concluiu = useRef(false);

  useFocusEffect(useCallback(() => {
    setTabBarVisible(false);
    // Voltou do X da câmera do check-in: a comemoração (90a) de novo, sem o pop-up do grupo;
    // o "Continuar" dela reabre o pop-up.
    if (consumirVoltaDoCheckin()) {
      saindo.current = false;
      setFolha('fechada');
    }
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]));

  const abrirPopup = (qual: 'concluir' | 'sair') => {
    if (!sessao || concluindo || concluiu.current) return;
    setFim(Date.now());
    setPopup(qual);
  };
  const tocarConcluir = () => { haptics.action(); abrirPopup('concluir'); };
  const tocarFechar = () => { haptics.tap(); abrirPopup('sair'); };
  // "Continuar" / "Continuar sessão" / tocar fora: o cronômetro volta a correr.
  const continuar = () => {
    setPopup('nenhum');
    setFim(null);
  };
  const excluir = () => {
    haptics.warning();
    concluiu.current = true;   // nada mais nesta tela responde
    void encerrarSessao();
    setPopup('nenhum');
    voltarOu('/home');
  };

  const concluir = async () => {
    if (!sessao || concluindo || concluiu.current) return;
    concluiu.current = true;
    haptics.success();
    setConcluindo(true);
    const duracao = (fim ?? Date.now()) - sessao.inicio;
    descricao.current = descricaoDoCheckin(sessao, duracao);
    // As estatísticas do check-in (prévia depois da foto e o que vai para o grupo).
    guardarUltimoSkincare({ periodo: sessao.periodo, duracao_s: Math.round(duracao / 1000), passos: sessao.passos });
    trackFora('skincare_concluido', { periodo: sessao.periodo, duracao_s: Math.round(duracao / 1000), passos: sessao.passos.length });
    let pontos: PontosConcluido = null;
    try {
      const r = await concluirSkincare(sessao.periodo, sessao.passos.map((p) => p.id));
      const e = await estadoCartas().catch(() => null);
      // A 90a mostra SEMPRE os NIKS Points deste skincare (pontos diretos, 20261204: 1º do dia
      // 10–50 — ×3 nas ocasiões de Rara —, 2º 15–30) e a barra do nível subindo. A barra do
      // topo não repete (no skincare, só a da 90a). Sem pontos na resposta (sem rede): +0
      // com o nível atual. Uma carta de PODER que venha junto abre no fim do fluxo.
      if (r?.pontos && r.pontos.total >= r.pontos.total_antes) {
        pontos = { ganhos: r.pontos.total - r.pontos.total_antes, totalAntes: r.pontos.total_antes, total: r.pontos.total };
      } else {
        const t = e?.pontos?.total ?? 0;
        pontos = { ganhos: 0, totalAntes: t, total: t };
      }
      await verificarDesafios({ segurar: false });
    } finally {
      void encerrarSessao();
      setPopup('nenhum');
      setConcluido({ duracao, pontos });
    }
  };
  // "Continuar" da 90a: o fim de sempre (pop-up do grupo → … → carta). A carta a raspar já é
  // buscada aqui, enquanto o pop-up está aberto: o "Agora não" sai sem esperar a rede.
  const cartaPronta = useRef<Promise<string | null> | null>(null);
  const depoisDoConcluido = () => {
    cartaPronta.current = cartaARasparAgora();
    setFolha('esperando');
  };
  useEffect(() => {
    if (folha !== 'esperando') return;
    if (grupos != null) setFolha('aberta');
    // Sem conseguir ler os grupos (sem rede): o check-in também não sairia — segue sem ele.
    else if (estadoGrupos === 'error') terminar('/home');
  }, [folha, grupos, estadoGrupos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fim sem check-in: a carta de hoje abre sozinha; sem carta, vai direto ao destino.
  // O pop-up fecha NA HORA (antes ficava parado ~0,5 s esperando o servidor e saía junto com a
  // tela, 12/nov/2026); a navegação vem depois que ele some.
  const terminar = (destino: string) => {
    if (saindo.current) return;
    saindo.current = true;
    setFolha('fechada');
    const pronta = cartaPronta.current ?? cartaARasparAgora();
    cartaPronta.current = null;
    setTimeout(() => { void abrirCartasEDepois(router, destino, pronta); }, 170);
  };
  // "Compartilhar": a câmera do check-in com os grupos ativados e a descrição automática.
  const fazerCheckin = (grupoIds: string[]) => {
    if (saindo.current || !grupoIds.length || !sessao) return;
    saindo.current = true;
    router.navigate({
      pathname: '/checkin',
      params: { fluxo: 'skincare', rotina: sessao.periodo, grupos: grupoIds.join(','), descricao: descricao.current },
    } as any);
  };

  // Voltar do Android = o X (o gesto do iOS está desligado nesta tela, `_layout`).
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const passoRef = useRef(passoAberto);
  passoRef.current = passoAberto;
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (concluiu.current) return true;
      if (passoRef.current != null) fecharPasso();
      else if (popupRef.current !== 'nenhum') continuar();
      else abrirPopup('sair');
      return true;
    });
    return () => sub.remove();
  }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sessao) return <View style={{ flex: 1, backgroundColor: TEMAS.am.fundo[2] }} />;
  const titulo = sessao.periodo === 'am' ? 'Skincare matinal' : 'Skincare noturno';
  const tema = TEMAS[sessao.periodo];
  const ocupado = popup !== 'nenhum' || concluindo || folha !== 'fechada';

  return (
    <View style={[styles.root, { backgroundColor: tema.base }]}>
      <StatusBar style={tema.noite ? 'dark' : 'light'} />
      <View style={StyleSheet.absoluteFill}><Fundo W={W} H={H} y={y} tema={tema} /></View>

      {/* X (left 16, top 60, 44 × 44), o período (top 66) e o cronômetro (top 88). */}
      <Animated.View style={[StyleSheet.absoluteFill, topoSt]} pointerEvents="box-none">
        {/* TouchableOpacity, não Pressable com estilo em função: com o NativeWind no JSX
            (`jsxImportSource`), o estilo em função do Pressable é ignorado (12/nov/2026). */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={tocarFechar}
          disabled={ocupado}
          style={[styles.fechar, { top: y(60) }]}
          accessibilityRole="button"
          accessibilityLabel="Sair da sessão"
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={tema.texto} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={[styles.periodo, { top: y(66), color: tema.texto }]} pointerEvents="none">{titulo}</Text>
        <Cronometro inicio={sessao.inicio} fim={fim} style={[styles.cronometro, { top: y(88), color: tema.texto }]} />
      </Animated.View>

      {/* O botão (caixa de 252 em top 184): halo, sombra e o círculo branco que flutua. */}
      <Animated.View style={[styles.caixaBotao, { top: y(184), left: W / 2 - 126 }, centroSt]} pointerEvents="box-none">
        <Animated.View pointerEvents="none" style={[styles.halo, haloSt]}>
          <Svg width={280} height={280}>
            <Defs>
              <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={tema.halo} stopOpacity={0.62} />
                <Stop offset="0.62" stopColor={tema.halo} stopOpacity={0.62} />
                <Stop offset="0.8" stopColor={tema.halo} stopOpacity={0.18} />
                <Stop offset="1" stopColor={tema.halo} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={140} cy={140} r={140} fill="url(#halo)" />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.flutua, flutuaSt]} pointerEvents="box-none">
          {/* Sombra embaixo (136 × 22, desfocada 10): uma elipse com degradê radial. */}
          <Animated.View pointerEvents="none" style={[styles.sombra, sombraSt]}>
            <Svg width={156} height={42}>
              <Defs>
                <RadialGradient id="sombra" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0" stopColor={tema.chao} stopOpacity={0.28} />
                  <Stop offset="0.55" stopColor={tema.chao} stopOpacity={0.2} />
                  <Stop offset="1" stopColor={tema.chao} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Ellipse cx={78} cy={21} rx={78} ry={21} fill="url(#sombra)" />
            </Svg>
          </Animated.View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={tocarConcluir}
            disabled={ocupado}
            style={[styles.botao, { boxShadow: `0px 20px 44px ${tema.botaoSombra}` }]}
            accessibilityRole="button"
            accessibilityLabel="Concluir o skincare"
          >
            <Svg width={BOTAO} height={BOTAO} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                {/* radial-gradient(circle at 38% 30%, #FFF 0, #FFF 46%, #FFF0F7 100%) — raio até o canto mais longe. */}
                <RadialGradient id="botao" cx="38%" cy="30%" r="93%" fx="38%" fy="30%">
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="0.46" stopColor="#FFFFFF" />
                  <Stop offset="1" stopColor={tema.botaoFim} />
                </RadialGradient>
              </Defs>
              <Circle cx={BOTAO / 2} cy={BOTAO / 2} r={BOTAO / 2} fill="url(#botao)" />
            </Svg>
            <Svg width={50} height={50} viewBox="0 0 24 24">
              <Path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke={tema.acento} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={[styles.botaoT, { color: tema.acento }]}>Concluir</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* Os passos do período (top 466 até o fim) — só a lista rola. */}
      <Animated.View style={[styles.listaCaixa, { top: y(466) }, listaSt]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + Math.max(0, insets.bottom - 34), gap: 10 }}
        >
          {sessao.passos.map((p, i) => (
            <LinhaPasso key={String(p.id)} p={p} n={i + 1} tema={tema} onPress={ocupado ? undefined : () => abrirPasso(i)} />
          ))}
        </ScrollView>
      </Animated.View>

      {sessao.passos.length > 0 && (
        <FolhaPasso
          passo={passoAberto != null ? sessao.passos[passoAberto] ?? null : null}
          inicial={sessao.passos[0]}
          n={(passoAberto ?? 0) + 1}
          topo={y(430)}
          onFechar={fecharPasso}
        />
      )}

      {/* 88b */}
      <PopUp
        aberta={popup === 'concluir'}
        titulo="Terminou seu skincare?"
        onFora={concluindo ? undefined : continuar}
        principal={{ texto: 'Concluir', cor: PINK, sombra: 'rgba(255,94,168,0.35)', onPress: concluir, ocupado: concluindo }}
        secundario={{ texto: 'Voltar', onPress: () => { haptics.tap(); continuar(); }, desligado: concluindo }}
      >
        <Text style={styles.popRotulo}>Tempo da sessão</Text>
        <Text style={styles.popTempo}>{formatarCronometro(tempoParado)}</Text>
      </PopUp>

      {/* 88c */}
      <PopUp
        aberta={popup === 'sair'}
        titulo="Você tem certeza que deseja sair?"
        onFora={continuar}
        principal={{ texto: 'Excluir sessão', cor: RED, sombra: 'rgba(253,58,66,0.28)', onPress: excluir }}
        secundario={{ texto: 'Continuar sessão', onPress: () => { haptics.tap(); continuar(); } }}
      >
        {/* `standard` = a quebra do iOS que evita uma palavra sozinha na última linha (o design usa text-wrap: balance). */}
        <Text style={styles.popTexto} lineBreakStrategyIOS="standard">A sessão e todo o seu progresso aqui serão perdidos.</Text>
      </PopUp>

      {/* 90a: depois de "Concluir", esmaecendo por cima da sessão (o pop-up do grupo vem por cima dela). */}
      {concluido && (
        <Animated.View entering={FadeIn.duration(rm ? 200 : 320)} style={[StyleSheet.absoluteFill, { zIndex: 70 }]}>
          <StatusBar style="dark" />
          <SkincareConcluido
            periodo={sessao.periodo}
            duracaoMs={concluido.duracao}
            passos={sessao.passos}
            pontos={concluido.pontos}
            onContinuar={depoisDoConcluido}
          />
        </Animated.View>
      )}

      <FolhaCompartilhar
        aberta={folha === 'aberta'}
        semEscolha
        onCompartilhar={fazerCheckin}
        onCriarGrupo={() => terminar(`/seus-grupos?criar=1&depois=checkin&rotina=${sessao.periodo}`)}
        onFechar={() => terminar('/home')}
      />
    </View>
  );
}

// O cronômetro (88a1, top 88): sempre agora − início, certo mesmo depois de o app ir para o
// fundo. O tique de 1 s fica AQUI, para só este texto redesenhar; com `fim` (um pop-up
// aberto), fica parado nele.
function Cronometro({ inicio, fim, style }: { inicio: number; fim: number | null; style: StyleProp<TextStyle> }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (fim != null) return;
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fim]);
  const ms = (fim ?? agora) - inicio;
  return (
    <Text style={style} pointerEvents="none" accessibilityLabel={`Tempo: ${duracaoPorExtenso(ms)}`}>
      {formatarCronometro(ms)}
    </Text>
  );
}

// Um passo da lista (88a1): número, foto do produto no quadro branco de 50, o passo pequeno em
// cima e "Marca · Produto" embaixo. Sem produto: o ícone do passo e só o nome, grande.
function LinhaPasso({ p, n, tema, onPress }: { p: PassoSessao; n: number; tema: Tema; onPress?: () => void }) {
  const prod = [p.marca, p.produto].filter(Boolean).join(' · ');
  const nome = p.nome?.trim() || '';
  const cor = { color: tema.texto };
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.passo, { backgroundColor: tema.cartao, borderColor: tema.cartaoBorda }]}
      accessibilityRole="button"
      accessibilityLabel={`Ver instruções: ${nome || prod || 'passo'}`}
    >
      <Text style={[styles.passoN, cor]}>{n}</Text>
      <View style={styles.passoFoto}>
        {p.img
          ? <ExpoImage source={{ uri: p.img }} cachePolicy="memory-disk" contentFit="contain" style={{ width: 44, height: 44 }} />
          : <StepIcon tipo={p.tipo} size={24} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {prod ? (
          <>
            {!!nome && <Text style={[styles.passoNome, { color: tema.textoSuave }]} numberOfLines={1}>{nome}</Text>}
            <Text style={[styles.passoProd, cor]} numberOfLines={1}>{prod}</Text>
          </>
        ) : (
          <Text style={[styles.passoProd, cor]} numberOfLines={1}>{nome || 'Passo'}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// As instruções do passo (12/nov/2026, pedido do produto): uma folha que sobe de baixo e toma a
// parte de baixo da tela (do `topo` até o fim), com o que a aba Rotina mostra ao abrir o passo —
// a frase dos dias (passo não diário), a instrução e a observação da IA sobre o produto.
// Movimento pensado para ser confortável: SOBE numa mola sem quique (520 ms, dampingRatio 1) e
// DESCE com ease-in-out (320 ms); o véu por cima do resto esmaece junto (até 22%), e o conteúdo
// da folha entra 8 pt atrasado e esmaecendo, para não chegar "colado". Tocar na folha ou fora
// fecha. "Reduzir movimento": só esmaece (200 ms).
// Fluidez (12/nov/2026 — "travada, baixo FPS" ao tocar): a folha fica MONTADA desde o início
// (escondida abaixo da tela, com o 1º passo), então tocar só troca o texto e a foto, sem criar
// a árvore inteira no quadro do toque; a subida só começa no quadro SEGUINTE à troca
// (`requestAnimationFrame`), com o conteúdo novo já desenhado; e a folha não leva sombra
// desfocada (era redesenhada a cada quadro do movimento) — o véu já a separa do fundo.
const EASE_DESCE = Easing.bezier(0.4, 0, 0.2, 1);
function FolhaPasso({ passo, inicial, n, topo, onFechar }: {
  passo: PassoSessao | null; inicial: PassoSessao; n: number; topo: number; onFechar: () => void;
}) {
  const rm = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const altura = Math.max(320, H - topo);
  const v = useSharedValue(0);
  // O passo mostrado: troca ao abrir e FICA na descida (a folha desce com o mesmo conteúdo).
  const [atual, setAtual] = useState<{ p: PassoSessao; n: number }>({ p: inicial, n: 1 });
  const aberta = passo != null;
  useEffect(() => {
    if (passo) setAtual({ p: passo, n });
  }, [passo, n]);
  useEffect(() => {
    if (!aberta) {
      v.set(withTiming(0, { duration: rm ? 200 : 320, easing: EASE_DESCE }));
      return;
    }
    // Um quadro depois: o conteúdo novo já está na tela quando a mola começa.
    const id = requestAnimationFrame(() => {
      v.set(rm ? withTiming(1, { duration: 200 }) : withSpring(1, { duration: 520, dampingRatio: 1 }));
    });
    return () => cancelAnimationFrame(id);
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  const veuSt = useAnimatedStyle(() => ({ opacity: v.get() }));
  const folhaSt = useAnimatedStyle(() => (rm
    ? { opacity: v.get() }
    : { transform: [{ translateY: (1 - v.get()) * (altura + 40) }] }), [rm, altura]);
  const miolosSt = useAnimatedStyle(() => ({
    opacity: Math.max(0, (v.get() - 0.35) / 0.65),
    transform: [{ translateY: rm ? 0 : (1 - v.get()) * 8 }],
  }), [rm]);
  // Aberta: o passo tocado já no 1º desenho; fechando: o último aberto (`atual`).
  const p = passo ?? atual.p;
  const numero = passo ? n : atual.n;
  const prod = [p.marca, p.produto].filter(Boolean).join(' · ');
  const nome = p.nome?.trim() || '';
  const fechar = () => { haptics.tap(); onFechar(); };
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 60 }]} pointerEvents={aberta ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.folhaVeu, veuSt]}>
        {/* Tocar fora fecha (sem haptic: é o véu). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar instruções" />
      </Animated.View>
      <Animated.View style={[styles.folha, { height: altura }, folhaSt]}>
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
          {/* A folha inteira é o "toque de novo": fecha. */}
          <Pressable onPress={fechar} accessibilityRole="button" accessibilityLabel="Fechar instruções" style={{ paddingHorizontal: 22 }}>
            <View style={styles.folhaAlca} />
            <Animated.View style={miolosSt}>
              <View style={styles.folhaCabeca}>
                <View style={styles.folhaFoto}>
                  {p.img
                    ? <ExpoImage source={{ uri: p.img }} cachePolicy="memory-disk" contentFit="contain" style={{ width: 54, height: 54 }} />
                    : <StepIcon tipo={p.tipo} size={28} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.folhaPasso}>Passo {numero}{nome ? ` · ${nome}` : ''}</Text>
                  <Text style={styles.folhaProd} numberOfLines={2}>{prod || nome || 'Passo'}</Text>
                </View>
              </View>
              {!!p.dias?.length && <Text style={styles.folhaDias}>{fraseFrequencia(p.dias)}</Text>}
              <Text style={styles.folhaRotulo}>Como usar</Text>
              <Text style={styles.folhaTexto} lineBreakStrategyIOS="push-out">
                {p.instrucao || 'Este passo ainda não tem instruções.'}
              </Text>
              {/* Observação da IA sobre o produto dela (a mesma do card aberto na aba Rotina). */}
              {!!p.aviso && (
                <View style={[styles.folhaAviso, p.aviso.nivel === 'forte' && { backgroundColor: '#FDECEA' }]}>
                  <Text style={[styles.folhaAvisoT, p.aviso.nivel === 'forte' && { color: '#B42318' }]}>{p.aviso.texto}</Text>
                </View>
              )}
            </Animated.View>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// O pop-up das 88b/88c: véu rgba(18,18,18,.48), card branco (24 pt das bordas, raio 28), título,
// o miolo e dois botões de 54. Entra crescendo de 96% com fade em 240 ms, sai em 160 ms;
// "Reduzir movimento": só fade.
type Botao = { texto: string; onPress: () => void; cor?: string; sombra?: string; ocupado?: boolean; desligado?: boolean };
function PopUp({ aberta, titulo, children, principal, secundario, onFora }: {
  aberta: boolean; titulo: string; children: React.ReactNode; principal: Botao; secundario: Botao; onFora?: () => void;
}) {
  const rm = useReducedMotion();
  const v = useSharedValue(0);
  const [montada, setMontada] = useState(false);
  useEffect(() => {
    if (aberta) {
      setMontada(true);
      v.set(withTiming(1, { duration: rm ? 200 : 240, easing: EASE_OUT }));
    } else if (montada) {
      v.set(withTiming(0, { duration: 160, easing: EASE_OUT }));
      const t = setTimeout(() => setMontada(false), 170);
      return () => clearTimeout(t);
    }
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  const veuSt = useAnimatedStyle(() => ({ opacity: v.get() }));
  const cardSt = useAnimatedStyle(() => (rm
    ? { opacity: v.get() }
    : { opacity: v.get(), transform: [{ scale: 0.96 + 0.04 * v.get() }] }), [rm]);
  if (!montada) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 80 }]} pointerEvents={aberta ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]}>
        {/* Tocar fora = continuar (sem haptic: é o véu). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onFora} accessibilityLabel="Fechar" />
      </Animated.View>
      <View style={styles.popCentro} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardSt]}>
          <Text style={styles.popTitulo}>{titulo}</Text>
          {children}
          <View style={styles.popBotoes}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={principal.onPress}
              disabled={principal.ocupado}
              style={[styles.popBtn, { backgroundColor: principal.cor, boxShadow: `0px 10px 22px ${principal.sombra}` }]}
              accessibilityRole="button"
              accessibilityLabel={principal.texto}
            >
              {principal.ocupado ? <ActivityIndicator color="#fff" /> : <Text style={styles.popBtnT}>{principal.texto}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={secundario.onPress}
              disabled={secundario.desligado}
              style={[styles.popBtn, { backgroundColor: '#F4F4F4' }]}
              accessibilityRole="button"
              accessibilityLabel={secundario.texto}
            >
              <Text style={styles.popBtn2T}>{secundario.texto}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A cor de baixo vem do tema (`base`), por trás do `Fundo`.
  root: { flex: 1 },
  fechar: { position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  periodo: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2, color: '#fff' },
  cronometro: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontSize: 60, lineHeight: 66, fontWeight: '800', letterSpacing: -2.4, color: '#fff', fontVariant: ['tabular-nums'],
  },
  caixaBotao: { position: 'absolute', width: 252, height: 252 },
  halo: { position: 'absolute', left: -14, top: -14, width: 280, height: 280 },
  flutua: { position: 'absolute', left: 28, top: 28, width: BOTAO, height: BOTAO },
  // left/right 30, bottom −26, 136 × 22, desfoque 10 → a elipse com borda de 10 em volta.
  sombra: { position: 'absolute', left: 20, bottom: -36, width: 156, height: 42 },
  botao: {
    width: BOTAO, height: BOTAO, borderRadius: BOTAO / 2, backgroundColor: '#fff', overflow: 'visible',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: '0px 20px 44px rgba(170,20,95,0.30)',
  },
  botaoT: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: PINK },
  listaCaixa: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  passo: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 14,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
  },
  passoN: { width: 24, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'] },
  passoFoto: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  passoNome: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: '#fff' },
  passoProd: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.3, color: '#fff' },
  veu: { backgroundColor: 'rgba(18,18,18,0.48)' },
  // Folha das instruções do passo.
  folhaVeu: { backgroundColor: 'rgba(18,18,18,0.22)' },
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    // Sem sombra desfocada: numa folha que se move, ela é redesenhada a cada quadro.
  },
  folhaAlca: { alignSelf: 'center', marginTop: 10, width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(18,18,18,0.14)' },
  folhaCabeca: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  folhaFoto: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#FFF5F9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  folhaPasso: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: MUTE },
  folhaProd: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: INK },
  folhaDias: { marginTop: 18, fontSize: 15, lineHeight: 21, fontWeight: '700', color: INK },
  folhaRotulo: { marginTop: 20, fontSize: 13, lineHeight: 17, fontWeight: '700', letterSpacing: 0.2, color: '#E8468F' },
  folhaTexto: { marginTop: 6, fontSize: 16, lineHeight: 23, color: '#3D3A3C' },
  folhaAviso: { marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: '#FFF5F9' },
  // A mesma cor do aviso no card aberto da aba Rotina (`stepAviso`: #C0206A; forte: #B42318).
  folhaAvisoT: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#C0206A' },
  popCentro: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    paddingTop: 30, paddingHorizontal: 22, paddingBottom: 22, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center',
    boxShadow: '0px 24px 60px rgba(0,0,0,0.25)',
  },
  popTitulo: { textAlign: 'center', fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8, color: INK },
  popRotulo: { marginTop: 18, fontSize: 14, lineHeight: 18, color: MUTE },
  popTempo: { marginTop: 2, fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1.4, color: PINK, fontVariant: ['tabular-nums'] },
  popTexto: { marginTop: 10, textAlign: 'center', fontSize: 15, lineHeight: 21, color: BODY },
  popBotoes: { marginTop: 24, alignSelf: 'stretch', gap: 10 },
  popBtn: { height: 54, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  popBtnT: { color: '#fff', fontSize: 17, fontWeight: '700' },
  popBtn2T: { color: INK, fontSize: 17, fontWeight: '600' },
});
