import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet,
  AccessibilityInfo, TextInput, Keyboard, Pressable, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { useCachedQuery } from '../../lib/cache';
import { getUserId, useUserId } from '../../lib/currentUser';
import { getRoutineHistory, routinesDoneOn, sessionDate, RoutineHistory } from '../../lib/routineProgress';
import { Grupo, gruposDemo, novoGrupo, fezHoje as membroFez } from '../../lib/grupos';
import Avatar from '../../components/grupos/Avatar';

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Seus grupos" — réplica das telas 75b (2 grupos), 75c (sem grupo), 75d (folha
// de criar grupo) e 75e (entrada da header ao abrir a aba) do Claude Design (projeto
// "NIKS home redesign", NiksHomeHeat.dc.html). Medidas do frame 393×852; o topo do
// conteúdo é 72 = barra de status (54) + 18 → `insets.top + 18`. Fonte SF Pro.
//
// Grupos (comunidades estilo Gym Rats) ainda NÃO existem no app nem no banco: a lista
// vem de lib/grupos.ts (conteúdo do design) e o grupo criado pela folha fica só na
// memória da tela. Reais: foto, nome e os números da header (check-ins = skincares
// concluídos, dias ativos = dias com skincare; zerados sem grupo, como no design).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIO = Easing.bezier(0.77, 0, 0.175, 1);
const SHEET_IN = Easing.bezier(0.32, 0.72, 0, 1);

const LOGO = require('../../assets/home/score-logo-pink.png');
const CARD_GRAD = 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)';
const HOLO = 'linear-gradient(115deg, rgba(255,255,255,0) 18%, rgba(255,170,215,0.9) 34%, rgba(205,180,255,0.9) 46%, rgba(255,255,255,1) 56%, rgba(190,175,255,0.85) 70%, rgba(255,255,255,0) 84%)';
const SPARK = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';
const PEOPLE = ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'];
const LINK = ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'];
const GEAR = 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z';

// Banners da folha (BANNERS do design): 0 e 1 = cores do NIKS com a logo, 2 = "Sua foto".
const BANNERS = [
  { bg: 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)', logo: true, logoO: 0.55 },
  { bg: 'linear-gradient(120deg, #FF5EA8 0%, #FF8CC0 55%, #FFC2DB 100%)', logo: true, logoO: 0.28 },
  { bg: 'linear-gradient(180deg, #FCE3EE 0%, #FDD5E6 100%)', prods: true },
] as const;

function Icon({ d, size, color, sw }: { d: string | string[]; size: number; color: string; sw: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setRm).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => sub.remove();
  }, []);
  return rm;
}

// Barra de XP do grupo: enche ao abrir a aba (700 ms, 80 ms entre os cards).
function XpBar({ value, index, run, rm }: { value: number; index: number; run: number; rm: boolean }) {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (run === 0) return;
    if (rm) { s.setValue(value); return; }
    s.setValue(0);
    const t = setTimeout(() => {
      Animated.timing(s, { toValue: value, duration: 700, delay: index * 80, easing: EO, useNativeDriver: true }).start();
    }, 350);
    return () => clearTimeout(t);
  }, [run, value, index, rm, s]);
  return (
    <View style={styles.xpTrack}>
      <Animated.View style={[styles.xpFill, { transform: [{ scaleX: s }] }]} />
    </View>
  );
}

type UserInfo = { nome: string; fotoUrl: string | null };

export default function Grupos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{ criar?: string }>();
  const userId = useUserId();
  const rm = useReduceMotion();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);

  const [hist, setHist] = useState<RoutineHistory>({});
  const [created, setCreated] = useState<Grupo[]>([]);
  const [run, setRun] = useState(0); // conta as aberturas da aba (refaz a entrada da header e das barras)

  // ── Foto e nome (reais) ──────────────────────────────────────────────────
  const fetchUser = useCallback(async (): Promise<UserInfo> => {
    const uid = await getUserId();
    if (!uid) throw new Error('sem sessão');
    const [userRes, scanRes] = await Promise.all([
      supabase.from('users').select('nome, foto_home_url').eq('id', uid).maybeSingle(),
      supabase.from('skin_scans').select('foto_url').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return {
      nome: String(userRes.data?.nome ?? '').trim(),
      fotoUrl: userRes.data?.foto_home_url ?? scanRes.data?.foto_url ?? null,
    };
  }, []);
  const { data: user } = useCachedQuery<UserInfo>(userId ? `grupos:${userId}` : null, fetchUser, { enabled: Boolean(userId) });

  // ── Entrada da header (75e): foto (fade + 0,92 → 1, 420 ms), nome (+80 ms) e
  // números (+160 ms) subindo 8 pt. Com Reduzir movimento, só fade de 220 ms.
  const hd = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      getRoutineHistory().then(setHist).catch(() => {});
      hd.forEach((v) => v.setValue(0));
      const t = setTimeout(() => {
        Animated.parallel(hd.map((v, i) => Animated.timing(v, {
          toValue: 1, duration: rm ? 220 : 420, delay: rm ? 0 : i * 80, easing: rm ? Easing.ease : EO, useNativeDriver: true,
        }))).start();
      }, 120);
      setRun((r) => r + 1);
      return () => { clearTimeout(t); closeSheet(true); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rm])
  );
  const hdStyle = (i: number) => {
    const op = hd[i].interpolate({ inputRange: [0, 0.76, 1], outputRange: [0, 1, 1] }); // opacidade em 320 dos 420 ms
    if (rm) return { opacity: hd[i] };
    return i === 0
      ? { opacity: op, transform: [{ scale: hd[i].interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }
      : { opacity: op, transform: [{ translateY: hd[i].interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] };
  };

  const voceFez = routinesDoneOn(hist, sessionDate()) > 0;
  const list = [...created, ...gruposDemo()];
  const has = list.length > 0;
  const days = Object.values(hist);
  const checkins = has ? days.reduce((n, d) => n + (d?.am ? 1 : 0) + (d?.pm ? 1 : 0), 0) : 0;
  const ativos = has ? days.filter((d) => d?.am || d?.pm).length : 0;
  const stats = [
    { n: checkins, l: 'Check-ins' },
    { n: ativos, l: 'Dias ativos' },
    { n: list.length, l: list.length === 1 ? 'Grupo' : 'Grupos' },
  ];

  // ── Brilho da carta do estado vazio (a cada 5 s) ──────────────────────────
  const sheen = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (has || rm) return;
    const go = () => { sheen.setValue(0); Animated.timing(sheen, { toValue: 1, duration: 820, easing: EIO, useNativeDriver: true }).start(); };
    const t = setTimeout(go, 700);
    const id = setInterval(go, 5000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [has, rm, sheen]);
  const SHEEN_W = 108 * 0.46; // 46% da carta por dentro da borda
  const sheenX = sheen.interpolate({ inputRange: [0, 1], outputRange: [-1.6 * SHEEN_W, 3.2 * SHEEN_W] });

  // ── Folha "Criar grupo" (75d) ─────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [banner, setBanner] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [sheetH, setSheetH] = useState(620);
  const veil = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current; // 0 = fora (105%), 1 = aberta
  const kb = useRef(new Animated.Value(0)).current;
  const bannerO = useRef(BANNERS.map(() => new Animated.Value(0))).current;
  const ok = name.trim().length > 0;

  const openSheet = () => {
    haptics.action();
    setBanner(0); // a folha abre com o 1º banner, como na 75d
    setTabBarVisible(false); // a folha cobre a navbar (z 41 × 30 no design)
    setOpen(true);
    Animated.timing(veil, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    Animated.timing(slide, { toValue: 1, duration: rm ? 220 : 500, easing: rm ? Easing.ease : SHEET_IN, useNativeDriver: true }).start();
  };
  function closeSheet(instant = false) {
    Keyboard.dismiss();
    setOpen(false);
    setTabBarVisible(true);
    if (instant) { veil.setValue(0); slide.setValue(0); return; }
    Animated.timing(veil, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    Animated.timing(slide, { toValue: 0, duration: rm ? 220 : 240, easing: rm ? Easing.ease : SHEET_IN, useNativeDriver: true }).start();
  }

  // Abrir direto pela home (74c → "Criar grupo").
  useEffect(() => {
    if (params.criar !== '1') return;
    router.setParams({ criar: undefined });
    const t = setTimeout(openSheet, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.criar]);

  useEffect(() => {
    BANNERS.forEach((_, i) => Animated.timing(bannerO[i], { toValue: banner === i ? 1 : 0, duration: 260, useNativeDriver: true }).start());
  }, [banner, bannerO]);

  // Teclado: sobe a folha o quanto der sem passar da barra de status.
  useEffect(() => {
    const sh = Keyboard.addListener('keyboardWillShow', (e) => {
      const room = winH - sheetH - insets.top - 8;
      const lift = Math.min(e.endCoordinates.height - 34, Math.max(0, room));
      Animated.timing(kb, { toValue: -Math.max(0, lift), duration: e.duration || 250, useNativeDriver: true }).start();
    });
    const hi = Keyboard.addListener('keyboardWillHide', (e) => {
      Animated.timing(kb, { toValue: 0, duration: e.duration || 250, useNativeDriver: true }).start();
    });
    return () => { sh.remove(); hi.remove(); };
  }, [kb, sheetH, winH, insets.top]);

  const submit = () => {
    if (!ok) return;
    haptics.success();
    setCreated((c) => [novoGrupo(name.trim()), ...c]);
    closeSheet();
    setName(''); setDesc(''); setBanner(-1);
  };

  const sheetT = rm
    ? 0
    : slide.interpolate({ inputRange: [0, 1], outputRange: [sheetH * 1.05, 0] });

  const shares = [
    { label: 'WhatsApp', d: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z', 'M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-.9-.4-1.5-1-1.8-1.8l.8-1-1-2Z'], on: () => {} },
    { label: 'Instagram', ig: true, on: () => {} },
    {
      label: copied ? 'Copiado' : 'Copiar link', d: copied ? ['M5 12.5l4.5 4.5L19 7.5'] : LINK,
      on: () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
    },
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']}
        locations={[0, 0.45, 0.72, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.circleBlob} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 150 }}>
        {/* ── Header de perfil ─────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 20 }}>
          <Animated.View style={[styles.gear, hdStyle(2)]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { haptics.tap(); router.push('/perfil' as any); }}
              style={styles.gearBtn}
              accessibilityLabel="Perfil e configurações"
            >
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d={GEAR} fill="none" stroke={INK} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                <Circle cx={12} cy={12} r={3} fill="none" stroke={INK} strokeWidth={1.7} />
              </Svg>
            </TouchableOpacity>
          </Animated.View>
          <View style={{ alignItems: 'center', paddingTop: 14 }}>
            <Animated.View style={[styles.photoRing, hdStyle(0)]}>
              {user?.fotoUrl
                ? <Image source={{ uri: user.fotoUrl }} style={styles.photo} />
                : <View style={[styles.photo, { backgroundColor: '#F6D3E1' }]} />}
            </Animated.View>
            <Animated.Text style={[styles.name, hdStyle(1)]}>{user?.nome ?? ''}</Animated.Text>
            <Animated.View style={[styles.stats, hdStyle(2)]}>
              {stats.map((x) => (
                <View key={x.l} style={styles.stat}>
                  <Text style={styles.statN}>{x.n}</Text>
                  <Text style={styles.statL}>{x.l}</Text>
                </View>
              ))}
            </Animated.View>
          </View>
        </View>

        {/* ── Lista de grupos (75b) ────────────────────────────────────── */}
        {has && (
          <View style={styles.list}>
            {list.map((g, i) => {
              const feitos = g.members.filter((m) => membroFez(g, m.k, voceFez)).length;
              return (
                <View key={`${g.name}-${i}`} style={styles.gCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.gName}>{g.name}</Text>
                      <Text style={styles.gDay}>{`${g.members.length} ${g.members.length === 1 ? 'integrante' : 'integrantes'} · desde ${g.since}`}</Text>
                    </View>
                    <Icon d="M9 6l6 6-6 6" size={16} color={PINK} sw={2.4} />
                  </View>
                  <View style={styles.gLevelRow}>
                    <Text style={styles.gLevel}>Nível {g.lvl} · {g.lvlName}</Text>
                    <Text style={styles.gXp}>{g.xp} / {g.max} XP</Text>
                  </View>
                  <XpBar value={g.xp / g.max} index={i} run={run} rm={rm} />
                  <View style={styles.gFoot}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {g.members.map((m) => (
                        <Avatar key={m.k} img={m.img} uri={m.k === 'voce' ? user?.fotoUrl ?? null : null} done={membroFez(g, m.k, voceFez)} size={38} />
                      ))}
                    </View>
                    <Text style={styles.gCount}>{feitos} de {g.members.length} hoje</Text>
                  </View>
                  {!!g.news && (
                    <View style={styles.news}>
                      <View style={styles.newsDot} />
                      <Text style={styles.newsText}>{g.news}</Text>
                      <Text style={styles.newsVer}>Ver</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {/* "Criar grupo" centralizado embaixo dos cards (pedido do Douglas, 01/nov/2026 —
                no design 75b ficava acima da lista, à esquerda, junto de "Entrar com convite",
                que saiu: quem recebe o link do convite já cai direto no grupo). */}
            <TouchableOpacity activeOpacity={0.85} onPress={openSheet} style={styles.createPill}>
              <Icon d="M12 5v14M5 12h14" size={16} color="#fff" sw={2.6} />
              <Text style={styles.createPillText}>Criar grupo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Estado vazio (75c) ───────────────────────────────────────── */}
        {!has && (
          <View style={styles.empty}>
            <View style={{ width: 220, height: 196 }}>
              <View style={styles.backCard} />
              <View style={styles.frontCardShadow}>
                <View style={styles.frontCard}>
                  <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: CARD_GRAD }]} />
                  <View style={styles.frontInner} />
                  <Image source={LOGO} style={styles.frontLogo} />
                  <View style={[StyleSheet.absoluteFill, { mixBlendMode: 'overlay', opacity: 0.55, experimental_backgroundImage: HOLO }]} />
                  <Animated.View pointerEvents="none" style={[styles.sheen, { transform: [{ translateX: sheenX }, { skewX: '-18deg' }] }]} />
                </View>
              </View>
              {([
                { left: 196, top: 22, size: 16, fill: '#FF5EA8' },
                { left: 30, top: 8, size: 11, fill: '#D9B8FF' },
                { left: 20, top: 150, size: 13, fill: '#FF8CC0' },
                { left: 190, top: 160, size: 10, fill: '#D9B8FF' },
              ]).map((s, i) => (
                <Svg key={i} viewBox="0 0 24 24" style={{ position: 'absolute', left: s.left, top: s.top, width: s.size, height: s.size }}>
                  <Path d={SPARK} fill={s.fill} />
                </Svg>
              ))}
            </View>
            <Text style={styles.emptyTitle}>Faça skincare com suas amigas</Text>
            <Text style={styles.emptySub} lineBreakStrategyIOS="push-out">Grupos que fazem juntas sobem de nível e liberam cartas para todas</Text>
            <View style={styles.emptyBtns}>
              <TouchableOpacity activeOpacity={0.85} onPress={openSheet} style={styles.emptyCreate}>
                <Icon d="M12 5v14M5 12h14" size={16} color="#fff" sw={2.6} />
                <Text style={styles.createPillText}>Criar grupo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Folha "Criar grupo" (75d) ──────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: veil }]} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()} />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.sheet, {
          opacity: rm ? veil : 1,
          transform: [{ translateY: sheetT as any }, { translateY: kb }],
        }]}
      >
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Criar grupo</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); closeSheet(); }} style={styles.closeBtn} accessibilityLabel="Fechar">
            <Icon d="M18 6 6 18M6 6l12 12" size={16} color="#515151" sw={2.2} />
          </TouchableOpacity>
        </View>

        <View style={styles.bannerBox}>
          {banner < 0 && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); setBanner(0); }} style={styles.bannerAdd}>
              <View style={styles.bannerAddIcon}>
                <Icon d={['M16 5h6M19 2v6', 'M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5', 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21']} size={22} color="#fff" sw={1.9} />
              </View>
              <Text style={styles.bannerAddText}>Adicionar banner</Text>
              <Text style={styles.bannerAddSub}>Aparece no topo do grupo</Text>
            </TouchableOpacity>
          )}
          {BANNERS.map((b, i) => (
            <Animated.View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: b.bg, opacity: bannerO[i] }]}>
              {'logo' in b && (
                <>
                  <Image source={LOGO} style={{ position: 'absolute', right: -18, top: -22, width: 150, height: 150, opacity: b.logoO }} />
                  <Image source={LOGO} style={{ position: 'absolute', left: 26, bottom: -30, width: 76, height: 76, opacity: b.logoO, transform: [{ rotate: '-18deg' }] }} />
                </>
              )}
              {'prods' in b && (
                <>
                  <ExpoImage source={require('../../assets/rotina-tutorial/cut-serum.png')} style={{ position: 'absolute', left: 46, top: 22, height: 108, width: 108 * 179 / 573, transform: [{ rotate: '-8deg' }] }} contentFit="contain" />
                  <ExpoImage source={require('../../assets/rotina-tutorial/cut-pump.png')} style={{ position: 'absolute', left: 130, top: 6, height: 132, width: 132 * 210 / 800 }} contentFit="contain" />
                  <ExpoImage source={require('../../assets/home-grupo/cut-tube.png')} style={{ position: 'absolute', left: 214, top: 34, height: 104, width: 104 * 225 / 532, transform: [{ rotate: '10deg' }] }} contentFit="contain" />
                </>
              )}
            </Animated.View>
          ))}
          {banner >= 0 && (
            <View style={styles.bannerBtns}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.select(); setBanner((banner + 1) % 2); }} style={styles.bannerBtn}>
                <Icon d={['m18 14 4 4-4 4', 'm18 2 4 4-4 4', 'M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-8.6a4 4 0 0 1 3.3-1.7H22', 'M2 6h1.97a4 4 0 0 1 3.3 1.7l.43.7', 'm13.3 15.6.43.7a4 4 0 0 0 3.3 1.7H22']} size={14} color={PINK} sw={2.2} />
                <Text style={styles.bannerBtnText}>Trocar</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.select(); setBanner(2); }} style={styles.bannerBtn}>
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Rect x={3} y={3} width={18} height={18} rx={2} fill="none" stroke={PINK} strokeWidth={2.2} />
                  <Circle cx={9} cy={9} r={2} fill="none" stroke={PINK} strokeWidth={2.2} />
                  <Path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={styles.bannerBtnText}>Sua foto</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.fields}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nome do grupo"
            placeholderTextColor="#A9A9A9"
            style={styles.nameInput}
            returnKeyType="next"
          />
          <View style={styles.fieldLine} />
          <View style={{ height: 88 }}>
            <TextInput
              value={desc}
              onChangeText={setDesc}
              placeholder="Descrição (opcional)"
              placeholderTextColor="#A9A9A9"
              multiline
              style={styles.descInput}
            />
          </View>
        </View>

        <Text style={styles.shareTitle}>Convidar amigas</Text>
        <View style={styles.shareRow}>
          {shares.map((x) => (
            <TouchableOpacity key={x.label === 'Copiado' ? 'Copiar link' : x.label} activeOpacity={0.7} onPress={() => { haptics.tap(); x.on(); }} style={styles.shareItem}>
              <View style={styles.shareCircle}>
                <Svg width={24} height={24} viewBox="0 0 24 24">
                  {'ig' in x ? (
                    <>
                      <Rect x={2.5} y={2.5} width={19} height={19} rx={5.5} fill="none" stroke="#fff" strokeWidth={1.9} />
                      <Circle cx={12} cy={12} r={4.2} fill="none" stroke="#fff" strokeWidth={1.9} />
                      <Path d="M17.5 6.5h.01" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" />
                    </>
                  ) : (x.d ?? []).map((p, k) => (
                    <Path key={k} d={p} fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </Svg>
              </View>
              <Text style={styles.shareLabel}>{x.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={submit}
          style={[styles.cta, ok ? styles.ctaOn : styles.ctaOff]}
        >
          <Text style={styles.ctaText}>Criar grupo</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F1F4' },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280, left: 190, top: -90,
    experimental_backgroundImage: 'radial-gradient(circle at 30% 75%, rgba(255,170,205,0.34), rgba(255,255,255,0.2))',
  },
  circleWhite: {
    position: 'absolute', width: 620, height: 620, borderRadius: 310,
    left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)',
  },

  // Header de perfil
  gear: { position: 'absolute', right: 20, top: -10, zIndex: 2 },
  gearBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', boxShadow: '0px 4px 14px rgba(120,60,72,0.10)',
  },
  photoRing: {
    width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderColor: PINK, padding: 4,
    backgroundColor: 'rgba(255,255,255,0.6)', boxShadow: '0px 10px 26px rgba(192,32,106,0.14)',
  },
  photo: { width: 92, height: 92, borderRadius: 46 },
  name: { marginTop: 12, fontSize: 26, fontWeight: '700', lineHeight: 30, letterSpacing: -0.7, color: INK },
  stats: { marginTop: 16, width: '100%', maxWidth: 330, flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statN: { fontSize: 28, fontWeight: '700', lineHeight: 32, letterSpacing: -0.9, color: INK, fontVariant: ['tabular-nums'] },
  statL: { fontSize: 13, lineHeight: 16, color: MUTE, letterSpacing: -0.1 },
  createPill: {
    marginTop: 12, alignSelf: 'center',
    height: 48, paddingHorizontal: 26, borderRadius: 100, backgroundColor: PINK,
    flexDirection: 'row', alignItems: 'center', gap: 9, boxShadow: '0px 10px 22px rgba(255,94,168,0.35)',
  },
  createPillText: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },

  // Lista
  list: { marginTop: 28, paddingHorizontal: 18, gap: 12 },
  gCard: {
    borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.78)',
    paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16,
  },
  gName: { fontSize: 20, fontWeight: '700', lineHeight: 24, letterSpacing: -0.5, color: INK },
  gDay: { marginTop: 3, fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1 },
  gLevelRow: { marginTop: 14, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  gLevel: { fontSize: 14, fontWeight: '600', color: '#515151', letterSpacing: -0.2 },
  gXp: { fontSize: 13, color: MUTE, letterSpacing: -0.1, fontVariant: ['tabular-nums'] },
  xpTrack: { marginTop: 7, height: 8, borderRadius: 100, backgroundColor: 'rgba(18,18,18,0.08)', overflow: 'hidden' },
  xpFill: { ...StyleSheet.absoluteFillObject, borderRadius: 100, backgroundColor: PINK, transformOrigin: 'left center' },
  gFoot: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gCount: { fontSize: 14, color: MUTE, letterSpacing: -0.1 },
  news: {
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(18,18,18,0.06)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  newsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PINK },
  newsText: { flex: 1, color: PINK, fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  newsVer: { color: PINK, fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },

  // Estado vazio
  empty: { marginTop: 30, paddingHorizontal: 28, alignItems: 'center' },
  backCard: {
    position: 'absolute', left: 40, top: 30, width: 104, height: 142, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(255,94,168,0.35)',
    boxShadow: '0px 10px 24px rgba(200,60,120,0.12)', transform: [{ rotate: '-12deg' }],
  },
  frontCardShadow: {
    position: 'absolute', left: 78, top: 14, width: 112, height: 154, borderRadius: 14,
    boxShadow: '0px 16px 34px rgba(200,60,120,0.24)', transform: [{ rotate: '7deg' }],
  },
  frontCard: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  frontInner: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  frontLogo: { position: 'absolute', left: '50%', top: '50%', width: 54, height: 54, marginLeft: -27, marginTop: -27 },
  sheen: {
    position: 'absolute', top: '-30%', bottom: '-30%', left: 0, width: '46%',
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9), rgba(255,255,255,0))',
  },
  emptyTitle: { marginTop: 22, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.7, color: INK, textAlign: 'center' },
  emptySub: { marginTop: 8, maxWidth: 290, fontSize: 15, lineHeight: 21, color: MUTE, letterSpacing: -0.1, textAlign: 'center' },
  emptyBtns: { marginTop: 26, width: '100%', maxWidth: 300, gap: 10 },
  emptyCreate: {
    height: 48, borderRadius: 100, backgroundColor: PINK, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 9, boxShadow: '0px 10px 22px rgba(255,94,168,0.35)',
  },

  // Folha
  veil: { backgroundColor: 'rgba(18,18,18,0.28)', zIndex: 40 },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41, backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 34,
    boxShadow: '0px -10px 30px rgba(190,70,120,0.12)',
  },
  grabber: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#E3E3E6', alignSelf: 'center' },
  sheetHead: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: INK },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  bannerBox: { marginTop: 18, height: 136, borderRadius: 18, overflow: 'hidden' },
  bannerAdd: {
    ...StyleSheet.absoluteFillObject, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: 'rgba(255,94,168,0.6)', backgroundColor: '#FFF6FA', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  bannerAddIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 8px 18px rgba(255,94,168,0.3)',
  },
  bannerAddText: { fontSize: 15, fontWeight: '600', color: PINK, letterSpacing: -0.2 },
  bannerAddSub: { fontSize: 12, color: MUTE, letterSpacing: -0.1 },
  bannerBtns: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', gap: 8 },
  bannerBtn: {
    height: 30, paddingHorizontal: 12, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: '0px 4px 12px rgba(120,60,72,0.12)',
  },
  bannerBtnText: { color: PINK, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
  fields: { marginTop: 14, borderRadius: 16, borderWidth: 1.5, borderColor: PINK, backgroundColor: '#fff', overflow: 'hidden' },
  nameInput: { height: 52, paddingHorizontal: 16, fontSize: 17, color: INK, letterSpacing: -0.3 },
  fieldLine: { height: 1, marginLeft: 16, backgroundColor: 'rgba(18,18,18,0.08)' },
  descInput: {
    maxHeight: 88, paddingTop: 14, paddingBottom: 14, paddingHorizontal: 16,
    fontSize: 16, lineHeight: 21, color: INK, letterSpacing: -0.2, textAlignVertical: 'top',
  },
  shareTitle: { marginTop: 18, fontSize: 13, fontWeight: '600', color: MUTE, letterSpacing: -0.1 },
  shareRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-around' },
  shareItem: { width: 90, alignItems: 'center', gap: 7 },
  shareCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 8px 18px rgba(255,94,168,0.3)',
  },
  shareLabel: { fontSize: 13, fontWeight: '500', color: '#515151', letterSpacing: -0.1 },
  cta: { marginTop: 24, height: 56, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  ctaOn: { backgroundColor: PINK, boxShadow: '0px 6px 12px rgba(255,94,168,0.45)' },
  ctaOff: { backgroundColor: '#9CA3AF' },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
});
