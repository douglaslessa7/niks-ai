import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown } from 'react-native-reanimated';
import SeletorPeriodo from '../rotina/SeletorPeriodo';
import { usePulsoMedalha } from '../medalhas/usePulsoMedalha';
import { haptics } from '../../lib/haptics';
import { periodoInicial, type RecomendacaoPasso } from '../../lib/recomendacaoPasso';
import type { Periodo, PassoRotina } from '../../lib/minhaRotina';

// ─────────────────────────────────────────────────────────────────────────────
// "Em qual passo?" — aberta em "Colocar na rotina" (tela do produto da estante). Seletor
// Manhã | Noite; o lugar recomendado (lib/recomendacaoPasso) vem em destaque no topo, com um
// pulso só de tamanho, mas ela pode escolher qualquer passo. "Reduzir movimento": só o selo.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const MUTE = '#7D7478';
const PINK_DEEP = '#E8468F';
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const ESCALA_PULSO = 0.02;

const nomeDoPasso = (p: PassoRotina) => p.nome?.trim() || p.produto?.nome?.trim() || 'Passo';
const produtoDoPasso = (p: PassoRotina) => (p.produto ? [p.produto.marca, p.produto.nome].filter(Boolean).join(' · ') : 'Sem produto');

function Selo({ texto }: { texto: string }) {
  return <View style={s.selo}><Text style={s.seloTxt}>{texto}</Text></View>;
}

function CardRecomendado({ rm, rotulo, onPress, disabled, children }: {
  rm: boolean; rotulo: string; onPress: () => void; disabled: boolean; children: React.ReactNode;
}) {
  const pulso = usePulsoMedalha(true, rm, ESCALA_PULSO);
  return (
    <Animated.View style={[s.destaque, pulso]}>
      <TouchableOpacity activeOpacity={0.75} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={rotulo} style={s.destaqueCorpo}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

type Props = {
  passos: PassoRotina[];
  recomendacao: RecomendacaoPasso;
  ocupado: boolean;
  rm: boolean;
  alturaTela: number;
  folgaBase: number;
  onEscolher: (p: PassoRotina, recomendado: boolean) => void;
  onCriarNovo: () => void;
  onFechar: () => void;
};

export default function FolhaEmQualPasso({ passos, recomendacao: r, ocupado, rm, alturaTela, folgaBase, onEscolher, onCriarNovo, onFechar }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoInicial(r, passos));

  // Um haptic leve ao abrir, só quando há o que recomendar.
  const temDestaque = r.tipo === 'passos' || r.tipo === 'novo';
  useEffect(() => {
    if (temDestaque) haptics.tap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porque = r.tipo === 'passos' ? r.porque : null;
  const doPeriodo = useMemo(() => {
    const lista = passos.filter((p) => p.periodo === periodo);
    return porque ? [...lista.filter((p) => porque[p.id]), ...lista.filter((p) => !porque[p.id])] : lista;
  }, [passos, periodo, porque]);
  const novoAqui = r.tipo === 'novo' && r.periodos.includes(periodo) ? r : null;

  const quandoNovo = (n: Extract<RecomendacaoPasso, { tipo: 'novo' }>) => [
    n.periodos.length === 2 ? 'Manhã e noite' : n.periodos[0] === 'am' ? 'Manhã' : 'Noite',
    n.dias ? n.dias.join(', ') : 'Todo dia',
  ].join(' · ');

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,20,25,0.28)' }]} onPress={onFechar} accessibilityLabel="Fechar" />
      <Animated.View
        entering={rm ? FadeIn.duration(150) : SlideInDown.duration(260).easing(EASE_SHEET)}
        style={[s.folha, { paddingBottom: folgaBase, maxHeight: alturaTela * 0.72 }]}
      >
        <Text style={s.titulo}>Em qual passo?</Text>
        <SeletorPeriodo valor={periodo} onChange={setPeriodo} fundo="#F7EEF2" style={{ marginTop: 12 }} />
        {r.tipo === 'aviso' && <Text style={s.aviso}>{r.texto}</Text>}

        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 4, paddingHorizontal: 4 }}>
          {!!novoAqui && (
            <CardRecomendado rm={rm} disabled={ocupado} onPress={onCriarNovo} rotulo={`Criar novo passo: ${novoAqui.nome}, ${quandoNovo(novoAqui)}`}>
              <Selo texto="Novo passo recomendado" />
              <Text style={s.passoNome} numberOfLines={1}>{novoAqui.nome}</Text>
              <Text style={s.passoSub} numberOfLines={1}>{quandoNovo(novoAqui)}</Text>
              <Text style={s.porque} numberOfLines={2}>{novoAqui.porque}</Text>
            </CardRecomendado>
          )}

          {doPeriodo.map((p) => (porque?.[p.id] ? (
            <CardRecomendado key={p.id} rm={rm} disabled={ocupado} onPress={() => onEscolher(p, true)} rotulo={`Recomendado: ${nomeDoPasso(p)}. ${porque[p.id]}`}>
              <Selo texto="Recomendado" />
              <Text style={s.passoNome} numberOfLines={1}>{nomeDoPasso(p)}</Text>
              <Text style={s.passoSub} numberOfLines={1}>{produtoDoPasso(p)}</Text>
              <Text style={s.porque} numberOfLines={2}>{porque[p.id]}</Text>
            </CardRecomendado>
          ) : (
            <TouchableOpacity key={p.id} activeOpacity={0.6} disabled={ocupado} onPress={() => onEscolher(p, false)} accessibilityRole="button" style={s.passo}>
              <Text style={s.passoNome} numberOfLines={1}>{nomeDoPasso(p)}</Text>
              <Text style={s.passoSub} numberOfLines={1}>{produtoDoPasso(p)}</Text>
            </TouchableOpacity>
          )))}

          {doPeriodo.length === 0 && !novoAqui && (
            <Text style={s.vazio}>Nenhum passo {periodo === 'am' ? 'de manhã' : 'à noite'}.</Text>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 20, paddingHorizontal: 14,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF',
  },
  titulo: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, color: INK, textAlign: 'center' },
  aviso: { marginTop: 12, paddingHorizontal: 12, fontSize: 14, lineHeight: 19, letterSpacing: -0.15, color: MUTE, textAlign: 'center' },
  destaque: { marginVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(232,70,143,0.45)', backgroundColor: '#FFF3F8' },
  destaqueCorpo: { paddingVertical: 12, paddingHorizontal: 14 },
  selo: { alignSelf: 'flex-start', marginBottom: 7, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 100, backgroundColor: 'rgba(232,70,143,0.14)' },
  seloTxt: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1, color: PINK_DEEP },
  passo: { minHeight: 58, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EADFE4' },
  passoNome: { fontSize: 16, fontWeight: '600', letterSpacing: -0.25, color: INK },
  passoSub: { marginTop: 1, fontSize: 13, color: MUTE },
  porque: { marginTop: 6, fontSize: 14, lineHeight: 18, fontWeight: '500', letterSpacing: -0.15, color: PINK_DEEP },
  vazio: { paddingVertical: 20, fontSize: 15, color: MUTE, textAlign: 'center' },
});
