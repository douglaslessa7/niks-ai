import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet, AccessibilityInfo,
  Pressable, ActionSheetIOS, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { useUserId } from '../../lib/currentUser';
import { askPushPermission } from '../../lib/notifications';
import {
  bloquear, chaveGrupo, denunciar, grupoDetalhe, invalidarGrupos, jornadaGrupo, muralGrupo, rankingGrupo,
  removerIntegrante, sairDoGrupo, type GrupoResumo, type Integrante, type ItemMural,
} from '../../lib/gruposServidor';
import { enviarConvite, type Canal } from '../../lib/convite';
import { BannerGrupo } from './seus-grupos';
import { sessionDate, dateKey } from '../../lib/routineProgress';

// ─────────────────────────────────────────────────────────────────────────────
// Tela do grupo — réplica de 80a (tela), 80b (menu "…" de quem criou) e 80c ("…" na
// foto do mural) do Claude Design (NiksGrupoV2.dc.html, rodada 80). Grupo SEM nível
// nem XP. Medidas do frame 393×852; o conteúdo começa em 72 → insets.top + 18.
//   · Cabeçalho: voltar, sino (ponto rosa = avisos do celular desligados; toque pede a
//     permissão) e "…". Nome em 28 pt. Card do banner com a líder e você (check-ins
//     desde a criação). Atalhos: Ranking (sua posição da semana) e Jornada (quem está
//     na frente e o nível dela).
//   · Mural: um separador por dia ("hoje, domingo, 1 de nov.") e um card por check-in
//     (foto 72, título, autora, hora). O "…" de cada foto abre "Denunciar foto" (e
//     "Bloquear", pedido da Apple 1.2). Produto compartilhado do scan (3.6): mesmo card,
//     "Escaneou <produto>" com a foto do scan; não conta no ranking.
//   · Menu "…" (abre de cima para a direita, 0,95 → 1, 180 ms): Convidar amigas,
//     Denunciar, Bloquear, Remover integrante (só quem criou) e Sair do grupo em
//     vermelho. A integrante é escolhida numa folha do sistema; ações sérias pedem
//     confirmação.
//   · Câmera: faz o check-in (Novo check-in, 80d). Com manhã e noite feitas hoje, vira
//     o check branco (o limite é 2 por dia).
// Dados reais: função `grupos` (`grupo`, `mural`, `ranking`, `jornada`).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const RED = '#FD3A42';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const DIAS_SEM = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES_C = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const ICO = {
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  trofeu: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'],
  rota: ['M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15'],
  invite: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7'],
  block: ['M4.9 4.9l14.2 14.2', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'],
  remove: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11h-6'],
  exit: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'],
  camera: ['M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'],
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

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setRm).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => sub.remove();
  }, []);
  return rm;
}

type DadosGrupo = {
  grupo: GrupoResumo;
  mural: ItemMural[];
  lider: { foto: string | null; n: number } | null;
  voce: { foto: string | null; n: number } | null;
  jornada: { nome: string; nivel: number } | null;
};

async function carregar(gid: string): Promise<DadosGrupo> {
  const [grupo, mural, geral, jor] = await Promise.all([grupoDetalhe(gid), muralGrupo(gid), rankingGrupo(gid, 'geral'), jornadaGrupo(gid)]);
  const lider = geral[0] ?? null;
  const voce = geral.find((r) => r.voce) ?? null;
  const top = jor.lista[0] ?? null;
  return {
    grupo, mural,
    lider: lider ? { foto: lider.foto, n: lider.checkins } : null,
    voce: voce ? { foto: voce.foto, n: voce.checkins } : null,
    jornada: top ? { nome: top.voce ? 'Você' : top.nome, nivel: top.nivel } : null,
  };
}

function rotuloDia(dia: string, hoje: string): string {
  const d = new Date(`${dia}T12:00:00`);
  const base = `${DIAS_SEM[d.getDay()]}, ${d.getDate()} de ${MESES_C[d.getMonth()]}`;
  return dia === hoje ? `hoje, ${base}` : base;
}
const hora = (iso: string) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function Grupo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rm = useReduceMotion();
  const userId = useUserId();
  const { id, de } = useLocalSearchParams<{ id?: string; de?: string }>();
  // `router.back()` numa aba oculta cai na home (1ª aba): o destino é explícito.
  const voltar = () => router.navigate((de === 'home' ? '/home' : '/seus-grupos') as any);
  const gid = typeof id === 'string' ? id : '';
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const fetcher = useCallback(() => carregar(gid), [gid]);
  const { data, refresh } = useCachedQuery<DadosGrupo>(userId && gid ? chaveGrupo(userId, gid) : null, fetcher, { staleMs: 0, enabled: Boolean(userId && gid) });
  const g = data?.grupo;

  // Avisos do celular desligados → ponto rosa no sino (toque pede a permissão).
  const [semAvisos, setSemAvisos] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      void refresh?.();
      Notifications.getPermissionsAsync().then((p) => setSemAvisos(p.status !== 'granted')).catch(() => {});
      if (gid) AsyncStorage.setItem(`grupo:visto:${gid}`, new Date().toISOString()).catch(() => {});
      return () => { setMenu(false); setFotoMenu(null); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gid])
  );

  // ── Menus ─────────────────────────────────────────────────────────────────
  const [menu, setMenu] = useState(false);
  const [fotoMenu, setFotoMenu] = useState<string | null>(null); // id do item do mural
  const pop = useRef(new Animated.Value(0)).current;
  const pop2 = useRef(new Animated.Value(0)).current;
  const abrirPop = (v: Animated.Value) => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: rm ? 120 : 180, easing: EO, useNativeDriver: true }).start();
  };
  const popStyle = (v: Animated.Value) => ({
    opacity: v,
    transform: rm ? [] : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
    transformOrigin: 'top right',
  });

  const outras = (g?.integrantes ?? []).filter((m) => !m.voce);
  const escolher = (titulo: string, lista: Integrante[], fn: (m: Integrante) => void) => {
    if (!lista.length) { Alert.alert(titulo, 'Ainda não tem ninguém além de você no grupo.'); return; }
    ActionSheetIOS.showActionSheetWithOptions(
      { title: titulo, options: [...lista.map((m) => m.nome), 'Cancelar'], cancelButtonIndex: lista.length },
      (i) => { if (i < lista.length) fn(lista[i]); },
    );
  };
  const depois = async () => { await invalidarGrupos(gid); void refresh?.(); };

  const acaoMenu = (k: 'invite' | 'flag' | 'block' | 'remove' | 'exit') => {
    setMenu(false);
    haptics.tap();
    if (!g) return;
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
    } else {
      Alert.alert('Sair do grupo?', g.seu_papel === 'criadora' && outras.length ? 'O grupo passa para a integrante mais antiga.' : undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => { sairDoGrupo(g.id).then(async () => { await invalidarGrupos(gid); router.navigate('/seus-grupos' as any); }).catch(() => {}); } },
      ]);
    }
  };
  const itensMenu = [
    { k: 'invite' as const, label: 'Convidar amigas', d: ICO.invite, color: INK },
    { k: 'flag' as const, label: 'Denunciar', d: ICO.flag, color: INK },
    { k: 'block' as const, label: 'Bloquear', d: ICO.block, color: INK },
    ...(g?.seu_papel === 'criadora' ? [{ k: 'remove' as const, label: 'Remover integrante', sub: 'Você criou o grupo', d: ICO.remove, color: INK }] : []),
    { k: 'exit' as const, label: 'Sair do grupo', d: ICO.exit, color: RED },
  ];

  const acaoFoto = (item: ItemMural, k: 'flag' | 'block') => {
    setFotoMenu(null);
    haptics.tap();
    if (!g) return;
    if (k === 'flag') {
      Alert.alert('Denunciar esta foto?', 'A equipe do NIKS vai analisar em até 24 horas.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Denunciar', style: 'destructive', onPress: () => { denunciar({ tipo: 'foto', grupo_id: g.id, ...(item.tipo === 'produto' ? { compartilhamento_id: item.compartilhamento_id ?? undefined } : { checkin_id: item.checkin_id ?? undefined }) }).then(() => Alert.alert('Denúncia enviada', 'Obrigada por avisar.')).catch(() => {}); } },
      ]);
    } else {
      Alert.alert(`Bloquear ${item.autora.nome}?`, 'Você deixa de ver as fotos e os avisos dela. Ela não é avisada.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Bloquear', style: 'destructive', onPress: () => { bloquear(item.user_id).then(depois).catch(() => {}); } },
      ]);
    }
  };

  // ── Mural por dia; FAB ─────────────────────────────────────────────────────
  const hoje = dateKey(sessionDate());
  const dias: { dia: string; itens: ItemMural[] }[] = [];
  for (const it of data?.mural ?? []) {
    const ult = dias[dias.length - 1];
    if (ult && ult.dia === it.dia) ult.itens.push(it); else dias.push({ dia: it.dia, itens: [it] });
  }
  const minhasHoje = new Set((data?.mural ?? []).filter((m) => m.tipo === 'checkin' && m.voce && m.dia === hoje).map((m) => m.rotina));
  const feito = minhasHoje.has('am') && minhasHoje.has('pm');
  const pos = g?.sua_posicao_semana;
  const rankSub = g && g.checkins_semana > 0 && pos ? `Você está em ${pos}º esta semana` : 'Semana começa com o primeiro check-in';
  const jorSub = data?.jornada ? `${data.jornada.nome} na frente · nível ${data.jornada.nivel}` : ' ';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']} locations={[0, 0.45, 0.72, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleBlob} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 170 }}>
        <View style={styles.head}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); voltar(); }} style={styles.roundBtn} accessibilityLabel="Voltar">
            <Icon d={['m15 18-6-6 6-6']} size={18} color={INK} sw={2} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { haptics.tap(); askPushPermission().then((ok) => setSemAvisos(!ok)).catch(() => {}); }}
            style={styles.roundBtn}
            accessibilityLabel={semAvisos ? 'Ligar avisos do grupo' : 'Avisos do grupo ligados'}
          >
            <Icon d={ICO.bell} size={19} color={INK} sw={1.7} />
            {semAvisos && <View style={styles.bellDot} />}
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); setMenu(true); abrirPop(pop); }} style={styles.roundBtn} accessibilityLabel="Mais opções">
            <Dots size={19} color={INK} r={1.7} />
          </TouchableOpacity>
        </View>

        <Text style={styles.title} numberOfLines={2}>{g?.nome ?? ''}</Text>

        <View style={styles.bannerCard}>
          <View style={styles.banner}>
            {g && <BannerGrupo banner={g.banner} url={g.banner_url} />}
          </View>
          <View style={styles.leads}>
            {[{ x: data?.lider, label: 'Líder' }, { x: data?.voce, label: 'Você' }].map(({ x, label }) => (
              <View key={label} style={styles.lead}>
                <View style={styles.leadAv}>
                  {x?.foto ? <Image source={{ uri: x.foto }} style={styles.leadImg} /> : <View style={[styles.leadImg, { backgroundColor: '#F6D3E1' }]} />}
                </View>
                <View>
                  <Text style={styles.leadN}>{x?.n ?? 0}</Text>
                  <Text style={styles.leadL}>{label}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.atalhos}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); router.push({ pathname: '/grupo-ranking', params: { id: gid } } as any); }} style={styles.atalho}>
            <View style={[styles.atalhoIcon, styles.atalhoIconPink]}><Icon d={ICO.trofeu} size={20} color="#fff" sw={1.9} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.atalhoT}>Ranking</Text>
              <Text style={styles.atalhoS} numberOfLines={2}>{rankSub}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); router.push({ pathname: '/grupo-jornada', params: { id: gid } } as any); }} style={styles.atalho}>
            <View style={[styles.atalhoIcon, styles.atalhoIconWhite]}><Icon d={ICO.rota} size={20} color={PINK} sw={1.9} circles={[[6, 19, 3], [18, 5, 3]]} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.atalhoT}>Jornada</Text>
              <Text style={styles.atalhoS} numberOfLines={2}>{jorSub}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {dias.map((d) => (
          <View key={d.dia}>
            <Text style={styles.diaLabel}>{rotuloDia(d.dia, hoje)}</Text>
            <View style={styles.diaList}>
              {d.itens.map((it) => (
                <View key={it.id} style={{ paddingBottom: 10, zIndex: fotoMenu === it.id ? 8 : 0 }}>
                  <View style={styles.item}>
                    <View style={styles.itemFoto}>
                      {it.foto_url ? <Image source={{ uri: it.foto_url }} style={{ width: '100%', height: '100%' }} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.itemT} numberOfLines={it.tipo === 'produto' ? 2 : 1}>{it.tipo === 'produto' ? `Escaneou ${it.titulo}` : it.titulo}</Text>
                        {!it.voce && (
                          <TouchableOpacity
                            activeOpacity={0.6}
                            onPress={() => { haptics.tap(); setFotoMenu(fotoMenu === it.id ? null : it.id); abrirPop(pop2); }}
                            style={styles.itemDots}
                            hitSlop={8}
                            accessibilityLabel="Opções da foto"
                          >
                            <Dots size={17} color={MUTE} r={1.9} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={styles.itemRow}>
                        {it.autora.foto ? <Image source={{ uri: it.autora.foto }} style={styles.itemAv} /> : <View style={[styles.itemAv, { backgroundColor: '#F6D3E1' }]} />}
                        <Text style={styles.itemWho} numberOfLines={1}>{it.voce ? 'Você' : it.autora.nome}</Text>
                        <Text style={styles.itemTime}>{hora(it.hora_exibida)}</Text>
                      </View>
                    </View>
                  </View>
                  {fotoMenu === it.id && (
                    <Animated.View style={[styles.pop2, popStyle(pop2)]}>
                      <TouchableOpacity activeOpacity={0.6} onPress={() => acaoFoto(it, 'flag')} style={styles.pop2Item}>
                        <Icon d={ICO.flag} size={17} color={INK} sw={1.9} />
                        <Text style={styles.pop2Text}>Denunciar foto</Text>
                      </TouchableOpacity>
                      <View style={styles.pop2Line} />
                      <TouchableOpacity activeOpacity={0.6} onPress={() => acaoFoto(it, 'block')} style={styles.pop2Item}>
                        <Icon d={ICO.block} size={17} color={INK} sw={1.9} />
                        <Text style={styles.pop2Text}>{`Bloquear ${it.autora.nome}`}</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <LinearGradient colors={['rgba(249,241,244,0)', 'rgba(249,241,244,0.85)']} locations={[0, 0.7]} style={styles.fadeBottom} pointerEvents="none" />
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={feito}
        onPress={() => { haptics.action(); router.push({ pathname: '/checkin', params: { feitas: [...minhasHoje].join(','), de: 'grupo', grupo: gid } } as any); }}
        style={[styles.fab, feito ? styles.fabDone : styles.fabOn, { bottom: 112 + Math.max(0, insets.bottom - 34) }]}
        accessibilityLabel={feito ? 'Check-in de hoje feito' : 'Fazer check-in'}
      >
        {feito
          ? <Icon d={['M20 6 9 17l-5-5']} size={24} color={PINK} sw={2.8} />
          : <Icon d={ICO.camera} size={24} color="#fff" sw={1.9} circles={[[12, 13, 3]]} />}
      </TouchableOpacity>

      {(menu || fotoMenu) && <Pressable style={[StyleSheet.absoluteFill, { zIndex: 40 }]} onPress={() => { setMenu(false); setFotoMenu(null); }} />}
      {menu && (
        <Animated.View style={[styles.pop, { top: insets.top + 60 }, popStyle(pop)]}>
          {itensMenu.map((m) => (
            <TouchableOpacity key={m.k} activeOpacity={0.6} onPress={() => acaoMenu(m.k)} style={styles.popItem}>
              <Icon d={m.d} size={19} color={m.color} sw={1.9} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.popT, { color: m.color }]}>{m.label}</Text>
                {'sub' in m && m.sub ? <Text style={styles.popS}>{m.sub}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F1F4' },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280, left: 190, top: -90,
    experimental_backgroundImage: 'radial-gradient(circle at 30% 75%, rgba(255,170,205,0.34), rgba(255,255,255,0.2))',
  },
  circleWhite: { position: 'absolute', width: 620, height: 620, borderRadius: 310, left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)' },

  head: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  roundBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 14px rgba(120,60,72,0.10)',
  },
  bellDot: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: PINK, borderWidth: 2, borderColor: '#fff' },
  title: { marginTop: 16, paddingHorizontal: 20, fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.8, color: INK },

  bannerCard: { marginTop: 14, marginHorizontal: 18, borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.78)' },
  banner: { height: 150, overflow: 'hidden' },
  leads: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16 },
  lead: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  leadAv: { width: 40, height: 40, borderRadius: 20, padding: 2, borderWidth: 2, borderColor: PINK },
  leadImg: { width: 32, height: 32, borderRadius: 16 },
  leadN: { fontSize: 20, fontWeight: '700', lineHeight: 23, letterSpacing: -0.5, color: INK, fontVariant: ['tabular-nums'] },
  leadL: { fontSize: 13, lineHeight: 16, color: MUTE, letterSpacing: -0.1 },

  atalhos: { marginTop: 10, marginHorizontal: 18, flexDirection: 'row', gap: 10 },
  atalho: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.78)', paddingVertical: 12, paddingRight: 12, paddingLeft: 14,
  },
  atalhoIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  atalhoIconPink: { backgroundColor: PINK, boxShadow: '0px 6px 14px rgba(255,94,168,0.3)' },
  atalhoIconWhite: { backgroundColor: '#fff', boxShadow: '0px 6px 14px rgba(200,60,120,0.16)' },
  atalhoT: { fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  atalhoS: { marginTop: 2, fontSize: 12, lineHeight: 15, color: MUTE, letterSpacing: -0.1 },

  diaLabel: { marginTop: 22, textAlign: 'center', fontSize: 14, color: MUTE, letterSpacing: -0.1 },
  diaList: { marginTop: 10, paddingHorizontal: 18 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: PINK,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  itemFoto: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F4F4F4' },
  itemT: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  itemDots: { width: 28, height: 28, marginVertical: -4, marginRight: -6, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  itemAv: { width: 20, height: 20, borderRadius: 10 },
  itemWho: { flex: 1, minWidth: 0, fontSize: 15, letterSpacing: -0.2, color: INK },
  itemTime: { fontSize: 13, color: MUTE, fontVariant: ['tabular-nums'] },

  pop2: {
    position: 'absolute', right: 14, top: 44, zIndex: 41, backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,94,168,0.2)', boxShadow: '0px 14px 36px rgba(120,60,72,0.18)', overflow: 'hidden',
  },
  pop2Item: { height: 46, paddingLeft: 14, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pop2Text: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: INK },
  pop2Line: { height: 1, backgroundColor: 'rgba(18,18,18,0.06)' },

  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 130, zIndex: 29 },
  fab: {
    position: 'absolute', right: 20, zIndex: 31, width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: PINK,
    alignItems: 'center', justifyContent: 'center',
  },
  fabOn: { backgroundColor: PINK, boxShadow: '0px 10px 22px rgba(255,94,168,0.4)' },
  fabDone: { backgroundColor: '#fff', boxShadow: '0px 6px 14px rgba(255,94,168,0.18)' },

  pop: {
    position: 'absolute', right: 18, zIndex: 41, width: 238, backgroundColor: '#fff', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,94,168,0.2)', boxShadow: '0px 18px 44px rgba(120,60,72,0.2)', overflow: 'hidden', paddingVertical: 6,
  },
  popItem: { minHeight: 48, paddingVertical: 6, paddingLeft: 16, paddingRight: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  popT: { fontSize: 16, lineHeight: 20, fontWeight: '500', letterSpacing: -0.3 },
  popS: { fontSize: 12, lineHeight: 15, color: MUTE, letterSpacing: -0.1 },
});
