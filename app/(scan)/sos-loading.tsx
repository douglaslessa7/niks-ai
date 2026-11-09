import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ScanLoadingView } from '../../components/scan/ScanLoadingView';
import { ObPillButton } from '../../components/onboarding/kit';
import { haptics } from '../../lib/haptics';
import { analisarEspinha, fotoAtual, lerUltimaAnalise, limparFoto, salvarUltimaAnalise } from '../../lib/sosEspinha';

// Carregamento do SOS espinha: a tela única de loading dos scans, com a foto dela e a linha
// de scan no disco. Os três desfechos sem análise têm texto e botão próprios.

type Aviso = { titulo: string; texto: string; botao: string; acao: () => void };

const DISCO = 224;

function FotoComScan({ uri }: { uri?: string }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(y, { toValue: DISCO - 2, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [y]);
  return (
    <View style={{ width: DISCO, height: DISCO, borderRadius: DISCO / 2, overflow: 'hidden', backgroundColor: '#FFE3EF' }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: '#FF5EA8', transform: [{ translateY: y }] }} />
    </View>
  );
}

export default function SosLoading() {
  const router = useRouter();
  const [percentual, setPercentual] = useState(0);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [uri] = useState(() => fotoAtual()?.uri);
  const vivoRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atualRef = useRef(0);
  const rodandoRef = useRef(false);

  // Cerca de 9 s até 92%, o tempo típico da análise; depois anda devagar até 99.
  const andar = useCallback(() => {
    if (atualRef.current >= 99) return;
    const c = atualRef.current;
    timerRef.current = setTimeout(() => {
      atualRef.current += 1;
      setPercentual(atualRef.current);
      andar();
    }, c < 60 ? 70 : c < 80 ? 130 : c < 92 ? 300 : 3000);
  }, []);

  const pararBarra = () => { if (timerRef.current) clearTimeout(timerRef.current); };

  const outraFoto = useCallback(() => { haptics.tap(); router.back(); }, [router]);

  const executar = useCallback(async () => {
    if (rodandoRef.current) return;
    rodandoRef.current = true;
    setAviso(null);
    atualRef.current = 0;
    setPercentual(0);
    andar();
    const r = await analisarEspinha();
    rodandoRef.current = false;
    if (!vivoRef.current) return;
    pararBarra();

    if (r.status === 'ok') {
      await salvarUltimaAnalise(r);
      limparFoto();
      setPercentual(100);
      haptics.success();
      setTimeout(() => { if (vivoRef.current) router.replace('/(scan)/sos-resultado' as any); }, 400);
      return;
    }
    if (r.status === 'precisa_foto') {
      setAviso({ titulo: 'Não consegui ver bem', texto: 'Tire outra foto, com boa luz e com a espinha no centro.', botao: 'Tirar outra foto', acao: outraFoto });
    } else if (r.status === 'limite') {
      const temUltima = !!(await lerUltimaAnalise());
      if (!vivoRef.current) return;
      setAviso({
        titulo: 'Você já fez 5 análises hoje',
        texto: 'Amanhã você pode analisar de novo. Até lá, siga os cuidados da sua última análise.',
        botao: temUltima ? 'Ver minha última análise' : 'Concluir',
        acao: () => { haptics.tap(); router.replace((temUltima ? '/(scan)/sos-resultado' : '/(app)/home') as any); },
      });
    } else {
      setAviso({ titulo: 'Não deu para analisar agora', texto: 'Verifique sua internet e tente de novo.', botao: 'Tentar novamente', acao: () => { haptics.tap(); executar(); } });
    }
  }, [andar, outraFoto, router]);

  useEffect(() => {
    vivoRef.current = true;
    executar();
    return () => { vivoRef.current = false; pararBarra(); limparFoto(); };
    // Só na montagem: refazer este efeito apagaria a foto no meio da análise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (aviso) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9F2F5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <LinearGradient colors={['#FFE3EF', '#FCEAF2', '#F9F2F5', '#F9F2F5']} locations={[0, 0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
        <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: '#121212', textAlign: 'center' }}>{aviso.titulo}</Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: '#515151', textAlign: 'center', marginTop: 10, marginBottom: 28 }}>{aviso.texto}</Text>
        <ObPillButton label={aviso.botao} onPress={aviso.acao} width={280} />
      </View>
    );
  }

  return (
    <ScanLoadingView
      kind="sos"
      percentage={percentual}
      showDemandNotice={false}
      countdown={0}
      countdownPaused={false}
      showError={false}
      onRetry={executar}
      center={<FotoComScan uri={uri} />}
    />
  );
}
