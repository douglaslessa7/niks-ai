// ─────────────────────────────────────────────────────────────────────────────
// Intro da aba Rotina (plano da Rotina, Fase 7 — decisão 3). Aparece UMA vez por conta,
// na primeira abertura da Rotina (`users.rotina_intro_status` null), inclusive para
// quem já usava o app.
//   · Tela 1 — "Essa é a rotina ideal pra sua pele": os passos da ideal (manhã/noite).
//   · Tela 2 — "Você não precisa comprar nada pra começar…": Escanear meus produtos /
//     Não tenho produtos / Fazer isso depois.
//   · Tela 3 — é a "Sua rotina está pronta" do lote (lote-resultado), depois do scan.
// "Não tenho produtos" e "Fazer isso depois" ficam na rotina ideal com os passos
// vazios; no "depois", a Rotina mostra um card visível para escanear depois.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Animated, Easing, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';
import StepIcon from './StepIcon';
import { haptics } from '../../lib/haptics';
import type { RotinaIdeal, PassoIdeal } from '../../lib/rotinaIdeal';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const MUTED = '#8A8385';
const SOFT = '#6E6468';

export type EscolhaIntro = 'escanear' | 'sem_produtos' | 'depois';

type Props = {
  visivel: boolean;
  ideal: RotinaIdeal | null;
  onEscolha: (e: EscolhaIntro) => void;
};

function Periodo({ titulo, passos, sol }: { titulo: string; passos: PassoIdeal[]; sol: boolean }) {
  if (!passos.length) return null;
  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          {sol
            ? <Path d="M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
            : <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />}
        </Svg>
        <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: INK }}>{titulo}</Text>
      </View>
      {passos.map((p, i) => (
        <View key={`${titulo}-${p.indice}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 10, borderRadius: 13, backgroundColor: '#FFFFFF' }}>
          <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#FFF5F9', alignItems: 'center', justifyContent: 'center' }}>
            <StepIcon tipo={p.tipo} size={22} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }}>Passo {i + 1}</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: INK }} numberOfLines={2}>{p.nome}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function IntroRotina({ visivel, ideal, onEscolha }: Props) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [tela, setTela] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (visivel) { setTela(0); anim.setValue(0); } }, [visivel, anim]);
  const irPara = (t: number) => {
    haptics.tap();
    setTela(t);
    Animated.timing(anim, { toValue: t, duration: 380, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
  };
  const escolher = (e: EscolhaIntro) => { haptics.action(); onEscolha(e); };

  return (
    <Modal visible={visivel} animationType="fade" onRequestClose={() => (tela === 1 ? irPara(0) : undefined)}>
      <LinearGradient colors={['#FFE3EF', '#FFF3F8', '#FFFFFF']} locations={[0, 0.4, 0.8]} style={{ flex: 1 }}>
        <Animated.View style={{ flex: 1, flexDirection: 'row', width: W * 2, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -W] }) }] }}>
          {/* ── Tela 1: a rotina ideal ── */}
          <View style={{ width: W }}>
            <ScrollView contentContainerStyle={{ paddingTop: insets.top + 36, paddingHorizontal: 22, paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: PINK_TEXT }}>Sua rotina</Text>
              <Text style={{ marginTop: 6, fontSize: 30, fontWeight: '700', lineHeight: 35, letterSpacing: -0.8, color: INK }}>
                Essa é a rotina ideal pra sua pele
              </Text>
              <Text style={{ marginTop: 10, fontSize: 16, lineHeight: 22, color: SOFT }}>
                Montada pela IA a partir da sua análise de pele.
              </Text>
              <Periodo titulo="Manhã" passos={ideal?.am ?? []} sol />
              <Periodo titulo="Noite" passos={ideal?.pm ?? []} sol={false} />
            </ScrollView>
            {/* Rodapé com fundo: a lista passa por baixo sem aparecer atrás do botão. */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 14, paddingBottom: insets.bottom + 20, gap: 14, backgroundColor: '#FFFFFF' }}>
              <Pontos ativo={0} />
              <TouchableOpacity onPress={() => irPara(1)} style={{ height: 54, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Tela 2: os produtos que ela já tem ── */}
          <View style={{ width: W, paddingTop: insets.top + 8, paddingHorizontal: 22 }}>
            <TouchableOpacity onPress={() => irPara(0)} hitSlop={10} accessibilityLabel="Voltar" style={{ width: 40, height: 40, justifyContent: 'center' }}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 6l-6 6 6 6" /></Svg>
            </TouchableOpacity>
            <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 220 }}>
              <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
                <Svg width={46} height={46} viewBox="0 0 48 48">
                  <Circle cx={24} cy={24} r={23} fill="#FFF0F6" />
                  {/* frasco + pote */}
                  <Path d="M15 15h6v3h-6zM14 18h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V20a2 2 0 0 1 2-2zM26 25h10v7a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 26 32zM25 22h12v3H25z" fill="none" stroke={PINK_TEXT} strokeWidth={1.8} strokeLinejoin="round" />
                </Svg>
              </View>
              <Text style={{ marginTop: 26, fontSize: 30, fontWeight: '700', lineHeight: 35, letterSpacing: -0.8, color: INK, textAlign: 'center' }}>
                Você não precisa comprar nada pra começar
              </Text>
              <Text style={{ marginTop: 12, fontSize: 17, lineHeight: 24, color: SOFT, textAlign: 'center' }}>
                Me mostra os produtos que você tem em casa e eu monto uma rotina eficaz com eles.
              </Text>
            </View>
            <View style={{ position: 'absolute', left: 22, right: 22, bottom: insets.bottom + 20, gap: 10 }}>
              <Pontos ativo={1} />
              <TouchableOpacity onPress={() => escolher('escanear')} style={{ height: 54, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Escanear meus produtos</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => escolher('sem_produtos')} style={{ height: 50, borderRadius: 100, backgroundColor: '#FFF0F6', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: PINK_TEXT }}>Não tenho produtos</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => escolher('depois')} style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '500', color: SOFT }}>Fazer isso depois</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

function Pontos({ ativo }: { ativo: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ width: i === ativo ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === ativo ? PINK : '#F1CFDE' }} />
      ))}
    </View>
  );
}
