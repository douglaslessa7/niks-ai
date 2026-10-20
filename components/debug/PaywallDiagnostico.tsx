// Painel do diagnóstico do paywall (ver `lib/paywallDebug.ts`). Montado na raiz
// (`app/_layout.tsx`), por cima de tudo, mas só desenha algo com o diagnóstico
// LIGADO pelo link secreto — para as usuárias ele é `null`.
//
// Camada absoluta, NÃO `<Modal>`: o paywall do Superwall é um controlador nativo
// apresentado, e um `<Modal>` do RN disputando a apresentação com ele falha no iOS.
// A pausa só acontece com o paywall fechado, então a camada fica visível.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  abrirAssinaturasDaApple,
  assinarDiagnostico,
  carregarDiagnostico,
  estadoDiagnostico,
  ligarDiagnostico,
  limparHistorico,
  retratoAgora,
  soltarPendente,
  zerarComoNovaUsuaria,
  type Decisao,
  type Retrato,
} from '../../lib/paywallDebug';
import { haptics } from '../../lib/haptics';
import { OB } from '../onboarding/kit';
import { Colors } from '../../constants/colors';

const COR_DESTINO: Record<Decisao['destino'], string> = {
  paywall: OB.ink,
  cadastro: OB.pink,
  home: OB.pink,
  parado: Colors.destructive,
};

function Linha({ rotulo, valor, forte }: { rotulo: string; valor?: string; forte?: boolean }) {
  if (!valor) return null;
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 3 }}>
      <Text style={{ width: 128, fontSize: 12, color: OB.sub }}>{rotulo}</Text>
      <Text style={{ flex: 1, fontSize: 12, color: OB.ink, fontWeight: forte ? '700' : '400' }}>{valor}</Text>
    </View>
  );
}

function RetratoView({ r }: { r: Retrato }) {
  return (
    <View>
      <Linha rotulo="Premium (RevenueCat)" valor={r.premium} forte />
      <Linha rotulo="Produto" valor={r.produto} />
      <Linha rotulo="Vale até" valor={r.valeAte} />
      <Linha rotulo="Renova sozinha" valor={r.renova} />
      <Linha rotulo="Ambiente" valor={r.ambiente} forte />
      <Linha rotulo="Tipo" valor={r.tipo} />
      <Linha rotulo="Última compra" valor={r.compradaEm} />
      <Linha rotulo="1ª compra" valor={r.primeiraCompra} />
      <Linha rotulo="Cancelamento" valor={r.cancelada} />
      <Linha rotulo="Histórico" valor={r.jaTeve} />
      <Linha rotulo="Assinaturas ativas" valor={r.assinaturasAtivas} />
      <Linha rotulo="Superwall vê" valor={r.superwall} forte />
      <Linha rotulo="Sessão (conta)" valor={r.sessao} />
      <Linha rotulo="ID RevenueCat" valor={`${r.rcId} (${r.rcAnonimo})`} />
      <Linha rotulo="Lido às" valor={r.em} />
    </View>
  );
}

function DecisaoView({ d }: { d: Decisao }) {
  return (
    <View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: OB.sub, letterSpacing: 0.6 }}>DECISÃO</Text>
      <Text style={{ marginTop: 2, fontSize: 18, lineHeight: 23, fontWeight: '800', color: COR_DESTINO[d.destino] }}>
        {d.decisao}
      </Text>
      <Text style={{ marginTop: 6, fontSize: 13, color: OB.ink }}>
        <Text style={{ fontWeight: '700' }}>Gatilho: </Text>{d.gatilho}
      </Text>
      {d.explicacao ? <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 17, color: OB.body }}>{d.explicacao}</Text> : null}
      {d.retrato ? (
        <View style={{ marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: OB.option }}>
          <RetratoView r={d.retrato} />
        </View>
      ) : null}
      {d.caminho.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: OB.sub, letterSpacing: 0.6 }}>CAMINHO ATÉ AQUI</Text>
          {d.caminho.map((p, i) => (
            <Text key={i} style={{ marginTop: 2, fontSize: 11, lineHeight: 15, color: OB.body, fontFamily: 'Menlo' }}>{p}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Botao({ titulo, onPress, cor = OB.pink }: { titulo: string; onPress: () => void; cor?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ marginTop: 10, height: 44, borderRadius: 22, backgroundColor: cor, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{titulo}</Text>
    </TouchableOpacity>
  );
}

export default function PaywallDiagnostico() {
  const insets = useSafeAreaInsets();
  const estado = useSyncExternalStore(assinarDiagnostico, estadoDiagnostico);
  const [aberto, setAberto] = useState(false);
  const [agora, setAgora] = useState<Retrato | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  useEffect(() => { void carregarDiagnostico(); }, []);

  if (!estado.ligado) return null;

  const cartao = {
    marginTop: insets.top + 8, marginHorizontal: 10, marginBottom: insets.bottom + 8,
    flex: 1, borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16,
  };

  // 1) Decisão pendente: o app está parado esperando o "Continuar".
  if (estado.pendente) {
    return (
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, elevation: 9999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <View style={cartao}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: OB.pink }}>DIAGNÓSTICO DO PAYWALL · o app está pausado</Text>
          <ScrollView style={{ flex: 1, marginTop: 10 }}>
            <DecisaoView d={estado.pendente} />
          </ScrollView>
          <Botao titulo="Continuar" onPress={() => { haptics.action(); soltarPendente(); }} />
        </View>
      </View>
    );
  }

  // 2) Painel aberto pela pílula: histórico + ações.
  if (aberto) {
    const verAgora = async () => { haptics.tap(); setAgora(await retratoAgora()); };
    const zerar = () => {
      haptics.warning();
      Alert.alert(
        'Zerar como usuária nova?',
        'Sai da conta, troca a identidade do RevenueCat, zera o Superwall e apaga os dados do app neste aparelho. O app reabre no começo do onboarding. A assinatura de teste do Apple ID NÃO é apagada.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Zerar',
            style: 'destructive',
            onPress: async () => {
              const msg = await zerarComoNovaUsuaria();
              if (msg) Alert.alert('Diagnóstico', msg);
            },
          },
        ],
      );
    };
    return (
      <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, elevation: 9999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <View style={cartao}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: OB.pink }}>DIAGNÓSTICO DO PAYWALL</Text>
            <TouchableOpacity onPress={() => { haptics.tap(); setAberto(false); }} hitSlop={12}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: OB.ink }}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1, marginTop: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: OB.sub, letterSpacing: 0.6 }}>ESTADO AGORA</Text>
            {agora ? <View style={{ marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: OB.option }}><RetratoView r={agora} /></View> : null}
            <Botao titulo={agora ? 'Ler de novo' : 'Ler estado agora'} onPress={verAgora} cor={OB.ink} />

            <Text style={{ marginTop: 18, fontSize: 11, fontWeight: '700', color: OB.sub, letterSpacing: 0.6 }}>
              ÚLTIMAS DECISÕES ({estado.historico.length})
            </Text>
            {estado.historico.length === 0 ? (
              <Text style={{ marginTop: 6, fontSize: 13, color: OB.sub }}>Nenhuma ainda.</Text>
            ) : estado.historico.map((d) => (
              <TouchableOpacity
                key={d.id}
                activeOpacity={0.8}
                onPress={() => { haptics.tap(); setExpandido(expandido === d.id ? null : d.id); }}
                style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: OB.divider }}
              >
                {expandido === d.id ? <DecisaoView d={d} /> : (
                  <>
                    <Text style={{ fontSize: 11, color: OB.sub }}>{d.retrato?.em ?? ''} · {d.gatilho}</Text>
                    <Text style={{ marginTop: 2, fontSize: 14, fontWeight: '700', color: COR_DESTINO[d.destino] }}>{d.decisao}</Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: OB.body }}>
                      Premium: {d.retrato?.premium ?? '?'}{d.retrato?.produto ? ` · ${d.retrato.produto}` : ''}{d.retrato?.valeAte ? ` · até ${d.retrato.valeAte}` : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ))}

            <Text style={{ marginTop: 18, fontSize: 11, fontWeight: '700', color: OB.sub, letterSpacing: 0.6 }}>AÇÕES</Text>
            <Botao titulo="Cancelar assinatura de teste (Apple)" onPress={() => { haptics.tap(); void abrirAssinaturasDaApple(); }} cor={OB.ink} />
            <Botao titulo="Zerar como usuária nova" onPress={zerar} cor={Colors.destructive} />
            <Botao titulo="Limpar histórico" onPress={() => { haptics.tap(); limparHistorico(); }} cor={OB.sub} />
            <Botao titulo="Desligar diagnóstico" onPress={() => { haptics.tap(); setAberto(false); ligarDiagnostico(false); }} cor={OB.sub} />
          </ScrollView>
        </View>
      </View>
    );
  }

  // 3) Ligado e sem nada pendente: só a pílula, no topo (não cobre a tela).
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 9999, elevation: 9999 }}>
      <TouchableOpacity
        onPress={() => { haptics.tap(); setAberto(true); }}
        activeOpacity={0.85}
        style={{
          position: 'absolute', top: insets.top + 2, right: 10,
          paddingHorizontal: 10, height: 24, borderRadius: 12,
          backgroundColor: OB.ink, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>diag PW</Text>
      </TouchableOpacity>
    </View>
  );
}
