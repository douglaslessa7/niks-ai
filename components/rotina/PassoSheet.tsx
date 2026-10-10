// ─────────────────────────────────────────────────────────────────────────────
// Folha "Novo passo" / "Editar passo" (plano da Rotina, Fase 3 — decisões 4 e 6).
//   · Nome livre e OPCIONAL (ex.: "Máscara de LED vermelho") — o passo precisa de nome
//     OU produto: sem nome, só dá para criar escolhendo o produto.
//   · Dias da semana: "Todo dia" (sem restrição) ou os dias marcados — no dia em que o
//     passo não vale, ele some do checklist.
//   · Editar: o produto atual com "Escolher/Trocar" (abre a folha "Escolher produto") e
//     "Remover produto" (tira o produto e mantém o passo; a estante não muda).
//   · Novo: "Criar e escolher produto" ou "Criar sem produto" — produto é opcional.
// Casca = a das outras folhas (Modal transparente + véu + translateY), com
// KeyboardAvoidingView para o teclado não cobrir o nome.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, Animated, Easing, StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { getUserId } from '../../lib/currentUser';
import { DIAS_SEMANA, atualizarPasso, criarPasso, definirProdutoDoPasso, type PassoRotina, type Periodo } from '../../lib/minhaRotina';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const MUTED = '#8A8385';
const SOFT = '#6E6468';

export type PassoSheetModo =
  | { tipo: 'novo'; periodo: Periodo }
  | { tipo: 'editar'; passo: PassoRotina };

export default function PassoSheet({ modo, onClose, onSalvo, onEscolherProduto }: {
  modo: PassoSheetModo | null;                       // null = fechada
  onClose: () => void;
  onSalvo: () => void;                               // gravou: a Rotina recarrega
  onEscolherProduto: (passo: PassoRotina) => void;   // abre a folha "Escolher produto"
}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const [montada, setMontada] = useState(false);
  const [atual, setAtual] = useState<PassoSheetModo | null>(null);
  const [nome, setNome] = useState('');
  const [dias, setDias] = useState<string[]>([]);    // vazio = todo dia
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (modo) {
      setAtual(modo);
      setNome(modo.tipo === 'editar' ? (modo.passo.nome ?? '') : '');
      setDias(modo.tipo === 'editar' ? (modo.passo.dias ?? []) : []);
      setMontada(true);
      Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => { setMontada(false); setAtual(null); });
    }
  }, [modo, anim]);

  if (!montada || !atual) return null;
  const editando = atual.tipo === 'editar' ? atual.passo : null;
  const temNome = nome.trim().length > 0;
  // Nome OU produto: editando, sem nome só vale se o passo tem produto.
  const podeSalvar = temNome || !!editando?.produto;

  const alternarDia = (d: string) => {
    haptics.select();
    setDias((cur) => {
      const prox = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
      // Todos os 7 marcados = todo dia.
      return prox.length === DIAS_SEMANA.length ? [] : DIAS_SEMANA.filter((x) => prox.includes(x));
    });
  };

  // Grava e devolve o passo (novo ou editado), ou null se falhou.
  const gravar = async (): Promise<PassoRotina | null> => {
    if (salvando) return null;
    setSalvando(true);
    try {
      if (editando) {
        await atualizarPasso(editando.id, { nome, dias });
        return { ...editando, nome: nome.trim() || null, dias: dias.length ? dias : null };
      }
      const uid = await getUserId();
      if (!uid) return null;
      return await criarPasso(uid, (atual as { periodo: Periodo }).periodo, nome, dias);
    } catch (e) {
      console.warn('[passo] salvar falhou:', e);
      haptics.error();
      Alert.alert('Não deu pra salvar o passo', 'Tente de novo em instantes.');
      return null;
    } finally {
      setSalvando(false);
    }
  };

  // "Remover produto": guarda nome/dias e tira o produto (o passo fica, sem produto).
  const removerProduto = async () => {
    if (!editando) return;
    if (!temNome) {
      haptics.warning();
      Alert.alert('Dê um nome ao passo', 'Sem produto, o passo precisa de um nome para continuar na sua rotina.');
      return;
    }
    const p = await gravar();
    if (!p) return;
    try {
      await definirProdutoDoPasso(p.id, null, { nivel: 'nenhum', texto: null });
      haptics.success();
      onSalvo();
      onClose();
    } catch (e) {
      console.warn('[passo] remover produto falhou:', e);
      haptics.error();
      Alert.alert('Não deu pra remover o produto', 'Tente de novo em instantes.');
    }
  };

  const salvar = async (depoisEscolherProduto: boolean) => {
    const p = await gravar();
    if (!p) return;
    haptics.success();
    onSalvo();
    onClose();
    if (depoisEscolherProduto) setTimeout(() => onEscolherProduto(p), 350); // folha fecha antes da outra abrir
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,18,18,0.35)', opacity: anim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <Animated.View style={[s.sheet, {
          paddingBottom: Math.max(insets.bottom, 20),
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
        }]}>
          <View style={s.handle} />
          <View style={s.head}>
            <View style={s.headBtn} />
            <Text style={s.title}>{editando ? 'Editar passo' : 'Novo passo'}</Text>
            <TouchableOpacity onPress={() => { haptics.tap(); onClose(); }} hitSlop={10} style={s.headBtn} accessibilityLabel="Fechar">
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
            </TouchableOpacity>
          </View>

          <Text style={s.label}>Nome do passo <Text style={{ fontWeight: '400', color: MUTED }}>(opcional)</Text></Text>
          <TextInput
            value={nome}
            onChangeText={setNome}
            placeholder="Ex.: Máscara de LED vermelho"
            placeholderTextColor="#B5ABB0"
            style={s.input}
            autoFocus={!editando}
            maxLength={60}
            returnKeyType="done"
          />

          <Text style={[s.label, { marginTop: 20 }]}>Dias da semana</Text>
          <View style={s.diasRow}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.select(); setDias([]); }} style={[s.diaTodo, !dias.length && s.diaOn]}>
              <Text style={[s.diaTxt, !dias.length && s.diaTxtOn]}>Todo dia</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.diasRow, { marginTop: 8 }]}>
            {DIAS_SEMANA.map((d) => {
              const on = dias.includes(d);
              return (
                <TouchableOpacity key={d} activeOpacity={0.85} onPress={() => alternarDia(d)} style={[s.dia, on && s.diaOn]} accessibilityLabel={d}>
                  <Text style={[s.diaTxt, on && s.diaTxtOn]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.ajuda}>{dias.length ? 'Nos outros dias, este passo some do checklist.' : 'Este passo aparece em todos os dias.'}</Text>

          {editando && (
            <>
              <Text style={[s.label, { marginTop: 20 }]}>Produto</Text>
              <View style={s.prodRow}>
                <Text style={s.prodNome} numberOfLines={1}>
                  {editando.produto ? [editando.produto.marca, editando.produto.nome].filter(Boolean).join(' · ') : 'Sem produto'}
                </Text>
                <TouchableOpacity onPress={() => { haptics.tap(); onClose(); setTimeout(() => onEscolherProduto(editando), 350); }} hitSlop={8}>
                  <Text style={s.link}>{editando.produto ? 'Trocar' : 'Escolher'}</Text>
                </TouchableOpacity>
                {!!editando.produto && (
                  <TouchableOpacity onPress={() => { haptics.tap(); void removerProduto(); }} hitSlop={8} accessibilityLabel="Remover produto do passo">
                    <Text style={[s.link, { color: MUTED }]}>Remover produto</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {editando && !podeSalvar && <Text style={[s.ajuda, { marginTop: 14 }]}>Dê um nome ao passo ou escolha um produto.</Text>}
          <View style={{ marginTop: 24, gap: 10 }}>
            {editando ? (
              <TouchableOpacity activeOpacity={0.85} disabled={!podeSalvar || salvando} onPress={() => { void salvar(false); }} style={[s.bigBtn, (!podeSalvar || salvando) && { opacity: 0.5 }]}>
                <Text style={s.bigBtnTxt}>Salvar</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity activeOpacity={0.85} disabled={salvando} onPress={() => { void salvar(true); }} style={[s.bigBtn, salvando && { opacity: 0.5 }]}>
                  <Text style={s.bigBtnTxt}>Criar e escolher produto</Text>
                </TouchableOpacity>
                {/* Sem produto, o passo precisa de nome. */}
                <TouchableOpacity activeOpacity={0.85} disabled={!temNome || salvando} onPress={() => { void salvar(false); }} style={[s.softBtn, (!temNome || salvando) && { opacity: 0.5 }]}>
                  <Text style={[s.bigBtnTxt, { color: PINK_TEXT }]}>Criar sem produto</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingHorizontal: 20,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 14,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#E3DCDF', alignSelf: 'center', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -8, marginBottom: 12 },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },
  label: { fontSize: 14, fontWeight: '600', letterSpacing: -0.2, color: SOFT },
  input: {
    marginTop: 8, height: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#F7F1F4',
    fontSize: 17, letterSpacing: -0.3, color: INK,
  },
  diasRow: { marginTop: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  diaTodo: { height: 36, paddingHorizontal: 16, borderRadius: 100, backgroundColor: '#F7F1F4', justifyContent: 'center' },
  dia: { width: 44, height: 36, borderRadius: 100, backgroundColor: '#F7F1F4', alignItems: 'center', justifyContent: 'center' },
  diaOn: { backgroundColor: '#FFE3EF', borderWidth: 1.5, borderColor: PINK },
  diaTxt: { fontSize: 14, fontWeight: '500', color: SOFT },
  diaTxtOn: { fontWeight: '600', color: '#C0206A' },
  ajuda: { marginTop: 8, fontSize: 13, color: MUTED },
  prodRow: { marginTop: 8, height: 48, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#F7F1F4', flexDirection: 'row', alignItems: 'center', gap: 10 },
  prodNome: { flex: 1, fontSize: 15, letterSpacing: -0.2, color: INK },
  link: { fontSize: 15, fontWeight: '600', color: PINK_TEXT },
  bigBtn: {
    height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(255,94,168)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  softBtn: { height: 50, borderRadius: 100, backgroundColor: '#FFF0F6', alignItems: 'center', justifyContent: 'center' },
  bigBtnTxt: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: '#FFFFFF' },
});
