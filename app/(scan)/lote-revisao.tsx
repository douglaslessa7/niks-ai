// ─────────────────────────────────────────────────────────────────────────────
// Revisão do scan em lote (plano da Rotina, Fase 5 — decisão 4). Mostra as imagens
// combinadas que vão para a IA (tocar abre em tela cheia), com:
//   · produto sem rótulo → "Precisão baixa" + "Sem a lista de ingredientes, essa
//     análise é menos exata" + "Adicionar foto do rótulo";
//   · remover produto; "Adicionar outro produto" (até 7; no limite: "Você pode
//     adicionar mais depois pela estante");
//   · "Pronto, montar minha rotina" → envia as imagens para o bucket `rotina-lotes` e
//     começa o lote no servidor (lib/rotinaLotes) → "Montando sua rotina…".
//     Teto do dia atingido → aviso, e as fotos enviadas são apagadas.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const MUTED = '#8A8385';
const SOFT = '#6E6468';

export default function LoteRevisao() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const produtos = useLote((s) => s.produtos);
  const remover = useLote((s) => s.remover);
  const limpar = useLote((s) => s.limpar);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [envio, setEnvio] = useState(false);

  const cardW = Math.floor((width - 20 * 2 - 12) / 2);
  const cheio = produtos.length >= MAX_PRODUTOS_LOTE;

  const voltarParaCamera = () => {
    haptics.tap();
    // Veio da câmera → volta para ela; veio direto (7º produto) → abre de novo.
    if (router.canGoBack()) router.back();
    else router.replace('/(scan)/lote-camera' as any);
  };

  const tirar = (id: string, n: number) => {
    haptics.tap();
    Alert.alert(`Remover o produto ${n}?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => remover(id) },
    ]);
  };

  const montar = async () => {
    const uid = await getUserId();
    if (!uid || !produtos.length || envio) return;
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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Cabeçalho */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={voltarParaCamera} hitSlop={10} accessibilityLabel="Voltar" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 6l-6 6 6 6" /></Svg>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK }}>Seus produtos</Text>
          <Text style={{ fontSize: 14, color: MUTED }}>{produtos.length} de {MAX_PRODUTOS_LOTE}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 170 }} showsVerticalScrollIndicator={false}>
        {produtos.length === 0 ? (
          <Text style={{ marginTop: 40, fontSize: 16, color: SOFT, textAlign: 'center' }}>Nenhum produto ainda.</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {produtos.map((p, i) => (
              <View key={p.id} style={{ width: cardW }}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); setAmpliada(p.combinadaUri); }}>
                  <ExpoImage
                    source={{ uri: p.combinadaUri }}
                    style={{ width: cardW, height: cardW * 1.5, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E6EA' }}
                    contentFit="contain"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => tirar(p.id, i + 1)}
                  accessibilityLabel={`Remover o produto ${i + 1}`}
                  style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(18,18,18,0.55)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
                </TouchableOpacity>
                <Text style={{ marginTop: 8, fontSize: 15, fontWeight: '600', color: INK }}>Produto {i + 1}</Text>
                {!p.rotuloUri && (
                  <View style={{ marginTop: 4, gap: 4 }}>
                    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: '#FFF4E5', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#B54708' }}>Precisão baixa</Text>
                    </View>
                    <Text style={{ fontSize: 13, lineHeight: 17, color: SOFT }}>Sem a lista de ingredientes, essa análise é menos exata</Text>
                    <TouchableOpacity
                      onPress={() => { haptics.tap(); router.push({ pathname: '/(scan)/lote-camera', params: { rotuloDe: p.id } } as any); }}
                      style={{ paddingVertical: 2 }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: PINK_TEXT }}>Adicionar foto do rótulo</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Rodapé fixo */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: 'rgba(255,255,255,0.97)', gap: 10 }}>
        {cheio ? (
          <Text style={{ fontSize: 14, color: MUTED, textAlign: 'center' }}>Você pode adicionar mais depois pela estante.</Text>
        ) : (
          <TouchableOpacity onPress={voltarParaCamera} disabled={envio} style={{ height: 48, borderRadius: 100, backgroundColor: '#FFF0F6', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: PINK_TEXT }}>Adicionar outro produto</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={montar}
          disabled={!produtos.length || envio}
          style={{ height: 52, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center', opacity: produtos.length ? 1 : 0.4 }}
        >
          {envio
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Pronto, montar minha rotina</Text>}
        </TouchableOpacity>
      </View>

      {/* Imagem combinada em tela cheia */}
      <Modal visible={!!ampliada} transparent animationType="fade" onRequestClose={() => setAmpliada(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setAmpliada(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {!!ampliada && <ExpoImage source={{ uri: ampliada }} style={{ width: width - 24, height: (width - 24) * 1.5 }} contentFit="contain" />}
          <Text style={{ marginTop: 14, color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>É assim que a IA vai ver esse produto. Toque para fechar.</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
