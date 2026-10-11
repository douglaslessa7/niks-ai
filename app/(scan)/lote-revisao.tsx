// ─────────────────────────────────────────────────────────────────────────────
// Revisão do scan em lote — réplica do Claude Design (`NiksLoteFlo`, tela 55e).
// "Seus produtos · N de 7 · ainda cabem X": cards em 2 colunas (foto da frente),
//   · com rótulo → "✓ Frente e rótulo";
//   · sem rótulo → selo "Sem rótulo" + "A análise fica menos precisa." + "Adicionar
//     rótulo" (abre a câmera direto no rótulo daquele produto);
//   · X remove na hora; "Adicionar produto" (tracejado) volta à câmera (até 7).
// "Montar minha rotina" → envia as imagens para o bucket `rotina-lotes` e começa o lote
// no servidor (lib/rotinaLotes) → "Montando sua rotina". Teto do dia → aviso, e as
// fotos enviadas são apagadas. A seta pergunta "Sair do scan?" (é a saída do fluxo).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { getUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';
import { BUCKET_LOTES, MAX_PRODUTOS_LOTE, enviarLote, useLote } from '../../lib/loteProdutos';
import { iniciarLote, TetoDoDiaError } from '../../lib/rotinaLotes';
import { supabase } from '../../lib/supabase';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const MUTED = '#8A8387';
const SOFT = '#6E6468';
// Fundo do quadradinho de cada produto, na ordem do design.
const TINT = ['#E2F1EF', '#E3EEF8', '#FFF1D6', '#EEE5F6', '#E3EEF8', '#FDE4EE', '#FFEFD9'];

export default function LoteRevisao() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const produtos = useLote((s) => s.produtos);
  const remover = useLote((s) => s.remover);
  const limpar = useLote((s) => s.limpar);
  const [envio, setEnvio] = useState(false);

  const count = produtos.length;
  // Arredondado para baixo: folga zero no flexWrap quebra a linha (Fabric — README, decisão 29).
  const colW = Math.floor((width - 18 * 2 - 10) / 2);

  const voltarParaCamera = () => {
    haptics.tap();
    if (router.canGoBack()) router.back();
    else router.replace('/(scan)/lote-camera' as any);
  };

  // A seta é a saída do fluxo (o X da câmera traz para cá).
  const sair = () => {
    haptics.tap();
    if (!count) { router.dismissAll(); return; }
    Alert.alert(
      'Sair do scan?',
      `Você vai perder ${count === 1 ? 'o produto fotografado' : `os ${count} produtos fotografados`}.`,
      [
        { text: 'Continuar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => { limpar(); router.dismissAll(); } },
      ],
    );
  };

  const montar = async () => {
    const uid = await getUserId();
    if (!uid || !count || envio) return;
    haptics.action();
    setEnvio(true);
    let enviados: string[] = [];
    try {
      const { caminhos } = await enviarLote(uid, produtos);
      enviados = caminhos;
      const loteId = await iniciarLote(caminhos, produtos.map((p) => !!p.rotuloUri));
      limpar();
      router.replace({ pathname: '/(scan)/lote-montando', params: { id: loteId } } as any);
    } catch (e) {
      console.warn('[lote-revisao] montar falhou:', e);
      if (e instanceof TetoDoDiaError) {
        // As fotos não vão ser usadas: sai do bucket (com as frentes ao lado).
        const todas = enviados.flatMap((c) => [c, c.replace(/\.jpg$/, '-frente.jpg')]);
        if (todas.length) void supabase.storage.from(BUCKET_LOTES).remove(todas);
        Alert.alert('Você já montou uma rotina hoje', 'Dá para montar uma por dia. Tente de novo amanhã.');
      } else {
        Alert.alert('Não deu para montar sua rotina', 'Verifique sua conexão e tente de novo.');
      }
    } finally {
      setEnvio(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#FFE3EF', '#FFD3E5', '#FDDFEB', '#FBEEF3', '#F9F2F5']}
        locations={[0, 0.28, 0.6, 0.8, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <ScrollView contentContainerStyle={{ paddingTop: 54, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 44, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={sair} activeOpacity={0.85} accessibilityLabel="Voltar" style={st.voltar}>
            <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M15 6l-6 6 6 6" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 12, paddingHorizontal: 20, gap: 4 }}>
          <Text style={st.titulo}>Seus produtos</Text>
          <Text style={st.sub}>
            {count >= MAX_PRODUTOS_LOTE ? `${MAX_PRODUTOS_LOTE} de ${MAX_PRODUTOS_LOTE} · você chegou no limite` : `${count} de ${MAX_PRODUTOS_LOTE} · ainda cabem ${MAX_PRODUTOS_LOTE - count}`}
          </Text>
        </View>

        {/* Grade de 2 colunas (alinhada no topo, como no design) */}
        <View style={{ marginTop: 18, paddingHorizontal: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
          {produtos.map((p, i) => (
            <View key={p.id} style={[st.card, { width: colW }]}>
              <View style={[st.fotoBox, { backgroundColor: TINT[i % TINT.length] }]}>
                <ExpoImage source={{ uri: p.frenteUri }} style={{ height: 70, width: 100, borderRadius: 8 }} contentFit="contain" />
                <TouchableOpacity
                  onPress={() => { haptics.tap(); remover(p.id); }}
                  activeOpacity={0.85}
                  accessibilityLabel={`Remover o produto ${i + 1}`}
                  style={st.remover}
                >
                  <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" /></Svg>
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: 4, paddingBottom: 4, gap: 4 }}>
                <Text style={st.produtoN}>Produto {i + 1}</Text>
                {p.rotuloUri ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Svg width={13} height={13} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={PINK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                    <Text style={{ fontSize: 13, color: MUTED }}>Frente e rótulo</Text>
                  </View>
                ) : (
                  <>
                    <View style={st.semRotulo}><Text style={st.semRotuloTxt}>Sem rótulo</Text></View>
                    <Text style={{ fontSize: 13, lineHeight: 17, color: MUTED }}>A análise fica menos precisa.</Text>
                    <TouchableOpacity
                      onPress={() => { haptics.tap(); router.push({ pathname: '/(scan)/lote-camera', params: { rotuloDe: p.id } } as any); }}
                      activeOpacity={0.85}
                    >
                      <Text style={st.addRotulo}>Adicionar rótulo</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ))}
          {count < MAX_PRODUTOS_LOTE && (
            <TouchableOpacity onPress={voltarParaCamera} activeOpacity={0.85} style={[st.adicionar, { width: colW }]}>
              <View style={st.adicionarCirculo}>
                <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" fill="none" stroke={PINK_TEXT} strokeWidth={2.4} strokeLinecap="round" /></Svg>
              </View>
              <Text style={st.adicionarTxt}>Adicionar produto</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Rodapé: degradê + "Montar minha rotina" */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(249,242,245,0)', '#F9F2F5']}
        locations={[0, 0.3]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 104 }}
      />
      <TouchableOpacity onPress={montar} disabled={!count || envio} activeOpacity={0.85} style={[st.montar, { opacity: count ? 1 : 0.4 }]}>
        {envio ? <ActivityIndicator color="#FFFFFF" /> : <Text style={st.montarTxt}>Montar minha rotina</Text>}
      </TouchableOpacity>
    </View>
  );
}

const st = {
  voltar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 7,
  },
  titulo: { fontSize: 28, fontWeight: '700' as const, lineHeight: 33, letterSpacing: -0.8, color: INK },
  sub: { fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: SOFT },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 8, gap: 8,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1,
  },
  fotoBox: { height: 84, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const },
  remover: { position: 'absolute' as const, top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(18,18,18,0.38)', alignItems: 'center' as const, justifyContent: 'center' as const },
  produtoN: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.3, color: INK },
  semRotulo: { alignSelf: 'flex-start' as const, height: 22, justifyContent: 'center' as const, paddingHorizontal: 9, borderRadius: 100, backgroundColor: '#FFF1DC' },
  semRotuloTxt: { fontSize: 12, fontWeight: '600' as const, color: '#9A5300' },
  addRotulo: { fontSize: 14, fontWeight: '600' as const, letterSpacing: -0.2, color: PINK_TEXT },
  adicionar: {
    height: 134, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: '#F4B5CF', backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
  },
  adicionarCirculo: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const,
    shadowColor: '#C0206A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6,
  },
  adicionarTxt: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.3, color: PINK_TEXT },
  montar: {
    position: 'absolute' as const, left: 20, right: 20, bottom: 34, height: 52, borderRadius: 100, backgroundColor: PINK,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  montarTxt: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.3, color: '#FFFFFF' },
};
