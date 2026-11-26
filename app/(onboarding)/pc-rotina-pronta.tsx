import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { t } from '../../lib/i18n';
import { haptics } from '../../lib/haptics';
import { useMixpanel } from '../../lib/mixpanel/MixpanelProvider';
import { useAppStore } from '../../store/onboarding';
import { useObName } from '../../components/onboarding/kit';
import { boasVindasAtual, setLembreteBoasVindas } from '../../lib/boasVindas';
import { BvScreen, dataMeta, diaMesLongo, menosDe, useDorPrincipal } from '../../components/boasVindas/kit';
import { PC, PcBotao, PcCheck, usePcFrame } from '../../components/posCompra/pcKit';

// Pós-compra v2 · tela 5 "Sua rotina está pronta, <nome>!"
// (design-handoff/pos-compra-v2/05-sua-rotina-esta-pronta.html).
// Topo rosa com a onda, o selo de check e o card com manhã · noite · scan semanal; "Foco do
// plano" = a DOR PRINCIPAL (a da carta de alerta) e "Data do marco" = hoje + 30 dias.
// Os passos vêm da rotina pré-gerada (manhã: quantos e quais; noite: quantos); sem ela ainda,
// os números do design (4 e 3).
// As três caixas: "Me lembrar…" é o mesmo interruptor da bv-sequencia (`setLembreteBoasVindas`).
// As outras duas ainda só ficam na tela (registradas no Mixpanel): não há preferência
// guardada para elas no app.
const MANHA_PROVISORIO = 4;
const NOITE_PROVISORIO = 3;

function listaNatural(nomes: string[]): string {
  const n = nomes.map((s, i) => (i === 0 ? s : s.charAt(0).toLocaleLowerCase('pt-BR') + s.slice(1)));
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} ${t('e')} ${n[n.length - 1]}`;
}

function Caixa({ marcada, texto, onPress }: { marcada: boolean; texto: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { haptics.select(); onPress(); }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      <View style={{
        width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
        backgroundColor: marcada ? PC.pink : '#FFFFFF', borderWidth: marcada ? 0 : 1.5, borderColor: '#C9BFC4',
      }}>
        {marcada && <PcCheck size={14} cor="#FFFFFF" traco={2.2} />}
      </View>
      <Text style={{ flex: 1, fontSize: 15, color: PC.ink }}>{texto}</Text>
    </Pressable>
  );
}

export default function PcRotinaPronta() {
  const router = useRouter();
  const { track } = useMixpanel();
  const name = useObName();
  const dor = useDorPrincipal();
  const { top, bottom } = usePcFrame();
  const dy = top - 59;
  const rotina = useAppStore((s) => s.prefetchedProtocol?.result ?? s.protocolResult);
  const manha = rotina?.morning ?? [];
  const noite = rotina?.night ?? [];
  const nManha = manha.length || MANHA_PROVISORIO;
  const nNoite = noite.length || NOITE_PROVISORIO;
  const descManha = manha.length
    ? `${listaNatural(manha.map((p) => p.name))}.`
    : t('Limpeza, sérum, hidratante e protetor.');

  const [lembrar, setLembrar] = useState(boasVindasAtual().lembrete);
  const [avisarScan, setAvisarScan] = useState(true);
  const [dicas, setDicas] = useState(true);

  const item = (icone: React.ReactNode, titulo: string, texto: string) => (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: PC.rosaClaro, alignItems: 'center', justifyContent: 'center' }}>
        {icone}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: PC.ink }}>{titulo}</Text>
        <Text style={{ fontSize: 13, color: PC.sub }}>{texto}</Text>
      </View>
    </View>
  );
  const quadro = (rotulo: string, valor: string) => (
    <View style={{ flex: 1, borderWidth: 1.5, borderColor: '#F0E6EB', borderRadius: 16, padding: 12, alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 13, color: PC.sub }}>{rotulo}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 18, fontWeight: '700', color: PC.ink }}>{valor}</Text>
    </View>
  );

  return (
    <BvScreen
      statusBar="light"
      fundo={
        <>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' }} />
          <LinearGradient colors={['#FF5EA8', '#FF7DBA']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 300 + dy }} />
          <Svg width="100%" height={60} viewBox="0 0 390 60" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 250 + dy }}>
            <Path d="M0 30 C40 10 70 40 110 28 C150 16 170 34 210 30 C250 26 260 6 300 14 C330 20 360 36 390 26 L390 60 L0 60 Z" fill="#FFFFFF" opacity={0.18} />
          </Svg>
        </>
      }
    >
      <View style={{ flex: 1, paddingTop: 76 + dy, paddingBottom: bottom, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center', color: '#FFFFFF' }}>
          {name ? t('Sua rotina está pronta,\n{{name}}!', { name }) : t('Sua rotina está pronta!')}
        </Text>

        {/* Selo de check (metade em cima do card) */}
        <View style={{ marginTop: 34, height: 30, zIndex: 2, alignItems: 'center' }}>
          <View style={{
            width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
            shadowColor: '#C4286E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 7,
          }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: PC.pink, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          </View>
        </View>

        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 20, paddingTop: 38, paddingHorizontal: 16, paddingBottom: 18, gap: 18,
          shadowColor: '#C4286E', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 15,
        }}>
          {item(
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={PC.pink} strokeWidth={2} strokeLinecap="round">
              <Circle cx={12} cy={12} r={4} />
              <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </Svg>,
            t('Manhã · {{n}} passos', { n: nManha }),
            descManha,
          )}
          {item(
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={PC.pink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
            </Svg>,
            t('Noite · {{n}} passos', { n: nNoite }),
            t('Menos de 3 minutos antes de dormir.'),
          )}
          {item(
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={PC.pink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
              <Circle cx={12} cy={12} r={3.5} />
            </Svg>,
            t('Escaneie a pele 1× por semana'),
            t('Pra ver a evolução de verdade.'),
          )}
        </View>

        <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
          {quadro(t('Foco do plano'), `${menosDe(dor.nome)} ${dor.nome}`)}
          {quadro(t('Data do marco'), diaMesLongo(dataMeta()))}
        </View>

        <View style={{ marginTop: 20, gap: 14, paddingHorizontal: 4 }}>
          <Caixa marcada={lembrar} texto={t('Me lembrar da rotina de manhã e à noite')} onPress={() => {
            const v = !lembrar;
            setLembrar(v);
            setLembreteBoasVindas(v);
            track('boas_vindas_lembrete', { ativo: v });
          }} />
          <Caixa marcada={avisarScan} texto={t('Me avisar na hora de escanear a pele')} onPress={() => {
            setAvisarScan(!avisarScan);
            track('boas_vindas_aviso_scan', { ativo: !avisarScan });
          }} />
          <Caixa marcada={dicas} texto={t('Receber dicas pra minha pele')} onPress={() => {
            setDicas(!dicas);
            track('boas_vindas_dicas', { ativo: !dicas });
          }} />
        </View>

        <View style={{ flex: 1 }} />
        <PcBotao label={t('Continuar')} onPress={() => router.push('/(onboarding)/pc-foto' as any)} />
      </View>
    </BvScreen>
  );
}
