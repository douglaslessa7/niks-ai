// ─────────────────────────────────────────────────────────────────────────────
// Dica do dia — réplica dos designs 56a/56b/56c do Claude Design (projeto "NIKS home
// redesign — rotina skincare", NiksTipFlo.dc.html; 56a = receita no topo, 56b = a
// mesma rolada até "Por que fazer", 56c = dica simples).
// Abre pelo card "Dica do dia" da home e mostra a dica de hoje (lib/dicas/dicaDoDia).
// Tela só de leitura, sem navbar: título grande, Ingredientes + Preparo (só nas
// receitas), "Por que fazer" num card branco (aviso em "ATENÇÃO", frase final em
// destaque) e "Voltar para a home". O cabeçalho com o voltar fica por cima da
// rolagem e ganha fundo rosa + o título depois de 60pt (como no design).
// Fonte = SF Pro (sistema), rosa #FF5EA8. Medidas do frame 393×852 (topo 62 = 54 + 8).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { BG_DAY, BG_STOPS } from '../../lib/homeTheme';
import { getDicaDoDia } from '../../lib/dicas/dicaDoDia';
import { dicaParaTela, DicaTela } from '../../lib/dicas/apresentacao';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const BULB = 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z';

// Linha pontilhada entre os números do preparo (`border-left: 2px dotted`): pontos
// redondos de 2pt a cada 4pt, cortados pela altura disponível. `borderStyle` num
// lado só não funciona no iOS. Os pontos ficam em camada absoluta para não
// esticarem a altura do passo.
function Dotted({ visible }: { visible: boolean }) {
  return (
    <View style={[styles.dotted, { opacity: visible ? 1 : 0 }]}>
      <View style={styles.dots}>
        {Array.from({ length: 80 }, (_, i) => <View key={i} style={styles.dot} />)}
      </View>
    </View>
  );
}

export default function DicaDoDia() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const [dica, setDica] = useState<DicaTela | null>(null);

  // Sem navbar (o design não tem) e a dica de hoje a cada abertura.
  useFocusEffect(useCallback(() => {
    setTabBarVisible(false);
    let vivo = true;
    getDicaDoDia().then((d) => { if (vivo) setDica(dicaParaTela(d)); });
    return () => { vivo = false; setTabBarVisible(true); };
  }, [setTabBarVisible]));

  // Cabeçalho rolado: fundo rosa + desfoque + linha + título (fade de 200 ms).
  const [scrolled, setScrolled] = useState(false);
  const hdrAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(hdrAnim, { toValue: scrolled ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [scrolled, hdrAnim]);

  const back = () => { haptics.tap(); router.navigate('/home' as any); };
  const headerH = insets.top + 8 + 36 + 10;
  const rec = !!dica?.receita;

  return (
    <View style={{ flex: 1, backgroundColor: BG_DAY[BG_DAY.length - 1] }}>
      <StatusBar style="dark" />
      <LinearGradient colors={BG_DAY} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />
      <View style={styles.circleBlob} pointerEvents="none" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { const v = e.nativeEvent.contentOffset.y > 60; if (v !== scrolled) setScrolled(v); }}
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: 40 + insets.bottom }}
      >
        {dica && (
          <>
            <View style={styles.top}>
              <View style={styles.kicker}>
                <View style={styles.kickerIcon}>
                  <Svg width={13} height={13} viewBox="0 0 24 24">
                    <Path d={BULB} fill="none" stroke="#B9761A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
                <Text style={styles.kickerText}>{rec ? 'Dica do dia · Receita' : 'Dica do dia'}</Text>
              </View>
              <Text style={styles.title} lineBreakStrategyIOS="push-out">{dica.titulo}</Text>
            </View>

            {rec && (
              <>
                <Text style={[styles.section, { marginTop: 28 }]}>Ingredientes</Text>
                <View style={styles.ingCard}>
                  {dica.ingredientes.map((g, i) => (
                    <View key={i} style={[styles.ingRow, i > 0 && styles.ingRowLine]}>
                      <View style={styles.ingDot} />
                      <Text style={styles.ingText} lineBreakStrategyIOS="push-out">
                        {g.main}
                        {!!g.note && <Text style={{ color: '#8A8387' }}>{g.note}</Text>}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.section, { marginTop: 30 }]}>Preparo</Text>
                <View style={styles.steps}>
                  {dica.preparo.map((t, i) => (
                    <View key={i} style={styles.stepRow}>
                      <View style={styles.stepLeft}>
                        <View style={[styles.stepNum, i === 0 ? styles.stepNumFirst : styles.stepNumRest]}>
                          <Text style={styles.stepNumText}>{i + 1}</Text>
                        </View>
                        <Dotted visible={i < dica.preparo.length - 1} />
                      </View>
                      <Text style={styles.stepText} lineBreakStrategyIOS="push-out">{t}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.section, { marginTop: rec ? 14 : 28 }]}>Por que fazer</Text>
            <View style={styles.whyCard}>
              {dica.porque.map((p, i) => (
                <Text key={i} style={styles.whyText} lineBreakStrategyIOS="push-out">{p}</Text>
              ))}
              {!!dica.atencao && (
                <View style={styles.callout}>
                  <Text style={styles.calloutLabel}>ATENÇÃO</Text>
                  <Text style={styles.calloutText} lineBreakStrategyIOS="push-out">{dica.atencao}</Text>
                </View>
              )}
              {!!dica.fecho && <Text style={styles.close} lineBreakStrategyIOS="push-out">{dica.fecho}</Text>}
            </View>

            <View style={{ marginTop: 28, alignItems: 'center' }}>
              <TouchableOpacity activeOpacity={0.85} onPress={back} style={styles.cta}>
                <Text style={styles.ctaText}>Voltar para a home</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Cabeçalho por cima da rolagem (sticky do design). */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.headerBg, { opacity: hdrAnim }]}>
          <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,214,231,0.94)' }]} />
        </Animated.View>
        <TouchableOpacity onPress={back} activeOpacity={0.85} style={styles.backBtn} accessibilityLabel="Voltar">
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M15 5l-7 7 7 7" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Animated.Text numberOfLines={1} style={[styles.headerTitle, { opacity: hdrAnim }]}>{dica?.titulo ?? ''}</Animated.Text>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circleWhite: {
    position: 'absolute', width: 620, height: 620, borderRadius: 310,
    left: -330, top: 300, backgroundColor: 'rgba(255,255,255,0.38)',
  },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280,
    left: 190, top: -120, backgroundColor: 'rgba(255,226,236,0.36)',
  },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 18, paddingBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  headerBg: { borderBottomWidth: 1, borderBottomColor: 'rgba(192,32,106,0.10)', overflow: 'hidden' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '500', letterSpacing: -0.3, color: INK },

  top: { paddingTop: 14, paddingHorizontal: 20, gap: 14 },
  kicker: {
    alignSelf: 'flex-start', height: 30, flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingLeft: 5, paddingRight: 12, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.7)',
  },
  kickerIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFE6C9', alignItems: 'center', justifyContent: 'center' },
  kickerText: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: '#3D3A3C' },
  title: { fontSize: 30, fontWeight: '700', lineHeight: 35, letterSpacing: -0.9, color: INK },

  section: { paddingHorizontal: 18, fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK },

  ingCard: {
    marginTop: 10, marginHorizontal: 18, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 4, paddingHorizontal: 18,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1,
  },
  ingRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 13 },
  ingRowLine: { borderTopWidth: 1, borderTopColor: '#F3EDF0' },
  ingDot: { width: 7, height: 7, marginTop: 8, borderRadius: 3.5, backgroundColor: PINK },
  ingText: { flex: 1, fontSize: 17, lineHeight: 23, letterSpacing: -0.3, color: INK },

  steps: { marginTop: 12, paddingLeft: 14, paddingRight: 18 },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  stepLeft: { width: 30, alignItems: 'center' },
  stepNum: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stepNumFirst: { borderWidth: 2, borderColor: PINK },
  stepNumRest: { borderWidth: 1.5, borderColor: '#F4C2D7' },
  stepNumText: { fontSize: 15, fontWeight: '600', color: PINK_TEXT },
  dotted: { flex: 1, minHeight: 12, width: 2, marginVertical: 4, overflow: 'hidden' },
  dots: { position: 'absolute', top: 0, left: 0, gap: 2 },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(192,32,106,0.28)' },
  stepText: { flex: 1, minWidth: 0, paddingTop: 4, paddingBottom: 20, fontSize: 17, lineHeight: 23, letterSpacing: -0.3, color: INK },

  whyCard: {
    marginTop: 10, marginHorizontal: 18, backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingTop: 18, paddingHorizontal: 18, paddingBottom: 20, gap: 14,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 1,
  },
  whyText: { fontSize: 17, lineHeight: 26, letterSpacing: -0.3, color: '#2B2729' },
  callout: { borderRadius: 12, backgroundColor: '#FFF3E3', paddingTop: 14, paddingHorizontal: 14, paddingBottom: 15, gap: 4 },
  calloutLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: '#9A5300' },
  calloutText: { fontSize: 17, lineHeight: 25, letterSpacing: -0.3, color: '#4A3524' },
  close: { fontSize: 19, fontWeight: '600', lineHeight: 26, letterSpacing: -0.45, color: INK },

  cta: {
    height: 48, paddingHorizontal: 30, borderRadius: 100, backgroundColor: PINK, justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  ctaText: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' },
});
