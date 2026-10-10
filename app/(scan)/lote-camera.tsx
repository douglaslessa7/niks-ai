// ─────────────────────────────────────────────────────────────────────────────
// Câmera do scan em lote "Montar minha rotina com meus produtos" (plano da Rotina,
// Fase 5 — decisão 4). Produto por produto:
//   (topo: "Produto N"; do 6º em diante, o aviso do limite de 7)
//   1. FRENTE do produto (moldura quadrada);
//   2. RÓTULO de ingredientes (moldura alta + dicas de enquadramento) — ou "Pular rótulo".
// Depois do rótulo (ou do pular) o app monta a imagem combinada (lib/loteProdutos) e
// já pede a frente do próximo. Até 7; no 7º vai direto para a revisão. Nada é
// analisado aqui. "Pronto (N)" leva à revisão (lote-revisao).
// `?rotuloDe=<id>`: abre direto no rótulo de um produto já fotografado ("Adicionar
// foto do rótulo" da revisão) e volta.
// No simulador (sem câmera), o disparador abre a galeria.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import Svg, { Path } from 'react-native-svg';
import { useScanConsentGate } from '../../hooks/useScanConsentGate';
import { haptics } from '../../lib/haptics';
import { MAX_PRODUTOS_LOTE, montarProduto, useLote } from '../../lib/loteProdutos';

type Etapa = 'frente' | 'rotulo';

function Cantos({ w, h }: { w: number; h: number }) {
  const L = 40;
  const c = { position: 'absolute' as const, width: L, height: L, borderColor: '#FFFFFF' };
  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <View style={[c, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 }]} />
      <View style={[c, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 }]} />
      <View style={[c, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 }]} />
      <View style={[c, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 }]} />
    </View>
  );
}

export default function LoteCamera() {
  const router = useRouter();
  const { rotuloDe } = useLocalSearchParams<{ rotuloDe?: string }>();
  const { consentGate } = useScanConsentGate();
  const { width } = useWindowDimensions();
  const produtos = useLote((s) => s.produtos);
  const adicionar = useLote((s) => s.adicionar);
  const substituir = useLote((s) => s.substituir);
  const limpar = useLote((s) => s.limpar);

  const alvo = rotuloDe ? produtos.find((p) => p.id === rotuloDe) ?? null : null;
  const [etapa, setEtapa] = useState<Etapa>(alvo ? 'rotulo' : 'frente');
  const [frenteUri, setFrenteUri] = useState<string | null>(alvo?.frenteUri ?? null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const isSimulator = !Device.isDevice;

  const numero = alvo ? produtos.indexOf(alvo) + 1 : produtos.length + 1;
  const cheio = !alvo && produtos.length >= MAX_PRODUTOS_LOTE;

  const mostrarAviso = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso((a) => (a === t ? null : a)), 1800);
  };

  // Uma foto (câmera ou, no simulador, galeria).
  const fotografar = async (): Promise<string | null> => {
    if (isSimulator) {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      return r.canceled ? null : r.assets[0]?.uri ?? null;
    }
    const foto = await cameraRef.current?.takePictureAsync({ quality: 0.9, base64: false });
    return foto?.uri ?? null;
  };

  // Fecha o produto (com rótulo ou sem) → imagem combinada → próximo.
  const fecharProduto = async (frente: string, rotulo: string | null) => {
    if (alvo) {
      substituir(await montarProduto(frente, rotulo, alvo.id));
      router.back();
      return;
    }
    const p = await montarProduto(frente, rotulo);
    adicionar(p);
    setFrenteUri(null);
    setEtapa('frente');
    if (produtos.length + 1 >= MAX_PRODUTOS_LOTE) {
      router.replace('/(scan)/lote-revisao' as any);
    } else {
      mostrarAviso(`Produto ${produtos.length + 1} adicionado`);
    }
  };

  const disparar = async () => {
    if (ocupado || cheio) return;
    haptics.action();
    setOcupado(true);
    try {
      const uri = await fotografar();
      if (!uri) return;
      if (etapa === 'frente') {
        setFrenteUri(uri);
        setEtapa('rotulo');
      } else if (frenteUri) {
        await fecharProduto(frenteUri, uri);
      }
    } catch (e) {
      console.warn('[lote-camera] foto falhou:', e);
      Alert.alert('Não deu para usar essa foto', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const pularRotulo = async () => {
    if (ocupado || !frenteUri) return;
    haptics.tap();
    setOcupado(true);
    try {
      await fecharProduto(frenteUri, null);
    } catch (e) {
      console.warn('[lote-camera] montar falhou:', e);
      Alert.alert('Não deu para usar essa foto', 'Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const fechar = () => {
    haptics.tap();
    if (alvo || produtos.length === 0) { router.back(); return; }
    Alert.alert(
      'Sair do scan?',
      `Você vai perder ${produtos.length === 1 ? 'o produto fotografado' : `os ${produtos.length} produtos fotografados`}.`,
      [
        { text: 'Continuar fotografando', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => { limpar(); router.back(); } },
      ],
    );
  };

  if (!isSimulator && !permission?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ color: 'white', fontSize: 17, textAlign: 'center', marginBottom: 24 }}>
          O NIKS AI precisa da câmera para fotografar seus produtos.
        </Text>
        <TouchableOpacity
          onPress={() => { haptics.tap(); requestPermission(); }}
          style={{ backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1A1A' }}>Permitir câmera</Text>
        </TouchableOpacity>
        {consentGate}
      </View>
    );
  }

  const rotulo = etapa === 'rotulo';
  const moldW = Math.round(width * (rotulo ? 0.74 : 0.8));
  const moldH = rotulo ? Math.round(moldW * 1.3) : moldW;

  return (
    <View style={{ flex: 1, backgroundColor: '#111111' }}>
      {!isSimulator && permission?.granted && (
        <CameraView ref={cameraRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" />
      )}

      {/* Topo: fechar · "Produto N de 7" */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 60, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={fechar} accessibilityLabel="Fechar" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700', letterSpacing: -0.3 }}>
            Produto {Math.min(numero, MAX_PRODUTOS_LOTE)}
          </Text>
          {/* O limite só aparece quando chega perto (a partir do 6º produto). */}
          {numero >= 6 && (
            <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
              Você pode adicionar até {MAX_PRODUTOS_LOTE} produtos por vez
            </Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Instrução + moldura */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 70, paddingBottom: 190 }}>
        <View style={{ alignItems: 'center', marginBottom: 16, paddingHorizontal: 28, gap: 4 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' }}>
            {rotulo ? 'Agora, o rótulo de ingredientes' : 'Foto da frente do produto'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 20, textAlign: 'center' }}>
            {rotulo
              ? 'Vire o produto e enquadre a lista de ingredientes inteira. Chegue perto, com boa luz e sem reflexo.'
              : 'Com o nome e a marca bem visíveis.'}
          </Text>
        </View>
        <Cantos w={moldW} h={moldH} />
      </View>

      {/* Aviso rápido ("Produto 2 adicionado") */}
      {!!aviso && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 112, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1A1A1A' }}>✓ {aviso}</Text>
          </View>
        </View>
      )}

      {/* Base: miniaturas · disparador · pular rótulo / pronto */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 44, gap: 18 }}>
        {!alvo && produtos.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            {produtos.map((p) => (
              <ExpoImage key={p.id} source={{ uri: p.combinadaUri }} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#FFFFFF' }} contentFit="cover" />
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28 }}>
          <View style={{ width: 112 }}>
            {rotulo && !!frenteUri && (
              <ExpoImage source={{ uri: frenteUri }} style={{ width: 48, height: 48, borderRadius: 10, borderWidth: 2, borderColor: '#FFFFFF' }} contentFit="cover" />
            )}
          </View>
          <TouchableOpacity
            onPress={disparar}
            disabled={ocupado || cheio}
            accessibilityLabel={rotulo ? 'Fotografar o rótulo' : 'Fotografar a frente'}
            style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: cheio ? 0.4 : 1 }}
          >
            {ocupado
              ? <ActivityIndicator color="#FFFFFF" />
              : <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' }} />}
          </TouchableOpacity>
          <View style={{ width: 112, alignItems: 'flex-end' }}>
            {rotulo ? (alvo ? null : (
              <TouchableOpacity onPress={pularRotulo} disabled={ocupado} style={{ paddingVertical: 8 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600', textAlign: 'right' }}>Pular rótulo</Text>
              </TouchableOpacity>
            )) : !alvo && produtos.length > 0 ? (
              <TouchableOpacity
                onPress={() => { haptics.tap(); router.push('/(scan)/lote-revisao' as any); }}
                disabled={ocupado}
                style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#FF5EA8', justifyContent: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>Pronto ({produtos.length})</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
      {consentGate}
    </View>
  );
}
