// ─────────────────────────────────────────────────────────────────────────────
// "Sua rotina está pronta" — confirmação do "Montar minha rotina com meus produtos"
// (plano da Rotina, Fase 6 — decisões 2, 4 e 5). A rotina montada JÁ substituiu a
// Minha rotina (automático, no servidor, quando o lote terminou). Lê o lote pronto
// (`rotina_lotes`) e mostra:
//   · a rotina montada (manhã/noite, na ordem, com o produto e os dias de cada passo);
//   · "Pra chegar na sua rotina ideal, falta: …" (ou "cobre tudo");
//   · os que ficaram de fora, com o motivo ("Não indicado pra você" quando prejudica a
//     pele — esses vão para a estante marcados assim, fora da rotina);
//   · os não identificados, com a mensagem combinada;
//   · precisão baixa de quem foi sem rótulo.
// "Começar" leva para a Rotina. Nenhum produto serviu → a rotina atual dela não muda
// (o servidor não aplica rotina vazia) e a tela diz isso. Abrir marca o lote como
// visto (some o aviso).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { invalidateCache } from '../../lib/cache';
import { getUserId } from '../../lib/currentUser';
import { diasDoPasso } from '../../lib/frequencia';
import { BUCKET_LOTES } from '../../lib/loteProdutos';
import { buscarLote, marcarVisto, type Lote, type ProdutoResultado } from '../../lib/rotinaLotes';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const MUTED = '#8A8385';
const SOFT = '#6E6468';

const NAO_IDENTIFICADO = 'Desculpa, não consegui identificar esse produto. Tenta escanear de novo pela sua estante, com uma foto mais nítida do rótulo.';

function nomeProduto(p?: ProdutoResultado | null): string {
  if (!p) return 'Produto';
  return [p.marca, p.nome].filter(Boolean).join(' · ') || `Produto ${p.indice}`;
}

export default function LoteResultado() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lote, setLote] = useState<Lote | null>(null);
  const [fotos, setFotos] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!id) return;
    (async () => {
      const l = await buscarLote(id);
      setLote(l);
      if (!l) return;
      void marcarVisto(l.id);
      // A Minha rotina mudou no servidor: a Rotina precisa reler.
      const uid = await getUserId();
      if (uid) { invalidateCache(`minharotina:${uid}`); invalidateCache(`lotehoje:${uid}`); }
      // Fotos (privadas → URL assinada); a frente fica no topo da imagem combinada.
      const { data } = await supabase.storage.from(BUCKET_LOTES).createSignedUrls(l.caminhos, 3600);
      const m: Record<number, string> = {};
      (data ?? []).forEach((d, i) => { if (d.signedUrl) m[i + 1] = d.signedUrl; });
      setFotos(m);
    })();
  }, [id]);

  const r = lote?.resultado ?? null;
  const porIndice = useMemo(() => new Map((r?.produtos ?? []).map((p) => [p.indice, p])), [r]);
  const naoIdentificados = (r?.produtos ?? []).filter((p) => !p.identificado);
  const semRotulo = (r?.produtos ?? []).filter((p) => p.identificado && p.precisao === 'baixa');
  const totalNaRotina = new Set([...(r?.rotina.am ?? []), ...(r?.rotina.pm ?? [])].map((s) => s.produto_indice)).size;

  const sair = () => router.replace('/(app)/protocolo' as any);

  if (!lote || !r) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        {lote && !r
          ? <Text style={{ fontSize: 16, color: SOFT }}>Essa rotina ainda não está pronta.</Text>
          : <ActivityIndicator color={PINK} />}
      </View>
    );
  }

  const Foto = ({ indice, size = 52 }: { indice: number; size?: number }) => (
    <View style={{ width: size, height: size, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E6EA', overflow: 'hidden' }}>
      {!!fotos[indice] && <ExpoImage source={{ uri: fotos[indice] }} style={{ width: size, height: size }} contentFit="cover" contentPosition="top" />}
    </View>
  );

  const Periodo = ({ titulo, passos }: { titulo: string; passos: typeof r.rotina.am }) => (
    passos.length ? (
      <View style={{ marginTop: 22 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: INK }}>{titulo}</Text>
        {passos.map((s, i) => {
          const p = porIndice.get(s.produto_indice);
          const dias = diasDoPasso(s.dias);
          return (
            <View key={`${titulo}-${i}`} style={{ flexDirection: 'row', gap: 12, marginTop: 12, padding: 12, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E6EA' }}>
              <Foto indice={s.produto_indice} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }}>{`${i + 1}. ${s.passo}`}</Text>
                <Text style={{ fontSize: 16, fontWeight: '600', letterSpacing: -0.3, color: INK }} numberOfLines={2}>{nomeProduto(p)}</Text>
                {!!s.instrucao && <Text style={{ fontSize: 14, lineHeight: 19, color: SOFT }}>{s.instrucao}</Text>}
                {!!dias && <Text style={{ marginTop: 2, fontSize: 13, fontWeight: '600', color: PINK_DEEP }}>{`${dias.length}x por semana · ${dias.join(', ')}`}</Text>}
                {p?.veredito === 'com_ressalva' && !!p.motivo && <Text style={{ marginTop: 2, fontSize: 13, lineHeight: 17, color: PINK_DEEP }}>{p.motivo}</Text>}
              </View>
            </View>
          );
        })}
      </View>
    ) : null
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 40 }} />
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => { haptics.tap(); sair(); }} hitSlop={10} accessibilityLabel="Fechar" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.7, color: INK }}>
          {totalNaRotina ? 'Sua rotina está pronta' : 'Não deu para montar uma rotina'}
        </Text>
        <Text style={{ marginTop: 6, fontSize: 16, lineHeight: 22, color: SOFT }}>
          {totalNaRotina
            ? `Montei com ${totalNaRotina === 1 ? '1 dos seus produtos' : `${totalNaRotina} dos seus produtos`}, e ela já é a sua rotina. Você pode mudar quando quiser.`
            : 'Nenhum dos produtos serviu para a sua pele agora, então sua rotina continua como estava. Veja o motivo de cada um abaixo.'}
        </Text>

        <Periodo titulo="Manhã" passos={r.rotina.am} />
        <Periodo titulo="Noite" passos={r.rotina.pm} />

        {/* O que falta da ideal */}
        <View style={{ marginTop: 26, padding: 16, borderRadius: 13, backgroundColor: '#FFF5F9', gap: 8 }}>
          {r.cobre_tudo || !r.faltam.length ? (
            <Text style={{ fontSize: 16, fontWeight: '600', color: INK }}>Sua rotina cobre tudo o que sua pele precisa ✓</Text>
          ) : (
            <>
              <Text style={{ fontSize: 16, fontWeight: '600', color: INK }}>Pra chegar na sua rotina ideal, falta:</Text>
              {r.faltam.map((f, i) => (
                <Text key={i} style={{ fontSize: 15, lineHeight: 20, color: SOFT }}>
                  <Text style={{ fontWeight: '600', color: INK }}>{f.passo_ideal}</Text>{` (${f.periodo === 'am' ? 'manhã' : 'noite'}) · ${f.por_que}`}
                </Text>
              ))}
            </>
          )}
        </View>

        {/* Ficaram de fora */}
        {r.fora_da_rotina.length > 0 && (
          <View style={{ marginTop: 26 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: INK }}>Ficaram de fora</Text>
            {r.fora_da_rotina.map((f) => {
              const p = porIndice.get(f.produto_indice);
              const naoIndicado = p?.veredito === 'evitaria';
              return (
                <View key={f.produto_indice} style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                  <Foto indice={f.produto_indice} size={46} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: INK }} numberOfLines={2}>{nomeProduto(p)}</Text>
                    {naoIndicado && <Text style={{ fontSize: 13, fontWeight: '700', color: p?.nivel_aviso === 'forte' ? '#B42318' : PINK_DEEP }}>Não indicado pra você</Text>}
                    <Text style={{ fontSize: 14, lineHeight: 19, color: SOFT }}>{f.motivo || p?.motivo}</Text>
                  </View>
                </View>
              );
            })}
            <Text style={{ marginTop: 10, fontSize: 13, color: MUTED }}>Eles ficam na sua estante.</Text>
          </View>
        )}

        {/* Não identificados */}
        {naoIdentificados.length > 0 && (
          <View style={{ marginTop: 26 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: INK }}>Não identificados</Text>
            {naoIdentificados.map((p) => (
              <View key={p.indice} style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                <Foto indice={p.indice} size={46} />
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: SOFT }}>{NAO_IDENTIFICADO}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Precisão baixa (sem rótulo) */}
        {semRotulo.length > 0 && (
          <Text style={{ marginTop: 22, fontSize: 13, lineHeight: 18, color: MUTED }}>
            {`Precisão baixa em ${semRotulo.map(nomeProduto).join(', ')}: sem a lista de ingredientes, essa análise é menos exata.`}
          </Text>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: 'rgba(255,255,255,0.97)' }}>
        <TouchableOpacity onPress={() => { haptics.action(); sair(); }} style={{ height: 52, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Começar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
