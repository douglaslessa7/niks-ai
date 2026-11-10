import { useEffect, useRef, useState } from 'react';
import { irPara } from '../../lib/navegar';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import FolhaCompartilhar from '../grupos/FolhaCompartilhar';
import FolhaEmQualPasso from './FolhaEmQualPasso';
import { confirmShelfRemove } from './ShelfStatus';
import { haptics } from '../../lib/haptics';
import { getUserId } from '../../lib/currentUser';
import { invalidateCache } from '../../lib/cache';
import { compartilharProduto, invalidarGrupos } from '../../lib/gruposServidor';
import { ganhouPontos } from '../../lib/pontosAnimacao';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import {
  removeFromColecao, setColecaoStatus, STATUS_COLECAO, STATUS_ORDEM, type ColecaoItem, type ColecaoStatus,
} from '../../lib/colecao';
import { adicionarDoCatalogo, adicionarDoScan, desfazerAdicao, type DecisaoRotina, type Desfazer } from '../../lib/adicionarDoScan';
import { recomendarPasso, type RecomendacaoPasso } from '../../lib/recomendacaoPasso';
import {
  avisoDoProduto, definirProdutoDoPasso, garantirMinhaRotina, listarMinhaRotina, type PassoRotina,
} from '../../lib/minhaRotina';
import type { Aviso } from '../../lib/avisoProduto';
import { fonteImagem } from '../../lib/produtosTela';
import { analiseDoItem, itemNaRotina, type AnaliseEstante, type VereditoEstante } from '../../lib/analiseEstante';

// ─────────────────────────────────────────────────────────────────────────────
// Tela do produto da estante (08/nov/2026). O próprio produto sai da prateleira e cresce até
// o centro, com a estante desfocada atrás: Modal transparente (cobre a barra de abas) com o
// recorte começando exatamente sobre a miniatura (`origem`, medida no toque).
// Movimento: voo só com transform (mola de 400 ms, sem passar do ponto); desfoque estático
// que entra por opacidade; inclinação 3D em repouso que responde ao dedo e volta com mola.
// "Reduzir movimento": só esmaece, sem voo nem inclinação.
// Busca (sem miniatura na tela): `origem` nula, entra esmaecendo.
// ─────────────────────────────────────────────────────────────────────────────

export type RetanguloOrigem = { x: number; y: number; width: number; height: number };

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#7D7478';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

const TILT_Y = -7;           // inclinação em repouso (graus)
const TILT_X = 3;
const TILT_MAX = 12;         // o que o dedo acrescenta, no máximo
const TILT_POR_PT = 0.09;

const VEREDITO: Record<VereditoEstante, { rotulo: string; cor: string; fundo: string }> = {
  pode_usar:    { rotulo: 'Pode usar',        cor: '#1E9E63', fundo: 'rgba(30,158,99,0.12)' },
  com_ressalva: { rotulo: 'Use com ressalva', cor: '#C67C1E', fundo: 'rgba(232,161,60,0.15)' },
  evitaria:     { rotulo: 'Eu evitaria',      cor: '#D8483F', fundo: 'rgba(216,72,63,0.12)' },
};

const PERSPECTIVA = 900;

const limitar = (v: number, a: number, b: number) => {
  'worklet';
  return Math.max(a, Math.min(b, v));
};

// Voo + inclinação numa matriz só, com o resultado achatado em z = 0. Com rotateX/rotateY
// de verdade, o iOS ordena as camadas por profundidade: a metade inclinada para trás
// passa atrás das irmãs (o fundo desfocado) e o produto aparece cortado na diagonal.
const matrizHero = (tx: number, ty: number, s: number, grausY: number, grausX: number) => {
  'worklet';
  const a = (grausY * Math.PI) / 180;
  const b = (grausX * Math.PI) / 180;
  const w0 = (Math.sin(a) * Math.cos(b)) / PERSPECTIVA;
  const w1 = -Math.sin(b) / PERSPECTIVA;
  return [
    s * Math.cos(a) + tx * w0, s * Math.sin(a) * Math.sin(b) + ty * w0, 0, w0,
    tx * w1, s * Math.cos(b) + ty * w1, 0, w1,
    0, 0, 1, 0,
    tx, ty, 0, 1,
  ];
};

function Icone({ d, cor = INK, extra }: { d: string; cor?: string; extra?: React.ReactNode }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {extra}
      <Path d={d} />
    </Svg>
  );
}

function BotaoBase({ rotulo, onPress, cor = INK, children }: { rotulo: string; onPress: () => void; cor?: string; children: React.ReactNode }) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} accessibilityRole="button" accessibilityLabel={rotulo} style={s.base}>
      {children}
      <Text style={[s.baseTxt, { color: cor }]}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

function PilulaStatus({ status, ativo, seta, onPress }: { status: ColecaoStatus; ativo: boolean; seta?: boolean; onPress: () => void }) {
  const info = STATUS_COLECAO[status];
  return (
    <Pressable
      onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityState={{ selected: ativo }}
      accessibilityLabel={seta ? `Status: ${info.rotulo}. Tocar para trocar` : info.rotulo}
      style={[s.pilula, { backgroundColor: ativo ? info.fundo : 'rgba(255,255,255,0.72)' }]}
    >
      <View style={[s.ponto, { backgroundColor: info.cor }]} />
      <Text style={[s.pilulaTxt, { color: ativo ? info.cor : INK }]}>{info.rotulo}</Text>
      {seta && (
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={info.cor} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M6 9l6 6 6-6" /></Svg>
      )}
    </Pressable>
  );
}

type Props = {
  item: ColecaoItem;
  origem: RetanguloOrigem | null;
  onVisivel: () => void;                              // o Modal apareceu: pode esconder a miniatura
  onFechou: () => void;                               // terminou de sair: desmontar
  onStatus: (id: string, status: ColecaoStatus) => void;
  onRemovido: (id: string) => void;
  onDetalhes: (item: ColecaoItem) => void;
};

export default function ProdutoEstanteOverlay({ item, origem, onVisivel, onFechou, onStatus, onRemovido, onDetalhes }: Props) {
  const rm = !!useReducedMotion();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  // ── Geometria: tamanho final do produto e de onde ele sai ─────────────────────
  const recortado = item.cutoutStatus === 'ok' && !!item.cutoutUrl;
  const uri = recortado ? item.cutoutUrl : (item.photoUrl ?? item.cutoutUrl);
  const proporcao = recortado && item.cutoutW && item.cutoutH ? item.cutoutW / item.cutoutH : 44 / 58;
  const alturaMax = Math.min(H * 0.34, 320);
  const larguraMax = W * 0.6;
  const heroH = Math.min(alturaMax, larguraMax / proporcao);
  const heroW = heroH * proporcao;
  const faixaTopo = insets.top + 56;
  const heroLeft = (W - heroW) / 2;
  const heroTop = faixaTopo + (alturaMax - heroH) / 2;
  const voa = !!origem && !rm;
  const dx = voa ? origem!.x + origem!.width / 2 - (heroLeft + heroW / 2) : 0;
  const dy = voa ? origem!.y + origem!.height / 2 - (heroTop + heroH / 2) : 0;
  const escala0 = voa ? origem!.width / heroW : 1;

  // ── Animação ─────────────────────────────────────────────────────────────────
  const voo = useSharedValue(0);
  const fundo = useSharedValue(0);
  const conteudo = useSharedValue(0);
  const saida = useSharedValue(1);    // esmaece tudo ao remover
  const dedoX = useSharedValue(0);
  const dedoY = useSharedValue(0);
  const fechando = useRef(false);
  const depoisDeFechar = useRef<(() => void) | undefined>(undefined);

  const entrar = () => {
    onVisivel();
    voo.set(rm ? withTiming(1, { duration: 220 }) : withSpring(1, { duration: 400, dampingRatio: 1 }));
    fundo.set(withTiming(1, { duration: 260, easing: EASE_OUT }));
    conteudo.set(withDelay(rm ? 0 : 130, withTiming(1, { duration: 240, easing: EASE_OUT })));
  };

  const concluir = () => {
    const depois = depoisDeFechar.current;
    onFechou();
    // Espera o Modal sair antes de abrir outro por cima (o iOS ignora dois ao mesmo tempo).
    if (depois) setTimeout(depois, 160);
  };

  const fechar = (depois?: () => void) => {
    if (fechando.current) return;
    fechando.current = true;
    depoisDeFechar.current = depois;
    conteudo.set(withTiming(0, { duration: 120 }));
    fundo.set(withTiming(0, { duration: 260 }));
    dedoX.set(withTiming(0, { duration: 200 }));
    dedoY.set(withTiming(0, { duration: 200 }));
    voo.set(withTiming(0, { duration: rm ? 180 : 300, easing: EASE_SHEET }, (ok) => {
      if (ok) scheduleOnRN(concluir);
    }));
  };

  // Removido: não há para onde voltar, então some no lugar.
  const sumir = (depois: () => void) => {
    if (fechando.current) return;
    fechando.current = true;
    depoisDeFechar.current = depois;
    saida.set(withTiming(0, { duration: 200 }, (ok) => { if (ok) scheduleOnRN(concluir); }));
  };

  const inclinar = Gesture.Pan()
    .enabled(!rm)
    .onUpdate((e) => {
      dedoY.set(limitar(e.translationX * TILT_POR_PT, -TILT_MAX, TILT_MAX));
      dedoX.set(limitar(-e.translationY * TILT_POR_PT, -TILT_MAX, TILT_MAX));
    })
    .onFinalize(() => {
      dedoX.set(withSpring(0, { duration: 400, dampingRatio: 0.8 }));
      dedoY.set(withSpring(0, { duration: 400, dampingRatio: 0.8 }));
    });

  const heroSt = useAnimatedStyle(() => {
    const p = voo.get();
    const repouso = rm ? 0 : p;
    return {
      opacity: voa ? 1 : p,
      transform: [{
        matrix: matrizHero(
          dx * (1 - p), dy * (1 - p), escala0 + (1 - escala0) * p,
          TILT_Y * repouso + dedoY.get(), TILT_X * repouso + dedoX.get(),
        ),
      }],
    };
  });
  const fundoSt = useAnimatedStyle(() => ({ opacity: fundo.get() }));
  const conteudoSt = useAnimatedStyle(() => ({
    opacity: conteudo.get(),
    transform: [{ translateY: rm ? 0 : (1 - conteudo.get()) * 10 }],
  }));
  const saidaSt = useAnimatedStyle(() => ({ opacity: saida.get() }));

  // ── Dados ────────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<ColecaoStatus>(item.status);
  const [escolhendoStatus, setEscolhendoStatus] = useState(false);
  const [analise, setAnalise] = useState<AnaliseEstante | null>(null);
  const [naRotina, setNaRotina] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [passos, setPassos] = useState<PassoRotina[] | null>(null);
  const [avisoPasso, setAvisoPasso] = useState<Aviso>({ nivel: 'nenhum', texto: null });
  const [recomendacao, setRecomendacao] = useState<RecomendacaoPasso>({ tipo: 'nenhuma' });
  const [desfazer, setDesfazer] = useState<{ texto: string; d: Desfazer } | null>(null);
  const [folhaGrupo, setFolhaGrupo] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const uid = await getUserId();
      if (!uid) throw new Error('sem sessão');
      const [a, r] = await Promise.all([analiseDoItem(item, uid), itemNaRotina(item.id)]);
      if (vivo) { setAnalise(a); setNaRotina(r); }
    })().catch((e) => {
      console.warn('[estante] falha ao ler a análise', e);
      if (vivo) { setAnalise({ temAnalise: false, compat: null, veredito: null, porque: null, decisao: null, passoRecomendado: null }); setNaRotina(false); }
    });
    return () => { vivo = false; };
  }, [item]);

  const mudarStatus = async (novo: ColecaoStatus) => {
    setEscolhendoStatus(false);
    if (novo === status) return;
    const antes = status;
    haptics.select();
    setStatus(novo);
    onStatus(item.id, novo);
    try {
      await setColecaoStatus(item.id, novo);
    } catch (e) {
      console.warn('[estante] falha ao salvar o status', e);
      haptics.error();
      setStatus(antes);
      onStatus(item.id, antes);
      Alert.alert('Não deu para salvar', 'Tente de novo em instantes.');
    }
  };

  const comSessao = async (acao: (uid: string) => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const uid = await getUserId();
      if (!uid) throw new Error('sem sessão');
      await acao(uid);
    } catch (e) {
      console.warn('[estante] falha ao colocar na rotina', e);
      haptics.error();
      Alert.alert('Não deu para colocar na rotina', 'Verifique sua conexão e tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  // A folha sempre abre: a recomendação só sugere, quem decide é ela.
  const seguirParaRotina = (aviso: Aviso) => comSessao(async (uid) => {
    await garantirMinhaRotina(uid);
    const rotina = await listarMinhaRotina(uid);
    const lista = [...rotina.am, ...rotina.pm];
    setAvisoPasso(aviso);
    setRecomendacao(recomendarPasso({
      escaneado: !!item.productScanId,
      categoria: item.categoria,
      veredito: analise?.veredito ?? null,
      decisao: analise?.decisao ?? null,
      passoRecomendado: analise?.passoRecomendado ?? null,
      passos: lista,
    }));
    setPassos(lista);
  });

  const entrouNaRotina = (uid: string, texto: string, d: Desfazer) => {
    invalidateCache(`minharotina:${uid}`);
    haptics.success();
    setPassos(null);
    setNaRotina(true);
    setDesfazer({ texto, d });
  };

  const colocarNaRotina = async () => {
    const uid = await getUserId();
    if (!uid) return;
    let aviso: Aviso;
    try {
      aviso = await avisoDoProduto(uid, { origem: 'estante', id: item.id });
    } catch {
      aviso = { nivel: 'nenhum', texto: null };
    }
    if (aviso.nivel === 'forte') {
      haptics.warning();
      Alert.alert('Atenção', aviso.texto ?? 'Esse produto pede cuidado na sua pele.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Adicionar mesmo assim', style: 'destructive', onPress: () => { void seguirParaRotina(aviso); } },
      ]);
    } else {
      await seguirParaRotina(aviso);
    }
  };

  const escolherPasso = (passo: PassoRotina, recomendado: boolean) => comSessao(async (uid) => {
    const decisao = analise?.decisao;
    if (recomendado && item.productScanId && decisao?.tipo === 'substituir') {
      // Só no passo tocado, mesmo quando a análise sugere manhã e noite.
      const unico: DecisaoRotina = { ...decisao, periodo: passo.periodo, substitui_passo_id: passo.id };
      const res = await adicionarDoScan(uid, item.productScanId, unico);
      entrouNaRotina(uid, res.aviso, res.desfazer);
      return;
    }
    await definirProdutoDoPasso(passo.id, { origem: 'estante', id: item.id }, avisoPasso);
    if (recomendado && (!passo.produto || passo.produto.origem === 'estante')) {
      entrouNaRotina(uid, `Adicionado ao passo ${passo.nome?.trim() || 'da sua rotina'}`, {
        criados: [], estanteNova: null,
        trocados: [{ id: passo.id, colecao: passo.produto?.id ?? null, aviso_nivel: passo.aviso.nivel, aviso_texto: passo.aviso.texto }],
      });
      return;
    }
    invalidateCache(`minharotina:${uid}`);
    haptics.success();
    setPassos(null);
    setNaRotina(true);
  });

  const criarPassoRecomendado = () => comSessao(async (uid) => {
    if (recomendacao.tipo !== 'novo') return;
    const res = item.productScanId
      ? await adicionarDoScan(uid, item.productScanId, recomendacao.decisao)
      : await adicionarDoCatalogo(uid, item.id, item.categoria, recomendacao.decisao);
    entrouNaRotina(uid, res.aviso, res.desfazer);
  });

  const voltarAtras = () => comSessao(async (uid) => {
    if (!desfazer) return;
    const d = desfazer.d;
    setDesfazer(null);
    await desfazerAdicao(uid, d);
    invalidateCache(`minharotina:${uid}`);
    haptics.tap();
    setNaRotina(false);
  });

  const principal = status === 'quero_comprar'
    ? { rotulo: 'Já comprei', onPress: () => { void mudarStatus('tenho'); }, pronto: true }
    : status === 'acabou'
      ? { rotulo: 'Comprei de novo', onPress: () => { void mudarStatus('tenho'); }, pronto: true }
      : naRotina
        ? { rotulo: 'Ver na rotina', onPress: () => fechar(() => irPara('/protocolo')), pronto: true }
        : { rotulo: 'Colocar na rotina', onPress: () => { void colocarNaRotina(); }, pronto: naRotina !== null };

  const remover = () => {
    confirmShelfRemove(item.nome, async () => {
      try {
        await removeFromColecao(item.id);
        haptics.success();
        sumir(() => onRemovido(item.id));
      } catch (e) {
        console.warn('[estante] falha ao remover', e);
        haptics.error();
        Alert.alert('Não deu pra remover da sua estante', 'Tente de novo em instantes.');
      }
    });
  };

  const compartilhar = async (grupos: string[]) => {
    if (!grupos.length || !item.productScanId) return;
    setCompartilhando(true);
    try {
      const res = await compartilharProduto(item.productScanId, grupos);
      if (!res.ok) { Alert.alert(res.motivo === 'filtro' ? 'Essa foto não pode ser publicada no grupo. Tente outra.' : 'Não deu para compartilhar agora', res.motivo === 'filtro' ? undefined : 'Tente de novo em instantes.'); return; }
      trackFora('compartilhado', { origem: 'estante', grupos: res.grupos.length, carta: Boolean(res.carta_id) });
      await Promise.all(res.grupos.map((g) => invalidarGrupos(g)));
      haptics.success();
      setFolhaGrupo(false);
      fechar(() => {
        if (res.carta_id) router.push(`/(carta)/carta?id=${res.carta_id}` as any);
        else ganhouPontos(res.pontos ?? null);
      });
    } catch {
      Alert.alert('Não deu para compartilhar agora', 'Confira a internet e tente de novo.');
    } finally {
      setCompartilhando(false);
    }
  };

  const baseAltura = 68 + Math.max(insets.bottom, 14) + 8;
  const veredito = analise?.veredito ? VEREDITO[analise.veredito] : null;
  const podeCompartilhar = !!item.productScanId;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={entrar} onRequestClose={() => fechar()}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, saidaSt]}>
          {/* Estante desfocada: desfoque fixo, só a opacidade anima */}
          <Animated.View style={[StyleSheet.absoluteFill, fundoSt]}>
            <BlurView intensity={36} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(252,234,242,0.58)' }]} />
            <Pressable style={StyleSheet.absoluteFill} onPress={() => fechar()} accessibilityLabel="Fechar" />
          </Animated.View>

          {/* O produto */}
          <GestureDetector gesture={inclinar}>
            <Animated.View
              accessible accessibilityRole="image" accessibilityLabel={item.nome ?? 'Produto'}
              style={[s.hero, { left: heroLeft, top: heroTop, width: heroW, height: heroH }, heroSt]}
            >
              {uri ? (
                <ExpoImage
                  source={fonteImagem(uri)} cachePolicy="memory-disk" contentFit={recortado ? 'contain' : 'cover'} transition={0}
                  style={[StyleSheet.absoluteFill, !recortado && { borderRadius: 18 }]}
                />
              ) : <View style={[StyleSheet.absoluteFill, { borderRadius: 18, backgroundColor: '#FFE3EF' }]} />}
            </Animated.View>
          </GestureDetector>

          <Animated.View style={[StyleSheet.absoluteFill, conteudoSt]} pointerEvents="box-none">
            <Pressable onPress={() => { haptics.tap(); fechar(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar" style={[s.fechar, { top: insets.top + 8 }]}>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
            </Pressable>

            <ScrollView
              style={{ position: 'absolute', left: 0, right: 0, top: faixaTopo + alturaMax + 16, bottom: baseAltura }}
              contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 22, paddingBottom: 12, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {escolhendoStatus ? (
                <Animated.View entering={rm ? undefined : FadeIn.duration(150)} style={s.linhaStatus}>
                  {STATUS_ORDEM.map((st) => (
                    <PilulaStatus key={st} status={st} ativo={st === status} onPress={() => { void mudarStatus(st); }} />
                  ))}
                </Animated.View>
              ) : (
                <PilulaStatus status={status} ativo seta onPress={() => { haptics.select(); setEscolhendoStatus(true); }} />
              )}

              {!!item.marca && <Text style={s.marca} numberOfLines={1}>{item.marca}</Text>}
              <Text style={[s.nome, !item.marca && { marginTop: 14 }]} numberOfLines={2}>{item.nome ?? 'Produto'}</Text>

              <View style={s.analise}>
                {analise === null ? (
                  <ActivityIndicator size="small" color={PINK} />
                ) : analise.temAnalise ? (
                  <Animated.View entering={rm ? undefined : FadeIn.duration(180)} style={{ alignItems: 'center' }}>
                    <View style={s.linhaCompat}>
                      {analise.compat != null && <Text style={s.compat}>{analise.compat}% compatível</Text>}
                      {!!veredito && (
                        <View style={[s.chip, { backgroundColor: veredito.fundo }]}>
                          <Text style={[s.chipTxt, { color: veredito.cor }]}>{veredito.rotulo}</Text>
                        </View>
                      )}
                    </View>
                    {!!analise.porque && <Text style={s.porque} numberOfLines={2}>{analise.porque}</Text>}
                  </Animated.View>
                ) : (
                  <Animated.View entering={rm ? undefined : FadeIn.duration(180)} style={{ alignItems: 'center' }}>
                    <Text style={s.semAnaliseTit}>Ainda não analisado</Text>
                    <Pressable
                      onPress={() => { haptics.action(); fechar(() => router.push('/(scan)/product-camera' as any)); }}
                      hitSlop={10} accessibilityRole="button" style={{ marginTop: 4 }}
                    >
                      <Text style={s.semAnaliseLink}>Analisar produto</Text>
                    </Pressable>
                  </Animated.View>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!principal.pronto || ocupado}
                onPress={() => { haptics.action(); principal.onPress(); }}
                accessibilityRole="button"
                style={[s.principal, (!principal.pronto || ocupado) && { opacity: 0.55 }]}
              >
                {ocupado
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={s.principalTxt}>{principal.rotulo}</Text>}
              </TouchableOpacity>
            </ScrollView>

            {/* Base */}
            <View style={[s.linhaBase, { bottom: Math.max(insets.bottom, 14) }]}>
              <BotaoBase rotulo="Detalhes" onPress={() => { haptics.tap(); fechar(() => onDetalhes(item)); }}>
                <Icone d="M12 11v5M12 8h.01" extra={<Circle cx={12} cy={12} r={9} />} />
              </BotaoBase>
              {podeCompartilhar && (
                <BotaoBase rotulo="Compartilhar" onPress={() => { haptics.tap(); setFolhaGrupo(true); }}>
                  <Icone d="M12 15V4M8 7.5L12 3.5l4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
                </BotaoBase>
              )}
              <BotaoBase rotulo="Remover" cor="#D8483F" onPress={remover}>
                <Icone cor="#D8483F" d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12M10 11v5M14 11v5" />
              </BotaoBase>
            </View>

            {!!desfazer && (
              <View style={[s.aviso, { bottom: baseAltura + 4 }]}>
                <Text style={s.avisoTxt}>{desfazer.texto}</Text>
                <Pressable onPress={() => { void voltarAtras(); }} hitSlop={10} accessibilityRole="button">
                  <Text style={s.avisoAcao}>Desfazer</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>

          {!!passos && (
            <FolhaEmQualPasso
              passos={passos}
              recomendacao={recomendacao}
              ocupado={ocupado}
              rm={rm}
              alturaTela={H}
              folgaBase={Math.max(insets.bottom, 16)}
              onEscolher={(p, recomendado) => { void escolherPasso(p, recomendado); }}
              onCriarNovo={() => { void criarPassoRecomendado(); }}
              onFechar={() => setPassos(null)}
            />
          )}

          {podeCompartilhar && (
            <FolhaCompartilhar
              aberta={folhaGrupo}
              ocupado={compartilhando}
              onCompartilhar={(g) => { void compartilhar(g); }}
              onCriarGrupo={() => { setFolhaGrupo(false); fechar(() => router.push('/(app)/seus-grupos?criar=1' as any)); }}
              onFechar={() => setFolhaGrupo(false)}
            />
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  hero: {
    position: 'absolute',
    shadowColor: 'rgb(110,30,60)', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.26, shadowRadius: 18,
  },
  fechar: {
    position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.82)', alignItems: 'center', justifyContent: 'center',
  },
  linhaStatus: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  pilula: { height: 34, paddingHorizontal: 12, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  pilulaTxt: { fontSize: 13, fontWeight: '600', letterSpacing: -0.15 },
  marca: { marginTop: 14, fontSize: 14, fontWeight: '500', letterSpacing: -0.15, color: MUTE, textAlign: 'center' },
  nome: { marginTop: 2, fontSize: 21, lineHeight: 26, fontWeight: '700', letterSpacing: -0.45, color: INK, textAlign: 'center' },
  analise: { marginTop: 14, minHeight: 72, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  linhaCompat: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  compat: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: INK, fontVariant: ['tabular-nums'] },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  chipTxt: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
  porque: { marginTop: 7, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: '#5F565A', textAlign: 'center' },
  semAnaliseTit: { fontSize: 16, fontWeight: '600', letterSpacing: -0.25, color: '#5F565A' },
  semAnaliseLink: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, color: '#E8468F' },
  principal: {
    marginTop: 14, height: 50, minWidth: 190, paddingHorizontal: 28, borderRadius: 100, backgroundColor: PINK,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(255,94,168)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  principalTxt: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' },
  linhaBase: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', gap: 8 },
  base: {
    flex: 1, height: 68, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.86)', alignItems: 'center', justifyContent: 'center', gap: 4,
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7,
  },
  baseTxt: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  aviso: {
    position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 16, backgroundColor: '#1F1A1C',
  },
  avisoTxt: { flex: 1, fontSize: 15, lineHeight: 20, color: '#FFFFFF' },
  avisoAcao: { fontSize: 15, fontWeight: '700', color: '#FF8AC0' },
});
