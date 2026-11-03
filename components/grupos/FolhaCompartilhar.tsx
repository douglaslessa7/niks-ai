import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet, AccessibilityInfo, Pressable, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { useMeusGrupos, type GrupoResumo } from '../../lib/gruposServidor';
import { BANNERS_GRUPO } from '../../app/(app)/seus-grupos';

// ─────────────────────────────────────────────────────────────────────────────
// "Compartilhar com o grupo?" — réplica de 80o (com grupo) e 80p (sem grupo) do Claude
// Design (NiksGrupoV2.dc.html). Sobe 500 ms depois da tela, com mola ζ.9 .55 s
// (rigidez (2π/.55)², amortecimento 4π·.9/.55) e o véu em 420 ms; desce em 360 ms.
// Com grupo: os grupos dela (o primeiro já marcado, toque alterna), Compartilhar e
// Agora não. Sem grupo: vira convite — "Faça skincare com suas amigas", + Criar grupo.
// O design desfoca a tela de trás (6 px); aqui só o véu (blur ao vivo de uma tela
// inteira não vale o custo).
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const SAIDA = Easing.bezier(0.32, 0.72, 0, 1);
const LOGO = require('../../assets/home/score-logo-pink.png');
const PEOPLE = ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'];

type Props = {
  /** Abre (true) / fecha (false). */
  aberta: boolean;
  /** Texto de baixo do título, com grupo (ex.: "Sua rotina da manhã entra no mural…"). */
  sub: string;
  ocupado?: boolean;
  onCompartilhar: (grupos: string[]) => void;
  onCriarGrupo: () => void;
  onFechar: () => void;
};

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setRm).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => sub.remove();
  }, []);
  return rm;
}

// Banner do grupo em 44 × 44 (design: o degradê e a logo 40 pt saindo pelo canto).
function MiniBanner({ g }: { g: GrupoResumo }) {
  if (g.banner === 'foto' && g.banner_url) return <Image source={{ uri: g.banner_url }} style={styles.banner} />;
  const b = BANNERS_GRUPO.find((x) => x.key === g.banner) ?? BANNERS_GRUPO[0];
  return (
    <View style={[styles.banner, { experimental_backgroundImage: b.bg }]}>
      <Image source={LOGO} style={{ position: 'absolute', right: -8, top: -8, width: 40, height: 40, opacity: 0.55 }} />
    </View>
  );
}

export default function FolhaCompartilhar({ aberta, sub, ocupado, onCompartilhar, onCriarGrupo, onFechar }: Props) {
  const insets = useSafeAreaInsets();
  const rm = useReduceMotion();
  const { data: grupos } = useMeusGrupos();
  const lista: GrupoResumo[] = grupos ?? [];
  const tem = lista.length > 0;
  const [sel, setSel] = useState<string[]>([]);
  const [montada, setMontada] = useState(false);
  const [h, setH] = useState(520);
  const y = useRef(new Animated.Value(0)).current;     // 0 = fora, 1 = no lugar
  const veu = useRef(new Animated.Value(0)).current;

  // O primeiro grupo já vem marcado a cada abertura.
  useEffect(() => { if (aberta) setSel(lista[0] ? [lista[0].id] : []); }, [aberta, lista[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (aberta) {
      setMontada(true);
      y.setValue(0); veu.setValue(0);
      if (rm) {
        Animated.parallel([
          Animated.timing(y, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(veu, { toValue: 1, duration: 260, useNativeDriver: true }),
        ]).start();
      } else {
        Animated.parallel([
          Animated.spring(y, { toValue: 1, stiffness: 130.5, damping: 20.56, mass: 1, useNativeDriver: true }),
          Animated.timing(veu, { toValue: 1, duration: 420, easing: EO, useNativeDriver: true }),
        ]).start();
      }
    } else if (montada) {
      Animated.parallel([
        Animated.timing(y, { toValue: 0, duration: rm ? 200 : 360, easing: SAIDA, useNativeDriver: true }),
        Animated.timing(veu, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setMontada(false));
    }
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!montada) return null;
  const alternar = (id: string) => {
    haptics.select();
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const folhaSt = rm
    ? { opacity: y }
    : { transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [h * 1.1, 0] }) }] };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 90 }]} pointerEvents={aberta ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, { opacity: veu }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar" />
      </Animated.View>
      <Animated.View onLayout={(e) => setH(e.nativeEvent.layout.height)} style={[styles.folha, { paddingBottom: 40 + Math.max(0, insets.bottom - 34) }, folhaSt]}>
        <View style={styles.handle} />
        <View style={styles.icone}>
          <Svg width={26} height={26} viewBox="0 0 24 24">
            {PEOPLE.map((d, i) => <Path key={i} d={d} fill="none" stroke={PINK} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />)}
            <Circle cx={9} cy={7} r={4} fill="none" stroke={PINK} strokeWidth={1.9} />
          </Svg>
        </View>
        <Text style={styles.titulo}>{tem ? 'Compartilhar com o grupo?' : 'Faça skincare com suas amigas'}</Text>
        <Text style={styles.sub}>{tem ? sub : 'Crie um grupo, façam check-in todo dia e vejam quem é mais constante.'}</Text>
        {tem && (
          <View style={{ marginTop: 16, gap: 8 }}>
            {lista.map((g) => {
              const on = sel.includes(g.id);
              return (
                <TouchableOpacity
                  key={g.id}
                  activeOpacity={0.8}
                  onPress={() => alternar(g.id)}
                  style={[styles.linha, { borderColor: on ? PINK : 'rgba(18,18,18,0.10)', backgroundColor: on ? '#FFF0F7' : '#fff' }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <MiniBanner g={g} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.gNome} numberOfLines={1}>{g.nome}</Text>
                    <Text style={styles.gSub}>{g.total === 1 ? 'Só você' : `${g.total} integrantes`}</Text>
                  </View>
                  <View style={[styles.radio, on ? styles.radioOn : null]}>
                    {on && (
                      <Svg width={12} height={12} viewBox="0 0 24 24">
                        <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={ocupado || (tem && sel.length === 0)}
          onPress={() => { haptics.action(); if (tem) onCompartilhar(sel); else onCriarGrupo(); }}
          style={[styles.cta, tem && sel.length === 0 && { opacity: 0.45 }]}
        >
          {ocupado ? <ActivityIndicator color="#fff" /> : (
            <>
              {!tem && (
                <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" /></Svg>
              )}
              <Text style={styles.ctaT}>{tem ? 'Compartilhar' : 'Criar grupo'}</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); onFechar(); }} style={styles.agoraNao} hitSlop={8}>
          <Text style={styles.agoraNaoT}>Agora não</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: 'rgba(60,20,40,0.32)' },
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 24, backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, boxShadow: '0px -10px 30px rgba(190,70,120,0.12)',
  },
  handle: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#F0F0F0', alignSelf: 'center' },
  icone: { marginTop: 22, width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF0F7', alignItems: 'center', justifyContent: 'center' },
  titulo: { marginTop: 16, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.7, color: INK },
  sub: { marginTop: 8, fontSize: 15, lineHeight: 21, color: '#515151', letterSpacing: -0.2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1.5 },
  banner: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' },
  gNome: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3, color: INK },
  gSub: { marginTop: 1, fontSize: 13, lineHeight: 16, color: MUTE, letterSpacing: -0.1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(18,18,18,0.2)', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: PINK, backgroundColor: PINK },
  cta: {
    marginTop: 18, height: 52, borderRadius: 100, backgroundColor: PINK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: '0px 6px 12px rgba(255,94,168,0.45)',
  },
  ctaT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  agoraNao: { marginTop: 14, alignSelf: 'center' },
  agoraNaoT: { fontSize: 15, fontWeight: '600', color: PINK, letterSpacing: -0.2 },
});
