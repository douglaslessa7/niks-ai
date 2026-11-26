// ─────────────────────────────────────────────────────────────────────────────
// Pós-compra v2 · passo 3 — câmera dos produtos de casa (lib/posCompraV2.ts). Visual: design-handoff/pos-compra-v2/03-camera-de-produtos.html (26/nov/2026):
// fundo preto, X no alto, visor com moldura de 180 × 260, pílula com as miniaturas do que já foi
// fotografado ("2 produtos escaneados") e os controles Flash · disparador · Concluir (com o
// número de produtos no selo).
//
// O que acontece com cada foto é o MESMO do "Montar minha rotina" da Rotina: `montarProduto`
// (lib/loteProdutos) monta a imagem que vai para a IA e a frente da estante, no store do lote.
// Uma atrás da outra, sem sair da câmera. Até 7 (o limite do lote no servidor).
// NIKS Points: a cada foto (até 10 pontuadas), a barra de nível do app desce no topo e enche
// (`ganhouPontos` → components/cartas/BarraPontosHost), como nos pontos ganhos sem carta. Só no
// aparelho: nada vai para o banco.
// "Concluir" (a partir do 1º produto) guarda as imagens e segue para o loading; o lote real
// só é enviado depois do cadastro. No simulador (sem câmera), o disparador abre a galeria.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import Svg, { Path } from 'react-native-svg';
import Sensivel from '../../components/Sensivel';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';
import { t } from '../../lib/i18n';
import { MAX_PRODUTOS_LOTE, montarProduto, useLote } from '../../lib/loteProdutos';
import { ganhouPontos } from '../../lib/pontosAnimacao';
import {
  FOTOS_PONTUADAS_MAX, guardarProdutosDeCasa, pontosDosProdutos, registrarFotoPosCompra, usePosCompraV2,
} from '../../lib/posCompraV2';

const PINK = '#FF5EA8';

export default function PcCamera() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { consentGate } = useScanConsentGate();
  const [perm, requestPermission] = useCameraPermissions();
  const isSimulator = !Device.isDevice;
  const cam = useRef<CameraView>(null);
  const produtos = useLote((s) => s.produtos);
  const adicionar = useLote((s) => s.adicionar);
  const [flash, setFlash] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [branco, setBranco] = useState(false);
  const [terminando, setTerminando] = useState(false);

  const count = produtos.length;
  const cheio = count >= MAX_PRODUTOS_LOTE;

  const fotografar = async (): Promise<string | null> => {
    if (isSimulator) {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      return r.canceled ? null : r.assets[0]?.uri ?? null;
    }
    const foto = await cam.current?.takePictureAsync({ quality: 0.9, base64: false });
    return foto?.uri ?? null;
  };

  const pontuar = () => {
    const antes = usePosCompraV2.getState().fotos;
    registrarFotoPosCompra();
    if (antes >= FOTOS_PONTUADAS_MAX) return; // a foto vale, os pontos não
    haptics.success();
    ganhouPontos({ total_antes: pontosDosProdutos(antes), total: pontosDosProdutos(antes + 1) }, { semCelebrar: true });
  };

  const disparar = async () => {
    if (ocupado || cheio || terminando) return;
    haptics.action();
    setOcupado(true);
    try {
      const uri = await fotografar();
      if (!uri) return;
      setBranco(true);
      setTimeout(() => setBranco(false), 120);
      adicionar(await montarProduto(uri, null));
      pontuar();
    } catch (e) {
      console.warn('[pc-camera] foto falhou:', e);
      Alert.alert(t('Não deu para usar essa foto'), t('Tente de novo.'));
    } finally {
      setOcupado(false);
    }
  };

  const terminar = async () => {
    if (terminando || ocupado || !count) return;
    haptics.action();
    setTerminando(true);
    try {
      await guardarProdutosDeCasa(useLote.getState().produtos);
      router.replace('/(onboarding)/pc-gerando' as any);
    } catch (e) {
      console.warn('[pc-camera] terminar falhou:', e);
      Alert.alert(t('Não deu para guardar seus produtos'), t('Tente de novo.'));
    } finally {
      setTerminando(false);
    }
  };

  // X: sem produtos, volta; com produtos, confirma (as fotos e os pontos delas se perdem).
  const sair = () => {
    haptics.tap();
    const voltar = () => {
      useLote.getState().limpar();
      usePosCompraV2.setState({ fotos: 0 });
      router.back();
    };
    if (!count) { voltar(); return; }
    Alert.alert(
      t('Sair do scan?'),
      count === 1 ? t('Você vai perder o produto fotografado.') : t('Você vai perder os {{n}} produtos fotografados.', { n: count }),
      [{ text: t('Continuar'), style: 'cancel' }, { text: t('Sair'), style: 'destructive', onPress: voltar }],
    );
  };

  if (!isSimulator && !perm?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <StatusBar style="light" />
        <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
          {t('O NIKS AI precisa da câmera para fotografar seus produtos.')}
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.tap(); requestPermission(); }}
          style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>{t('Permitir câmera')}</Text>
        </TouchableOpacity>
        {consentGate}
      </View>
    );
  }

  // Pílula acima dos controles: as miniaturas do que já foi fotografado + "N produtos
  // escaneados" (design); antes da 1ª foto, a dica de como fotografar.
  const pilula = cheio
    ? t('Você chegou no limite de {{max}} produtos', { max: MAX_PRODUTOS_LOTE })
    : count === 0
      ? t('Fotografe a frente, com o nome e a marca visíveis')
      : count === 1 ? t('1 produto escaneado') : t('{{n}} produtos escaneados', { n: count });

  const canto = (topo: boolean, esq: boolean) => (
    <View key={`${topo}${esq}`} style={{
      position: 'absolute', width: 26, height: 26, borderColor: '#FFFFFF',
      [topo ? 'top' : 'bottom']: 0, [esq ? 'left' : 'right']: 0,
      [topo ? 'borderTopWidth' : 'borderBottomWidth']: 3, [esq ? 'borderLeftWidth' : 'borderRightWidth']: 3,
      [`border${topo ? 'Top' : 'Bottom'}${esq ? 'Left' : 'Right'}Radius`]: 8,
    }} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
      {/* Topo: só o X (design 03-camera-de-produtos) */}
      <View style={{ paddingTop: Math.max(0, insets.top - 3), paddingHorizontal: 12, paddingBottom: 12 }}>
        <TouchableOpacity activeOpacity={0.6} onPress={sair} style={st.close} accessibilityLabel={t('Fechar')}>
          <Svg width={18} height={18} viewBox="0 0 18 18">
            <Path d="M2 2l14 14M16 2L2 16" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Visor com a moldura de 180 × 260 */}
      <View style={st.vf}>
        {!isSimulator && perm?.granted && (
          <Sensivel style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" flash={flash ? 'on' : 'off'} />
          </Sensivel>
        )}
        <View pointerEvents="none" style={{ width: 180, height: 260 }}>
          {canto(true, true)}{canto(true, false)}{canto(false, true)}{canto(false, false)}
        </View>
      </View>

      {/* Controles */}
      <View style={{ paddingTop: 16, paddingHorizontal: 28, paddingBottom: Math.max(insets.bottom, 20), alignItems: 'center', gap: 18 }}>
        <View style={st.pilula}>
          {count > 0 && (
            <View style={{ flexDirection: 'row' }}>
              {produtos.slice(-3).map((p, i) => (
                <Image key={p.id} source={{ uri: p.frenteUri }} style={[st.mini, i > 0 && { marginLeft: -10 }]} />
              ))}
            </View>
          )}
          <Text numberOfLines={1} style={[st.pilulaT, count === 0 && { paddingLeft: 10 }]}>{pilula}</Text>
        </View>

        <View style={st.controls}>
          <TouchableOpacity activeOpacity={0.6} onPress={() => { haptics.tap(); setFlash((f) => !f); }} style={st.lado} accessibilityLabel={flash ? t('Desligar flash') : t('Ligar flash')}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M13 2L4 14h7l-1 8 9-12h-7z" fill={flash ? '#FFFFFF' : 'none'} />
              {!flash && <Path d="M3 3l18 18" />}
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { void disparar(); }}
            disabled={ocupado || cheio || terminando}
            style={[st.shutter, (cheio || terminando) && { opacity: 0.4 }]}
            accessibilityLabel={t('Tirar foto')}
          >
            {ocupado ? <ActivityIndicator color="#fff" /> : <View style={st.shutterIn} />}
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { void terminar(); }}
            disabled={!count || ocupado || terminando}
            style={[st.lado, st.concluir, !count && { opacity: 0.4 }]}
            accessibilityLabel={count ? t('Concluir, {{n}} produtos', { n: count }) : t('Concluir')}
          >
            {terminando ? <ActivityIndicator color="#fff" /> : (
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#FFFFFF" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            )}
            {count > 0 && (
              <View style={st.badge}><Text style={st.badgeT}>{count}</Text></View>
            )}
          </TouchableOpacity>
        </View>
        <View style={[st.controls, { marginTop: -10 }]}>
          <Text style={st.rotulo}>{t('Flash')}</Text>
          <Text style={[st.rotulo, { color: '#FFFFFF', fontWeight: '600', opacity: count ? 1 : 0.4 }]}>{t('Concluir')}</Text>
        </View>
      </View>

      {branco && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} pointerEvents="none" />}
      {consentGate}
    </View>
  );
}

const st = StyleSheet.create({
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  vf: { flex: 1, backgroundColor: '#1C171B', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingLeft: 4, paddingRight: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', maxWidth: '100%' },
  pilulaT: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  mini: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#1C171B', backgroundColor: '#3a3036' },
  controls: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lado: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  concluir: { backgroundColor: PINK },
  badge: { position: 'absolute', right: -4, top: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  badgeT: { fontSize: 11, fontWeight: '700', color: PINK },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterIn: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#fff' },
  rotulo: { width: 52, textAlign: 'center', fontSize: 11, color: '#BDB3B8' },
});
