// ─────────────────────────────────────────────────────────────────────────────
// Folha "Rotina ideal" — réplica do Claude Design (NiksIdealFlo, telas 53n/53o).
// Abre de baixo na Rotina, pelo card "Ver rotina ideal ›" (ou "Ver o que mudou ›").
// Mostra a rotina ideal (só leitura — lib/rotinaIdeal) por período:
//   · resumo rosa: "Você já tem K dos N passos" / "Sua rotina tem todos os passos
//     ideais" + barra segmentada (um segmento por passo da ideal);
//   · "Para adicionar à sua rotina": cards com "Adicionar à rotina" — copia o passo
//     para a Minha rotina, na ordem da ideal, sem produto (ela escolhe depois);
//   · "Já está na sua rotina": ✓ + nome + produto que ela usa; o passo recém-
//     adicionado ganha a etiqueta "Novo" e "Sem produto ainda · escolha na sua rotina".
// Casca: véu + folha que sobe (top 70, cantos 20), como no design.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Animated, Easing, StyleSheet, ActivityIndicator, Alert,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Image as ExpoImage } from 'expo-image';
import { getUserId } from '../../lib/currentUser';
import type { MinhaRotina, Periodo } from '../../lib/minhaRotina';
import { adicionarPassoIdeal, calcularCobertura, type RotinaIdeal } from '../../lib/rotinaIdeal';
import { ROTULO_TIPO } from '../../lib/tipoPasso';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const MUTED = '#8A8387';
const SOFT = '#6E6468';
const BODY = '#3D3A3C';
const TOPO = 70; // a folha começa a 70 do topo da tela (design)

type Props = {
  aberta: boolean;
  periodoInicial: Periodo;
  ideal: RotinaIdeal | null;
  minha: MinhaRotina | null;
  mostrarMudanca: boolean;      // abriu por "Ver o que mudou"
  onClose: () => void;
  onAdicionado: () => Promise<unknown> | void; // recarrega a Minha rotina
};

const Check = ({ size, stroke }: { size: number; stroke: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
const Mais = ({ size, stroke, color }: { size: number; stroke: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 5v14M5 12h14" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
  </Svg>
);

export default function RotinaIdealSheet({ aberta, periodoInicial, ideal, minha, mostrarMudanca, onClose, onAdicionado }: Props) {
  const { height: H } = useWindowDimensions();

  // Casca: monta, sobe; ao fechar, desce e desmonta.
  const anim = useRef(new Animated.Value(0)).current;
  const [montada, setMontada] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [mudanca, setMudanca] = useState(false);
  // Passos adicionados NESTA abertura (índice na ideal) → etiqueta "Novo" e textos do resumo.
  const [adicionados, setAdicionados] = useState<{ am: number[]; pm: number[] }>({ am: [], pm: [] });
  const [fresco, setFresco] = useState<number | null>(null);
  useEffect(() => {
    if (aberta) {
      setPeriodo(periodoInicial);
      setMudanca(mostrarMudanca);
      setAdicionados({ am: [], pm: [] });
      setFresco(null);
      setMontada(true);
      Animated.timing(anim, { toValue: 1, duration: 420, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 300, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start(() => setMontada(false));
    }
  }, [aberta, anim]); // eslint-disable-line react-hooks/exhaustive-deps

  const passos = ideal ? ideal[periodo] : [];
  const dela = minha ? minha[periodo] : [];
  const cobertura = useMemo(() => calcularCobertura(passos, dela), [passos, dela]);
  const temLista = passos.filter((p) => cobertura.has(p.indice));
  const faltamLista = passos.filter((p) => !cobertura.has(p.indice));
  const n = passos.length;
  const k = temLista.length;
  const nm = faltamLista.length;
  const novos = adicionados[periodo];
  const algumAdicionado = novos.length > 0;
  const [adicionando, setAdicionando] = useState<number | null>(null);

  const adicionar = async (indice: number) => {
    const p = passos.find((x) => x.indice === indice);
    const uid = await getUserId();
    if (!p || !uid || adicionando !== null) return;
    haptics.action();
    setAdicionando(indice);
    try {
      await adicionarPassoIdeal(uid, p, dela, cobertura);
      setAdicionados((a) => ({ ...a, [periodo]: a[periodo].includes(indice) ? a[periodo] : [...a[periodo], indice] }));
      setFresco(indice);
      await onAdicionado();
    } catch {
      Alert.alert('Não deu para adicionar', 'Verifique sua conexão e tente de novo.');
    } finally {
      setAdicionando(null);
    }
  };

  if (!montada) return null;

  const segOn = { backgroundColor: '#FFFFFF', shadowColor: '#783C48', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 5 };
  const resumoTitulo = nm > 0
    ? `Você já tem ${k} dos ${n} passos`
    : (algumAdicionado ? 'Agora sua rotina tem todos os passos ideais' : 'Sua rotina tem todos os passos ideais');
  const resumoSub = nm > 0
    ? (nm === 1 ? 'O outro é uma sugestão para você adicionar no seu ritmo.' : `Os outros ${nm} são sugestões para você adicionar no seu ritmo.`)
    : (algumAdicionado ? 'Escolha os produtos dos passos novos na tela de Rotina.' : 'Agora é manter a constância, dia após dia.');

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.35)', opacity: anim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.sheet, {
        top: TOPO,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [(H - TOPO) * 1.05, 0] }) }],
      }]}>
        {/* Cabeçalho fixo: alça, título + fechar, Manhã/Noite */}
        <View style={{ paddingTop: 8, paddingHorizontal: 20 }}>
          <View style={s.handle} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ gap: 2 }}>
              <Text style={s.title}>Rotina ideal</Text>
              <Text style={s.subtitle}>Feita pela NIKS para a sua pele</Text>
            </View>
            <TouchableOpacity onPress={() => { haptics.tap(); onClose(); }} activeOpacity={0.7} style={s.fechar} accessibilityLabel="Fechar">
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path d="M6 6l12 12M18 6L6 18" fill="none" stroke={SOFT} strokeWidth={2.6} strokeLinecap="round" />
              </Svg>
            </TouchableOpacity>
          </View>
          <View style={s.seg}>
            {(['am', 'pm'] as const).map((p) => {
              const on = periodo === p;
              return (
                <TouchableOpacity
                  key={p}
                  activeOpacity={0.8}
                  onPress={() => { haptics.select(); setPeriodo(p); setFresco(null); }}
                  style={[s.segBtn, on && segOn]}
                >
                  <Text style={[s.segTxt, on ? { color: INK, fontWeight: '600' } : { color: SOFT, fontWeight: '500' }]}>
                    {p === 'am' ? 'Manhã' : 'Noite'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
          {mudanca && (
            <View style={s.faixa}>
              <Text style={s.faixaTitulo}>Sua rotina ideal mudou com o novo scan</Text>
              <Text style={s.faixaTexto}>
                Os passos novos estão marcados. A sua rotina não muda sozinha: adicione o que quiser.
              </Text>
            </View>
          )}

          {!ideal ? (
            <ActivityIndicator color={PINK} style={{ marginTop: 40 }} />
          ) : n === 0 ? (
            <Text style={s.vazio}>Sua rotina ideal não tem passos {periodo === 'am' ? 'de manhã' : 'à noite'}.</Text>
          ) : (
            <>
              {/* Resumo + barra segmentada */}
              <View style={s.resumo}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  {nm === 0 && <View style={s.resumoCheck}><Check size={14} stroke={3.2} /></View>}
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.resumoTitulo}>{resumoTitulo}</Text>
                    <Text style={s.resumoSub}>{resumoSub}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {passos.map((p) => (
                    <View key={`seg-${periodo}-${p.indice}`} style={[s.segmento, { backgroundColor: cobertura.has(p.indice) ? PINK : '#F6D9E5' }]} />
                  ))}
                </View>
              </View>

              {/* Para adicionar */}
              {nm > 0 && (
                <>
                  <Text style={s.secao}>Para adicionar à sua rotina</Text>
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {faltamLista.map((p) => (
                      <View key={`${periodo}-${p.indice}`} style={s.faltaCard}>
                        <View style={s.faltaTile}><Mais size={18} stroke={2.2} color={PINK_TEXT} /></View>
                        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                          <Text style={s.kicker}>
                            {p.tipo ? `Passo ${p.indice + 1} · ${ROTULO_TIPO[p.tipo]}` : `Passo ${p.indice + 1}`}
                          </Text>
                          <Text style={s.faltaNome}>{p.nome}</Text>
                          {!!p.ingrediente && <Text style={s.faltaPorque}>{p.ingrediente}</Text>}
                          <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={adicionando !== null}
                            onPress={() => adicionar(p.indice)}
                            style={s.addBtn}
                          >
                            {adicionando === p.indice ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Mais size={15} stroke={2.6} color="#FFFFFF" />
                                <Text style={s.addTxt}>Adicionar à rotina</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Já está na sua rotina */}
              {k > 0 && (
                <>
                  <Text style={s.secao}>Já está na sua rotina</Text>
                  <View style={s.temLista}>
                    {temLista.map((p, i) => {
                      const pid = cobertura.get(p.indice);
                      const passo = pid ? dela.find((x) => x.id === pid) : null;
                      const prod = passo?.produto && (passo.produto.recorteUrl || passo.produto.imagemUrl) ? passo.produto : null;
                      const ehNovo = novos.includes(p.indice) || (mudanca && p.novo);
                      const linha = novos.includes(p.indice)
                        ? 'Sem produto ainda · escolha na sua rotina'
                        : prod ? [prod.marca, prod.nome].filter(Boolean).join(' · ') : 'Escolher produto';
                      return (
                        <View
                          key={`${periodo}-tem-${p.indice}`}
                          style={[s.temLinha, i > 0 && s.temLinhaBorda, { backgroundColor: novos.includes(p.indice) && p.indice === fresco ? '#FFF5F9' : '#FFFFFF' }]}
                        >
                          <View style={s.temCheck}><Check size={12} stroke={3.4} /></View>
                          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <Text style={s.temNome} numberOfLines={1}>{p.nome}</Text>
                              {ehNovo && <View style={s.novo}><Text style={s.novoTxt}>Novo</Text></View>}
                            </View>
                            <Text style={[s.temProduto, { color: prod ? MUTED : PINK_TEXT }]} numberOfLines={1}>{linha}</Text>
                          </View>
                          <View style={[s.temTile, prod ? { backgroundColor: '#FFFFFF' } : s.temTileVazio]}>
                            {prod
                              ? <ExpoImage source={{ uri: prod.recorteUrl ?? prod.imagemUrl ?? '' }} style={{ width: 32, height: 32 }} contentFit="contain" />
                              : <Mais size={14} stroke={2.4} color={PINK_TEXT} />}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
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
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 14,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#E3DCDF', alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 27, letterSpacing: -0.6, color: INK },
  subtitle: { fontSize: 15, letterSpacing: -0.2, color: MUTED },
  fechar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5EFF2', alignItems: 'center', justifyContent: 'center' },
  seg: { marginTop: 16, flexDirection: 'row', gap: 2, padding: 3, borderRadius: 100, backgroundColor: '#F6F0F3' },
  segBtn: { flex: 1, height: 34, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  segTxt: { fontSize: 15, letterSpacing: -0.2 },

  faixa: { marginBottom: 14, borderRadius: 13, padding: 14, backgroundColor: '#FFF0F6', gap: 4 },
  faixaTitulo: { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: PINK_DEEP },
  faixaTexto: { fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: SOFT },
  vazio: { marginTop: 24, fontSize: 15, lineHeight: 20, color: SOFT, textAlign: 'center' },

  resumo: { borderRadius: 16, backgroundColor: '#FDF3F7', padding: 16, gap: 12 },
  resumoCheck: { width: 26, height: 26, marginTop: 1, borderRadius: 13, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  resumoTitulo: { fontSize: 18, fontWeight: '600', lineHeight: 23, letterSpacing: -0.45, color: INK },
  resumoSub: { fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: SOFT },
  segmento: { flex: 1, height: 6, borderRadius: 3 },

  secao: { marginTop: 24, fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },

  faltaCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 13,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E4EA',
  },
  faltaTile: {
    width: 52, height: 52, borderRadius: 11, backgroundColor: '#FFF5F9',
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#F4B5CF', alignItems: 'center', justifyContent: 'center',
  },
  kicker: { fontSize: 13, fontWeight: '500', color: MUTED },
  faltaNome: { fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.4, color: INK },
  faltaPorque: { marginTop: 2, fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: BODY },
  addBtn: {
    marginTop: 10, alignSelf: 'flex-start', height: 36, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 12, paddingRight: 16, borderRadius: 100, backgroundColor: PINK, minWidth: 120, justifyContent: 'center',
    shadowColor: PINK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  addTxt: { fontSize: 15, fontWeight: '600', letterSpacing: -0.25, color: '#FFFFFF' },

  temLista: { marginTop: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E4EA', borderRadius: 13, overflow: 'hidden' },
  temLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12 },
  temLinhaBorda: { borderTopWidth: 1, borderTopColor: '#F3EDF0' },
  temCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  temNome: { flexShrink: 1, fontSize: 16, fontWeight: '500', letterSpacing: -0.3, color: INK },
  temProduto: { fontSize: 14, letterSpacing: -0.2 },
  temTile: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  temTileVazio: { backgroundColor: '#FFF5F9', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#F4B5CF' },
  novo: { height: 20, paddingHorizontal: 8, borderRadius: 100, backgroundColor: '#FDEEF4', justifyContent: 'center' },
  novoTxt: { fontSize: 12, fontWeight: '600', color: PINK_DEEP },
});
