// ─────────────────────────────────────────────────────────────────────────────
// Detalhe do produto recomendado (design 47c, NiksProductDetailFlo). Saiu da aba Estante
// (12/nov/2026) para abrir também DIRETO na home: antes a home trocava para a aba Estante e o
// detalhe subia por cima dela — ela via a prateleira por um instante e, ao fechar, ficava na
// estante em vez de voltar para a home. Agora quem abre é a própria tela em que ela está, e
// fechar (X ou deslizar para baixo) volta para ela.
// Foto em card branco, selo de compatibilidade, marca, nome, faixa de preço (recomendados),
// tags e a descrição; embaixo, fixo sobre um esmaecido, "Adicionar à estante" (ou o selo).
// Folha nativa (`pageSheet`): sobe com a curva do sistema e fecha deslizando.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useColecaoToggle } from '../../hooks/useColecaoToggle';
import { ShelfAddButton, ShelfRemoveLink } from './ShelfStatus';
import FaixaPreco from './FaixaPreco';
import { faixasDosProdutos, type FaixaPreco as FaixaPrecoValor } from '../../lib/faixaPreco';
import { haptics } from '../../lib/haptics';

const INK = '#121212';

export type DetalheItem = {
  productId?: string;
  brand?: string;
  name?: string;
  img?: any;               // foto original do catálogo ({ uri } ou require)
  cutout?: string | null;  // recorte sem fundo (só para exibir)
  compat?: number | null;
  praLong?: string;
  targets?: string[];
  categoria?: string | null;
  recomendado?: boolean;   // aberto de um RECOMENDADO → mostra a faixa de preço
};

export default function DetalheProduto({ item, onClose, faixa, onColecaoMudou }: {
  item: DetalheItem | null;
  onClose: () => void;
  /** Faixa já conhecida (a aba Estante tem todas); sem ela, é lida aqui quando for recomendado. */
  faixa?: FaixaPrecoValor;
  onColecaoMudou?: () => void;
}) {
  // O item continua montado durante a saída da folha (senão ela desce vazia).
  const [mostrado, setMostrado] = useState<DetalheItem | null>(item);
  useEffect(() => { if (item) setMostrado(item); }, [item]);
  const d = item ?? mostrado;

  const src = useMemo(() => (item?.productId ? {
    origem: 'catalogo' as const, produtoId: item.productId, nome: item.name ?? null, marca: item.brand ?? null,
    categoria: item.categoria ?? null, compat: item.compat ?? null,
    imagemUrl: item.img && typeof item.img === 'object' && 'uri' in item.img ? item.img.uri : null,
  } : null), [item]);
  const col = useColecaoToggle(src, onColecaoMudou);

  const [faixaLida, setFaixaLida] = useState<FaixaPrecoValor | undefined>(undefined);
  useEffect(() => {
    setFaixaLida(undefined);
    if (faixa !== undefined || !item?.recomendado || !item.productId) return;
    let vivo = true;
    const id = item.productId;
    faixasDosProdutos([id]).then((m) => { if (vivo) setFaixaLida(m.get(id)); }).catch(() => {});
    return () => { vivo = false; };
  }, [item?.productId, item?.recomendado, faixa]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = d?.recomendado ? (faixa ?? faixaLida) : undefined;
  const owned = !!col.owned;

  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#F9F2F5' }}>
        <LinearGradient colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
        {d && (
          <>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 200 }} showsVerticalScrollIndicator={false}>
              <View style={[s.imgCard, { marginTop: 63 }]}>
                <ExpoImage
                  source={d.cutout ? { uri: d.cutout } : d.img}
                  cachePolicy="memory-disk"
                  transition={0}
                  style={{ width: 170, height: 196 }}
                  contentFit="contain"
                  accessibilityLabel={d.name}
                />
              </View>
              <View style={{ marginTop: 18, paddingHorizontal: 20 }}>
                {d.compat != null && (
                  <View style={s.badge}>
                    <View style={s.badgeDot}>
                      <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
                    </View>
                    <Text style={s.badgeText}>{`${d.compat}% compatível com sua pele`}</Text>
                  </View>
                )}
                {!!d.brand && <Text style={s.brand}>{d.brand}</Text>}
                <Text style={s.name} lineBreakStrategyIOS="push-out">{d.name}</Text>
                {f ? <FaixaPreco faixa={f} linha style={{ marginTop: 10 }} /> : null}
                {!!(d.targets && d.targets.length) && (
                  <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {d.targets.map((tg) => (
                      <View key={tg} style={s.tag}><Text style={s.tagText}>{tg}</Text></View>
                    ))}
                  </View>
                )}
                {!!d.praLong && <Text style={s.desc} lineBreakStrategyIOS="push-out">{d.praLong}</Text>}
              </View>
            </ScrollView>

            <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); onClose(); }} style={[s.close, { top: 15 }]} accessibilityLabel="Fechar" hitSlop={8}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
            </TouchableOpacity>

            <LinearGradient pointerEvents="none" colors={['rgba(249,242,245,0)', 'rgba(249,242,245,0.95)', 'rgba(249,242,245,0.95)']} locations={[0, 0.4, 1]} style={s.fade} />
            <View style={[s.actions, { bottom: 34 }]}>
              {src && col.owned !== null && (
                <ShelfAddButton owned={owned} busy={col.busy} onAdd={() => { void col.toggle(); }} />
              )}
              {src && (
                <ShelfRemoveLink owned={owned} busy={col.busy} name={d.name} onRemove={() => { void col.toggle(); }} style={{ marginTop: 2 }} />
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  imgCard: {
    marginHorizontal: 18, height: 236, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7,
  },
  badge: {
    alignSelf: 'flex-start', height: 26, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 5, paddingRight: 11, borderRadius: 100, backgroundColor: '#FFFFFF',
    shadowColor: 'rgb(192,32,106)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4,
  },
  badgeDot: { width: 17, height: 17, borderRadius: 8.5, backgroundColor: '#FF5EA8', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: '#C0206A' },
  brand: { marginTop: 16, fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: '#8A8385' },
  name: { marginTop: 4, fontSize: 28, fontWeight: '700', lineHeight: 33, letterSpacing: -0.6, color: INK },
  tag: { height: 30, paddingHorizontal: 13, borderRadius: 100, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.55)' },
  tagText: { fontSize: 14, fontWeight: '500', letterSpacing: -0.2, color: '#6E6468' },
  desc: { marginTop: 16, fontSize: 17, fontWeight: '400', lineHeight: 23, letterSpacing: -0.3, color: '#3D3639' },
  close: {
    position: 'absolute', right: 20, zIndex: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: 'rgb(120,60,72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 7,
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  actions: { position: 'absolute', left: 18, right: 18, gap: 10 },
});
