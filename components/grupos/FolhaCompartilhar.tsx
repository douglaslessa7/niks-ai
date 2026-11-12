import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator, Image, Switch, ScrollView, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from '../../lib/haptics';
import { useMeusGrupos, type GrupoResumo } from '../../lib/gruposServidor';
import { BANNERS_GRUPO } from '../../app/(app)/seus-grupos';

// ─────────────────────────────────────────────────────────────────────────────
// "Compartilhar com o grupo?" — 81t (com grupo) e 81u (sem grupo) do Claude Design (rodada
// 81, linguagem do Flo), no fim do skincare e do scan de produto.
// 05/nov/2026, pedido do produto: vira um POP-UP NO MEIO DA TELA (card branco centrado sobre
// o véu, no lugar da folha que subia de baixo) e cada grupo ganha um botão de ATIVAR/DESATIVAR
// ao lado do nome (todos começam ativados, como o Novo check-in). "Compartilhar" usa só os
// grupos ativados (apagado com nenhum); "Agora não" em pílula cinza. Sem grupo, o convite:
// três fotos, "Faça skincare com suas amigas", Criar grupo e Agora não.
// Entrada: o véu esmaece (200 ms) e o card cresce de 96% com fade (240 ms, ease-out forte);
// saída em 160 ms. "Reduzir movimento": só esmaece.
// `semEscolha` (12/nov/2026, fim do skincare): sem a lista; os banners dos grupos e
// "Compartilhar com o grupo" — os grupos são escolhidos na tela do check-in.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const LOGO = require('../../assets/home/score-logo-pink.png');
const FOTOS = [require('../../assets/review-mariana.png'), require('../../assets/home/profile-photo.png'), require('../../assets/review-larissa.png')];
const EO = Easing.bezier(0.23, 1, 0.32, 1);

type Props = {
  /** Abre (true) / fecha (false). */
  aberta: boolean;
  /** Compartilhando: o botão "Compartilhar" vira o indicador. */
  ocupado?: boolean | string | null;
  /** Os grupos ATIVADOS (pelo menos um). */
  onCompartilhar: (grupoIds: string[]) => void;
  onCriarGrupo: () => void;
  onFechar: () => void;
  /** Sem a lista de grupos (fim do skincare, 12/nov/2026): "Compartilhar com o grupo" manda
   *  TODOS, e ela escolhe os grupos na tela do check-in. */
  semEscolha?: boolean;
};

// Banner do grupo (o degradê do grupo ou a foto, com a flor no meio). 44 × 44 por padrão.
export function MiniBanner({ g, tamanho = 44, redondo = false, style }: { g: GrupoResumo; tamanho?: number; redondo?: boolean; style?: object }) {
  const caixa = [styles.banner, { width: tamanho, height: tamanho, borderRadius: redondo ? tamanho / 2 : tamanho * 0.27 }, style];
  if (g.banner === 'foto' && g.banner_url) return <Image source={{ uri: g.banner_url }} style={caixa} />;
  const b = g.banner === 'niks-2' ? BANNERS_GRUPO[1] : BANNERS_GRUPO[0];
  return (
    <View style={[caixa, { experimental_backgroundImage: b.bg, alignItems: 'center', justifyContent: 'center' }]}>
      <Image source={LOGO} style={{ width: tamanho / 2, height: tamanho / 2 }} />
    </View>
  );
}

export default function FolhaCompartilhar({ aberta, ocupado, onCompartilhar, onCriarGrupo, onFechar, semEscolha = false }: Props) {
  const rm = useReducedMotion();
  const { width: W, height: H } = useWindowDimensions();
  const { data: grupos } = useMeusGrupos();
  const lista: GrupoResumo[] = grupos ?? [];
  const tem = lista.length > 0;
  const [montada, setMontada] = useState(false);
  // Grupos DESATIVADOS (todos começam ativados; um grupo novo na lista já entra ativado).
  const [desligados, setDesligados] = useState<string[]>([]);
  const ativos = lista.filter((g) => !desligados.includes(g.id)).map((g) => g.id);
  const v = useSharedValue(0);
  const veu = useSharedValue(0);

  useEffect(() => {
    if (aberta) {
      setMontada(true);
      setDesligados([]);
      veu.set(0); v.set(0);
      veu.set(withTiming(1, { duration: 200 }));
      v.set(withTiming(1, { duration: rm ? 200 : 240, easing: EO }));
    } else if (montada) {
      veu.set(withTiming(0, { duration: 160 }));
      v.set(withTiming(0, { duration: 160, easing: EO }, (fim) => { if (fim) scheduleOnRN(setMontada, false); }));
    }
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

  const veuSt = useAnimatedStyle(() => ({ opacity: veu.get() }));
  const cardSt = useAnimatedStyle(() => (rm
    ? { opacity: v.get() }
    : { opacity: v.get(), transform: [{ scale: 0.96 + 0.04 * v.get() }] }), [rm]);
  if (!montada) return null;

  const alternar = (id: string) => {
    haptics.select();
    setDesligados((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  };
  const ocupadoAgora = Boolean(ocupado);
  const pode = ativos.length > 0 && !ocupadoAgora;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 90 }]} pointerEvents={aberta ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar" />
      </Animated.View>
      <View style={styles.centro} pointerEvents="box-none">
        <Animated.View style={[styles.card, { width: Math.min(W - 40, 360), maxHeight: H * 0.8 }, cardSt]}>
          {tem ? (
            <>
              <Text style={styles.titulo}>Compartilhar com o grupo?</Text>
              {semEscolha ? (
                <View style={styles.bannersSem}>
                  {lista.slice(0, 4).map((g, i) => <MiniBanner key={g.id} g={g} tamanho={52} redondo style={[styles.bannerSem, i > 0 && { marginLeft: -14 }]} />)}
                </View>
              ) : (
              <ScrollView style={styles.lista} bounces={false} showsVerticalScrollIndicator={false}>
                {lista.map((g, i) => {
                  const ligado = !desligados.includes(g.id);
                  return (
                    <View key={g.id} style={styles.linha}>
                      <MiniBanner g={g} />
                      <View style={[styles.linhaTexto, { borderBottomColor: i < lista.length - 1 ? 'rgba(18,18,18,0.07)' : 'transparent' }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.gNome} numberOfLines={1}>{g.nome}</Text>
                          <Text style={styles.gHoje}>{g.total <= 1 ? 'Só você' : `${g.feitos_hoje} de ${g.total} fizeram hoje`}</Text>
                        </View>
                        {/* Caixa do tamanho do Switch do iOS: sem ela, na nova arquitetura ele
                            fica preso no topo da linha em vez de centrado. */}
                        <View style={styles.chave}>
                          <Switch
                            value={ligado}
                            onValueChange={() => alternar(g.id)}
                            disabled={ocupadoAgora}
                            trackColor={{ false: '#E5DEE2', true: PINK }}
                            ios_backgroundColor="#E5DEE2"
                            accessibilityLabel={`Compartilhar em ${g.nome}`}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              )}
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!pode}
                onPress={() => { haptics.action(); onCompartilhar(semEscolha ? lista.map((g) => g.id) : ativos); }}
                style={[styles.criar, !pode && !ocupadoAgora && { opacity: 0.4 }]}
                accessibilityState={{ disabled: !pode }}
              >
                {ocupadoAgora ? <ActivityIndicator color="#fff" /> : <Text style={styles.criarT}>{semEscolha ? 'Compartilhar com o grupo' : 'Compartilhar'}</Text>}
              </TouchableOpacity>
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
          <TouchableOpacity activeOpacity={0.7} disabled={ocupadoAgora} onPress={() => { haptics.tap(); onFechar(); }} style={styles.agoraNao}>
            <Text style={styles.agoraNaoT}>Agora não</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: 'rgba(18,18,18,0.34)' },
  centro: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  card: {
    paddingTop: 22, paddingHorizontal: 16, paddingBottom: 16, borderRadius: 24, backgroundColor: '#fff',
    boxShadow: '0px 18px 44px rgba(18,18,18,0.18)',
  },
  titulo: { marginTop: 2, textAlign: 'center', fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.6, color: INK },
  lista: { marginTop: 18, flexGrow: 0, borderRadius: 16, backgroundColor: '#F6F1F4' },
  linha: { height: 68, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  banner: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden' },
  linhaTexto: { flex: 1, minWidth: 0, height: 68, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  gNome: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.4, color: INK },
  gHoje: { fontSize: 13, lineHeight: 17, color: MUTE },
  chave: { width: 51, height: 31, alignItems: 'center', justifyContent: 'center' },
  bannersSem: { marginTop: 18, flexDirection: 'row', justifyContent: 'center' },
  bannerSem: { borderWidth: 3, borderColor: '#fff', boxShadow: '0px 4px 12px rgba(200,60,120,0.14)' },
  fotos: { marginTop: 6, flexDirection: 'row', justifyContent: 'center', paddingLeft: 14 },
  foto: { width: 60, height: 60, marginLeft: -14, borderRadius: 30, borderWidth: 3, borderColor: '#fff', boxShadow: '0px 4px 12px rgba(200,60,120,0.14)' },
  criar: { marginTop: 18, height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  criarT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
  agoraNao: { marginTop: 10, height: 50, borderRadius: 100, backgroundColor: '#F2EDF0', alignItems: 'center', justifyContent: 'center' },
  agoraNaoT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
});
