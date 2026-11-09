import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, X } from 'lucide-react-native';
import { ObPillButton, OB } from '../../components/onboarding/kit';
import { haptics } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { listColecao } from '../../lib/colecao';
import { TEXTO_BALAO_DUVIDA, useBalaoEspinha } from '../../lib/espinhaAcompanhamento';
import { lerUltimaAnalise, type AnaliseSos, type DermatologistaSos, type QuandoSos } from '../../lib/sosEspinha';

// Resultado do SOS espinha. Lê sempre a análise guardada no aparelho (a que acabou de chegar ou
// a das últimas 24 h). As fotos dos produtos vêm da própria coleção dela.

const QUANDO: Record<QuandoSos, string> = { agora: 'Agora', manha: 'Hoje de manhã', noite: 'Hoje à noite' };

// Desligado a pedido do produto (08/nov/2026); vale também para análises já salvas no aparelho.
const MOSTRAR_AVISO_DERMATOLOGISTA = false;

const AVISOS: Record<DermatologistaSos, { titulo: string; texto: string }> = {
  inflamada: { titulo: 'Vale procurar um dermatologista', texto: 'Esta espinha parece mais inflamada que o normal. Um dermatologista pode avaliar e tratar com segurança.' },
  infeccao: { titulo: 'Procure um dermatologista logo', texto: 'A foto sugere sinais que precisam de avaliação. Se tiver febre ou se a vermelhidão estiver aumentando, procure atendimento hoje.' },
  varias: { titulo: 'Vale procurar um dermatologista', texto: 'A foto mostra várias espinhas juntas. Um dermatologista pode ver o que está causando isso.' },
};

function Lista({ itens, icone }: { itens: string[]; icone: 'check' | 'x' }) {
  const Icone = icone === 'check' ? Check : X;
  return (
    <View style={styles.card}>
      {itens.map((t, i) => (
        <View key={i} style={[styles.linha, i > 0 && styles.linhaSeparada]}>
          <View style={styles.bolinha}><Icone size={14} color={OB.pink} strokeWidth={2.6} /></View>
          <Text style={styles.linhaTexto}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SosResultado() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [analise, setAnalise] = useState<AnaliseSos | null>(null);
  const [fotos, setFotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    lerUltimaAnalise().then((a) => {
      if (!vivo) return;
      if (!a) { router.replace('/(scan)/sos-camera' as any); return; }
      setAnalise(a);
      if (a.produtos.length === 0) return;
      supabase.auth.getSession()
        .then(({ data }) => (data.session?.user?.id ? listColecao(data.session.user.id) : []))
        .then((lista) => {
          if (!vivo) return;
          const mapa: Record<string, string> = {};
          lista.forEach((i) => { const u = i.cutoutUrl ?? i.photoUrl; if (u) mapa[i.id] = u; });
          setFotos(mapa);
        })
        .catch(() => {}); // Sem foto, o card segue com o nome.
    });
    return () => { vivo = false; };
  }, [router]);

  if (!analise) return <View style={{ flex: 1, backgroundColor: '#F9F2F5' }} />;

  const aviso = MOSTRAR_AVISO_DERMATOLOGISTA && analise.dermatologista ? AVISOS[analise.dermatologista] : null;
  const urgente = analise.dermatologista === 'infeccao';

  return (
    <View style={{ flex: 1, backgroundColor: '#F9F2F5' }}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 170 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.titulo} accessibilityRole="header">Sua análise</Text>

        {aviso && (
          <View style={[styles.aviso, urgente && styles.avisoUrgente]} accessibilityLiveRegion="polite">
            <AlertTriangle size={20} color={urgente ? '#FFFFFF' : OB.pink} strokeWidth={2.2} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.avisoTitulo, urgente && { color: '#FFFFFF' }]}>{aviso.titulo}</Text>
              <Text style={[styles.avisoTexto, urgente && { color: '#FFFFFF' }]}>{aviso.texto}</Text>
            </View>
          </View>
        )}

        <Text style={styles.secao}>Faça agora com o que você já tem</Text>
        {analise.produtos.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.linhaTexto}>Nenhum produto da sua estante é indicado para esta espinha agora. Siga os cuidados abaixo.</Text>
          </View>
        ) : analise.produtos.map((p) => (
          <View key={p.colecao_id} style={[styles.card, styles.produto]}>
            <View style={styles.fotoCaixa}>
              {fotos[p.colecao_id] ? <Image source={{ uri: fotos[p.colecao_id] }} style={styles.foto} resizeMode="contain" /> : null}
            </View>
            <View style={{ flex: 1 }}>
              {p.marca ? <Text style={styles.marca} numberOfLines={1}>{p.marca}</Text> : null}
              <Text style={styles.nome}>{p.nome}</Text>
              <View style={styles.etiquetas}>
                <View style={styles.etiqueta}><Text style={styles.etiquetaTexto}>{QUANDO[p.quando]}</Text></View>
                {p.na_rotina && <View style={[styles.etiqueta, styles.etiquetaNeutra]}><Text style={[styles.etiquetaTexto, { color: OB.body }]}>Na sua rotina</Text></View>}
              </View>
              <Text style={styles.comoUsar}>{p.como_usar}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.secao}>Cuidados sem produto</Text>
        <Lista itens={analise.cuidados} icone="check" />

        {analise.evitar.length > 0 && (
          <>
            <Text style={styles.secao}>O que evitar</Text>
            <Lista itens={analise.evitar} icone="x" />
          </>
        )}

        <Text style={styles.rodape}>Esta análise não substitui a avaliação de um dermatologista.</Text>
      </ScrollView>

      <View style={[styles.base, { paddingBottom: insets.bottom + 12 }]}>
        <ObPillButton
          label="Concluir"
          width={280}
          onPress={() => {
            haptics.tap();
            if (analise.conversation_id) {
              useBalaoEspinha.getState().mostrar({ conversationId: analise.conversation_id, texto: TEXTO_BALAO_DUVIDA, tipo: 'duvida' });
            }
            router.replace('/(app)/home' as any);
          }}
        />
        <TouchableOpacity onPress={() => { haptics.tap(); router.replace('/(scan)/sos-camera' as any); }} style={styles.secundario} accessibilityRole="button">
          <Text style={styles.secundarioTexto}>Analisar outra espinha</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8, color: OB.ink },
  secao: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: OB.ink, marginTop: 26, marginBottom: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16 },
  produto: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  fotoCaixa: { width: 64, height: 84, borderRadius: 14, backgroundColor: '#F9F2F5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  foto: { width: 58, height: 78 },
  marca: { fontSize: 12, color: OB.sub },
  nome: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: OB.ink, marginTop: 1 },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  etiqueta: { backgroundColor: OB.wash, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  etiquetaNeutra: { backgroundColor: OB.option },
  etiquetaTexto: { fontSize: 12, fontWeight: '600', color: '#C0206A' },
  comoUsar: { fontSize: 15, lineHeight: 21, color: OB.body, marginTop: 8 },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  linhaSeparada: { marginTop: 14 },
  bolinha: { width: 22, height: 22, borderRadius: 11, backgroundColor: OB.wash, alignItems: 'center', justifyContent: 'center' },
  linhaTexto: { flex: 1, fontSize: 15, lineHeight: 21, color: OB.body },
  aviso: { flexDirection: 'row', gap: 10, backgroundColor: OB.wash, borderRadius: 20, padding: 16, marginTop: 18 },
  avisoUrgente: { backgroundColor: OB.pink },
  avisoTitulo: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: OB.ink },
  avisoTexto: { fontSize: 14, lineHeight: 20, color: OB.body, marginTop: 4 },
  rodape: { fontSize: 13, lineHeight: 18, color: OB.sub, textAlign: 'center', marginTop: 24 },
  base: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, alignItems: 'center', backgroundColor: 'rgba(249,242,245,0.96)' },
  secundario: { paddingVertical: 12, paddingHorizontal: 20, marginTop: 2 },
  secundarioTexto: { fontSize: 15, fontWeight: '600', color: OB.ink },
});
