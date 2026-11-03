import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet,
  AccessibilityInfo, TextInput, Keyboard, Pressable, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { criarGrupo, invalidarGrupos, subirFoto, useMeusGrupos, type GrupoResumo } from '../../lib/gruposServidor';
import { enviarConvite, type Canal } from '../../lib/convite';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';

// ─────────────────────────────────────────────────────────────────────────────
// Seus grupos — réplica de 80s (com grupos), 80t (sem grupo) e 80u (folha de criar
// grupo) do Claude Design (NiksGrupoV2.dc.html, rodada 80). Abre pelo "Seus grupos"
// da aba Grupos (80q). Medidas do frame 393×852; o conteúdo começa em 72 → insets.top + 18.
//   · Cards SEM nível nem XP: integrantes (anel rosa = fez hoje; tracejado e apagada =
//     ainda não), "x de y hoje" e a linha do troféu ("Você está em Nº esta semana" ou,
//     antes do 1º check-in da semana, "Semana começa com o primeiro check-in"). O ponto
//     rosa ao lado do nome = alguém fez check-in desde a última vez que ela abriu o grupo.
//   · Criar grupo fica embaixo dos cards. Sem grupo: "Faça skincare com suas amigas e
//     vejam quem é mais constante" e só Criar grupo ("Entrar com convite" saiu: quem é
//     convidada entra pelo link).
//   · Folha (gaveta do iOS, 500 ms; desce em 240 ms): banner do NIKS (Trocar alterna os
//     dois) ou a foto dela, nome, descrição opcional, convite (WhatsApp, Instagram,
//     Copiar link) e Criar grupo. Convidar antes de criar já cria o grupo (o link precisa
//     dele). Ao criar, o card novo mostra "Só você · convide amigas".
// Dados reais: função `grupos` (`meus_grupos`, `criar`, `convite`).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EIO = Easing.bezier(0.77, 0, 0.175, 1);
const SHEET_IN = Easing.bezier(0.32, 0.72, 0, 1);

const LOGO = require('../../assets/home/score-logo-pink.png');
const CARD_GRAD = 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)';
const HOLO = 'linear-gradient(115deg, rgba(255,255,255,0) 18%, rgba(255,170,215,0.9) 34%, rgba(205,180,255,0.9) 46%, rgba(255,255,255,1) 56%, rgba(190,175,255,0.85) 70%, rgba(255,255,255,0) 84%)';
const SPARK = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';
const LINK = ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'];
const TROFEU = ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'];

// Banners do NIKS (os dois de "Trocar"); a foto dela é o terceiro estado.
export const BANNERS_GRUPO = [
  { key: 'niks-1', bg: CARD_GRAD, logoO: 0.55 },
  { key: 'niks-2', bg: 'linear-gradient(120deg, #FF5EA8 0%, #FF8CC0 55%, #FFC2DB 100%)', logoO: 0.28 },
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

/** Banner do grupo (NIKS ou foto), usado no card da folha e na tela do grupo. */
export function BannerGrupo({ banner, url, style }: { banner: string; url?: string | null; style?: object }) {
  const b = BANNERS_GRUPO.find((x) => x.key === banner) ?? BANNERS_GRUPO[0];
  if (banner === 'foto' && url) return <ExpoImage source={{ uri: url }} style={[StyleSheet.absoluteFill, style]} contentFit="cover" />;
  return (
    <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: b.bg }, style]}>
      <Image source={LOGO} style={{ position: 'absolute', right: -18, top: -22, width: 150, height: 150, opacity: b.logoO }} />
      <Image source={LOGO} style={{ position: 'absolute', left: 26, bottom: -30, width: 76, height: 76, opacity: b.logoO, transform: [{ rotate: '-18deg' }] }} />
    </View>
  );
}

const VISTO_KEY = (gid: string) => `grupo:visto:${gid}`;

export default function SeusGrupos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{ criar?: string }>();
  const rm = useReduceMotion();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const { data: grupos, refresh } = useMeusGrupos();
  const list = grupos ?? [];
  const has = list.length > 0;

  // Ponto rosa: check-in de outra desde a última vez que ela abriu o grupo.
  const [vistos, setVistos] = useState<Record<string, string | null>>({});
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      void refresh?.();
      return () => closeSheet(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  useEffect(() => {
    if (!list.length) return;
    AsyncStorage.multiGet(list.map((g) => VISTO_KEY(g.id)))
      .then((kv) => setVistos(Object.fromEntries(kv.map(([k, v]) => [k.slice('grupo:visto:'.length), v]))))
      .catch(() => {});
  }, [list.map((g) => g.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const novidade = (g: GrupoResumo) => !!g.ultimo_checkin_outra && (!vistos[g.id] || g.ultimo_checkin_outra > (vistos[g.id] ?? ''));

  // ── Brilho da carta do estado vazio (a cada 5 s) ──────────────────────────
  const sheen = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (has || rm) return;
    const go = () => { sheen.setValue(0); Animated.timing(sheen, { toValue: 1, duration: 820, easing: EIO, useNativeDriver: true }).start(); };
    const t = setTimeout(go, 700);
    const id = setInterval(go, 5000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [has, rm, sheen]);
  const SHEEN_W = 108 * 0.46;
  const sheenX = sheen.interpolate({ inputRange: [0, 1], outputRange: [-1.6 * SHEEN_W, 3.2 * SHEEN_W] });

  // ── Folha "Criar grupo" (80u) ─────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [banner, setBanner] = useState(0); // 0/1 = NIKS, 2 = foto dela
  const [foto, setFoto] = useState<{ uri: string; base64: string } | null>(null);
  const [criado, setCriado] = useState<string | null>(null); // grupo já criado por um convite
  const [ocupado, setOcupado] = useState(false);
  const [copied, setCopied] = useState(false);
  const [erro, setErro] = useState('');
  const [sheetH, setSheetH] = useState(620);
  const veil = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const kb = useRef(new Animated.Value(0)).current;
  const bannerO = useRef([0, 1, 2].map((i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const ok = name.trim().length > 0;

  const openSheet = () => {
    haptics.action();
    setTabBarVisible(false);
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
  const resetSheet = () => { setName(''); setDesc(''); setBanner(0); setFoto(null); setCriado(null); setErro(''); };

  // Abrir direto (home/compartilhar sem grupo → "Criar grupo").
  useEffect(() => {
    if (params.criar !== '1') return;
    router.setParams({ criar: undefined });
    const t = setTimeout(openSheet, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.criar]);

  useEffect(() => {
    bannerO.forEach((v, i) => Animated.timing(v, { toValue: banner === i ? 1 : 0, duration: 260, useNativeDriver: true }).start());
  }, [banner, bannerO]);

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

  const escolherFoto = async () => {
    haptics.select();
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [353, 136], quality: 1 }).catch(() => null);
    if (!r || r.canceled || !r.assets?.[0]) return;
    const m = await ImageManipulator.manipulateAsync(r.assets[0].uri, [{ resize: { width: 1080 } }], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (!m.base64) return;
    setFoto({ uri: m.uri, base64: m.base64 });
    setBanner(2);
  };

  // Cria o grupo (uma vez) e devolve o id. O convite precisa dele.
  const garantirGrupo = async (): Promise<string | null> => {
    if (criado) return criado;
    if (!ok) { haptics.error(); setErro('Dê um nome ao grupo'); return null; }
    setOcupado(true);
    setErro('');
    try {
      const bannerPath = banner === 2 && foto ? await subirFoto('banner', foto.base64) : null;
      const r = await criarGrupo({ nome: name.trim(), descricao: desc.trim() || undefined, banner: BANNERS_GRUPO[banner === 1 ? 1 : 0].key, banner_path: bannerPath });
      if (!('grupo_id' in r)) {
        setErro(r.motivo === 'assinatura' ? 'Não conseguimos confirmar sua assinatura agora' : 'Não deu para criar o grupo');
        haptics.error();
        return null;
      }
      trackFora('grupo_criado', { banner: bannerPath ? 'foto' : BANNERS_GRUPO[banner === 1 ? 1 : 0].key, com_descricao: !!desc.trim() });
      setCriado(r.grupo_id);
      await invalidarGrupos();
      void refresh?.();
      return r.grupo_id;
    } catch {
      setErro('Sem conexão. Tente de novo.');
      haptics.error();
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const convidar = async (canal: Canal) => {
    haptics.tap();
    const gid = await garantirGrupo();
    if (!gid) return;
    try {
      const r = await enviarConvite(canal, gid, name.trim());
      if (r.copiado) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
    } catch {
      setErro('Não deu para gerar o convite agora');
    }
  };

  const submit = async () => {
    if (!ok || ocupado) return;
    const gid = await garantirGrupo();
    if (!gid) return;
    haptics.success();
    closeSheet();
    setTimeout(resetSheet, 260);
  };

  const sheetT = rm ? 0 : slide.interpolate({ inputRange: [0, 1], outputRange: [sheetH * 1.1, 0] });
  const shares: { canal: Canal; label: string; d?: string[]; ig?: boolean }[] = [
    { canal: 'whatsapp', label: 'WhatsApp', d: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z', 'M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-.9-.4-1.5-1-1.8-1.8l.8-1-1-2Z'] },
    { canal: 'instagram', label: 'Instagram', ig: true },
    { canal: 'copiar', label: copied ? 'Copiado' : 'Copiar link', d: copied ? ['M5 12.5l4.5 4.5L19 7.5'] : LINK },
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']} locations={[0, 0.45, 0.72, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleBlob} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 150 }}>
        <View style={styles.head}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.navigate('/grupos' as any); }} style={styles.roundBtn} accessibilityLabel="Voltar">
            <Icon d="m15 18-6-6 6-6" size={18} color={INK} sw={2} />
          </TouchableOpacity>
          <Text style={styles.headTitle} pointerEvents="none">Seus grupos</Text>
        </View>

        {/* ── Cards (80s) ──────────────────────────────────────────────── */}
        {has && (
          <>
            <View style={styles.list}>
              {list.map((g) => {
                const so = g.total <= 1;
                const rankOn = !so && g.checkins_semana > 0 && g.sua_posicao_semana != null;
                return (
                  <TouchableOpacity key={g.id} activeOpacity={0.85} onPress={() => { haptics.tap(); router.push({ pathname: '/grupo', params: { id: g.id } } as any); }} style={styles.gCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.gName} numberOfLines={1}>{g.nome}</Text>
                          {novidade(g) && <View style={styles.newsDot} />}
                        </View>
                        <Text style={styles.gSub}>{so ? 'Só você · convide amigas' : `${g.total} integrantes`}</Text>
                      </View>
                      <Icon d="M9 6l6 6-6 6" size={16} color={PINK} sw={2.4} />
                    </View>
                    <View style={styles.gFoot}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {g.integrantes.slice(0, 5).map((m) => (
                          <View key={m.user_id} style={[styles.av, m.fez_hoje ? styles.avDone : styles.avTodo]}>
                            {m.foto
                              ? <Image source={{ uri: m.foto }} style={[styles.avImg, !m.fez_hoje && styles.avImgTodo]} />
                              : <View style={[styles.avImg, { backgroundColor: '#F6D3E1' }, !m.fez_hoje && styles.avImgTodo]} />}
                          </View>
                        ))}
                      </View>
                      <Text style={styles.gCount}>{`${g.feitos_hoje} de ${g.total} hoje`}</Text>
                    </View>
                    <View style={styles.rank}>
                      <Icon d={TROFEU} size={14} color={rankOn ? PINK : MUTE} sw={2} />
                      <Text style={[styles.rankText, { color: rankOn ? PINK : MUTE }]}>
                        {rankOn ? `Você está em ${g.sua_posicao_semana}º esta semana` : 'Semana começa com o primeiro check-in'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ marginTop: 24, alignItems: 'center' }}>
              <TouchableOpacity activeOpacity={0.85} onPress={openSheet} style={styles.createPill}>
                <Icon d="M12 5v14M5 12h14" size={16} color="#fff" sw={2.6} />
                <Text style={styles.createPillText}>Criar grupo</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Sem grupo (80t) ──────────────────────────────────────────── */}
        {grupos && !has && (
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
              ]).map((s, i) => (
                <Svg key={i} viewBox="0 0 24 24" style={{ position: 'absolute', left: s.left, top: s.top, width: s.size, height: s.size }}>
                  <Path d={SPARK} fill={s.fill} />
                </Svg>
              ))}
            </View>
            <Text style={styles.emptyTitle}>{"Faça skincare com suas amigas\ne vejam quem é mais constante"}</Text>
            <Text style={styles.emptySub}>Check-in com foto todo dia, ranking da semana e a jornada de cada uma</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={openSheet} style={[styles.createPill, { marginTop: 24 }]}>
              <Icon d="M12 5v14M5 12h14" size={16} color="#fff" sw={2.6} />
              <Text style={styles.createPillText}>Criar grupo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── Folha "Criar grupo" (80u) ──────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: veil }]} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()} />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.sheet, { opacity: rm ? veil : 1, transform: [{ translateY: sheetT as any }, { translateY: kb }] }]}
      >
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Criar grupo</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); closeSheet(); }} style={styles.closeBtn} accessibilityLabel="Fechar">
            <Icon d="M18 6 6 18M6 6l12 12" size={16} color="#515151" sw={2.2} />
          </TouchableOpacity>
        </View>

        <View style={styles.bannerBox}>
          {[0, 1].map((i) => (
            <Animated.View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: bannerO[i] }]}>
              <BannerGrupo banner={BANNERS_GRUPO[i].key} />
            </Animated.View>
          ))}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: bannerO[2] }]}>
            {foto && <ExpoImage source={{ uri: foto.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
          </Animated.View>
          <View style={styles.bannerBtns}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.select(); setBanner(banner === 0 ? 1 : 0); }} style={styles.bannerBtn}>
              <Icon d={['m18 14 4 4-4 4', 'm18 2 4 4-4 4', 'M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-8.6a4 4 0 0 1 3.3-1.7H22', 'M2 6h1.97a4 4 0 0 1 3.3 1.7l.43.7', 'm13.3 15.6.43.7a4 4 0 0 0 3.3 1.7H22']} size={14} color={PINK} sw={2.2} />
              <Text style={styles.bannerBtnText}>Trocar</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={escolherFoto} style={styles.bannerBtn}>
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Rect x={3} y={3} width={18} height={18} rx={2} fill="none" stroke={PINK} strokeWidth={2.2} />
                <Circle cx={9} cy={9} r={2} fill="none" stroke={PINK} strokeWidth={2.2} />
                <Path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.bannerBtnText}>Sua foto</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fields}>
          <TextInput value={name} onChangeText={(t) => { setName(t); if (erro) setErro(''); }} placeholder="Nome do grupo" placeholderTextColor="#A9A9A9" style={styles.nameInput} returnKeyType="next" maxLength={40} editable={!criado} />
          <View style={styles.fieldLine} />
          <TextInput value={desc} onChangeText={setDesc} placeholder="Descrição (opcional)" placeholderTextColor="#A9A9A9" multiline maxLength={140} style={styles.descInput} editable={!criado} />
        </View>

        <Text style={styles.shareTitle}>Convidar amigas</Text>
        <View style={styles.shareRow}>
          {shares.map((x) => (
            <TouchableOpacity key={x.canal} activeOpacity={0.7} onPress={() => { void convidar(x.canal); }} style={styles.shareItem} disabled={ocupado}>
              <View style={styles.shareCircle}>
                <Svg width={24} height={24} viewBox="0 0 24 24">
                  {x.ig ? (
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

        {!!erro && <Text style={styles.erro}>{erro}</Text>}
        <TouchableOpacity activeOpacity={0.85} onPress={submit} style={[styles.cta, ok ? styles.ctaOn : styles.ctaOff]} disabled={ocupado}>
          {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{criado ? 'Pronto' : 'Criar grupo'}</Text>}
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
  circleWhite: { position: 'absolute', width: 620, height: 620, borderRadius: 310, left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)' },

  head: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  roundBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 14px rgba(120,60,72,0.10)', zIndex: 1,
  },
  headTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },

  list: { marginTop: 20, paddingHorizontal: 18, gap: 10 },
  gCard: {
    borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.78)',
    paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16,
  },
  gName: { flexShrink: 1, fontSize: 20, fontWeight: '700', lineHeight: 24, letterSpacing: -0.5, color: INK },
  newsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PINK },
  gSub: { marginTop: 3, fontSize: 14, lineHeight: 18, color: MUTE, letterSpacing: -0.1 },
  gFoot: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  av: { width: 40, height: 40, borderRadius: 20, padding: 2, borderWidth: 2 },
  avDone: { borderColor: PINK, borderStyle: 'solid' },
  avTodo: { borderColor: 'rgba(129,129,129,0.45)', borderStyle: 'dashed' },
  avImg: { width: 32, height: 32, borderRadius: 16 },
  avImgTodo: { opacity: 0.5, filter: [{ grayscale: 0.7 }] },
  gCount: { fontSize: 14, color: MUTE, letterSpacing: -0.1 },
  rank: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  createPill: {
    height: 48, paddingHorizontal: 28, borderRadius: 100, backgroundColor: PINK,
    flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0px 10px 22px rgba(255,94,168,0.35)',
  },
  createPillText: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },

  empty: { marginTop: 36, paddingHorizontal: 28, alignItems: 'center' },
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
  emptyTitle: { marginTop: 20, fontSize: 20, lineHeight: 24, fontWeight: '600', letterSpacing: -0.5, color: INK, textAlign: 'center' },
  emptySub: { marginTop: 6, maxWidth: 280, fontSize: 15, lineHeight: 21, color: MUTE, letterSpacing: -0.1, textAlign: 'center' },

  veil: { backgroundColor: 'rgba(60,20,40,0.32)', zIndex: 40 },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41, backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 34,
    boxShadow: '0px -10px 30px rgba(190,70,120,0.12)',
  },
  grabber: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#E3E3E6', alignSelf: 'center' },
  sheetHead: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, fontWeight: '600', letterSpacing: -0.5, color: INK },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  bannerBox: { marginTop: 18, height: 136, borderRadius: 18, overflow: 'hidden' },
  bannerBtns: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', gap: 8 },
  bannerBtn: {
    height: 30, paddingHorizontal: 12, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row', alignItems: 'center', gap: 6, boxShadow: '0px 4px 12px rgba(120,60,72,0.12)',
  },
  bannerBtnText: { color: PINK, fontSize: 13, fontWeight: '600' },
  fields: { marginTop: 14, borderRadius: 16, borderWidth: 1.5, borderColor: PINK, backgroundColor: '#fff', overflow: 'hidden' },
  nameInput: { height: 52, paddingHorizontal: 16, fontSize: 17, color: INK, letterSpacing: -0.3 },
  fieldLine: { height: 1, marginLeft: 16, backgroundColor: 'rgba(18,18,18,0.08)' },
  descInput: { height: 72, paddingTop: 14, paddingBottom: 14, paddingHorizontal: 16, fontSize: 16, lineHeight: 21, color: INK, letterSpacing: -0.2, textAlignVertical: 'top' },
  shareTitle: { marginTop: 18, fontSize: 13, fontWeight: '600', color: MUTE, letterSpacing: -0.1 },
  shareRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-around' },
  shareItem: { width: 90, alignItems: 'center', gap: 7 },
  shareCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 8px 18px rgba(255,94,168,0.3)',
  },
  shareLabel: { fontSize: 13, fontWeight: '500', color: '#515151', letterSpacing: -0.1 },
  erro: { marginTop: 14, textAlign: 'center', fontSize: 14, color: '#D93A6B', letterSpacing: -0.1 },
  cta: { marginTop: 24, height: 48, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  ctaOn: { backgroundColor: PINK, boxShadow: '0px 6px 12px rgba(255,94,168,0.45)' },
  ctaOff: { backgroundColor: '#9CA3AF' },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },
});
