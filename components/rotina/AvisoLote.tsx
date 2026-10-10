// ─────────────────────────────────────────────────────────────────────────────
// Aviso dentro do app do "Montar minha rotina com meus produtos" (plano da Rotina,
// Fase 6). Vive no layout do (app) — por cima de qualquer aba, como irmão da navbar.
//   · Lote que terminou e ela ainda não viu → cartão no topo: "Sua rotina está pronta
//     · Ver" (ou "Não deu para montar sua rotina · Ver"). Tocar abre o resultado / a
//     tela de erro; o x dispensa (marca como visto). A Minha rotina já foi trocada no
//     servidor — o aviso só conta que ficou pronta.
//   · Enquanto há lote processando, confere a cada 5 s; fora isso, ao abrir o app e ao
//     voltar para ele.
//   · Toque no PUSH do lote (`data.type === 'rotina_lote'`), com o app aberto, em
//     segundo plano ou fechado → abre o resultado (ou a tela de erro / "Montando…").
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import Svg, { Path } from 'react-native-svg';
import { useUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';
import { invalidateCache } from '../../lib/cache';
import { buscarLote, lotePendente, marcarVisto, type Lote } from '../../lib/rotinaLotes';

const INK = '#121212';
const PINK_TEXT = '#E8468F';
const SOFT = '#6E6468';
const INTERVALO_MS = 5000;

export default function AvisoLote() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const [lote, setLote] = useState<Lote | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const ultimoStatus = useRef<string | null>(null);

  const abrir = useCallback((l: Lote) => {
    if (l.status === 'pronto') router.push({ pathname: '/(scan)/lote-resultado', params: { id: l.id } } as any);
    else router.push({ pathname: '/(scan)/lote-montando', params: { id: l.id } } as any);
  }, [router]);

  const conferir = useCallback(async () => {
    if (!userId) return;
    const l = await lotePendente(userId).catch(() => null);
    // Terminou agora: a Rotina e o link dela precisam reler.
    if (l && ultimoStatus.current === 'processando' && l.status !== 'processando') {
      invalidateCache(`lotehoje:${userId}`);
      invalidateCache(`minharotina:${userId}`); // a rotina foi trocada no servidor
    }
    ultimoStatus.current = l?.status ?? null;
    setLote(l);
  }, [userId]);

  // Ao abrir, ao voltar para o app e, com lote processando, a cada 5 s.
  useEffect(() => {
    void conferir();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void conferir(); });
    return () => sub.remove();
  }, [conferir]);
  useEffect(() => {
    if (lote?.status !== 'processando') return;
    const t = setInterval(conferir, INTERVALO_MS);
    return () => clearInterval(t);
  }, [lote?.status, conferir]);

  // Toque no push do lote (inclusive o que abriu o app do zero).
  useEffect(() => {
    const tratar = async (r: Notifications.NotificationResponse | null) => {
      const d = r?.notification.request.content.data as { type?: string; lote_id?: string } | undefined;
      if (d?.type !== 'rotina_lote' || !d.lote_id) return;
      const l = await buscarLote(d.lote_id).catch(() => null);
      if (l) { setLote(null); abrir(l); }
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      void tratar(r);
      if (r) void Notifications.clearLastNotificationResponseAsync?.();
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => { void tratar(r); });
    return () => sub.remove();
  }, [abrir]);

  const visivel = !!lote && lote.status !== 'processando' && !lote.visto_em;
  useEffect(() => {
    if (visivel) haptics.action();
    Animated.timing(anim, { toValue: visivel ? 1 : 0, duration: visivel ? 380 : 220, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
  }, [visivel, anim]);

  if (!lote || lote.status === 'processando') return null;
  const ok = lote.status === 'pronto';

  return (
    <Animated.View
      pointerEvents={visivel ? 'box-none' : 'none'}
      style={{
        position: 'absolute', top: insets.top + 8, left: 14, right: 14,
        opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => { haptics.tap(); setLote(null); abrir(lote); }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF',
          shadowColor: '#783C48', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 8,
        }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF0F6', alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            {ok
              ? <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="none" stroke={PINK_TEXT} strokeWidth={1.8} strokeLinejoin="round" />
              : <Path d="M12 8v5M12 16.5v.01M10.3 3.9L2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0z" fill="none" stroke={PINK_TEXT} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
          </Svg>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: INK }}>
            {ok ? 'Sua rotina está pronta' : 'Não deu para montar sua rotina'}
          </Text>
          <Text style={{ marginTop: 1, fontSize: 14, color: SOFT }} numberOfLines={1}>
            {ok ? 'Montei com seus produtos.' : 'Suas fotos estão guardadas.'}
          </Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: PINK_TEXT }}>{ok ? 'Ver' : 'Tentar'}</Text>
        <TouchableOpacity
          onPress={() => { haptics.tap(); const l = lote; setLote(null); void marcarVisto(l.id); }}
          hitSlop={10}
          accessibilityLabel="Dispensar"
          style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
        >
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={SOFT} strokeWidth={2.6} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}
