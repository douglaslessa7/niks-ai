import FotoComMoldura from '../../components/medalhas/FotoComMoldura';
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, TextInput, Keyboard, Pressable, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { criarGrupo, invalidarGrupos, useMeusGrupos, type GrupoResumo } from '../../lib/gruposServidor';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import AlvoGuia from '../../components/coach/AlvoGuia';
import { useCoachStage } from '../../lib/coachMarks';
import { verificarTutorialGrupos } from '../../lib/gruposTutorial';

// ─────────────────────────────────────────────────────────────────────────────
// Seus grupos — réplica de 81c (com grupos), 81d (sem grupo) e 81e (folha "Novo grupo")
// do Claude Design ("NIKS home redesign", NiksGrupoFlo.dc.html, rodada 81: linguagem do
// Flo). Frame de 393 × 852 com barra de status de 54: Y do design → insets.top + y − 54.
//   · Cards brancos de canto 16, a 16 da borda e 16 entre eles: faixa do banner (72) com a
//     flor num círculo, nome, integrantes + "x de y fizeram hoje", linha fina e a posição
//     da semana em rosa com a seta. "Criar grupo" embaixo: círculo rosa com + e texto rosa.
//     Ao abrir, os cards sobem 10 pt em cascata (420 ms, 60 ms entre eles).
//   · Sem grupo: o vazio da rodada 80 (as duas cartas, título, texto e Criar grupo).
//   · Folha cinza-rosada com alça (sobe com mola ζ1 .5 s, 120 ms depois do véu; desce em
//     240 ms): X em círculo branco, "Novo grupo", card com o nome num campo em pílula e
//     "Depois você convida as amigas pelo link.", Criar grupo em largura total. Criado, o
//     grupo abre — o convite fica no menu "…" dele ("Convidar amigas").
// Dados reais: função `grupos` (`meus_grupos`, `criar`).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIO = Easing.bezier(0.77, 0, 0.175, 1);
const EIN = Easing.bezier(0.55, 0, 1, 0.45);

const LOGO = require('../../assets/home/score-logo-pink.png');
const CARD_GRAD = 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)';
const HOLO = 'linear-gradient(115deg, rgba(255,255,255,0) 18%, rgba(255,170,215,0.9) 34%, rgba(205,180,255,0.9) 46%, rgba(255,255,255,1) 56%, rgba(190,175,255,0.85) 70%, rgba(255,255,255,0) 84%)';
const SPARK = 'M12 0Q12 12 24 12Q12 12 12 24Q12 12 0 12Q12 12 12 0Z';

// Banners do NIKS; a foto dela é o terceiro estado.
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

/** Banner do grupo (NIKS ou foto), usado na tela do grupo e nas folhas. */
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

/** Faixa do banner no card (81c): o degradê do grupo (ou a foto) e a flor num círculo branco. */
export function FaixaGrupo({ g, h }: { g: Pick<GrupoResumo, 'banner' | 'banner_url'>; h: number }) {
  const rosa = g.banner === 'niks-2';
  return (
    <View style={{ height: h, experimental_backgroundImage: rosa ? BANNERS_GRUPO[1].bg : BANNERS_GRUPO[0].bg }}>
      {g.banner === 'foto' && g.banner_url ? <ExpoImage source={{ uri: g.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <View style={styles.faixaLogo}><Image source={LOGO} style={{ width: 26, height: 26 }} /></View>
    </View>
  );
}

/** Sobe 10 pt e acende (o `data-in` do design): 420 ms, 60 ms entre um e outro. */
function Entra({ i, run, rm, children }: { i: number; run: number; rm: boolean; children: React.ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(0);
    p.set(withDelay(Math.min(i, 8) * 60 + 80, withTiming(1, { duration: rm ? 200 : 420, easing: EO })));
  }, [p, i, run, rm]);
  const st = useAnimatedStyle(() => (rm ? { opacity: p.get() } : { opacity: p.get(), transform: [{ translateY: 10 * (1 - p.get()) }] }), [rm]);
  return <Animated.View style={st}>{children}</Animated.View>;
}

export default function SeusGrupos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ criar?: string }>();
  const rm = useReducedMotion();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const { data: grupos, refresh } = useMeusGrupos();
  const list = grupos ?? [];
  const has = list.length > 0;
  const y = (v: number) => insets.top + v - 54;

  const [run, setRun] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
      setRun((n) => n + 1);
      void refresh?.();
      verificarTutorialGrupos('/seus-grupos');
      return () => fecharFolha(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  useCoachStage('seusGrupos', grupos != null);

  // ── Brilho da carta do estado vazio (a cada 5 s) ──────────────────────────
  const brilho = useSharedValue(0);
  useEffect(() => {
    if (has || rm) { brilho.set(0); return; }
    brilho.set(0);
    brilho.set(withDelay(700, withRepeat(withSequence(withTiming(1, { duration: 820, easing: EIO }), withTiming(1, { duration: 4180 }), withTiming(0, { duration: 0 })), -1, false)));
  }, [has, rm, brilho]);
  const SHEEN_W = 108 * 0.46;
  const brilhoSt = useAnimatedStyle(() => ({ transform: [{ translateX: -1.6 * SHEEN_W + 4.8 * SHEEN_W * brilho.get() }, { skewX: '-18deg' }] }));

  // ── Folha "Novo grupo" (81e) ───────────────────────────────────────────────
  const [aberta, setAberta] = useState(false);
  const [nome, setNome] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [folhaH, setFolhaH] = useState(320);
  const veu = useSharedValue(0);
  const sobe = useSharedValue(0);
  const teclado = useSharedValue(0);
  const ok = nome.trim().length > 0;

  const abrirFolha = () => {
    haptics.action();
    setTabBarVisible(false);
    setAberta(true);
    veu.set(withTiming(1, { duration: 240 }));
    sobe.set(0);
    sobe.set(rm ? withTiming(1, { duration: 200 }) : withDelay(120, withSpring(1, { stiffness: (2 * Math.PI / 0.5) ** 2, damping: (4 * Math.PI) / 0.5, mass: 1 })));
  };
  function fecharFolha(instant = false) {
    Keyboard.dismiss();
    setAberta(false);
    setTabBarVisible(true);
    if (instant) { veu.set(0); sobe.set(0); return; }
    veu.set(withTiming(0, { duration: 200 }));
    sobe.set(withTiming(0, { duration: rm ? 160 : 240, easing: EIN }, (fim) => { if (fim) scheduleOnRN(setErro, ''); }));
  }

  // Abrir direto (home/compartilhar sem grupo → "Criar grupo").
  useEffect(() => {
    if (params.criar !== '1') return;
    router.setParams({ criar: undefined });
    const t = setTimeout(abrirFolha, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.criar]);

  useEffect(() => {
    const sh = Keyboard.addListener('keyboardWillShow', (e) => {
      teclado.set(withTiming(-(e.endCoordinates.height - Math.max(insets.bottom, 0)), { duration: e.duration || 250, easing: Easing.bezier(0.17, 0.59, 0.4, 0.77) }));
    });
    const hi = Keyboard.addListener('keyboardWillHide', (e) => {
      teclado.set(withTiming(0, { duration: e.duration || 250, easing: Easing.bezier(0.17, 0.59, 0.4, 0.77) }));
    });
    return () => { sh.remove(); hi.remove(); };
  }, [teclado, insets.bottom]);

  const criar = async () => {
    if (!ok || ocupado) { if (!ok) haptics.error(); return; }
    haptics.action();
    setOcupado(true);
    setErro('');
    try {
      const r = await criarGrupo({ nome: nome.trim(), banner: 'niks-1' });
      if (!('grupo_id' in r)) {
        setErro(r.motivo === 'assinatura' ? 'Não conseguimos confirmar sua assinatura agora' : 'Não deu para criar o grupo');
        haptics.error();
        return;
      }
      trackFora('grupo_criado', { banner: 'niks-1', com_descricao: false });
      haptics.success();
      await invalidarGrupos();
      fecharFolha();
      setNome('');
      setTimeout(() => router.push({ pathname: '/grupo', params: { id: r.grupo_id } } as any), 260);
    } catch {
      setErro('Sem conexão. Tente de novo.');
      haptics.error();
    } finally {
      setOcupado(false);
    }
  };

  const veuSt = useAnimatedStyle(() => ({ opacity: veu.get() }));
  const folhaSt = useAnimatedStyle(() => (rm
    ? { opacity: sobe.get(), transform: [{ translateY: teclado.get() }] }
    : { transform: [{ translateY: folhaH * (1 - sobe.get()) + teclado.get() }] }), [rm, folhaH]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={[styles.titleRow, { top: y(54) }]}><Text style={styles.title}>Seus grupos</Text></View>
      <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.navigate('/grupos' as any); }} style={[styles.back, { top: y(54) }]} accessibilityLabel="Voltar">
        <Icon d="m15 18-6-6 6-6" size={26} color={INK} sw={2} />
      </TouchableOpacity>

      {/* ── Cards (81c) ─────────────────────────────────────────────────── */}
      {has && (
        <ScrollView
          style={{ position: 'absolute', top: y(98), left: 0, right: 0, bottom: 0 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 140, gap: 16 }}
        >
          {list.map((g, i) => {
            const so = g.total <= 1;
            const rankOn = !so && g.checkins_semana > 0 && g.sua_posicao_semana != null;
            return (
              <Entra key={g.id} i={i} run={run} rm={rm}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); router.push({ pathname: '/grupo', params: { id: g.id } } as any); }} style={styles.card}>
                  {i === 0 && <AlvoGuia chave="lista-card" style={StyleSheet.absoluteFill}><View /></AlvoGuia>}
                  <FaixaGrupo g={g} h={72} />
                  <View style={styles.cardBody}>
                    <Text style={styles.cardNome} numberOfLines={1}>{g.nome}</Text>
                    <View style={styles.cardRow}>
                      <View style={styles.avs}>
                        {/* Cada foto com a moldura da medalha atual dela (08/nov/2026). */}
                        {g.integrantes.slice(0, 5).map((m) => (
                          <FotoComMoldura key={m.user_id} nivel={m.nivel} foto={m.foto} tamanho={44} pequena vazio="#FCE3EE" style={styles.av} />
                        ))}
                      </View>
                      <Text style={styles.hoje}>{so ? 'Só você · convide amigas' : `${g.feitos_hoje} de ${g.total} fizeram hoje`}</Text>
                    </View>
                  </View>
                  <View style={styles.sep} />
                  <View style={styles.rankRow}>
                    <Text style={styles.rank} numberOfLines={1}>
                      {rankOn ? `Você está em ${g.sua_posicao_semana}º esta semana` : 'Semana começa com o primeiro check-in'}
                    </Text>
                    <Icon d="m9 18 6-6-6-6" size={16} color="#B5B5B5" sw={2.4} />
                  </View>
                </TouchableOpacity>
              </Entra>
            );
          })}
          <Entra i={list.length} run={run} rm={rm}>
            <TouchableOpacity activeOpacity={0.7} onPress={abrirFolha} style={styles.criarLink}>
              <AlvoGuia chave="lista-criar" style={{ flexDirection: 'row', alignItems: 'center', gap: styles.criarLink.gap }}>
                <View style={styles.criarCirculo}><Icon d="M12 5v14M5 12h14" size={15} color="#fff" sw={3} /></View>
                <Text style={styles.criarT}>Criar grupo</Text>
              </AlvoGuia>
            </TouchableOpacity>
          </Entra>
        </ScrollView>
      )}

      {/* ── Sem grupo (81d = o vazio da rodada 80) ──────────────────────────── */}
      {grupos && !has && (
        <View style={[styles.vazio, { top: y(150) }]}>
          <Entra i={0} run={run} rm={rm}>
            <View style={{ alignItems: 'center' }}>
              <AlvoGuia chave="lista-vazio" style={{ alignItems: 'center' }}>
              <View style={{ width: 220, height: 196 }}>
                <View style={styles.cartaTras} />
                <View style={styles.cartaFrenteSombra}>
                  <View style={styles.cartaFrente}>
                    <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: CARD_GRAD }]} />
                    <View style={styles.cartaFio} />
                    <Image source={LOGO} style={styles.cartaLogo} />
                    <View style={[StyleSheet.absoluteFill, { mixBlendMode: 'overlay', opacity: 0.55, experimental_backgroundImage: HOLO }]} />
                    <Animated.View pointerEvents="none" style={[styles.brilho, brilhoSt]} />
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
              <Text style={styles.vazioT}>{'Faça skincare com suas amigas\ne vejam quem é mais constante'}</Text>
              <Text style={styles.vazioS}>Check-in com foto todo dia, ranking da semana e a jornada de cada uma</Text>
              </AlvoGuia>
              <AlvoGuia chave="lista-criar" style={{ marginTop: 24 }}>
                <TouchableOpacity activeOpacity={0.85} onPress={abrirFolha} style={styles.criarPilula}>
                  <Icon d="M12 5v14M5 12h14" size={16} color="#fff" sw={2.6} />
                  <Text style={styles.criarPilulaT}>Criar grupo</Text>
                </TouchableOpacity>
              </AlvoGuia>
            </View>
          </Entra>
        </View>
      )}

      {/* ── Folha "Novo grupo" (81e) ────────────────────────────────────── */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]} pointerEvents={aberta ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { haptics.tap(); fecharFolha(); }} accessibilityLabel="Fechar" />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setFolhaH(e.nativeEvent.layout.height)}
        pointerEvents={aberta ? 'auto' : 'none'}
        style={[styles.folha, { paddingBottom: 38 + Math.max(0, insets.bottom - 34) }, folhaSt]}
      >
        <View style={styles.alca} />
        <View style={styles.folhaHead}>
          <Text style={styles.folhaT}>Novo grupo</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); fecharFolha(); }} style={styles.fechar} accessibilityLabel="Fechar">
            <Icon d="M18 6 6 18M6 6l12 12" size={16} color={INK} sw={2.4} />
          </TouchableOpacity>
        </View>
        <View style={styles.nomeCard}>
          <Text style={styles.nomeLabel}>Nome do grupo</Text>
          <TextInput
            value={nome}
            onChangeText={(t) => { setNome(t); if (erro) setErro(''); }}
            placeholder="Ex.: As Hidratadas"
            placeholderTextColor="#A9A3A6"
            selectionColor={PINK}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={criar}
            style={styles.nomeInput}
          />
          <Text style={[styles.nomeDica, !!erro && { color: '#D93A6B' }]}>{erro || 'Depois você convida as amigas pelo link.'}</Text>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={criar} disabled={ocupado} style={[styles.cta, !ok && { opacity: 0.45 }]}>
          {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaT}>Criar grupo</Text>}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F1F4' },
  titleRow: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  back: { position: 'absolute', left: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 4 },

  card: { borderRadius: 16, backgroundColor: '#fff', overflow: 'hidden', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)' },
  faixaLogo: {
    position: 'absolute', left: 16, top: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14 },
  cardNome: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.4, color: INK },
  cardRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avs: { flexDirection: 'row', paddingLeft: 12, marginVertical: -8 },
  av: { marginLeft: -12 },
  hoje: { flexShrink: 1, fontSize: 13, color: MUTE, letterSpacing: -0.1 },
  sep: { height: 1, marginHorizontal: 16, backgroundColor: 'rgba(18,18,18,0.07)' },
  rankRow: { height: 50, paddingLeft: 16, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: PINK },
  criarLink: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  criarCirculo: { width: 26, height: 26, borderRadius: 13, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  criarT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: PINK },

  vazio: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 28 },
  cartaTras: {
    position: 'absolute', left: 40, top: 30, width: 104, height: 142, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(255,94,168,0.35)',
    boxShadow: '0px 10px 24px rgba(200,60,120,0.12)', transform: [{ rotate: '-12deg' }],
  },
  cartaFrenteSombra: {
    position: 'absolute', left: 78, top: 14, width: 112, height: 154, borderRadius: 14,
    boxShadow: '0px 16px 34px rgba(200,60,120,0.24)', transform: [{ rotate: '7deg' }],
  },
  cartaFrente: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  cartaFio: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)' },
  cartaLogo: { position: 'absolute', left: '50%', top: '50%', width: 54, height: 54, marginLeft: -27, marginTop: -27 },
  brilho: {
    position: 'absolute', top: '-30%', bottom: '-30%', left: 0, width: '46%',
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9), rgba(255,255,255,0))',
  },
  vazioT: { marginTop: 20, fontSize: 20, lineHeight: 24, fontWeight: '600', letterSpacing: -0.5, color: INK, textAlign: 'center' },
  vazioS: { marginTop: 6, maxWidth: 280, fontSize: 15, lineHeight: 21, color: MUTE, letterSpacing: -0.1, textAlign: 'center' },
  criarPilula: {
    height: 48, paddingHorizontal: 28, borderRadius: 100, backgroundColor: PINK,
    flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0px 10px 22px rgba(255,94,168,0.35)',
  },
  criarPilulaT: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },

  veu: { backgroundColor: 'rgba(18,18,18,0.34)', zIndex: 40 },
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41, paddingTop: 8, paddingHorizontal: 16,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F6F1F4',
  },
  alca: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#DCD3D8', alignSelf: 'center' },
  folhaHead: { marginTop: 8, height: 44, alignItems: 'center', justifyContent: 'center' },
  folhaT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  fechar: { position: 'absolute', left: -4, top: 4, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  nomeCard: { marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: '#fff' },
  nomeLabel: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.4, color: INK },
  nomeInput: { marginTop: 12, height: 48, paddingHorizontal: 18, borderRadius: 100, backgroundColor: '#F4EFF2', fontSize: 17, letterSpacing: -0.4, color: INK },
  nomeDica: { marginTop: 10, fontSize: 13, lineHeight: 18, color: MUTE },
  cta: { marginTop: 16, height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  ctaT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
});
