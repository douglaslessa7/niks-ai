// ─────────────────────────────────────────────────────────────────────────────
// Convidar para o grupo (12/nov/2026, pedido do produto: réplica da tela de convite de outro app,
// sem "Mostrar QR code" e sem "Quem pode participar", na identidade do NIKS). Abre pelo botão
// "Compartilhar" do topo do grupo, como folha nativa (`presentation: 'modal'`).
//   • X · nome do grupo · as fotos das integrantes (com a moldura da medalha) + um lugar vazio ·
//     "N integrantes" · "Convide suas amigas…"
//   • cartão: "Compartilhar convite" (folha de compartilhar do sistema) e "Copiar convite"
//     (código do grupo; copia a mensagem com o link da App Store e o código)
//   • botão "Convidar" (a folha de compartilhar).
// O convite vem da função `grupos` (`conviteDoGrupo`: reaproveita o dela), pedido ao abrir.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import FotoComMoldura from '../../components/medalhas/FotoComMoldura';
import { conviteDoGrupo, useMeusGrupos } from '../../lib/gruposServidor';
import { copiarTexto, mensagemConvite } from '../../lib/convite';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import { haptics } from '../../lib/haptics';

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const BG = '#F6F1F4';

const ICO_ENVIAR = ['M22 2 11 13', 'M22 2 15 22l-4-9-9-4 20-7z'];
const ICO_LINK = ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'];
const ICO_OK = ['M20 6 9 17l-5-5'];

function Icone({ d, cor = INK, tam = 22, sw = 2 }: { d: string[]; cor?: string; tam?: number; sw?: number }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24">
      {d.map((p, i) => <Path key={i} d={p} fill="none" stroke={cor} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />)}
    </Svg>
  );
}

export default function ConvidarGrupo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const gid = typeof id === 'string' ? id : '';
  const { data: grupos } = useMeusGrupos();
  const g = grupos?.find((x) => x.id === gid) ?? null;
  const [convite, setConvite] = useState<{ codigo: string } | null>(null);
  const [erro, setErro] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!gid) return;
    conviteDoGrupo(gid)
      .then((r) => { if ('codigo' in r) setConvite({ codigo: r.codigo }); else setErro(true); })
      .catch(() => setErro(true));
  }, [gid]);

  const mensagem = g && convite ? mensagemConvite(g.nome, convite.codigo) : null;
  const compartilhar = async () => {
    if (!mensagem) return;
    haptics.action();
    trackFora('convite_enviado', { canal: 'sistema', tela: 'convidar_grupo' });
    await Share.share({ message: mensagem }).catch(() => {});
  };
  const copiar = async () => {
    if (!mensagem) return;
    haptics.tap();
    trackFora('convite_enviado', { canal: 'copiar', tela: 'convidar_grupo' });
    if (await copiarTexto(mensagem)) {
      haptics.success();
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } else {
      await Share.share({ message: mensagem }).catch(() => {});
    }
  };
  const fechar = () => { haptics.tap(); router.back(); };

  const integrantes = g?.integrantes ?? [];
  const total = g?.total ?? integrantes.length;
  const pronto = !!mensagem;
  const sub = (texto: string) => (erro ? 'Não deu para gerar o convite agora' : pronto ? texto : 'Gerando o convite…');

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <TouchableOpacity activeOpacity={0.6} onPress={fechar} style={styles.fechar} accessibilityLabel="Fechar" hitSlop={8}>
        <Icone d={['M18 6 6 18', 'm6 6 12 12']} tam={24} />
      </TouchableOpacity>

      <View style={styles.topo}>
        <Text style={styles.nome} numberOfLines={2}>{g?.nome ?? ' '}</Text>
        <View style={styles.fotos}>
          {integrantes.slice(0, 5).map((m) => (
            <FotoComMoldura key={m.user_id} nivel={m.nivel} foto={m.foto} nome={m.nome} tamanho={52} pequena vazio="#FCE3EE" style={styles.foto} />
          ))}
          {/* O lugar da próxima amiga. */}
          <View style={styles.vaga}><Icone d={['M12 5v14', 'M5 12h14']} cor="#D9A6BF" tam={16} sw={2.2} /></View>
        </View>
        <Text style={styles.total}>{total === 1 ? '1 integrante' : `${total} integrantes`}</Text>
        <Text style={styles.chamada}>Convide suas amigas para fazer skincare com você neste grupo.</Text>
      </View>

      <View style={styles.cartao}>
        <TouchableOpacity activeOpacity={0.7} disabled={!pronto} onPress={compartilhar} style={styles.linha} accessibilityRole="button">
          <View style={styles.icone}><Icone d={ICO_ENVIAR} cor={PINK} tam={20} /></View>
          <View style={styles.textos}>
            <Text style={styles.linhaT}>Compartilhar convite</Text>
            <Text style={styles.linhaS} numberOfLines={2}>{sub('WhatsApp, Instagram, mensagens e onde mais quiser')}</Text>
          </View>
          <Icone d={['m9 18 6-6-6-6']} cor="#B5B5B5" tam={16} sw={2.4} />
        </TouchableOpacity>
        <View style={styles.fio} />
        <TouchableOpacity activeOpacity={0.7} disabled={!pronto} onPress={copiar} style={styles.linha} accessibilityRole="button">
          <View style={styles.icone}><Icone d={copiado ? ICO_OK : ICO_LINK} cor={PINK} tam={20} /></View>
          <View style={styles.textos}>
            <Text style={styles.linhaT}>{copiado ? 'Convite copiado' : 'Copiar convite'}</Text>
            <Text style={styles.linhaS} numberOfLines={1}>{sub(`Link do NIKS e o código ${convite?.codigo ?? ''}`)}</Text>
          </View>
          {!pronto && !erro ? <ActivityIndicator color={PINK} /> : <Icone d={['m9 18 6-6-6-6']} cor="#B5B5B5" tam={16} sw={2.4} />}
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }} />
      <Animated.View entering={FadeIn.duration(200)}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!pronto}
          onPress={erro ? () => Alert.alert('Não deu para gerar o convite agora', 'Tente de novo em instantes.') : compartilhar}
          style={[styles.convidar, !pronto && !erro && { opacity: 0.5 }]}
          accessibilityRole="button"
        >
          <Icone d={ICO_ENVIAR} cor="#fff" tam={19} sw={2.2} />
          <Text style={styles.convidarT}>Convidar</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingHorizontal: 16 },
  fechar: { position: 'absolute', top: 16, left: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  topo: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 12 },
  nome: { textAlign: 'center', fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.7, color: INK },
  fotos: { marginTop: 18, flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  foto: { marginLeft: -14 },
  vaga: {
    marginLeft: -2, width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#E7B9CF',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7FB',
  },
  total: { marginTop: 14, fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.4, color: INK },
  chamada: { marginTop: 4, textAlign: 'center', fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: MUTE },
  cartao: { marginTop: 24, borderRadius: 18, backgroundColor: '#fff', overflow: 'hidden', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)' },
  linha: { minHeight: 72, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icone: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFE6F1', alignItems: 'center', justifyContent: 'center' },
  textos: { flex: 1, minWidth: 0 },
  linhaT: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.4, color: INK },
  linhaS: { marginTop: 1, fontSize: 13, lineHeight: 17, color: MUTE },
  fio: { height: 1, marginLeft: 66, backgroundColor: 'rgba(18,18,18,0.07)' },
  convidar: { height: 52, borderRadius: 100, backgroundColor: PINK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  convidarT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
});
