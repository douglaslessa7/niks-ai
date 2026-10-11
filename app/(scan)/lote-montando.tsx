// ─────────────────────────────────────────────────────────────────────────────
// "Montando sua rotina" — réplica do Claude Design (`NiksLoteFlo`, tela 55f). A IA roda
// no servidor (lote em `rotina_lotes`); esta tela só acompanha, e a espera não prende:
// "Continuar usando o app" volta para onde ela estava, e o aviso dentro do app / o push
// avisam quando ficar pronta. Pronto → resultado (lote-resultado). Erro → "Tentar de
// novo" com as mesmas fotos (não conta para o teto do dia).
// As 3 etapas ("Lendo os rótulos → Cruzando com a sua pele → Separando manhã e noite")
// avançam pelo TEMPO desde a criação do lote (o servidor não informa a etapa): uma a
// cada 7 s, e a última fica girando até o lote ficar pronto.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { haptics } from '../../lib/haptics';
import { usePalco } from '../../lib/palco';
import { buscarLote, fotosDoLote, tentarDeNovo, TetoDoDiaError, type Lote } from '../../lib/rotinaLotes';

const INK = '#121212';
const PINK = '#FF5EA8';
const SOFT = '#6E6468';
const INTERVALO_MS = 3000;
const ETAPA_MS = 7000;
const CHECKS = ['Lendo os rótulos', 'Cruzando com a sua pele', 'Separando manhã e noite'];
const LOGO = require('../../assets/home/score-logo-pink.png');

export default function LoteMontando() {
  const router = useRouter();
  const palco = usePalco();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loteId, setLoteId] = useState(id);
  const [lote, setLote] = useState<Lote | null>(null);
  const [fotos, setFotos] = useState<Record<number, string>>({});
  const [tentando, setTentando] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const saiu = useRef(false);

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

  // Fotos dos produtos para a órbita (uma vez por lote).
  const fotosDe = useRef<string | null>(null);
  useEffect(() => {
    if (!lote || fotosDe.current === lote.id) return;
    fotosDe.current = lote.id;
    void fotosDoLote(lote).then(setFotos).catch(() => {});
  }, [lote]);

  // Relógio das etapas.
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 500); return () => clearInterval(t); }, []);
  const inicio = lote ? new Date(lote.criado_em).getTime() : agora;
  const chk = Math.min(CHECKS.length - 1, Math.max(0, Math.floor((agora - inicio) / ETAPA_MS)));

  // Animações: logo "respirando" (2,8 s), órbita (30 s) e o spinner da etapa (0,9 s).
  const respira = useRef(new Animated.Value(0)).current;
  const orbita = useRef(new Animated.Value(0)).current;
  const gira = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(respira, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(respira, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.timing(orbita, { toValue: 1, duration: 30000, easing: Easing.linear, useNativeDriver: true }));
    const c = Animated.loop(Animated.timing(gira, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [respira, orbita, gira]);

  const continuar = () => {
    haptics.tap();
    saiu.current = true;
    router.dismissAll();
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
  const imgs = Array.from({ length: Math.min(n, 7) }, (_, i) => fotos[i + 1] ?? null);
  const giro = orbita.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const contraGiro = orbita.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#FFE3EF', '#FFD3E5', '#FDDFEB', '#FBEEF3', '#F9F2F5']}
        locations={[0, 0.3, 0.58, 0.8, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={palco.style} pointerEvents="box-none">
        <View pointerEvents="none" style={{ position: 'absolute', width: 560, height: 560, borderRadius: 280, left: -84, top: -120, backgroundColor: 'rgba(255,255,255,0.32)' }} />

        {/* Círculo com o logo e os produtos em órbita */}
        <View pointerEvents="none" style={{ position: 'absolute', left: (393 - 240) / 2, top: 128, width: 240, height: 240 }}>
          <View style={{ position: 'absolute', left: 24, top: 24, right: 24, bottom: 24, borderRadius: 96, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' }} />
          <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 120, borderWidth: 2, borderStyle: 'dotted', borderColor: 'rgba(192,32,106,0.22)' }} />
          <View style={{ position: 'absolute', left: 80, top: 80, width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.Image
              source={LOGO}
              style={{ width: 76, height: 76, transform: [{ scale: respira.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }] }}
              resizeMode="contain"
            />
          </View>
          {!erro && (
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: 240, height: 240, transform: [{ rotate: giro }] }}>
              {imgs.map((uri, i, arr) => {
                const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
                return (
                  <Animated.View
                    key={i}
                    style={[st.orbitTile, { left: 120 + 108 * Math.cos(a) - 24, top: 120 + 108 * Math.sin(a) - 24, transform: [{ rotate: contraGiro }] }]}
                  >
                    {!!uri && <ExpoImage source={{ uri }} style={{ width: 34, height: 34, borderRadius: 6 }} contentFit="contain" />}
                  </Animated.View>
                );
              })}
            </Animated.View>
          )}
        </View>

        {/* Textos */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 28, right: 28, top: 398, alignItems: 'center', gap: 8 }}>
          <Text style={st.titulo}>{erro ? 'Não deu para montar sua rotina' : 'Montando sua rotina'}</Text>
          <Text style={st.sub}>
            {erro
              ? 'Algo deu errado do nosso lado. Suas fotos estão guardadas: é só tentar de novo.'
              : n === 1
                ? 'Estou analisando seu produto e encaixando no passo certo pra sua pele.'
                : `Estou analisando seus ${n || ''} produtos e encaixando cada um no passo certo pra sua pele.`.replace('seus  ', 'seus ')}
          </Text>
        </View>

        {/* Etapas */}
        {!erro && (
          <View pointerEvents="none" style={st.checks}>
            {CHECKS.map((t, i) => {
              const done = i < chk;
              const active = i === chk;
              return (
                <View key={t} style={[st.checkRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#F3EDF0' }]}>
                  <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                    {done ? (
                      <View style={st.checkDone}>
                        <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#FFFFFF" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                      </View>
                    ) : active ? (
                      <Animated.View style={[st.spinner, { transform: [{ rotate: gira.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} />
                    ) : (
                      <View style={st.checkTodo} />
                    )}
                  </View>
                  <Text style={[st.checkTxt, { fontWeight: active ? '600' : '500', color: i <= chk ? INK : '#A39A9F' }]}>{t}</Text>
                </View>
              );
            })}
          </View>
        )}

        {!erro && (
          <Text pointerEvents="none" style={st.rodape}>Leva alguns segundos. Pode seguir usando o app, eu te aviso quando ficar pronta.</Text>
        )}

        {erro && (
          <TouchableOpacity onPress={deNovo} disabled={tentando} activeOpacity={0.85} style={[st.botao, { bottom: 34 + 52 + 10 }]}>
            {tentando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={st.botaoTxt}>Tentar de novo</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={continuar} activeOpacity={0.85} style={[st.botao, erro && { backgroundColor: '#FFFFFF', shadowOpacity: 0 }]}>
          <Text style={[st.botaoTxt, erro && { color: '#E8468F' }]}>{erro ? 'Voltar' : 'Continuar usando o app'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = {
  orbitTile: {
    position: 'absolute' as const, width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center' as const, justifyContent: 'center' as const,
    shadowColor: '#781E46', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 9,
  },
  titulo: { fontSize: 26, fontWeight: '700' as const, lineHeight: 31, letterSpacing: -0.7, color: INK, textAlign: 'center' as const },
  sub: { fontSize: 15, lineHeight: 20, letterSpacing: -0.25, color: SOFT, textAlign: 'center' as const },
  checks: {
    position: 'absolute' as const, left: 20, right: 20, top: 508, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 4, paddingHorizontal: 16,
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1,
  },
  checkRow: { height: 50, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  checkDone: { width: 22, height: 22, borderRadius: 11, backgroundColor: PINK, alignItems: 'center' as const, justifyContent: 'center' as const },
  spinner: { width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: '#F6D9E5', borderTopColor: PINK },
  checkTodo: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#EDE3E8' },
  checkTxt: { fontSize: 16, letterSpacing: -0.3 },
  rodape: { position: 'absolute' as const, left: 32, right: 32, bottom: 104, fontSize: 14, lineHeight: 19, letterSpacing: -0.2, color: SOFT, textAlign: 'center' as const },
  botao: {
    position: 'absolute' as const, left: 20, right: 20, bottom: 34, height: 52, borderRadius: 100, backgroundColor: PINK,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 8,
  },
  botaoTxt: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.3, color: '#FFFFFF' },
};
