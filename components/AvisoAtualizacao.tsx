// ─────────────────────────────────────────────────────────────────────────────
// Aviso de versão nova (13/nov/2026, pedido do produto). Ao abrir o app, pergunta à App Store
// qual é a versão publicada do NIKS (`itunes.apple.com/lookup`, sem servidor nosso) e compara
// com a instalada (`expo-application`). Instalada mais antiga → pop-up "Nova versão do NIKS"
// com "Atualizar" (abre a página do NIKS na App Store) e "Agora não". Uma vez por abertura do
// app (fechou e abriu de novo, aparece de novo enquanto não atualizar). Não bloqueia nada: o
// bloqueio de verdade é a versão mínima (`grupos_config.versao_minima` → `app/atualize.tsx`).
// SÓ na Home, com conta logada e ASSINANTE, depois que a Home carregou e fora dos tutoriais:
// quem decide é o `(app)/_layout` (prop `liberado`). Nunca no onboarding, paywall ou login.
//
// Só iOS. TestFlight/Metro com versão MAIOR que a da loja: nada aparece. Sem internet, a App
// Store sem resposta em 6 s ou a versão ilegível: nada aparece (na dúvida, não incomoda).
// ⚠️ Só chega a quem já tem a versão com este código: quem está numa versão anterior não vê.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Application from 'expo-application';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { haptics } from '../lib/haptics';
import { trackFora } from '../lib/mixpanel/MixpanelProvider';

const BUNDLE = 'br.com.niksai.app';
const APP_STORE = 'https://apps.apple.com/app/id6760590018';
const PINK = '#FF5EA8';
const INK = '#121212';
const BODY = '#5C5458';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** `a` é mais antiga que `b`? (1.61 < 1.62 < 1.62.1; só números) */
export function versaoMaisAntiga(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

// Estado do aviso fora do React: a conferência roda uma vez por abertura do app.
type Aviso = { versao: string; url: string } | null;
let aviso: Aviso = null;
let conferido = false;
const ouvintes = new Set<() => void>();
const avisar = (a: Aviso) => { aviso = a; ouvintes.forEach((f) => f()); };

/** Pergunta à App Store a versão publicada e liga o aviso se a instalada for mais antiga. */
export async function verificarAtualizacao(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const instalada = Application.nativeApplicationVersion;
  if (!instalada) return;
  try {
    const controle = new AbortController();
    const t = setTimeout(() => controle.abort(), 6000);
    const resp = await fetch(`https://itunes.apple.com/lookup?bundleId=${BUNDLE}&country=br&t=${Date.now()}`, { signal: controle.signal });
    clearTimeout(t);
    const json = await resp.json();
    const loja = json?.results?.[0];
    const versao = typeof loja?.version === 'string' ? loja.version : null;
    if (!versao || !versaoMaisAntiga(instalada, versao)) return;
    trackFora('atualizacao_aviso_visto', { instalada, loja: versao });
    avisar({ versao, url: typeof loja?.trackViewUrl === 'string' ? loja.trackViewUrl : APP_STORE });
  } catch {
    // sem resposta: não incomoda
  }
}

export default function AvisoAtualizacao({ liberado }: { liberado: boolean }) {
  const [atual, setAtual] = useState<Aviso>(aviso);
  const rm = useReducedMotion();
  const v = useSharedValue(0);

  useEffect(() => {
    const f = () => setAtual(aviso);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);

  // Na 1ª vez que a Home está pronta nesta abertura do app (1,2 s depois, para a Home assentar).
  useEffect(() => {
    if (!liberado || conferido) return;
    const t = setTimeout(() => { conferido = true; void verificarAtualizacao(); }, 1200);
    return () => clearTimeout(t);
  }, [liberado]);

  const mostrar = !!atual && liberado;
  useEffect(() => {
    if (mostrar) v.set(withTiming(1, { duration: rm ? 200 : 260, easing: EASE_OUT }));
    else v.set(0);
  }, [mostrar, rm, v]);

  const veuSt = useAnimatedStyle(() => ({ opacity: v.get() }));
  const cardSt = useAnimatedStyle(() => (rm
    ? { opacity: v.get() }
    : { opacity: v.get(), transform: [{ scale: 0.94 + 0.06 * v.get() }] }), [rm]);

  // Saiu da Home antes de responder (ou caiu num tutorial): espera ela voltar.
  if (!atual || !liberado) return null;

  const fechar = (depois?: () => void) => {
    v.set(withTiming(0, { duration: 160, easing: EASE_OUT }));
    setTimeout(() => { avisar(null); depois?.(); }, 170);
  };
  const atualizar = () => {
    haptics.action();
    trackFora('atualizacao_aviso_atualizar', { loja: atual.versao });
    const url = atual.url;
    fechar(() => { void Linking.openURL(url).catch(() => Linking.openURL(APP_STORE)); });
  };
  const agoraNao = () => {
    haptics.tap();
    trackFora('atualizacao_aviso_agora_nao', { loja: atual.versao });
    fechar();
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veu, veuSt]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={agoraNao} accessibilityLabel="Fechar" />
      </Animated.View>
      <View style={styles.centro} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardSt]}>
          <Text style={styles.titulo}>Nova versão do NIKS</Text>
          <Text style={styles.texto}>Atualize o app para ter as novidades e as últimas melhorias.</Text>
          <View style={styles.botoes}>
            <TouchableOpacity activeOpacity={0.85} onPress={atualizar} style={[styles.btn, styles.btnPrincipal]} accessibilityRole="button" accessibilityLabel="Atualizar">
              <Text style={styles.btnT}>Atualizar</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={agoraNao} style={[styles.btn, { backgroundColor: '#F4F4F4' }]} accessibilityRole="button" accessibilityLabel="Agora não">
              <Text style={styles.btn2T}>Agora não</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  veu: { backgroundColor: 'rgba(26,8,18,0.45)' },
  centro: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    paddingTop: 30, paddingHorizontal: 22, paddingBottom: 22, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center',
    boxShadow: '0px 24px 60px rgba(0,0,0,0.25)',
  },
  titulo: { textAlign: 'center', fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8, color: INK },
  texto: { marginTop: 10, textAlign: 'center', fontSize: 15, lineHeight: 21, color: BODY },
  botoes: { marginTop: 24, alignSelf: 'stretch', gap: 10 },
  btn: { height: 54, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  btnPrincipal: { backgroundColor: PINK, boxShadow: '0px 10px 22px rgba(255,94,168,0.35)' },
  btnT: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btn2T: { color: INK, fontSize: 17, fontWeight: '600' },
});
