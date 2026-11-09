// Aviso do cadeado da convidada e paywall `paywall_convidada` (igual ao normal, com X).
// Fechar volta para a tela em que ela estava, sem downsell.
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePlacement } from 'expo-superwall';
import { haptics } from '../../lib/haptics';
import { fecharTrava, useTrava } from '../../lib/trava';
import { definirAcesso } from '../../lib/acesso';
import { confirmPremium } from '../../lib/subscriptionGate';
import { useAppStore } from '../../store/onboarding';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import { getUserId } from '../../lib/currentUser';

export default function AvisoCadeado() {
  const frase = useTrava((s) => s.frase);
  const funcao = useTrava((s) => s.funcao);
  const pedidoPaywall = useTrava((s) => s.abrirPaywall);
  const setSubscriptionVerified = useAppStore((s) => s.setSubscriptionVerified);
  const origem = useRef('perfil');

  const { registerPlacement } = usePlacement({
    onDismiss: async (_info, result) => {
      if (result?.type !== 'purchased' && result?.type !== 'restored') {
        trackFora('convidada_paywall_fechado', { origem: origem.current });
        return;
      }
      if (await confirmPremium({ source: 'sync', attempts: 3, label: `convidada:${result.type}` })) {
        const uid = await getUserId();
        definirAcesso('assinante', uid ?? undefined);
        setSubscriptionVerified(true);
        trackFora('convidada_assinou', { origem: origem.current });
      }
    },
  });

  const abrir = (de: string) => {
    origem.current = de;
    trackFora('convidada_paywall_aberto', { origem: de });
    void registerPlacement({ placement: 'paywall_convidada' }).catch(() => {});
  };

  const visto = useRef(pedidoPaywall);
  useEffect(() => {
    if (pedidoPaywall === visto.current) return;
    visto.current = pedidoPaywall;
    abrir('perfil');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoPaywall]);

  useEffect(() => {
    if (funcao) trackFora('convidada_cadeado_tocado', { funcao });
  }, [funcao]);

  return (
    <Modal visible={!!frase} transparent animationType="fade" onRequestClose={fecharTrava}>
      <Pressable style={styles.veu} onPress={fecharTrava}>
        <Pressable style={styles.card}>
          <Text style={styles.frase}>{frase}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.botao}
            onPress={() => { haptics.action(); const f = funcao ?? 'cadeado'; fecharTrava(); setTimeout(() => abrir(f), 350); }}
          >
            <Text style={styles.botaoT}>Ver planos</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.6} style={styles.agora} onPress={() => { haptics.tap(); fecharTrava(); }}>
            <Text style={styles.agoraT}>Agora não</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veu: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 340, borderRadius: 24, backgroundColor: '#fff', padding: 24, alignItems: 'center' },
  frase: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4, color: '#121212', textAlign: 'center' },
  botao: { marginTop: 20, alignSelf: 'stretch', height: 52, borderRadius: 26, backgroundColor: '#FF5EA8', alignItems: 'center', justifyContent: 'center' },
  botaoT: { color: '#fff', fontSize: 17, fontWeight: '600' },
  agora: { marginTop: 8, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  agoraT: { color: '#7A7076', fontSize: 15, fontWeight: '500' },
});
