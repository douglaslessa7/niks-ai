// ─────────────────────────────────────────────────────────────────────────────
// "Montando sua rotina…" (plano da Rotina, Fase 6 — decisão 4). A IA roda no
// servidor (lote em `rotina_lotes`); esta tela só acompanha, e a espera não prende:
// "Continuar usando o app" volta para a Rotina, e o aviso dentro do app / o push
// avisam quando ficar pronta. Pronto → resultado (lote-resultado). Erro → "Tentar de
// novo" com as mesmas fotos (não conta para o teto do dia).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { buscarLote, tentarDeNovo, TetoDoDiaError, type Lote } from '../../lib/rotinaLotes';

const INK = '#121212';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const SOFT = '#6E6468';
const INTERVALO_MS = 3000;

export default function LoteMontando() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loteId, setLoteId] = useState(id);
  const [lote, setLote] = useState<Lote | null>(null);
  const [tentando, setTentando] = useState(false);
  const saiu = useRef(false);

  // Pulso do brilho.
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [pulso]);

  // Acompanha o lote até ficar pronto (ou dar erro).
  useEffect(() => {
    if (!loteId) return;
    let vivo = true;
    const olhar = async () => {
      const l = await buscarLote(loteId).catch(() => null);
      if (!vivo || !l) return;
      setLote(l);
      if (l.status === 'pronto' && !saiu.current) {
        saiu.current = true;
        haptics.action();
        router.replace({ pathname: '/(scan)/lote-resultado', params: { id: l.id } } as any);
      }
    };
    void olhar();
    const t = setInterval(olhar, INTERVALO_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [loteId, router]);

  const continuar = () => {
    haptics.tap();
    saiu.current = true;
    router.replace('/(app)/protocolo' as any);
  };

  const deNovo = async () => {
    if (!lote || tentando) return;
    haptics.action();
    setTentando(true);
    try {
      const novo = await tentarDeNovo(lote);
      setLote(null);
      setLoteId(novo);
    } catch (e) {
      Alert.alert(
        'Não deu para tentar de novo',
        e instanceof TetoDoDiaError ? 'Você já montou uma rotina hoje. Tente de novo amanhã.' : 'Verifique sua conexão e tente de novo.',
      );
    } finally {
      setTentando(false);
    }
  };

  const erro = lote?.status === 'erro';
  const n = lote?.caminhos.length ?? 0;
  const escala = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top + 90, paddingHorizontal: 28, alignItems: 'center' }}>
      <Animated.View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#FFF0F6', alignItems: 'center', justifyContent: 'center', transform: [{ scale: erro ? 1 : escala }] }}>
        <Svg width={38} height={38} viewBox="0 0 24 24">
          {erro
            ? <Path d="M12 8v5M12 16.5v.01M10.3 3.9L2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0z" fill="none" stroke={PINK_TEXT} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            : <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="none" stroke={PINK_TEXT} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />}
        </Svg>
      </Animated.View>

      <Text style={{ marginTop: 24, fontSize: 26, fontWeight: '700', letterSpacing: -0.6, color: INK, textAlign: 'center' }}>
        {erro ? 'Não deu para montar sua rotina' : 'Montando sua rotina…'}
      </Text>
      <Text style={{ marginTop: 10, fontSize: 16, lineHeight: 22, color: SOFT, textAlign: 'center' }}>
        {erro
          ? 'Algo deu errado do nosso lado. Suas fotos estão guardadas: é só tentar de novo.'
          : n
            ? `Estou analisando ${n === 1 ? 'seu produto' : `seus ${n} produtos`} e montando uma rotina eficaz com eles.`
            : 'Estou analisando seus produtos e montando uma rotina eficaz com eles.'}
      </Text>
      {!erro && (
        <Text style={{ marginTop: 18, fontSize: 15, fontWeight: '600', color: PINK_TEXT, textAlign: 'center' }}>
          Eu te aviso quando ficar pronta.
        </Text>
      )}

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 24, gap: 10 }}>
        {erro && (
          <TouchableOpacity onPress={deNovo} disabled={tentando} style={{ height: 52, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' }}>
            {tentando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>Tentar de novo</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={continuar}
          style={{ height: 52, borderRadius: 100, backgroundColor: erro ? '#FFF0F6' : PINK, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: erro ? PINK_TEXT : '#FFFFFF' }}>
            {erro ? 'Voltar para a Rotina' : 'Continuar usando o app'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
