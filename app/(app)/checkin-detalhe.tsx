// ─────────────────────────────────────────────────────────────────────────────
// Detalhes de um check-in (09/nov/2026). Abre ao tocar num check-in do mural do grupo (o meu
// ou o de uma amiga) e num dia do calendário de check-ins (aba Grupos e Suas conquistas).
// Referência: tela de detalhes de outro app (foto grande, quem fez, quando, título), adaptada
// ao NIKS — fundo rosado, foto em card branco, moldura da medalha. O que a referência tem e o
// NIKS não guarda (mapa/local, reações, comentários) fica de fora. Check-in do fluxo do skincare
// (1.62, `estatisticas`): no lugar do título/descrição, o tempo, os passos e os produtos.
//
// Dados: função `grupos`, ação `checkin_detalhe` (migration 20261201120000). O servidor só
// devolve para quem fez ou para integrante de um grupo em comum; escondido pela denúncia não
// abre para as outras. Convidada abre igual. Sem resposta → "Este check-in não está mais
// disponível."
//
// Vários check-ins no mesmo dia (manhã e noite): `ids` separados por vírgula, uma página cada,
// deslizando de lado (rolagem nativa).
// Menu "…" (só no check-in de outra pessoa, exigência da Apple 1.2): "Denunciar check-in",
// "Bloquear <nome>", "Cancelar" — as mesmas ações e confirmações do grupo.
// Animações (Reanimated, thread de UI): a página entra com fade + 8 pt; a folha sobe com a
// curva de folha do iOS. "Reduzir movimento": só fade.
//
// Foto de ponta a ponta + transição de zoom (12/nov/2026, cópia da do app de treino, que é o zoom
// nativo do iOS). A foto ocupa a parte de cima da tela inteira (sob a barra de status), com o
// voltar e o "…" dentro dela. A tela abre por cima da anterior (modal transparente, sem animação
// nativa) CRESCENDO a partir da miniatura tocada (mural, calendário — `lib/origemZoom`). No topo
// da rolagem, arrastar para baixo leva só a foto, num cartão que encolhe e segue o dedo; soltando
// além do limite (ou num puxão) ela volta voando para dentro da miniatura; senão, volta à tela
// cheia. Detalhes no bloco "Transição de zoom" de `Tela`. "Reduzir movimento": só fade.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing, FadeIn, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import FotoComMoldura from '../../components/medalhas/FotoComMoldura';
import { fonteDoCheckin } from '../../lib/fotosRapidas';
import { BlocoEstatisticas, tituloEstatisticas } from '../../components/grupos/EstatisticasCheckin';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { bloquear, checkinDetalhe, checkinDetalheEmMemoria, denunciar, fotoConhecidaDoCheckin, type CheckinDetalhe } from '../../lib/gruposServidor';
import { invalidateCachePrefixo } from '../../lib/cache';
import { voltar as voltarOu } from '../../lib/navegar';
import { useGestoVoltar } from '../../hooks/useGestoVoltar';
import { Gesture, GestureDetector, State, type GestureType } from 'react-native-gesture-handler';
import { origemDe, type Origem } from '../../lib/origemZoom';

const BG = '#F9F2F5';
const INK = '#121212';
const MUTE = '#818181';
const PINK = '#FF5EA8';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const FOLHA = Easing.bezier(0.32, 0.72, 0, 1);

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** "9 de nov., 8:07 de manhã" — o fim é o período da rotina, não o fuso. */
function quando(c: CheckinDetalhe): string {
  const [, m, d] = c.dia.split('-').map(Number);
  const h = new Date(c.hora_exibida);
  const hora = `${h.getHours()}:${String(h.getMinutes()).padStart(2, '0')}`;
  return `${d} de ${MESES[(m || 1) - 1]}, ${hora} ${c.rotina === 'am' ? 'de manhã' : 'à noite'}`;
}

function Icone({ d, size = 20, color = INK }: { d: string; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function Pontos({ cor = INK }: { cor?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      {[5, 12, 19].map((x) => <Circle key={x} cx={x} cy={12} r={1.9} fill={cor} />)}
    </Svg>
  );
}

/** Mesmo check-in na tela? (a assinatura do link da foto não conta: a foto é a mesma). */
function mesmoConteudo(a: CheckinDetalhe, b: CheckinDetalhe): boolean {
  const semToken = (c: CheckinDetalhe) => JSON.stringify({ ...c, foto_url: c.foto_url?.split('?')[0] ?? null });
  return semToken(a) === semToken(b);
}

type Estado = { tipo: 'carregando' } | { tipo: 'pronto'; c: CheckinDetalhe } | { tipo: 'indisponivel' };

type Topo = { insetTop: number; onVoltar: () => void; onMenu: (c: CheckinDetalhe) => void };

/** Voltar e "…" dentro da foto: círculo escuro translúcido, ícone branco. */
function BotoesNaFoto({ topo, c }: { topo: Topo; c: CheckinDetalhe | null }) {
  return (
    <View style={[styles.botoesFoto, { top: topo.insetTop + 6 }]} pointerEvents="box-none">
      <TouchableOpacity activeOpacity={0.7} onPress={topo.onVoltar} style={styles.vidro} accessibilityLabel="Voltar" hitSlop={6}>
        <Icone d="m15 18-6-6 6-6" color="#fff" />
      </TouchableOpacity>
      {c && !c.voce ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => topo.onMenu(c)} style={styles.vidro} accessibilityLabel="Mais opções" hitSlop={6}>
            <Pontos cor="#fff" />
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Pagina({ id, largura, rm, onCarregou, topo, info }: { id: string; largura: number; rm: boolean; onCarregou: (c: CheckinDetalhe | null) => void; topo: Topo; info: SharedValue<number> }) {
  // Já na memória (o mural semeia ao tocar; ou aberto antes) → abre pronta, sem carregando.
  // A leitura do servidor roda igual e só atualiza (link da foto novo, moderação).
  const [estado, setEstado] = useState<Estado>(() => {
    const c = checkinDetalheEmMemoria(id);
    return c ? { tipo: 'pronto', c } : { tipo: 'carregando' };
  });
  useEffect(() => {
    let vivo = true;
    const tinha = checkinDetalheEmMemoria(id);
    checkinDetalhe(id)
      .then((c) => {
        if (!vivo) return;
        // Igual ao que já está na tela (o link da foto muda a cada leitura, a foto não): não
        // redesenha — um re-render no meio da entrada era um dos trancos.
        if (c && tinha && mesmoConteudo(c, tinha)) return;
        setEstado(c ? { tipo: 'pronto', c } : { tipo: 'indisponivel' }); onCarregou(c);
      })
      .catch(() => { if (!vivo || tinha) return; setEstado({ tipo: 'indisponivel' }); onCarregou(null); });
    return () => { vivo = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aberta já pronta (memória): a entrada é só o zoom da tela (`Tela`); um 2º fade aqui, ao
  // mesmo tempo, pesava a abertura. Vinda do servidor (carregando → pronta), entra com fade.
  const entra = useSharedValue(estado.tipo === 'pronto' ? 1 : 0);
  useEffect(() => {
    if (estado.tipo === 'carregando' || entra.get() === 1) return;
    entra.set(withTiming(1, { duration: rm ? 200 : 320, easing: EO }));
  }, [estado.tipo, rm, entra]);
  const st = useAnimatedStyle(() => (rm
    ? { opacity: entra.get() }
    : { opacity: entra.get(), transform: [{ translateY: 8 * (1 - entra.get()) }] }), [rm]);
  // Arrastando para sair: só a foto vai junto; o resto (texto, botões, sombra) esmaece.
  // Abriu mostrando só a foto (calendário, sem os dados ainda): quando eles chegam, a foto fica
  // parada e só o texto entra com fade.
  const soFoto = useRef(estado.tipo === 'carregando' && !!fotoConhecidaDoCheckin(id)).current;
  const infoSt = useAnimatedStyle(() => ({ opacity: soFoto ? info.get() * entra.get() : info.get() }));

  const fotoH = Math.round(largura * 4 / 3);
  const fotoJa = estado.tipo === 'carregando' ? fotoConhecidaDoCheckin(id) : null;
  if (estado.tipo === 'carregando') {
    return (
      <View style={{ width: largura }}>
        {/* Sem os dados ainda, mas com a foto conhecida (calendário): a foto já aparece, sem
            "carregando"; o resto entra com fade quando o servidor responde. */}
        <View style={[styles.foto, { height: fotoH, alignItems: 'center', justifyContent: 'center' }]}>
          {fotoJa
            ? <Image source={fonteDoCheckin(id, fotoJa)} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            : <ActivityIndicator color={PINK} />}
          <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']} style={[styles.sombraTopo, { height: topo.insetTop + 76 }]} />
        </View>
        <BotoesNaFoto topo={topo} c={null} />
      </View>
    );
  }
  if (estado.tipo === 'indisponivel') {
    return (
      <View style={{ width: largura, minHeight: fotoH }}>
        <Animated.View style={[styles.pagina, { width: largura, minHeight: fotoH, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }, st]}>
          <Text style={styles.indisponivel}>Este check-in não está mais disponível.</Text>
        </Animated.View>
        <BotoesNaFoto topo={{ ...topo, insetTop: topo.insetTop }} c={null} />
      </View>
    );
  }
  const c = estado.c;
  return (
    <Animated.View style={[{ width: largura }, !soFoto && st]}>
      <View style={[styles.foto, { height: fotoH }]}>
        {c.foto_url ? <Image source={fonteDoCheckin(c.checkin_id, c.foto_url)} cachePolicy="memory-disk" style={StyleSheet.absoluteFill} contentFit="cover" transition={0}
          // Link vencido (detalhe guardado no disco há mais de 1 h e a foto fora do cache): troca
          // pelo link novo que a leitura do servidor acabou de trazer.
          onError={() => { const n = checkinDetalheEmMemoria(id); if (n && n.foto_url !== c.foto_url) setEstado({ tipo: 'pronto', c: n }); }} /> : null}
        {/* Sombra suave no topo: os botões e a barra de status sempre legíveis sobre a foto. */}
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, infoSt]}>
          <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']} style={[styles.sombraTopo, { height: topo.insetTop + 76 }]} />
          <BotoesNaFoto topo={topo} c={c} />
        </Animated.View>
      </View>
      <Animated.View style={infoSt}>
      <View style={styles.quem}>
        <FotoComMoldura nivel={c.autora.nivel} foto={c.autora.foto} nome={c.autora.nome} tamanho={44} pequena vazio="#F6D3E1" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.nome} numberOfLines={1}>{c.voce ? 'Você' : c.autora.nome}</Text>
          <Text style={styles.quando} numberOfLines={1}>{quando(c)}</Text>
        </View>
      </View>
      {c.estatisticas?.passos ? (
        // Check-in do fluxo do skincare (1.62): tempo, passos e a lista dos passos com os produtos.
        <>
          <Text style={styles.titulo}>{tituloEstatisticas(c.estatisticas, c.rotina, c.titulo)}</Text>
          <View style={{ marginTop: 14, marginHorizontal: 16 }}><BlocoEstatisticas est={c.estatisticas} /></View>
        </>
      ) : (
        <>
          <Text style={styles.titulo}>{c.titulo}</Text>
          {!!c.descricao && <Text style={styles.descricao}>{c.descricao}</Text>}
        </>
      )}
      </Animated.View>
    </Animated.View>
  );
}

/** Rolagem vertical de uma página. Sem o repique no topo: puxar para baixo ali é o gesto de sair
 *  (`Tela`), que leva a foto junto com o dedo. */
function Rolagem({ largura, rola, rolar, arrasto, bottom, children }: {
  largura: number; rola: SharedValue<number>; rolar: boolean; arrasto: GestureType; bottom: number; children: React.ReactNode;
}) {
  const handler = useAnimatedScrollHandler({ onScroll: (e) => { rola.set(e.contentOffset.y); } });
  // A rolagem nativa e o arrasto de sair andam juntos (senão a rolagem pega o toque e o arrasto
  // nunca começa); enquanto a foto é arrastada, a rolagem fica parada (`rolar`).
  const nativo = Gesture.Native().simultaneousWithExternalGesture(arrasto);
  return (
    <GestureDetector gesture={nativo}>
    <Animated.ScrollView
      style={{ width: largura }}
      onScroll={handler}
      scrollEventThrottle={16}
      bounces={false}
      scrollEnabled={rolar}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: bottom }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </Animated.ScrollView>
    </GestureDetector>
  );
}

type Params = { ids?: string; i?: string; volta?: string; grupo?: string };

// A aba oculta continua montada entre aberturas: cada check-in aberto recomeça a tela do zero
// (`key`), senão a folha e as páginas do anterior apareceriam no próximo.
export default function CheckinDetalheTela() {
  const params = useLocalSearchParams<Params>();
  return <Tela key={`${params.ids ?? ''}:${params.i ?? ''}`} params={params} />;
}

function Tela({ params }: { params: Params }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const rm = useReducedMotion();
  const ids = (params.ids ?? '').split(',').filter(Boolean);
  const [pagina, setPagina] = useState(Math.min(Math.max(Number(params.i) || 0, 0), Math.max(ids.length - 1, 0)));
  // Já na memória desde o 1º quadro (sem um 2º render logo depois de montar).
  const [carregados, setCarregados] = useState<Record<string, CheckinDetalhe | null>>(() => {
    const m: Record<string, CheckinDetalhe | null> = {};
    for (const id of ids) { const c = checkinDetalheEmMemoria(id); if (c) m[id] = c; }
    return m;
  });
  const atual = carregados[ids[pagina]] ?? null;
  const scrollRef = useRef<ScrollView>(null);

  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  useFocusEffect(useCallback(() => {
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]));

  // Volta para quem abriu (a tela de trás); sem ela, o grupo ou a tela que pediu (`volta`).
  const sairJa = () => {
    voltarOu(params.grupo ? { pathname: '/grupo', params: { id: params.grupo } } : ((params.volta || '/grupos') as any));
  };

  // ── Transição de zoom (12/nov/2026, cópia da do app de treino = zoom nativo do iOS) ──────────
  // A tela é um CARTÃO: posição (gx, gy), escala (gs, com origem no canto de cima à esquerda),
  // altura visível (gh: corta a parte de baixo) e canto (gr, em pt antes da escala).
  //  • Abrir: o cartão nasce do tamanho e no lugar da miniatura tocada (`lib/origemZoom`) e cresce
  //    até a tela cheia numa mola. Sem miniatura: fade + escala curta.
  //  • Arrastar para baixo (no topo da rolagem): só a foto vai junto. Ela encolhe e segue o dedo
  //    para qualquer lado; o texto e o fundo somem e a tela de trás aparece.
  //  • Soltar (passou do limite ou num puxão): o cartão volta voando para dentro da miniatura, com a
  //    velocidade do dedo. Senão, a mola o devolve à tela cheia. O voltar faz o mesmo voo.
  // Tudo na thread de UI (gesto + valores compartilhados), sem re-render por quadro.
  const { height: H } = useWindowDimensions();
  const fotoH = Math.round(W * 4 / 3);
  const origem = origemDe(params.ids ?? '');
  /** Onde o cartão fica para coincidir com a miniatura (foto cortada ao centro, como `cover`). */
  const alvo = (o: Origem) => {
    'worklet';
    const s = o.w / W;
    return { x: o.x, y: o.y, s, h: o.h / s, r: o.r / s };
  };
  const ini = origem && !rm ? alvo(origem) : null;
  const gx = useSharedValue(ini?.x ?? 0);
  const gy = useSharedValue(ini?.y ?? 0);
  const gs = useSharedValue(ini?.s ?? (rm ? 1 : 0.94));
  const gh = useSharedValue(ini?.h ?? H);
  const gr = useSharedValue(ini?.r ?? 0);
  const info = useSharedValue(ini ? 0 : 1);   // texto, botões e sombra da foto
  const fundo = useSharedValue(0);            // o fundo rosado da tela (cobre a de trás)
  const alfa = useSharedValue(ini ? 1 : 0);   // o cartão inteiro (só sem miniatura)
  const rola = useSharedValue(0);             // rolagem vertical (barra de status, gesto)
  const [rolar, setRolar] = useState(true);   // a rolagem para enquanto a foto é arrastada
  const saindo = useRef(false);

  const MOLA = { damping: 32, stiffness: 300, mass: 1 };          // crítica: chega sem quicar
  const MOLA_ABRE = { damping: 30, stiffness: 260, mass: 1 };
  const cheia = (vx = 0, vy = 0) => {
    'worklet';
    gx.set(withSpring(0, { ...MOLA_ABRE, velocity: vx }));
    gy.set(withSpring(0, { ...MOLA_ABRE, velocity: vy }));
    gs.set(withSpring(1, MOLA_ABRE));
    gh.set(withSpring(H, MOLA_ABRE));
    gr.set(withSpring(0, MOLA_ABRE));
    info.set(withTiming(1, { duration: 260, easing: EO }));
    fundo.set(withTiming(1, { duration: 260, easing: EO }));
  };

  // A entrada começa no quadro DEPOIS de a tela estar montada e medida (montar a foto grande, a
  // moldura e as estatísticas no mesmo quadro do 1º passo da animação dava um tranco).
  const abriu = useRef(false);
  const comecarEntrada = () => {
    if (abriu.current) return;
    abriu.current = true;
    requestAnimationFrame(() => {
      if (ini) { cheia(); return; }
      alfa.set(withTiming(1, { duration: rm ? 200 : 300, easing: EO }));
      gs.set(withTiming(1, { duration: rm ? 200 : 320, easing: EO }));
      fundo.set(withTiming(1, { duration: rm ? 200 : 300, easing: EO }));
    });
  };
  useEffect(() => {
    const t = setTimeout(comecarEntrada, 120);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sairJs = () => { saindo.current = true; sairJa(); };
  const marcarSaindo = () => { saindo.current = true; };
  const tocar = () => haptics.tap();
  /** O voo de volta (da posição atual), com a velocidade do dedo. Worklet: roda no gesto. */
  const voar = (vx: number, vy: number) => {
    'worklet';
    info.set(withTiming(0, { duration: 140 }));
    fundo.set(withTiming(0, { duration: 220, easing: EO }));
    if (origem && !rm) {
      const a = alvo(origem);
      gs.set(withSpring(a.s, MOLA));
      gh.set(withSpring(a.h, MOLA));
      gr.set(withSpring(a.r, MOLA));
      gx.set(withSpring(a.x, { ...MOLA, velocity: vx }));
      gy.set(withSpring(a.y, { ...MOLA, velocity: vy }, (fim) => { if (fim) scheduleOnRN(sairJs); }));
    } else {
      gs.set(withTiming(gs.get() * 0.8, { duration: 220, easing: EO }));
      alfa.set(withTiming(0, { duration: 220, easing: EO }, (fim) => { if (fim) scheduleOnRN(sairJs); }));
    }
  };
  const animarSaida = () => {
    if (saindo.current) return;
    saindo.current = true;
    voar(0, 0);
  };
  const voltar = () => { haptics.tap(); animarSaida(); };

  // Arrastar para sair: só começa puxando PARA BAIXO com a rolagem no topo (de lado é a troca de
  // página; para cima, a rolagem). O ponto tocado fica sob o dedo enquanto a foto encolhe.
  const t0 = useSharedValue({ x: 0, y: 0 });
  const ancora = useSharedValue({ x: 0, y: 0 });
  const arrasto = Gesture.Pan()
    .maxPointers(1)
    .manualActivation(true)
    .onTouchesDown((e) => { const t = e.allTouches[0]; if (t) t0.set({ x: t.absoluteX, y: t.absoluteY }); })
    .onTouchesMove((e, gerente) => {
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.absoluteX - t0.get().x;
      const dy = t.absoluteY - t0.get().y;
      if (e.state === State.ACTIVE) return;   // já arrastando: subir de volta não cancela
      if (rola.get() > 1 || dy < -8 || Math.abs(dx) > 12) { gerente.fail(); return; }
      if (dy > 8 && dy > Math.abs(dx) * 1.2) gerente.activate();
    })
    .onStart((e) => {
      ancora.set({ x: e.absoluteX, y: Math.min(e.absoluteY, fotoH * 0.85) });
      t0.set({ x: e.absoluteX, y: e.absoluteY });
      scheduleOnRN(setRolar, false);
    })
    .onUpdate((e) => {
      const tx = e.absoluteX - t0.get().x;
      const ty = e.absoluteY - t0.get().y;
      const d = Math.max(0, ty);
      const s = 1 - 0.5 * Math.min(1, d / (H * 0.55));
      const a = ancora.get();
      gs.set(s);
      gh.set(H - (H - fotoH) * Math.min(1, d / 70));
      gr.set((30 * Math.min(1, d / 40)) / s);
      gx.set(a.x + tx - a.x * s);
      gy.set(a.y + ty - a.y * s);
      info.set(1 - Math.min(1, d / 60));
      fundo.set(1 - Math.min(1, d / 140));
    })
    .onEnd((e) => {
      const ty = e.absoluteY - t0.get().y;
      if ((ty > 110 && e.velocityY > -300) || (ty > 24 && e.velocityY > 700)) {
        scheduleOnRN(tocar);
        scheduleOnRN(marcarSaindo);
        voar(e.velocityX, e.velocityY);
      } else {
        cheia(e.velocityX, e.velocityY);
        scheduleOnRN(setRolar, true);
      }
    })
    .onFinalize((_e, ok) => { if (!ok) scheduleOnRN(setRolar, true); });

  const fundoSt = useAnimatedStyle(() => ({ opacity: fundo.get() }));
  const cartaoSt = useAnimatedStyle(() => ({
    opacity: alfa.get(),
    height: gh.get(),
    borderRadius: gr.get(),
    transform: [{ translateX: gx.get() }, { translateY: gy.get() }, { scale: gs.get() }],
  }));
  // A foto cortada ao centro quando o cartão fica mais baixo que ela (miniatura quadrada).
  const pontosSt = useAnimatedStyle(() => ({ opacity: info.get() }));
  const conteudoSt = useAnimatedStyle(() => ({
    transform: [{ translateY: gh.get() < fotoH ? -(fotoH - gh.get()) / 2 : 0 }],
  }));

  // Barra de status: clara sobre a foto, escura quando o conteúdo rosado chega ao topo.
  const [barraEscura, setBarraEscura] = useState(false);
  const limiteFoto = Math.round(W * 4 / 3) - insets.top - 20;
  useAnimatedReaction(() => rola.get() > limiteFoto, (agora, antes) => { if (agora !== antes) scheduleOnRN(setBarraEscura, agora); }, [limiteFoto]);

  // ── Folha "…" ────────────────────────────────────────────────────────────────
  const [folha, setFolha] = useState(false);
  arrasto.enabled(!folha);   // com a folha "…" aberta, nada de arrastar a tela
  const [folhaH, setFolhaH] = useState(220);
  // Folha "…" aberta: o gesto nativo não tira a tela de baixo dela.
  useGestoVoltar(!folha);
  const abre = useSharedValue(0);
  const abrirFolha = () => { haptics.tap(); setFolha(true); abre.set(withTiming(1, { duration: rm ? 180 : 380, easing: FOLHA })); };
  const fecharFolha = (depois?: () => void) => {
    abre.set(withTiming(0, { duration: rm ? 150 : 240, easing: EO }));
    setTimeout(() => { setFolha(false); depois?.(); }, rm ? 150 : 240);
  };
  // Saiu da tela com a folha aberta: ela não volta aberta (a aba continua montada).
  useFocusEffect(useCallback(() => () => { setFolha(false); abre.set(0); }, [abre]));
  const veuSt = useAnimatedStyle(() => ({ opacity: abre.get() }));
  const folhaSt = useAnimatedStyle(() => (rm
    ? { opacity: abre.get() }
    : { transform: [{ translateY: (1 - abre.get()) * (folhaH + 40) }] }), [rm, folhaH]);

  // Mesmas ações e confirmações do grupo (`app/(app)/grupo.tsx`).
  const saiu = () => { invalidateCachePrefixo('grupos:'); voltar(); };
  const acao = (k: 'flag' | 'block') => {
    haptics.tap();
    const c = atual;
    if (!c) return;
    fecharFolha(() => {
      if (k === 'flag') {
        if (!c.grupo_id) return;
        Alert.alert('Denunciar esta foto?', 'A equipe do NIKS vai analisar em até 24 horas.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Denunciar', style: 'destructive', onPress: () => { denunciar({ tipo: 'foto', grupo_id: c.grupo_id!, checkin_id: c.checkin_id }).then((r) => { if (r.ok) { Alert.alert('Recebemos sua denúncia. Essa foto ficou escondida enquanto revisamos.'); saiu(); } else Alert.alert('Não deu para denunciar agora', 'Tente de novo mais tarde.'); }).catch(() => {}); } },
        ]);
      } else {
        Alert.alert(`Bloquear ${c.autora.nome}?`, 'Você deixa de ver as fotos e os avisos dela. Ela não é avisada.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Bloquear', style: 'destructive', onPress: () => { bloquear(c.user_id).then(saiu).catch(() => {}); } },
        ]);
      }
    });
  };

  // Abre já na página pedida (dia com manhã e noite).
  useEffect(() => {
    if (pagina > 0) requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: pagina * W, animated: false }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const topo: Topo = { insetTop: insets.top, onVoltar: voltar, onMenu: () => abrirFolha() };
  return (
    <View style={{ flex: 1 }} onLayout={comecarEntrada}>
    {/* Fundo da tela: some com a puxada e deixa ver a tela de trás (modal transparente). */}
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: BG }, fundoSt]} />
    <GestureDetector gesture={arrasto}>
    <Animated.View style={[styles.cartao, { width: W, backgroundColor: BG }, cartaoSt]}>
      {/* Clara só sobre a foto: sem foto (carregando a página, indisponível) fica escura. */}
      {/* Arrastando (`!rolar`), a barra fica sobre a tela de trás, que é clara. */}
      <StatusBar style={barraEscura || !rolar || !atual?.foto_url ? 'dark' : 'light'} />

      {/* Altura fixa da tela: o cartão só CORTA (gh), o conteúdo nunca refaz o layout. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H }, conteudoSt]}>
      <GestureDetector gesture={Gesture.Native().simultaneousWithExternalGesture(arrasto)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={ids.length > 1 && rolar}
        onMomentumScrollEnd={(e) => {
          const n = Math.round(e.nativeEvent.contentOffset.x / W);
          if (n !== pagina) { haptics.select(); setPagina(n); }
        }}
        style={{ flex: 1 }}
      >
        {ids.map((id) => (
          <Rolagem key={id} largura={W} rola={rola} rolar={rolar} arrasto={arrasto} bottom={insets.bottom + 32}>
            <Pagina id={id} largura={W} rm={rm} topo={topo} info={info} onCarregou={(c) => setCarregados((m) => ({ ...m, [id]: c }))} />
          </Rolagem>
        ))}
        {!ids.length && (
          <View style={[styles.pagina, { width: W, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
            <Text style={styles.indisponivel}>Este check-in não está mais disponível.</Text>
            <BotoesNaFoto topo={topo} c={null} />
          </View>
        )}
      </ScrollView>
      </GestureDetector>

      {ids.length > 1 && (
        <Animated.View style={[styles.pontos, { bottom: insets.bottom + 12 }, pontosSt]} pointerEvents="none">
          {ids.map((id, i) => <View key={id} style={[styles.ponto, i === pagina && styles.pontoOn]} />)}
        </Animated.View>
      )}
      </Animated.View>

      {/* ── Folha "…" ─────────────────────────────────────────────────────── */}
      {folha && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => { haptics.tap(); fecharFolha(); }} accessibilityLabel="Fechar" />
          </Animated.View>
          <Animated.View onLayout={(e) => setFolhaH(e.nativeEvent.layout.height)} style={[styles.folha, { paddingBottom: insets.bottom + 16 }, folhaSt]}>
            <View style={styles.alca} />
            <View style={styles.folhaCard}>
              {!!atual?.grupo_id && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => acao('flag')} style={[styles.folhaItem, styles.folhaFio]}>
                  <Icone d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5" size={18} color={PINK} />
                  <Text style={styles.folhaLabel}>Denunciar check-in</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity activeOpacity={0.7} onPress={() => acao('block')} style={styles.folhaItem}>
                <Icone d="M4.9 4.9l14.2 14.2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" size={18} color={PINK} />
                <Text style={styles.folhaLabel} numberOfLines={1}>{`Bloquear ${atual?.autora.nome ?? ''}`}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); fecharFolha(); }} style={styles.cancelar}>
              <Text style={styles.cancelarT}>Cancelar</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </Animated.View>
    </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: { position: 'absolute', left: 0, top: 0, overflow: 'hidden', transformOrigin: 'top left' },
  botoesFoto: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vidro: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(18,18,18,0.34)', alignItems: 'center', justifyContent: 'center' },
  sombraTopo: { position: 'absolute', left: 0, right: 0, top: 0 },
  pagina: { paddingTop: 4, minHeight: 300 },
  foto: { width: '100%', backgroundColor: '#FCE3EE', overflow: 'hidden' },
  quem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginHorizontal: 20 },
  nome: { fontSize: 17, fontWeight: '600', letterSpacing: -0.35, color: INK },
  quando: { marginTop: 2, fontSize: 14, letterSpacing: -0.15, color: MUTE },
  titulo: { marginTop: 18, marginHorizontal: 20, fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.6, color: INK },
  descricao: { marginTop: 8, marginHorizontal: 20, fontSize: 16, lineHeight: 22, letterSpacing: -0.2, color: '#515151' },
  indisponivel: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: INK, textAlign: 'center' },
  pontos: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  ponto: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(18,18,18,0.18)' },
  pontoOn: { backgroundColor: PINK },
  veu: { backgroundColor: 'rgba(26,8,18,0.45)' },
  folha: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  alca: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)', marginBottom: 10 },
  folhaCard: { borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  folhaItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, height: 56 },
  folhaFio: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(18,18,18,0.08)' },
  folhaLabel: { flex: 1, fontSize: 17, fontWeight: '500', letterSpacing: -0.35, color: INK },
  cancelar: { marginTop: 10, height: 56, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  cancelarT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.35, color: INK },
});
