// ─────────────────────────────────────────────────────────────────────────────
// Aviso dentro do app do "Montar minha rotina com meus produtos" (plano da Rotina,
// Fase 6). Vive no layout do (app) — por cima de qualquer aba, como irmão da navbar.
//   · Lote que terminou e ela ainda não viu → o aviso do Claude Design (55g) desce do
//     topo: "NIKS · agora", as fotos dos produtos usados, "Sua rotina está pronta ·
//     Montei com K dos seus N produtos" + "Ver" (ou "Não deu para montar sua rotina ·
//     Tentar"). "Ver" abre o resultado / a tela de erro; deslizar para cima dispensa
//     (marca como visto). A Minha rotina já foi trocada no servidor.
//   · Enquanto há lote processando, confere a cada 5 s; fora isso, ao abrir o app e ao
//     voltar para ele.
//   · Toque no PUSH do lote (`data.type === 'rotina_lote'`), com o app aberto, em
//     segundo plano ou fechado → abre o resultado (ou a tela de erro / "Montando…").
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, AppState, PanResponder, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import * as Notifications from 'expo-notifications';
import { useUserId } from '../../lib/currentUser';
import { haptics } from '../../lib/haptics';
import { invalidateCache } from '../../lib/cache';
import { buscarLote, fotosDoLote, lotePendente, marcarVisto, type Lote } from '../../lib/rotinaLotes';
import { usePalco } from '../../lib/palco';

const INK = '#121212';
const SOFT = '#6E6468';
const INTERVALO_MS = 5000;

export default function AvisoLote() {
  const router = useRouter();
  const palco = usePalco();
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

  // Fotos dos produtos que entraram na rotina (até 3, empilhadas como no design).
  const [fotos, setFotos] = useState<Record<number, string>>({});
  const fotosDe = useRef<string | null>(null);
  useEffect(() => {
    if (!lote || lote.status !== 'pronto' || fotosDe.current === lote.id) return;
    fotosDe.current = lote.id;
    void fotosDoLote(lote).then(setFotos).catch(() => {});
  }, [lote]);

  // Entrada: desce do topo (.6s, cubic-bezier(.2,.9,.25,1.12) — passa um pouco e volta).
  useEffect(() => {
    if (visivel) haptics.action();
    Animated.timing(anim, {
      toValue: visivel ? 1 : 0, duration: visivel ? 600 : 300,
      easing: visivel ? Easing.bezier(0.2, 0.9, 0.25, 1.12) : Easing.in(Easing.quad), useNativeDriver: true,
    }).start();
  }, [visivel, anim]);

  // Deslizar para cima dispensa (marca como visto) — o design não tem X.
  const arraste = useRef(new Animated.Value(0)).current;
  const dispensar = useCallback(() => {
    const l = lote;
    if (!l) return;
    Animated.timing(arraste, { toValue: -220, duration: 200, useNativeDriver: true }).start(() => {
      setLote(null);
      arraste.setValue(0);
    });
    void marcarVisto(l.id);
  }, [lote, arraste]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => arraste.setValue(Math.min(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy < -40 || g.vy < -0.5) { haptics.tap(); dispensar(); }
      else Animated.spring(arraste, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [arraste, dispensar]);

  if (!lote || lote.status === 'processando') return null;
  const ok = lote.status === 'pronto';
  const r = lote.resultado;
  const naRotina = r ? [...new Set([...r.rotina.am, ...r.rotina.pm].map((p) => p.produto_indice))] : [];
  const total = lote.caminhos.length;
  const usados = naRotina.slice(0, 3);

  return (
    <View pointerEvents="box-none" style={palco.style}>
      <Animated.View
        {...pan.panHandlers}
        pointerEvents={visivel ? 'box-none' : 'none'}
        style={[st.toast, { transform: [{ translateY: Animated.add(anim.interpolate({ inputRange: [0, 1], outputRange: [-170, 0] }), arraste) }] }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Image source={LOGO} style={{ width: 16, height: 16 }} resizeMode="contain" />
          <Text style={st.origem}>NIKS · agora</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {ok && usados.length > 0 && (
            <View style={{ flexDirection: 'row' }}>
              {usados.map((n, i) => (
                <View key={n} style={[st.bolinha, { marginLeft: i ? -12 : 0, backgroundColor: TINT[i % TINT.length] }]}>
                  {!!fotos[n] && <ExpoImage source={{ uri: fotos[n] }} style={{ width: 24, height: 24 }} contentFit="contain" />}
                </View>
              ))}
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={st.titulo}>{ok ? 'Sua rotina está pronta' : 'Não deu para montar sua rotina'}</Text>
            <Text style={st.sub}>
              {ok
                ? (naRotina.length ? `Montei com ${naRotina.length} dos seus ${total} produtos.` : 'Veja o que achei dos seus produtos.')
                : 'Suas fotos estão guardadas.'}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); setLote(null); abrir(lote); }} style={st.ver}>
            <Text style={st.verTxt}>{ok ? 'Ver' : 'Tentar'}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// Fundo das bolinhas dos produtos, na ordem do design.
const TINT = ['#E2F1EF', '#E3EEF8', '#FFF1D6'];
const LOGO = require('../../assets/home/score-logo-pink.png');

const st = {
  toast: {
    position: 'absolute' as const, left: 10, right: 10, top: 50, zIndex: 60, backgroundColor: '#FFFFFF', borderRadius: 22,
    paddingTop: 12, paddingBottom: 12, paddingRight: 12, paddingLeft: 14, gap: 8,
    shadowColor: '#781E46', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 12,
  },
  origem: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.2, color: '#8A8387' },
  bolinha: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  titulo: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.35, color: INK },
  sub: { fontSize: 14, letterSpacing: -0.2, color: SOFT },
  ver: { height: 34, paddingHorizontal: 16, borderRadius: 100, backgroundColor: '#FF5EA8', alignItems: 'center' as const, justifyContent: 'center' as const },
  verTxt: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.25, color: '#FFFFFF' },
};
