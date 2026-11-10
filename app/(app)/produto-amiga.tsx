// Produto que uma amiga compartilhou no mural (Parte B, Fase 5). O servidor só manda o produto
// e o que ele faz: a nota e o texto pessoal são de quem escaneou, e nunca chegam aqui.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import ProductAnalysis from '../../components/product/ProductAnalysis';
import { produtoCompartilhado } from '../../lib/gruposServidor';
import { useEhConvidada } from '../../lib/acesso';
import { abrirTrava } from '../../lib/trava';
import { haptics } from '../../lib/haptics';
import { useAppStore } from '../../store/onboarding';
import VoltarPelaBorda from '../../components/VoltarPelaBorda';

const PINK = '#E0447F';

async function baixarBase64(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('leitura'));
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.readAsDataURL(blob);
  });
}

export default function ProdutoAmiga() {
  const router = useRouter();
  const { grupo, id } = useLocalSearchParams<{ grupo: string; id: string }>();
  const convidada = useEhConvidada();
  const setProductImage = useAppStore((s) => s.setProductImage);
  const [dados, setDados] = useState<{ resultado: any; foto_url: string | null } | null>(null);
  const [analisando, setAnalisando] = useState(false);
  // Aba oculta do <Tabs>: `router.back()` cairia na Home (1ª aba). Volta para o grupo de onde abriu.
  const voltar = () => router.navigate((grupo ? { pathname: '/grupo', params: { id: grupo } } : '/grupos') as any);

  useEffect(() => {
    if (!grupo || !id) { voltar(); return; }
    produtoCompartilhado(grupo, id)
      .then((r) => {
        if (r.ok) setDados({ resultado: r.resultado, foto_url: r.foto_url });
        else { Alert.alert('Esse produto não está mais disponível'); voltar(); }
      })
      .catch(() => { Alert.alert('Não deu para abrir agora', 'Confira a internet e tente de novo.'); voltar(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo, id]);

  const verSeCombina = async () => {
    if (!dados?.foto_url || analisando) return;
    haptics.action();
    setAnalisando(true);
    try {
      setProductImage(await baixarBase64(dados.foto_url), 'image/jpeg');
      router.push('/(scan)/product-loading' as any);
    } catch {
      Alert.alert('Não deu para analisar agora', 'Confira a internet e tente de novo.');
    } finally {
      setAnalisando(false);
    }
  };

  if (!dados) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9f9f9' }}><ActivityIndicator /></View>;

  const bloco = convidada ? (
    <TouchableOpacity activeOpacity={0.8} onPress={() => { haptics.tap(); abrirTrava('compatibilidade'); }} style={{ alignItems: 'center', paddingVertical: 8 }} accessibilityLabel="Ver a compatibilidade">
      <Text style={{ fontSize: 72, fontWeight: '800', color: 'transparent', textShadowColor: 'rgba(224,68,127,0.75)', textShadowRadius: 22, textShadowOffset: { width: 0, height: 0 } }}>88%</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8 }}>
        <Lock size={16} color={PINK} strokeWidth={2.4} />
        <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: '#121212' }}>Compatibilidade de pele</Text>
      </View>
    </TouchableOpacity>
  ) : (
    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
      <TouchableOpacity activeOpacity={0.85} disabled={analisando} onPress={verSeCombina} style={{ height: 52, borderRadius: 26, paddingHorizontal: 28, backgroundColor: '#FF5EA8', alignItems: 'center', justifyContent: 'center', minWidth: 240 }}>
        {analisando ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Ver se combina comigo</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <VoltarPelaBorda onVoltar={voltar}>
      <ProductAnalysis result={dados.resultado} photoUri={dados.foto_url} onClose={voltar} blocoCompatibilidade={bloco} />
    </VoltarPelaBorda>
  );
}
