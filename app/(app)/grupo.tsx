import { saiuSemGrupo } from '../../lib/acesso';
import FotoComMoldura from '../../components/medalhas/FotoComMoldura';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Pressable, ActionSheetIOS, Alert, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { useUserId } from '../../lib/currentUser';
import { useEstadoCartas } from '../../lib/cartasServidor';
import {
  bloquear, chaveGrupo, denunciar, grupoDetalhe, invalidarGrupos, muralGrupo, rankingGrupo,
  removerIntegrante, sairDoGrupo, type GrupoResumo, type Integrante, type ItemMural, type LinhaRanking,
} from '../../lib/gruposServidor';
import { enviarConvite, type Canal } from '../../lib/convite';
import { BANNERS_GRUPO } from './seus-grupos';
import { sessionDate, dateKey } from '../../lib/routineProgress';
import AlvoGuia from '../../components/coach/AlvoGuia';
import { onCoachPrepare, useCoachStage } from '../../lib/coachMarks';
import { verificarTutorialGrupos } from '../../lib/gruposTutorial';

// ─────────────────────────────────────────────────────────────────────────────
// Tela do grupo — réplica de 81f (tela), 81g (folha "…" de quem criou) e 81h ("…" na foto
// do mural) do Claude Design ("NIKS home redesign", NiksGrupoFlo.dc.html, rodada 81: o
// Gym Rats na linguagem do Flo). Grupo SEM nível nem XP. Frame de 393 × 852 com barra de
// status de 54: Y do design → insets.top + y − 54.
//   · Banner do grupo no topo (212, o mesmo degradê de Seus grupos, com a flor em padrão e
//     uma grande à direita), voltar e "…" em círculos brancos.
//   · Card branco por cima (−48): nome, integrantes, "Semana de …", a líder da semana
//     (coroa, 1º) e você (ou, se a líder é você, a 2ª colocada) com o nível e os check-ins
//     da semana, e Fazer check-in (com manhã e noite feitas hoje, fica apagado).
//   · Ranking (sua posição) e Jornada (seu nível individual); "Check-ins" e os dias.
//   · Folhas com alça (sobem com mola ζ1 .5 s, 120 ms depois do véu; descem em 240 ms):
//     Convidar amigas, Denunciar, Bloquear, Remover integrante (só quem criou), Sair do grupo
//     num card vermelho e Cancelar; a da foto: Denunciar foto e Bloquear. Bloquear não
//     está no design (pedido da Apple 1.2, aprovado). A integrante é escolhida numa folha
//     do sistema e as ações sérias pedem confirmação.
//   · Ao abrir: o card, os atalhos e o mural sobem 10 pt em cascata (420 ms, 60 ms) e as
//     duas fotos saltam (mola ζ.72 .5 s, 0,86 → 1). Reduzir movimento: só fade.
// Dados reais: função `grupos` (`grupo`, `mural`, `ranking` da semana).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const RED = '#FD3A42';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIN = Easing.bezier(0.55, 0, 1, 0.45);
const LOGO = require('../../assets/home/score-logo-pink.png');
const DIAS_SEM = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES_C = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const ICO = {
  trofeu: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'],
  rota: ['M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15'],
  invite: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7'],
  block: ['M4.9 4.9l14.2 14.2', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'],
  remove: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11h-6'],
  exit: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'],
  coroa: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
};

function Icon({ d, size, color, sw, circles }: { d: string[]; size: number; color: string; sw: number; circles?: [number, number, number][] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {d.map((p, i) => <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />)}
      {circles?.map(([cx, cy, r], i) => <Circle key={`c${i}`} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} />)}
    </Svg>
  );
}
const Dots = ({ size, color, r }: { size: number; color: string; r: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {[5, 12, 19].map((x) => <Circle key={x} cx={x} cy={12} r={r} fill={color} />)}
  </Svg>
);
const mola = (z: number, r: number) => ({ stiffness: (2 * Math.PI / r) ** 2, damping: (4 * Math.PI * z) / r, mass: 1 });

/** Sobe 10 pt e acende (o `data-in` do design). */
function Entra({ i, run, rm, children, style }: { i: number; run: number; rm: boolean; children: React.ReactNode; style?: object }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(0);
    p.set(withDelay(Math.min(i, 8) * 60 + 80, withTiming(1, { duration: rm ? 200 : 420, easing: EO })));
  }, [p, i, run, rm]);
  const st = useAnimatedStyle(() => (rm ? { opacity: p.get() } : { opacity: p.get(), transform: [{ translateY: 10 * (1 - p.get()) }] }), [rm]);
  return <Animated.View style={[style, st]}>{children}</Animated.View>;
}
/** Salta (o `pop` do design): mola ζ.72 .5 s, de 0,86. */
function Salta({ delay, run, rm, children }: { delay: number; run: number; rm: boolean; children: React.ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(0);
    p.set(rm ? withDelay(delay, withTiming(1, { duration: 200 })) : withDelay(delay, withSpring(1, mola(0.72, 0.5))));
  }, [p, delay, run, rm]);
  const st = useAnimatedStyle(() => (rm ? { opacity: p.get() } : { opacity: Math.min(1, p.get() * 1.6), transform: [{ scale: 0.86 + 0.14 * p.get() }] }), [rm]);
  return <Animated.View style={st}>{children}</Animated.View>;
}

type DadosGrupo = { grupo: GrupoResumo; mural: ItemMural[]; semana: LinhaRanking[] };

async function carregar(gid: string): Promise<DadosGrupo> {
  const [grupo, mural, semana] = await Promise.all([grupoDetalhe(gid), muralGrupo(gid), rankingGrupo(gid, 'semana')]);
  return { grupo, mural, semana };
}

function rotuloDia(dia: string, hoje: string): string {
  const d = new Date(`${dia}T12:00:00`);
  return dia === hoje ? `Hoje, ${DIAS_SEM[d.getDay()].toLowerCase()}` : `${DIAS_SEM[d.getDay()]}, ${d.getDate()} de ${MESES_C[d.getMonth()]}`;
}
const hora = (iso: string) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const curta = (d: Date) => `${d.getDate()} de ${MESES_C[d.getMonth()]}`;

// Banner do topo (212): o degradê do grupo (ou a foto), a flor em padrão de 26 e uma grande à direita.
function BannerTopo({ g, w, h }: { g: GrupoResumo | undefined; w: number; h: number }) {
  const rosa = g?.banner !== 'niks-1';
  const cols = Math.floor(w / 26), rows = Math.floor(h / 26);
  const gx = cols > 1 ? (w - cols * 26) / (cols - 1) : 0, gy = rows > 1 ? (h - rows * 26) / (rows - 1) : 0;
  return (
    <View style={{ height: h, overflow: 'hidden', experimental_backgroundImage: rosa ? BANNERS_GRUPO[1].bg : BANNERS_GRUPO[0].bg }}>
      {g?.banner === 'foto' && g.banner_url ? <ExpoImage source={{ uri: g.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
        <>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.16 }]}>
            {Array.from({ length: rows }).map((_, r) => Array.from({ length: cols }).map((__, c) => (
              <Image key={`${r}-${c}`} source={LOGO} style={{ position: 'absolute', left: c * (26 + gx), top: r * (26 + gy), width: 26, height: 26, tintColor: '#fff' }} />
            )))}
          </View>
          <Image source={LOGO} style={{ position: 'absolute', right: -34, top: 40, width: 190, height: 192, tintColor: '#fff', opacity: 0.32 }} />
        </>
      )}
    </View>
  );
}

/** Só o 1º item do mural é alvo do tutorial (duas instâncias da mesma chave se apagam). */
const AlvoItem = ({ primeiro, children }: { primeiro: boolean; children: React.ReactNode }) =>
  (primeiro ? <AlvoGuia chave="grupo-mural-item">{children}</AlvoGuia> : <>{children}</>);

type ItemFolha = { k: string; label: string; sub?: string; d: string[] };

export default function Grupo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const rm = useReducedMotion();
  const userId = useUserId();
  const { id, de } = useLocalSearchParams<{ id?: string; de?: string }>();
  // `router.back()` numa aba oculta cai na home (1ª aba): o destino é explícito.
  const voltar = () => router.navigate((de === 'home' ? '/home' : '/seus-grupos') as any);
  const gid = typeof id === 'string' ? id : '';
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const fetcher = useCallback(() => carregar(gid), [gid]);
  const { data, refresh } = useCachedQuery<DadosGrupo>(userId && gid ? chaveGrupo(userId, gid) : null, fetcher, { staleMs: 0, enabled: Boolean(userId && gid) });
  const g = data?.grupo;
  const { data: estado } = useEstadoCartas();
  const y = (v: number) => insets.top + v - 54;
  const bannerH = y(212);

  const [run, setRun] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      setRun((n) => n + 1);
      void refresh?.();
      if (gid) AsyncStorage.setItem(`grupo:visto:${gid}`, new Date().toISOString()).catch(() => {});
      if (gid) verificarTutorialGrupos('/grupo', gid);
      return () => fecharFolha(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gid])
  );

  // Tutorial dos Grupos: palco pronto com ESTE grupo carregado; a rolagem acompanha as paradas.
  useCoachStage('grupo', g?.id === gid);
  const rolagem = useRef<ScrollView | null>(null);
  const muralY = useRef(0);
  useEffect(() => onCoachPrepare((alvo) => {
    rolagem.current?.scrollTo({ y: alvo === 'mural' ? Math.max(0, muralY.current - 90) : 0, animated: false });
  }), []);

  // ── Folhas (81g/81h) ─────────────────────────────────────────────────────
  const [folha, setFolha] = useState<null | { tipo: 'menu' } | { tipo: 'foto'; item: ItemMural }>(null);
  const [folhaH, setFolhaH] = useState(420);
  const veu = useSharedValue(0);
  const sobe = useSharedValue(0);
  const abrirFolha = (f: NonNullable<typeof folha>) => {
    haptics.tap();
    setFolha(f);
    setTabBarVisible(false);
    veu.set(0); sobe.set(0);
    veu.set(withTiming(1, { duration: 240 }));
    sobe.set(rm ? withTiming(1, { duration: 200 }) : withDelay(120, withSpring(1, mola(1, 0.5))));
  };
  function fecharFolha(instant = false, depois?: () => void) {
    setTabBarVisible(true);
    if (instant) { veu.set(0); sobe.set(0); setFolha(null); return; }
    veu.set(withTiming(0, { duration: 200 }));
    sobe.set(withTiming(0, { duration: rm ? 160 : 240, easing: EIN }, (fim) => {
      if (!fim) return;
      scheduleOnRN(setFolha, null);
      if (depois) scheduleOnRN(depois);
    }));
  }
  const veuSt = useAnimatedStyle(() => ({ opacity: veu.get() }));
  const folhaSt = useAnimatedStyle(() => (rm ? { opacity: sobe.get() } : { transform: [{ translateY: folhaH * (1 - sobe.get()) }] }), [rm, folhaH]);

  const outras = (g?.integrantes ?? []).filter((m) => !m.voce);
  const escolher = (titulo: string, lista: Integrante[], fn: (m: Integrante) => void) => {
    if (!lista.length) { Alert.alert(titulo, 'Ainda não tem ninguém além de você no grupo.'); return; }
    ActionSheetIOS.showActionSheetWithOptions(
      { title: titulo, options: [...lista.map((m) => m.nome), 'Cancelar'], cancelButtonIndex: lista.length },
      (i) => { if (i < lista.length) fn(lista[i]); },
    );
  };
  const depois = async () => { await invalidarGrupos(gid); void refresh?.(); };

  const acaoMenu = (k: string) => {
    haptics.tap();
    if (!g) return;
    fecharFolha(false, () => {
      if (k === 'invite') {
        const canais: Canal[] = ['whatsapp', 'instagram', 'copiar'];
        ActionSheetIOS.showActionSheetWithOptions(
          { title: 'Convidar amigas', options: ['WhatsApp', 'Instagram', 'Copiar link', 'Cancelar'], cancelButtonIndex: 3 },
          (i) => { if (i < 3) enviarConvite(canais[i], g.id, g.nome).then((r) => { if (r.copiado) Alert.alert('Link copiado'); }).catch(() => Alert.alert('Não deu para gerar o convite agora')); },
        );
      } else if (k === 'flag') {
        escolher('Denunciar integrante', outras, (m) => Alert.alert(`Denunciar ${m.nome}?`, 'A equipe do NIKS vai analisar em até 24 horas.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Denunciar', style: 'destructive', onPress: () => { denunciar({ tipo: 'integrante', grupo_id: g.id, user_id: m.user_id }).then(() => Alert.alert('Denúncia enviada', 'Obrigada por avisar.')).catch(() => {}); } },
        ]));
      } else if (k === 'block') {
        escolher('Bloquear integrante', outras, (m) => Alert.alert(`Bloquear ${m.nome}?`, 'Você deixa de ver as fotos e os avisos dela. Ela não é avisada.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Bloquear', style: 'destructive', onPress: () => { bloquear(m.user_id).then(depois).catch(() => {}); } },
        ]));
      } else if (k === 'remove') {
        escolher('Remover integrante', outras, (m) => Alert.alert(`Remover ${m.nome} do grupo?`, 'Ela não poderá voltar por convite.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Remover', style: 'destructive', onPress: () => { removerIntegrante(g.id, m.user_id).then(depois).catch(() => {}); } },
        ]));
      } else if (k === 'exit') {
        Alert.alert('Sair do grupo?', g.seu_papel === 'criadora' && outras.length ? 'O grupo passa para a integrante mais antiga.' : undefined, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair', style: 'destructive', onPress: () => { sairDoGrupo(g.id).then(async () => { await invalidarGrupos(gid); if (await saiuSemGrupo()) { router.replace('/(onboarding)/sem-grupo' as any); return; } router.navigate('/seus-grupos' as any); }).catch(() => {}); } },
        ]);
      }
    });
  };
  const acaoFoto = (item: ItemMural, k: string) => {
    haptics.tap();
    if (!g) return;
    fecharFolha(false, () => {
      if (k === 'flag') {
        Alert.alert('Denunciar esta foto?', 'A equipe do NIKS vai analisar em até 24 horas.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Denunciar', style: 'destructive', onPress: () => { denunciar({ tipo: 'foto', grupo_id: g.id, ...(item.tipo === 'produto' ? { compartilhamento_id: item.compartilhamento_id ?? undefined } : { checkin_id: item.checkin_id ?? undefined }) }).then((r) => { if (r.ok) Alert.alert('Recebemos sua denúncia. Essa foto ficou escondida enquanto revisamos.'); else Alert.alert('Não deu para denunciar agora', 'Tente de novo mais tarde.'); return depois(); }).catch(() => {}); } },
        ]);
      } else {
        Alert.alert(`Bloquear ${item.autora.nome}?`, 'Você deixa de ver as fotos e os avisos dela. Ela não é avisada.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Bloquear', style: 'destructive', onPress: () => { bloquear(item.user_id).then(depois).catch(() => {}); } },
        ]);
      }
    });
  };
  const itensMenu: ItemFolha[] = [
    { k: 'invite', label: 'Convidar amigas', d: ICO.invite },
    { k: 'flag', label: 'Denunciar', d: ICO.flag },
    { k: 'block', label: 'Bloquear', d: ICO.block },
    ...(g?.seu_papel === 'criadora' ? [{ k: 'remove', label: 'Remover integrante', sub: 'Só para quem criou o grupo', d: ICO.remove }] : []),
  ];
  const itensFoto: ItemFolha[] = folha?.tipo === 'foto'
    ? [{ k: 'flag', label: 'Denunciar foto', d: ICO.flag }, { k: 'block', label: `Bloquear ${folha.item.autora.nome}`, d: ICO.block }]
    : [];

  // ── Semana: a líder e você (ou a 2ª, se a líder é você) ───────────────────
  const hoje = dateKey(sessionDate());
  const seg = sessionDate(); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  const semana = data?.semana ?? [];
  const lider = semana[0] ?? null;
  const voce = semana.find((r) => r.voce) ?? null;
  const outra = lider?.voce ? semana[1] ?? null : voce;
  const duelo = [lider, outra].filter((x): x is LinhaRanking => !!x);
  const pos = voce?.posicao;
  const rankSub = g && g.checkins_semana > 0 && pos ? `Você está em ${pos}º` : 'Semana começa com o primeiro check-in';
  const pontos = estado?.pontos;

  // ── Mural por dia; check-in de hoje ──────────────────────────────────────
  const dias: { dia: string; itens: ItemMural[] }[] = [];
  for (const it of data?.mural ?? []) {
    const ult = dias[dias.length - 1];
    if (ult && ult.dia === it.dia) ult.itens.push(it); else dias.push({ dia: it.dia, itens: [it] });
  }
  const minhasHoje = new Set((data?.mural ?? []).filter((m) => m.tipo === 'checkin' && m.voce && m.dia === hoje).map((m) => m.rotina));
  const feito = minhasHoje.has('am') && minhasHoje.has('pm');
  let iIn = 3;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView ref={rolagem} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 + Math.max(0, insets.bottom - 34) }}>
        <View>
          <BannerTopo g={g} w={W} h={bannerH} />
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); voltar(); }} style={[styles.roundBtn, { top: y(58), left: 16 }]} accessibilityLabel="Voltar">
            <Icon d={['m15 18-6-6 6-6']} size={20} color={INK} sw={2.2} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => abrirFolha({ tipo: 'menu' })} style={[styles.roundBtn, { top: y(58), right: 16 }]} accessibilityLabel="Mais opções">
            <AlvoGuia chave="grupo-menu"><Dots size={20} color={INK} r={1.8} /></AlvoGuia>
          </TouchableOpacity>
        </View>

        <Entra i={0} run={run} rm={rm} style={styles.card}>
          <Text style={styles.nome} numberOfLines={2}>{g?.nome ?? ''}</Text>
          <AlvoGuia chave="grupo-membros" style={styles.membros}>
            <View style={styles.avs}>
              {/* Cada foto com a moldura da medalha atual dela (08/nov/2026). */}
              {(g?.integrantes ?? []).slice(0, 5).map((m) => (
                <FotoComMoldura key={m.user_id} nivel={m.nivel} foto={m.foto} nome={m.nome} tamanho={42} pequena vazio="#FCE3EE" style={styles.av} />
              ))}
            </View>
            <Text style={styles.membrosT}>{g ? (g.total === 1 ? '1 integrante' : `${g.total} integrantes`) : ' '}</Text>
          </AlvoGuia>
          <View style={styles.sepCard} />
          <Text style={styles.semana}>{`Semana de ${curta(seg)} a ${curta(dom)}`}</Text>
          <AlvoGuia chave="grupo-duelo" style={styles.duelo}>
            {duelo.map((d, i) => {
              const lead = d === lider;
              return (
                <View key={d.user_id} style={styles.duel}>
                  <Salta delay={rm ? 0 : 60 + i * 70} run={run} rm={rm}>
                    <View style={{ width: 80, height: 80 }}>
                      {/* A moldura da medalha dela (passa 14 pt da caixa de cada lado). */}
                      <FotoComMoldura nivel={d.nivel} foto={d.foto} nome={d.nome} tamanho={108} pequena={false} vazio="#FCE3EE" style={{ position: 'absolute', left: -14, top: -14 }} />
                      {lead && (
                        <View style={styles.coroa}>
                          <Svg width={15} height={15} viewBox="0 0 24 24"><Path d={ICO.coroa} fill={PINK} stroke={PINK} strokeWidth={1.6} strokeLinejoin="round" /></Svg>
                        </View>
                      )}
                      <View style={[styles.posBadge, { backgroundColor: lead ? PINK : '#fff' }]}>
                        <Text style={[styles.posT, { color: lead ? '#fff' : PINK }]}>{`${d.posicao}º`}</Text>
                      </View>
                    </View>
                  </Salta>
                  <Text style={styles.duelNome} numberOfLines={1}>{d.voce ? 'Você' : d.nome}</Text>
                  <Text style={styles.duelSub} numberOfLines={1}>{lead ? 'Líder' : d.titulo}</Text>
                  <Text style={styles.duelN}>{`${d.checkins} ${d.checkins === 1 ? 'check-in' : 'check-ins'}`}</Text>
                </View>
              );
            })}
          </AlvoGuia>
          <AlvoGuia chave="grupo-checkin" style={{ marginTop: 18 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={feito}
            onPress={() => { haptics.action(); router.push({ pathname: '/checkin', params: { feitas: [...minhasHoje].join(','), de: 'grupo', grupo: gid } } as any); }}
            style={[styles.checkinBtn, feito && { opacity: 0.45 }]}
            accessibilityLabel={feito ? 'Check-ins de hoje feitos' : 'Fazer check-in'}
          >
            <Icon d={ICO.camera} size={19} color="#fff" sw={2} circles={[[12, 13, 3]]} />
            <Text style={styles.checkinT}>{feito ? 'Check-ins de hoje feitos' : 'Fazer check-in'}</Text>
          </TouchableOpacity>
          </AlvoGuia>
        </Entra>

        <Entra i={1} run={run} rm={rm} style={styles.atalhos}>
          <AlvoGuia chave="grupo-ranking" style={{ flex: 1 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push({ pathname: '/grupo-ranking', params: { id: gid } } as any); }} style={styles.atalho} accessibilityLabel="Ranking">
            <View style={styles.atalhoTop}>
              <View style={styles.atalhoIcon}><Icon d={ICO.trofeu} size={20} color={PINK} sw={1.9} /></View>
              <Icon d={['m9 18 6-6-6-6']} size={16} color="#B5B5B5" sw={2.4} />
            </View>
            <Text style={styles.atalhoT}>Ranking</Text>
            <Text style={styles.atalhoS} numberOfLines={1}>{rankSub}</Text>
          </TouchableOpacity>
          </AlvoGuia>
          <AlvoGuia chave="grupo-jornada" style={{ flex: 1 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push({ pathname: '/grupo-jornada', params: { id: gid } } as any); }} style={styles.atalho} accessibilityLabel="Jornada">
            <View style={styles.atalhoTop}>
              <View style={styles.atalhoIcon}><Icon d={ICO.rota} size={20} color={PINK} sw={1.9} circles={[[6, 19, 3], [18, 5, 3]]} /></View>
              <Icon d={['m9 18 6-6-6-6']} size={16} color="#B5B5B5" sw={2.4} />
            </View>
            <Text style={styles.atalhoT}>Jornada</Text>
            <Text style={styles.atalhoS} numberOfLines={1}>{pontos ? `Nível ${pontos.nivel} · ${pontos.titulo}` : ' '}</Text>
          </TouchableOpacity>
          </AlvoGuia>
        </Entra>

        {dias.length > 0 && <View onLayout={(e) => { muralY.current = e.nativeEvent.layout.y; }}><Entra i={2} run={run} rm={rm}><AlvoGuia chave="grupo-mural"><Text style={styles.secao}>Check-ins</Text></AlvoGuia></Entra></View>}
        {dias.map((d) => (
          <View key={d.dia}>
            <Entra i={iIn++} run={run} rm={rm}><Text style={styles.diaLabel}>{rotuloDia(d.dia, hoje)}</Text></Entra>
            <View style={styles.diaList}>
              {d.itens.map((it) => (
                <Entra key={it.id} i={iIn++} run={run} rm={rm}>
                  <AlvoItem primeiro={it.id === dias[0]?.itens[0]?.id}>
                  <Pressable disabled={it.tipo !== 'produto' || it.voce || !it.compartilhamento_id} onPress={() => { haptics.tap(); router.push({ pathname: '/produto-amiga', params: { grupo: g!.id, id: it.compartilhamento_id! } } as any); }} style={styles.item}>
                    <View style={styles.itemFoto}>
                      {it.foto_url ? <Image source={{ uri: it.foto_url }} style={{ width: '100%', height: '100%' }} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.itemT} numberOfLines={it.tipo === 'produto' ? 2 : 1}>{it.tipo === 'produto' ? `Escaneou ${it.titulo}` : it.titulo}</Text>
                        {!it.voce && (
                          <TouchableOpacity activeOpacity={0.6} onPress={() => abrirFolha({ tipo: 'foto', item: it })} style={styles.itemDots} hitSlop={8} accessibilityLabel="Opções da foto">
                            <Dots size={17} color={MUTE} r={1.9} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.itemRow}>
                        <FotoComMoldura nivel={it.autora.nivel} foto={it.autora.foto} nome={it.autora.nome} tamanho={34} pequena vazio="#F6D3E1" style={styles.itemAv} />
                        <Text style={styles.itemWho} numberOfLines={1}>{it.voce ? 'Você' : it.autora.nome}</Text>
                        <Text style={styles.itemTime}>{hora(it.hora_exibida)}</Text>
                      </View>
                    </View>
                  </Pressable>
                  </AlvoItem>
                </Entra>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ── Folhas (81g/81h) ─────────────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]} pointerEvents={folha ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { haptics.tap(); fecharFolha(); }} accessibilityLabel="Fechar" />
      </Animated.View>
      {folha && (
        <Animated.View onLayout={(e) => setFolhaH(e.nativeEvent.layout.height)} style={[styles.folha, { paddingBottom: 38 + Math.max(0, insets.bottom - 34) }, folhaSt]}>
          <View style={styles.alca} />
          <View style={styles.folhaCard}>
            {(folha.tipo === 'menu' ? itensMenu : itensFoto).map((m, i, arr) => (
              <TouchableOpacity
                key={m.k}
                activeOpacity={0.7}
                onPress={() => (folha.tipo === 'menu' ? acaoMenu(m.k) : acaoFoto(folha.item, m.k))}
                style={styles.folhaItem}
              >
                <View style={styles.folhaIcon}><Icon d={m.d} size={18} color={PINK} sw={2} /></View>
                <View style={[styles.folhaTexto, { borderBottomColor: i < arr.length - 1 ? 'rgba(18,18,18,0.07)' : 'transparent' }]}>
                  <Text style={styles.folhaLabel}>{m.label}</Text>
                  {!!m.sub && <Text style={styles.folhaSub}>{m.sub}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          {folha.tipo === 'menu' && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => acaoMenu('exit')} style={[styles.folhaCard, styles.folhaItem, { marginTop: 12 }]}>
              <View style={[styles.folhaIcon, { backgroundColor: '#FFE8E9' }]}><Icon d={ICO.exit} size={18} color={RED} sw={2} /></View>
              <Text style={[styles.folhaLabel, { color: RED }]}>Sair do grupo</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); fecharFolha(); }} style={styles.cancelar}>
            <Text style={styles.cancelarT}>Cancelar</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F1F4' },
  roundBtn: { position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },

  card: {
    marginTop: -48, marginHorizontal: 16, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16, borderRadius: 20,
    backgroundColor: '#fff', boxShadow: '0px 6px 20px rgba(200,60,120,0.10)',
  },
  nome: { textAlign: 'center', fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: INK },
  membros: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  avs: { flexDirection: 'row', paddingLeft: 12 },
  av: { marginLeft: -12 },
  membrosT: { fontSize: 13, color: MUTE },
  sepCard: { height: 1, marginVertical: 16, backgroundColor: 'rgba(18,18,18,0.07)' },
  semana: { textAlign: 'center', fontSize: 13, lineHeight: 17, color: MUTE },
  duelo: { marginTop: 14, flexDirection: 'row', justifyContent: 'center', gap: 40 },
  duel: { width: 104, alignItems: 'center' },
  duelFoto: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, overflow: 'hidden', backgroundColor: '#FCE3EE' },
  coroa: {
    position: 'absolute', top: -6, right: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 8px rgba(200,60,120,0.2)',
  },
  posBadge: {
    position: 'absolute', bottom: -10, alignSelf: 'center', height: 22, paddingHorizontal: 9, borderRadius: 100,
    borderWidth: 1.5, borderColor: PINK, justifyContent: 'center',
  },
  posT: { fontSize: 12, fontWeight: '700' },
  duelNome: { marginTop: 16, fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3, color: INK },
  duelSub: { fontSize: 13, lineHeight: 17, color: MUTE },
  duelN: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  checkinBtn: { height: 50, borderRadius: 100, backgroundColor: PINK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  checkinT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },

  atalhos: { marginTop: 16, marginHorizontal: 16, flexDirection: 'row', gap: 12 },
  atalho: { flex: 1, height: 116, padding: 14, borderRadius: 16, backgroundColor: '#fff', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)' },
  atalhoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  atalhoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFE6F1', alignItems: 'center', justifyContent: 'center' },
  atalhoT: { marginTop: 12, fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.4, color: INK },
  atalhoS: { marginTop: 2, fontSize: 13, lineHeight: 17, color: MUTE },

  secao: { marginTop: 28, marginHorizontal: 16, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.45, color: INK },
  diaLabel: { marginTop: 16, marginHorizontal: 16, marginBottom: 8, fontSize: 15, lineHeight: 20, color: '#9A9A9A', letterSpacing: -0.2 },
  diaList: { marginHorizontal: 16, gap: 10 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  itemFoto: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F4F4F4' },
  itemT: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  itemDots: { width: 28, height: 28, marginVertical: -4, marginRight: -6, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemAv: { marginVertical: -7, marginLeft: -7, marginRight: -7 },
  itemWho: { flex: 1, minWidth: 0, fontSize: 15, letterSpacing: -0.2, color: INK },
  itemTime: { fontSize: 13, color: MUTE, fontVariant: ['tabular-nums'] },

  veu: { backgroundColor: 'rgba(18,18,18,0.34)', zIndex: 40 },
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41, paddingTop: 8, paddingHorizontal: 16,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F6F1F4',
  },
  alca: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#DCD3D8', alignSelf: 'center' },
  folhaCard: { marginTop: 16, borderRadius: 16, backgroundColor: '#fff', overflow: 'hidden' },
  folhaItem: { height: 60, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  folhaIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFE6F1', alignItems: 'center', justifyContent: 'center' },
  folhaTexto: { flex: 1, minWidth: 0, height: 60, justifyContent: 'center', borderBottomWidth: 1 },
  folhaLabel: { fontSize: 17, lineHeight: 22, letterSpacing: -0.4, color: INK },
  folhaSub: { fontSize: 13, lineHeight: 16, color: MUTE },
  cancelar: { marginTop: 12, height: 50, borderRadius: 100, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  cancelarT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
});
