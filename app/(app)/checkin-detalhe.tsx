// ─────────────────────────────────────────────────────────────────────────────
// Detalhes de um check-in (09/nov/2026). Abre ao tocar num check-in do mural do grupo (o meu
// ou o de uma amiga) e num dia do calendário de check-ins (aba Grupos e Suas conquistas).
// Referência: tela de detalhes de outro app (foto grande, quem fez, quando, título), adaptada
// ao NIKS — fundo rosado, foto em card branco, moldura da medalha. O que a referência tem e o
// NIKS não guarda (mapa/local, reações, comentários, produtos do check-in) fica de fora.
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
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import FotoComMoldura from '../../components/medalhas/FotoComMoldura';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { bloquear, checkinDetalhe, denunciar, type CheckinDetalhe } from '../../lib/gruposServidor';
import { invalidateCachePrefixo } from '../../lib/cache';
import VoltarPelaBorda from '../../components/VoltarPelaBorda';

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
function Pontos() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      {[5, 12, 19].map((x) => <Circle key={x} cx={x} cy={12} r={1.9} fill={INK} />)}
    </Svg>
  );
}

type Estado = { tipo: 'carregando' } | { tipo: 'pronto'; c: CheckinDetalhe } | { tipo: 'indisponivel' };

function Pagina({ id, largura, rm, onCarregou }: { id: string; largura: number; rm: boolean; onCarregou: (c: CheckinDetalhe | null) => void }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  useEffect(() => {
    let vivo = true;
    checkinDetalhe(id)
      .then((c) => { if (!vivo) return; setEstado(c ? { tipo: 'pronto', c } : { tipo: 'indisponivel' }); onCarregou(c); })
      .catch(() => { if (!vivo) return; setEstado({ tipo: 'indisponivel' }); onCarregou(null); });
    return () => { vivo = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const entra = useSharedValue(0);
  useEffect(() => {
    if (estado.tipo === 'carregando') return;
    entra.set(withTiming(1, { duration: rm ? 200 : 320, easing: EO }));
  }, [estado.tipo, rm, entra]);
  const st = useAnimatedStyle(() => (rm
    ? { opacity: entra.get() }
    : { opacity: entra.get(), transform: [{ translateY: 8 * (1 - entra.get()) }] }), [rm]);

  if (estado.tipo === 'carregando') {
    return <View style={[styles.pagina, { width: largura, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={PINK} /></View>;
  }
  if (estado.tipo === 'indisponivel') {
    return (
      <Animated.View style={[styles.pagina, { width: largura, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }, st]}>
        <Text style={styles.indisponivel}>Este check-in não está mais disponível.</Text>
      </Animated.View>
    );
  }
  const c = estado.c;
  const fotoL = largura - 32;
  return (
    <Animated.View style={[styles.pagina, { width: largura }, st]}>
      <View style={[styles.fotoCard, { width: fotoL, height: Math.round(fotoL * 4 / 3) }]}>
        {c.foto_url ? <Image source={{ uri: c.foto_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} /> : null}
      </View>
      <View style={styles.quem}>
        <FotoComMoldura nivel={c.autora.nivel} foto={c.autora.foto} nome={c.autora.nome} tamanho={44} pequena vazio="#F6D3E1" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.nome} numberOfLines={1}>{c.voce ? 'Você' : c.autora.nome}</Text>
          <Text style={styles.quando} numberOfLines={1}>{quando(c)}</Text>
        </View>
      </View>
      <Text style={styles.titulo}>{c.titulo}</Text>
      {!!c.descricao && <Text style={styles.descricao}>{c.descricao}</Text>}
    </Animated.View>
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
  const [carregados, setCarregados] = useState<Record<string, CheckinDetalhe | null>>({});
  const atual = carregados[ids[pagina]] ?? null;
  const scrollRef = useRef<ScrollView>(null);

  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  useFocusEffect(useCallback(() => {
    setTabBarVisible(false);
    return () => setTabBarVisible(true);
  }, [setTabBarVisible]));

  // Aba oculta do <Tabs>: `router.back()` cairia na home. Volta para quem abriu.
  const voltar = () => {
    haptics.tap();
    if (params.grupo) router.navigate({ pathname: '/grupo', params: { id: params.grupo } } as any);
    else router.navigate((params.volta || '/grupos') as any);
  };

  // ── Folha "…" ────────────────────────────────────────────────────────────────
  const [folha, setFolha] = useState(false);
  const [folhaH, setFolhaH] = useState(220);
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

  const menu = !!atual && !atual.voce;
  return (
    <VoltarPelaBorda onVoltar={() => { if (params.grupo) router.navigate({ pathname: '/grupo', params: { id: params.grupo } } as any); else router.navigate((params.volta || '/grupos') as any); }} ativo={!folha}>
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="dark" />
      <View style={[styles.topo, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={voltar} style={styles.redondo} accessibilityLabel="Voltar">
          <Icone d="m15 18-6-6 6-6" />
        </TouchableOpacity>
        {menu ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <TouchableOpacity activeOpacity={0.7} onPress={abrirFolha} style={styles.redondo} accessibilityLabel="Mais opções">
              <Pontos />
            </TouchableOpacity>
          </Animated.View>
        ) : <View style={{ width: 40 }} />}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={ids.length > 1}
        onMomentumScrollEnd={(e) => {
          const n = Math.round(e.nativeEvent.contentOffset.x / W);
          if (n !== pagina) { haptics.select(); setPagina(n); }
        }}
        style={{ flex: 1 }}
      >
        {ids.map((id) => (
          <ScrollView key={id} style={{ width: W }} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
            <Pagina id={id} largura={W} rm={rm} onCarregou={(c) => setCarregados((m) => ({ ...m, [id]: c }))} />
          </ScrollView>
        ))}
        {!ids.length && (
          <View style={[styles.pagina, { width: W, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
            <Text style={styles.indisponivel}>Este check-in não está mais disponível.</Text>
          </View>
        )}
      </ScrollView>

      {ids.length > 1 && (
        <View style={[styles.pontos, { bottom: insets.bottom + 12 }]} pointerEvents="none">
          {ids.map((id, i) => <View key={id} style={[styles.ponto, i === pagina && styles.pontoOn]} />)}
        </View>
      )}

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
    </View>
    </VoltarPelaBorda>
  );
}

const styles = StyleSheet.create({
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  redondo: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 2px 8px rgba(192,32,106,0.10)',
  },
  pagina: { paddingTop: 4, minHeight: 300 },
  fotoCard: {
    alignSelf: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: '#FCE3EE',
    borderWidth: 3, borderColor: '#FFFFFF',
  },
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
