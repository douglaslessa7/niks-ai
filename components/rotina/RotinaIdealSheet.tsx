// ─────────────────────────────────────────────────────────────────────────────
// Folha "Rotina ideal" (plano da Rotina, Fase 4 — decisões 7 e 8). Abre de baixo na
// Rotina, pelo card "Faltam N passos… · Ver rotina ideal ›" ou "Ver o que mudou ›".
// Mostra a rotina ideal (só leitura — lib/rotinaIdeal) por período:
//   · ✓ "Na sua rotina" no passo que ela já cobre (e com qual passo dela, se o nome
//     for outro);
//   · "Adicionar à minha rotina" no que falta — copia o passo para a Minha rotina, na
//     ordem da ideal, sem produto (ela escolhe depois);
//   · selo "Novo" no que entrou com o scan novo, e a faixa "Sua rotina ideal mudou".
// Cobre tudo → "Sua rotina cobre tudo o que sua pele precisa ✓".
// Casca da folha = a do Alarme / "Escolher produto" (Modal transparente + véu + translateY).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Animated, Easing, StyleSheet, ActivityIndicator, Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import StepIcon from './StepIcon';
import { getUserId } from '../../lib/currentUser';
import { nomeDoPasso, type MinhaRotina, type Periodo } from '../../lib/minhaRotina';
import { adicionarPassoIdeal, calcularCobertura, type RotinaIdeal } from '../../lib/rotinaIdeal';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const MUTED = '#8A8385';
const SOFT = '#6E6468';

type Props = {
  aberta: boolean;
  periodoInicial: Periodo;
  ideal: RotinaIdeal | null;
  minha: MinhaRotina | null;
  mostrarMudanca: boolean;      // abriu por "Ver o que mudou"
  onClose: () => void;
  onAdicionado: () => Promise<unknown> | void; // recarrega a Minha rotina
};

export default function RotinaIdealSheet({ aberta, periodoInicial, ideal, minha, mostrarMudanca, onClose, onAdicionado }: Props) {
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();

  // Casca: monta, sobe; ao fechar, desce e desmonta.
  const anim = useRef(new Animated.Value(0)).current;
  const [montada, setMontada] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [mudanca, setMudanca] = useState(false);
  useEffect(() => {
    if (aberta) {
      setPeriodo(periodoInicial);
      setMudanca(mostrarMudanca);
      setMontada(true);
      Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setMontada(false));
    }
  }, [aberta, anim]); // eslint-disable-line react-hooks/exhaustive-deps

  const passos = ideal ? ideal[periodo] : [];
  const dela = minha ? minha[periodo] : [];
  const cobertura = useMemo(() => calcularCobertura(passos, dela), [passos, dela]);
  const faltam = passos.filter((p) => !cobertura.has(p.indice)).length;
  const [adicionando, setAdicionando] = useState<number | null>(null);

  const adicionar = async (indice: number) => {
    const p = passos.find((x) => x.indice === indice);
    const uid = await getUserId();
    if (!p || !uid || adicionando !== null) return;
    haptics.action();
    setAdicionando(indice);
    try {
      await adicionarPassoIdeal(uid, p, dela, cobertura);
      await onAdicionado();
    } catch {
      Alert.alert('Não deu para adicionar', 'Verifique sua conexão e tente de novo.');
    } finally {
      setAdicionando(null);
    }
  };

  if (!montada) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.35)', opacity: anim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.sheet, {
        height: H * 0.86,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [H, 0] }) }],
      }]}>
        <View style={s.handle} />
        <View style={s.head}>
          <View style={s.headBtn} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.title}>Rotina ideal</Text>
            <Text style={s.subtitle}>Feita pela IA a partir da sua pele</Text>
          </View>
          <TouchableOpacity onPress={() => { haptics.tap(); onClose(); }} hitSlop={10} style={s.headBtn} accessibilityLabel="Fechar">
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {mudanca && (
            <View style={s.faixa}>
              <Text style={s.faixaTitulo}>Sua rotina ideal mudou com o novo scan</Text>
              <Text style={s.faixaTexto}>
                Os passos novos estão marcados. A sua rotina não muda sozinha: adicione o que quiser.
              </Text>
            </View>
          )}

          {/* Manhã / Noite */}
          <View style={s.seg}>
            {(['am', 'pm'] as const).map((p) => {
              const on = periodo === p;
              return (
                <TouchableOpacity
                  key={p}
                  activeOpacity={0.8}
                  onPress={() => { haptics.select(); setPeriodo(p); }}
                  style={[s.segBtn, on && s.segBtnOn]}
                >
                  <Text style={[s.segTxt, on && { color: INK, fontWeight: '600' }]}>{p === 'am' ? 'Manhã' : 'Noite'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!ideal ? (
            <ActivityIndicator color={PINK} style={{ marginTop: 40 }} />
          ) : passos.length === 0 ? (
            <Text style={s.vazio}>Sua rotina ideal não tem passos {periodo === 'am' ? 'de manhã' : 'à noite'}.</Text>
          ) : (
            <>
              <Text style={s.resumo}>
                {faltam === 0
                  ? 'Sua rotina cobre tudo o que sua pele precisa\u00A0✓'
                  : faltam === 1 ? 'Falta 1 passo na sua rotina' : `Faltam ${faltam} passos na sua rotina`}
              </Text>
              {passos.map((p, n) => {
                const pid = cobertura.get(p.indice);
                const cobridor = pid ? dela.find((x) => x.id === pid) : null;
                const nomeCobridor = cobridor ? nomeDoPasso(cobridor) : null;
                const mesmoNome = !!nomeCobridor && nomeCobridor.trim().toLowerCase() === p.nome.trim().toLowerCase();
                return (
                  <View key={`${periodo}-${p.indice}`} style={[s.card, !!pid && s.cardCoberto]}>
                    <View style={s.tile}><StepIcon tipo={p.tipo} size={24} /></View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.passoN}>Passo {n + 1}</Text>
                        {mudanca && p.novo && <View style={s.novo}><Text style={s.novoTxt}>Novo</Text></View>}
                      </View>
                      <Text style={s.nome} numberOfLines={2}>{p.nome}</Text>
                      {!!p.ingrediente && <Text style={s.ing} numberOfLines={2}>{p.ingrediente}</Text>}
                      {pid ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <View style={s.check}>
                            <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                          </View>
                          <Text style={s.naRotina} numberOfLines={1}>
                            {mesmoNome || !nomeCobridor ? 'Na sua rotina' : `Na sua rotina: ${nomeCobridor}`}
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={adicionando !== null}
                          onPress={() => adicionar(p.indice)}
                          style={s.addBtn}
                        >
                          {adicionando === p.indice
                            ? <ActivityIndicator size="small" color={PINK_TEXT} />
                            : <Text style={s.addTxt}>Adicionar à minha rotina</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 14,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#E3DCDF', alignSelf: 'center', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },
  subtitle: { marginTop: 1, fontSize: 14, letterSpacing: -0.2, color: MUTED },
  faixa: { marginTop: 4, marginBottom: 14, borderRadius: 13, padding: 14, backgroundColor: '#FFF0F6', gap: 4 },
  faixaTitulo: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: PINK_DEEP },
  faixaTexto: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: SOFT },
  seg: { flexDirection: 'row', backgroundColor: '#F7F1F4', borderRadius: 100, padding: 3, marginTop: 4 },
  segBtn: { flex: 1, height: 34, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: '#FFFFFF', shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  segTxt: { fontSize: 15, letterSpacing: -0.2, color: SOFT },
  resumo: { marginTop: 18, marginBottom: 10, fontSize: 18, fontWeight: '600', letterSpacing: -0.4, color: INK },
  vazio: { marginTop: 24, fontSize: 15, lineHeight: 20, color: SOFT, textAlign: 'center' },
  card: {
    flexDirection: 'row', gap: 12, padding: 12, marginBottom: 10, borderRadius: 13,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E6EA',
  },
  cardCoberto: { backgroundColor: '#FFFAFC' },
  tile: { width: 52, height: 52, borderRadius: 11, backgroundColor: '#FFF5F9', alignItems: 'center', justifyContent: 'center' },
  passoN: { fontSize: 13, fontWeight: '500', color: MUTED },
  novo: { paddingHorizontal: 7, height: 18, borderRadius: 9, backgroundColor: PINK, justifyContent: 'center' },
  novoTxt: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  nome: { fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  ing: { fontSize: 14, lineHeight: 19, letterSpacing: -0.2, color: SOFT },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  naRotina: { flex: 1, fontSize: 14, fontWeight: '500', letterSpacing: -0.2, color: PINK_DEEP },
  addBtn: {
    marginTop: 8, alignSelf: 'flex-start', height: 34, paddingHorizontal: 14, borderRadius: 100,
    backgroundColor: '#FFF0F6', alignItems: 'center', justifyContent: 'center', minWidth: 120,
  },
  addTxt: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: PINK_TEXT },
});
