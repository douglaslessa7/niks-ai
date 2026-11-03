import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';
import { useMeusGrupos, type GrupoResumo } from '../../lib/gruposServidor';
import { BANNERS_GRUPO } from '../../app/(app)/seus-grupos';

// ─────────────────────────────────────────────────────────────────────────────
// "Compartilhar com o grupo?" — réplica de 81t (com grupo) e 81u (sem grupo) do Claude
// Design ("NIKS home redesign", NiksGrupoFlo.dc.html, rodada 81: linguagem do Flo).
// Folha branca com alça, no fim da rotina e do scan de produto. Cada grupo é uma linha
// (banner, nome, "x de y fizeram hoje" e o botão de compartilhar): tocar compartilha
// naquele grupo. "Agora não" em pílula cinza. Sem grupo, vira convite: três fotos,
// "Faça skincare com suas amigas", Criar grupo e Agora não.
// Sobe com mola ζ1 .5 s, 120 ms depois do véu (240 ms); desce em 240 ms.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const LOGO = require('../../assets/home/score-logo-pink.png');
const FOTOS = [require('../../assets/review-mariana.png'), require('../../assets/home/profile-photo.png'), require('../../assets/review-larissa.png')];
const SHARE = ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'm16 6-4-4-4 4', 'M12 2v13'];
const EIN = Easing.bezier(0.55, 0, 1, 0.45);
const mola = (z: number, r: number) => ({ stiffness: (2 * Math.PI / r) ** 2, damping: (4 * Math.PI * z) / r, mass: 1 });

type Props = {
  /** Abre (true) / fecha (false). */
  aberta: boolean;
  /** Compartilhando nesse grupo (o botão dele vira o indicador). */
  ocupado?: string | null;
  onCompartilhar: (grupoId: string) => void;
  onCriarGrupo: () => void;
  onFechar: () => void;
};

// Banner do grupo em 44 × 44 (o degradê do grupo ou a foto, com a flor no meio).
function MiniBanner({ g }: { g: GrupoResumo }) {
  if (g.banner === 'foto' && g.banner_url) return <Image source={{ uri: g.banner_url }} style={styles.banner} />;
  const b = g.banner === 'niks-2' ? BANNERS_GRUPO[1] : BANNERS_GRUPO[0];
  return (
    <View style={[styles.banner, { experimental_backgroundImage: b.bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Image source={LOGO} style={{ width: 22, height: 22 }} />
    </View>
  );
}

export default function FolhaCompartilhar({ aberta, ocupado, onCompartilhar, onCriarGrupo, onFechar }: Props) {
  const insets = useSafeAreaInsets();
  const rm = useReducedMotion();
  const { data: grupos } = useMeusGrupos();
  const lista: GrupoResumo[] = grupos ?? [];
  const tem = lista.length > 0;
  const [montada, setMontada] = useState(false);
  const [h, setH] = useState(420);
  const sobe = useSharedValue(0);
  const veu = useSharedValue(0);

  useEffect(() => {
    if (aberta) {
      setMontada(true);
      veu.set(0); sobe.set(0);
      veu.set(withTiming(1, { duration: 240 }));
      sobe.set(rm ? withTiming(1, { duration: 200 }) : withDelay(120, withSpring(1, mola(1, 0.5))));
    } else if (montada) {
      veu.set(withTiming(0, { duration: 200 }));
      sobe.set(withTiming(0, { duration: rm ? 160 : 240, easing: EIN }, (fim) => { if (fim) scheduleOnRN(setMontada, false); }));
    }
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

  const veuSt = useAnimatedStyle(() => ({ opacity: veu.get() }));
  const folhaSt = useAnimatedStyle(() => (rm ? { opacity: sobe.get() } : { transform: [{ translateY: h * (1 - sobe.get()) }] }), [rm, h]);
  if (!montada) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 90 }]} pointerEvents={aberta ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { haptics.tap(); onFechar(); }} accessibilityLabel="Fechar" />
      </Animated.View>
      <Animated.View onLayout={(e) => setH(e.nativeEvent.layout.height)} style={[styles.folha, { paddingBottom: 38 + Math.max(0, insets.bottom - 34) }, folhaSt]}>
        <View style={styles.alca} />
        {tem ? (
          <>
            <Text style={styles.titulo}>Compartilhar com o grupo?</Text>
            <View style={styles.lista}>
              {lista.map((g, i) => (
                <TouchableOpacity
                  key={g.id}
                  activeOpacity={0.7}
                  disabled={!!ocupado}
                  onPress={() => { haptics.action(); onCompartilhar(g.id); }}
                  style={styles.linha}
                  accessibilityLabel={`Compartilhar em ${g.nome}`}
                >
                  <MiniBanner g={g} />
                  <View style={[styles.linhaTexto, { borderBottomColor: i < lista.length - 1 ? 'rgba(18,18,18,0.07)' : 'transparent' }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.gNome} numberOfLines={1}>{g.nome}</Text>
                      <Text style={styles.gHoje}>{g.total <= 1 ? 'Só você' : `${g.feitos_hoje} de ${g.total} fizeram hoje`}</Text>
                    </View>
                    <View style={styles.share}>
                      {ocupado === g.id
                        ? <ActivityIndicator size="small" color={PINK} />
                        : (
                          <Svg width={17} height={17} viewBox="0 0 24 24">
                            {SHARE.map((d) => <Path key={d} d={d} fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />)}
                          </Svg>
                        )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.fotos}>
              {FOTOS.map((f, i) => <Image key={i} source={f} style={styles.foto} />)}
            </View>
            <Text style={[styles.titulo, { marginTop: 16 }]}>Faça skincare com suas amigas</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.action(); onCriarGrupo(); }} style={styles.criar}>
              <Text style={styles.criarT}>Criar grupo</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); onFechar(); }} style={styles.agoraNao}>
          <Text style={styles.agoraNaoT}>Agora não</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: 'rgba(18,18,18,0.34)' },
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 8, paddingHorizontal: 16, backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  alca: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#DCD3D8', alignSelf: 'center' },
  titulo: { marginTop: 20, textAlign: 'center', fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: INK },
  lista: { marginTop: 18, borderRadius: 16, backgroundColor: '#F6F1F4', overflow: 'hidden' },
  linha: { height: 68, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  banner: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' },
  linhaTexto: { flex: 1, minWidth: 0, height: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  gNome: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.4, color: INK },
  gHoje: { fontSize: 13, lineHeight: 17, color: MUTE },
  share: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  fotos: { marginTop: 22, flexDirection: 'row', justifyContent: 'center', paddingLeft: 14 },
  foto: { width: 60, height: 60, marginLeft: -14, borderRadius: 30, borderWidth: 3, borderColor: '#fff', boxShadow: '0px 4px 12px rgba(200,60,120,0.14)' },
  criar: { marginTop: 22, height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  criarT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
  agoraNao: { marginTop: 10, height: 50, borderRadius: 100, backgroundColor: '#F2EDF0', alignItems: 'center', justifyContent: 'center' },
  agoraNaoT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
});
