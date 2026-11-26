// ─────────────────────────────────────────────────────────────────────────────
// Aviso da CORTESIA de boas-vindas (26/nov/2026). De 12 a 26/nov o servidor recusou as
// boas-vindas de quem assinou (defeito corrigido na migration 20261226120000); essas contas
// receberam +100 NIKS Points de cortesia (20261228120000). Este aviso conta isso UMA vez:
// "Seus 100 NIKS Points chegaram ✨" + "Ver" → a Caminhada (onde o app já celebra o nível
// novo, porque o `nivel_visto` não foi mexido). Deslizar para cima dispensa.
//   · Lê `minha_cortesia()` (migration 20261229120000) ao abrir o app e ao voltar para ele;
//     marca `marcar_cortesia_vista()` ao tocar em "Ver" ou ao dispensar.
//   · Toque no PUSH da cortesia (`data.type === 'boas_vindas_cortesia'`) → abre a Caminhada e
//     marca como visto (o roteador único é lib/pushToque.ts).
// Mesmo visual do aviso do lote (components/rotina/AvisoLote.tsx), no layout do (app).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, AppState, PanResponder, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { registrarToque } from '../lib/pushToque';
import { useUserId } from '../lib/currentUser';
import { supabase } from '../lib/supabase';
import { haptics } from '../lib/haptics';
import { t } from '../lib/i18n';
import { usePalco } from '../lib/palco';
import { trackFora } from '../lib/mixpanel/MixpanelProvider';

const INK = '#121212';
const SOFT = '#6E6468';
const LOGO = require('../assets/home/score-logo-pink.png');

type Cortesia = { pontos: number; vista: boolean } | null;

async function lerCortesia(): Promise<Cortesia> {
  const { data, error } = await supabase.rpc('minha_cortesia');
  if (error) throw error;
  return (data as Cortesia) ?? null;
}

async function marcarVista(): Promise<void> {
  const { error } = await supabase.rpc('marcar_cortesia_vista');
  if (error) console.warn('[AvisoCortesia] não marcou como vista:', error.message);
}

export default function AvisoCortesia() {
  const router = useRouter();
  const palco = usePalco();
  const userId = useUserId();
  const [cortesia, setCortesia] = useState<Cortesia>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const mostrou = useRef(false);

  const conferir = useCallback(async () => {
    if (!userId) return;
    // Função ainda não publicada (ou sem rede): fica quieto, tenta na próxima.
    const c = await lerCortesia().catch(() => null);
    setCortesia(c);
  }, [userId]);

  useEffect(() => {
    void conferir();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void conferir(); });
    return () => sub.remove();
  }, [conferir]);

  const abrirCaminhada = useCallback((origem: 'aviso' | 'push') => {
    trackFora('cortesia_aberta', { origem });
    setCortesia((c) => (c ? { ...c, vista: true } : c));
    void marcarVista();
    router.push('/caminhada?de=cortesia' as any);
  }, [router]);

  // Toque no push da cortesia (inclusive o que abriu o app do zero).
  useEffect(() => registrarToque('boas_vindas_cortesia', () => abrirCaminhada('push')), [abrirCaminhada]);

  const visivel = !!cortesia && !cortesia.vista;

  useEffect(() => {
    if (visivel && !mostrou.current) {
      mostrou.current = true;
      haptics.action();
      trackFora('cortesia_aviso_visto', { pontos: cortesia?.pontos ?? 100 });
    }
    Animated.timing(anim, {
      toValue: visivel ? 1 : 0, duration: visivel ? 600 : 300,
      easing: visivel ? Easing.bezier(0.2, 0.9, 0.25, 1.12) : Easing.in(Easing.quad), useNativeDriver: true,
    }).start();
  }, [visivel, anim]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deslizar para cima dispensa (marca como visto), como no aviso do lote.
  const arraste = useRef(new Animated.Value(0)).current;
  const dispensar = useCallback(() => {
    Animated.timing(arraste, { toValue: -220, duration: 200, useNativeDriver: true }).start(() => {
      setCortesia((c) => (c ? { ...c, vista: true } : c));
      arraste.setValue(0);
    });
    trackFora('cortesia_dispensada', {});
    void marcarVista();
  }, [arraste]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => arraste.setValue(Math.min(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy < -40 || g.vy < -0.5) { haptics.tap(); dispensar(); }
      else Animated.spring(arraste, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [arraste, dispensar]);

  if (!cortesia) return null;

  return (
    <View pointerEvents="box-none" style={palco.style}>
      <Animated.View
        {...pan.panHandlers}
        pointerEvents={visivel ? 'box-none' : 'none'}
        style={[st.toast, { transform: [{ translateY: Animated.add(anim.interpolate({ inputRange: [0, 1], outputRange: [-170, 0] }), arraste) }] }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Image source={LOGO} style={{ width: 16, height: 16 }} resizeMode="contain" />
          <Text style={st.origem}>{t('NIKS · agora')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={st.titulo}>{t('Seus {{n}} NIKS Points chegaram ✨', { n: cortesia.pontos })}</Text>
            <Text style={st.sub}>{t('Seu presente de boas-vindas já está na sua conta.')}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); abrirCaminhada('aviso'); }} style={st.ver}>
            <Text style={st.verTxt}>{t('Ver')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const st = {
  toast: {
    position: 'absolute' as const, left: 10, right: 10, top: 50, zIndex: 60, backgroundColor: '#FFFFFF', borderRadius: 22,
    paddingTop: 12, paddingBottom: 12, paddingRight: 12, paddingLeft: 14, gap: 8,
    shadowColor: '#781E46', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 12,
  },
  origem: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.2, color: '#8A8387' },
  titulo: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.35, color: INK },
  sub: { fontSize: 14, letterSpacing: -0.2, color: SOFT },
  ver: { height: 34, paddingHorizontal: 16, borderRadius: 100, backgroundColor: '#FF5EA8', alignItems: 'center' as const, justifyContent: 'center' as const },
  verTxt: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.25, color: '#FFFFFF' },
};
