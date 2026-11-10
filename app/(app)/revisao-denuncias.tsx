// Revisão de denúncias (Parte B, Fase 2). Tela escondida, aberta pelo push: quem não está em
// `moderadores` recebe "sem_permissão" do servidor e volta para a home. A trava é do servidor.
import { voltar as voltarOu } from '../../lib/navegar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { denunciasAbertas, revisarDenuncia, type DecisaoDenuncia, type DenunciaAberta } from '../../lib/gruposServidor';

const ROTULO: Record<DecisaoDenuncia, string> = { manter: 'Manter', apagar: 'Apagar', remover_usuaria: 'Remover usuária' };
const CONFIRMA: Record<DecisaoDenuncia, string> = {
  manter: 'A foto volta para o mural.',
  apagar: 'A foto sai do mural de vez.',
  remover_usuaria: 'A foto sai do mural, e ela sai de todos os grupos e não entra em outros. A conta e a assinatura continuam.',
};

export default function RevisaoDenuncias() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [lista, setLista] = useState<DenunciaAberta[] | null>(null);
  const [erro, setErro] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(false);
    try {
      const r = await denunciasAbertas();
      if (!r.ok) { voltarOu('/home'); return; }
      setLista(r.denuncias);
    } catch {
      setErro(true);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));

  const decidir = (d: DenunciaAberta, decisao: DecisaoDenuncia) => {
    Alert.alert(`${ROTULO[decisao]}?`, CONFIRMA[decisao], [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: ROTULO[decisao],
        style: decisao === 'manter' ? 'default' : 'destructive',
        onPress: async () => {
          setOcupada(d.id);
          try {
            const r = await revisarDenuncia(d.id, decisao);
            if (!r.ok && r.motivo !== 'ja_revisada') Alert.alert('Não deu certo', 'Tente de novo.');
          } catch {
            Alert.alert('Não deu certo', 'Confira a internet e tente de novo.');
          }
          setOcupada(null);
          void carregar();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={carregar} />}
    >
      <Text style={styles.titulo}>Denúncias</Text>
      {erro && <Text style={styles.vazio}>Não deu para carregar. Puxe para tentar de novo.</Text>}
      {!erro && lista === null && <ActivityIndicator style={{ marginTop: 32 }} />}
      {lista?.length === 0 && <Text style={styles.vazio}>Nenhuma denúncia aberta.</Text>}
      {lista?.map((d) => (
        <View key={d.id} style={styles.card}>
          {d.foto_url && <Image source={{ uri: d.foto_url }} style={styles.foto} resizeMode="cover" />}
          <Text style={styles.linha}>{d.tipo === 'foto' ? 'Foto' : 'Integrante'} de {d.alvo ?? 'conta apagada'}, no grupo {d.grupo ?? 'apagado'}</Text>
          <Text style={styles.detalhe}>Denunciada por {d.denunciante ?? 'conta apagada'} em {new Date(d.criado_em).toLocaleString('pt-BR')}</Text>
          {!!d.motivo && <Text style={styles.detalhe}>Motivo: {d.motivo}</Text>}
          <View style={styles.botoes}>
            {(d.tipo === 'foto' ? (['manter', 'apagar', 'remover_usuaria'] as const) : (['manter', 'remover_usuaria'] as const)).map((a) => (
              <Pressable key={a} disabled={ocupada === d.id} onPress={() => decidir(d, a)} style={[styles.botao, a === 'manter' && styles.botaoLeve]}>
                <Text style={[styles.botaoTexto, a === 'manter' && styles.botaoTextoLeve]}>{ROTULO[a]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF7FA' },
  titulo: { fontSize: 28, fontWeight: '700', color: '#121212', marginBottom: 16 },
  vazio: { fontSize: 15, color: '#7A7076', marginTop: 32, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 16 },
  foto: { width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 10, backgroundColor: '#eee' },
  linha: { fontSize: 15, fontWeight: '600', color: '#121212' },
  detalhe: { fontSize: 13, color: '#7A7076', marginTop: 4 },
  botoes: { flexDirection: 'row', gap: 8, marginTop: 12 },
  botao: { flex: 1, height: 44, borderRadius: 12, backgroundColor: '#D93A6B', alignItems: 'center', justifyContent: 'center' },
  botaoLeve: { backgroundColor: '#F1ECEF' },
  botaoTexto: { color: '#fff', fontSize: 13, fontWeight: '600' },
  botaoTextoLeve: { color: '#121212' },
});
