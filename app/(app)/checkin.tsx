import { useCallback, useEffect, useRef, useState } from 'react';
import { voltar as voltarOu } from '../../lib/navegar';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet, AccessibilityInfo, TextInput,
  Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import { clearRoutineFlow, getRoutinePeriodForNow, markRoutineDone } from '../../lib/routineProgress';
import { invalidarCartas } from '../../lib/cartasServidor';
import { reagendarLembretes } from '../../lib/routineReminders';
import { invalidarGrupos, publicarCheckin, subirFoto, useMeusGrupos, type EstatisticasCheckin } from '../../lib/gruposServidor';
import { invalidarMissoes } from '../../lib/missoes';
import { LinhasPassos } from '../../components/grupos/EstatisticasCheckin';
import { duracaoPorExtenso, marcarVoltaDoCheckin, ultimoSkincare } from '../../lib/sessaoSkincare';
import FolhaCompartilhar, { MiniBanner } from '../../components/grupos/FolhaCompartilhar';
import { getUserId } from '../../lib/currentUser';
import { saveRoutinePhoto, temFotoDoDia } from '../../lib/routinePhotos';
import { abrirCartasEDepois } from '../../lib/concluirSkincare';
import { ganhouPontos } from '../../lib/pontosAnimacao';

// ─────────────────────────────────────────────────────────────────────────────
// Check-in do grupo — câmera 81i do Claude Design (NiksGrupoFlo.dc.html, rodada 81) e, depois
// da foto, a PRÉVIA (12/nov/2026, build 1.62; no lugar do "Novo check-in" 81j): a foto e, no
// fluxo do skincare, as estatísticas daquele skincare (tempo, passos e produtos, sem NIKS
// Points — `components/grupos/EstatisticasCheckin`), com "Publicar" e "Tirar outra". A foto é
// obrigatória e vem só da câmera, na hora (no simulador de dev, a galeria faz o papel dela).
// Câmera: visor de 520 pt, flash à esquerda, disparador, inverter à direita (o visor gira 90°
// em 150 ms, troca e volta em 180 ms). A rotina é a do skincare (fora dele, a do horário; a
// já postada hoje cede a vez à outra) e a hora exibida é a de publicar. Publicar sobe a foto
// (bucket privado, URL assinada), publica e abre a carta para raspar; sem carta, volta.
// O botão "Fazer check-in" do grupo agora é SÓ da convidada (prévia só com a foto).
//
// `fluxo=skincare` (05/nov/2026) — o fim do "Iniciar skincare" da home, depois de a rotina já
// estar concluída (`(app)/skincare`). A foto também vale como Foto do dia (manhã e noite; a
// PRIMEIRA do dia vale: com uma já salva hoje, esta vai só para o check-in; refazer aqui
// troca a que este caminho salvou). Fechar a câmera volta para a comemoração do timer (90a). Chega aqui só quem
// escolheu um grupo na folha "Compartilhar com o grupo?" (`grupos` = esse grupo): a prévia
// com as estatísticas (`ultimoSkincare`, guardado ao concluir a sessão); publicou → carta(s) → mural do 1º
// grupo publicado. Sem grupo, o convite já aparece na lista, sem câmera; o convite daqui
// (por cima da foto) fica só de reserva, se a lista de grupos chegar vazia depois da foto.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIN = Easing.bezier(0.55, 0, 1, 0.45);
const EFOLHA = Easing.bezier(0.32, 0.72, 0, 1);

type Foto = { uri: string; base64: string };

function Icon({ d, size, color, sw, children }: { d?: string[]; size: number; color: string; sw: number; children?: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {d?.map((p, i) => <Path key={i} d={p} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />)}
      {children}
    </Svg>
  );
}
const Cadeado = ({ color }: { color: string }) => (
  <Icon size={13} color={color} sw={2.2} d={['M8 11V7a4 4 0 0 1 8 0v4']}>
    <Rect x={4} y={11} width={16} height={10} rx={2.5} fill="none" stroke={color} strokeWidth={2.2} />
  </Icon>
);

function useReduceMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setRm).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setRm);
    return () => sub.remove();
  }, []);
  return rm;
}

export default function Checkin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rm = useReduceMotion();
  // Do fim da rotina (3.6, "Compartilhar com o grupo?"): `rotina`, `grupos` (ids) e,
  // na manhã, `foto` (a Foto do dia que ela acabou de tirar) → abre direto no Novo check-in.
  // `descricao` (12/nov/2026): a descrição automática da sessão de skincare (tempo + rotina,
  // `lib/sessaoSkincare`), já no campo e editável.
  const { feitas, de, grupo, rotina: rotinaParam, grupos: gruposParam, foto: fotoParam, fluxo, descricao: descricaoParam } = useLocalSearchParams<{
    feitas?: string; de?: string; grupo?: string; rotina?: string; grupos?: string; foto?: string; fluxo?: string; descricao?: string;
  }>();
  const skincare = fluxo === 'skincare';
  // fluxo=skincare: fechar a câmera termina o fluxo — a carta de hoje abre sozinha e depois a home.
  // Para onde o check-in volta (fora do fluxo do skincare): o grupo de onde veio, a Rotina ou a aba Grupos.
  const destino = de === 'grupo' && grupo ? `/grupo?id=${grupo}` : de === 'rotina' ? '/protocolo' : '/grupos';
  // X: volta para a tela de trás (o grupo, a Rotina ou a aba Grupos); sem ela, o `destino`.
  // fluxo=skincare (12/nov/2026): o X volta para a comemoração do timer (90a), que está logo
  // atrás; de lá ela pode compartilhar de novo ou seguir. Sem a sessão atrás, a home.
  const navegacao = useNavigation();
  const sair = () => {
    if (!skincare) { voltarOu(destino as any); return; }
    const st: any = navegacao.getState();
    const atras = st?.routes?.[(st?.index ?? 0) - 1]?.name;
    if (atras === 'skincare-sessao') { marcarVoltaDoCheckin(); router.back(); return; }
    void terminar('/home');
  };
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const { data: grupos } = useMeusGrupos();
  const y = (v: number) => insets.top + v - 54;

  // `convite` = só no `fluxo=skincare` sem grupo: a foto parada + o convite para criar um.
  const [etapa, setEtapa] = useState<'cam' | 'compor' | 'convite'>('cam');
  const [foto, setFoto] = useState<Foto | null>(null);

  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(false);
      setEtapa('cam');
      setFoto(null);
      setSel(typeof gruposParam === 'string' && gruposParam ? gruposParam.split(',') : null);
      if (typeof fotoParam === 'string' && fotoParam) {
        ImageManipulator.manipulateAsync(fotoParam, [{ resize: { width: 1080 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true })
          .then((r) => { if (r.base64) { setFoto({ uri: r.uri, base64: r.base64 }); setEtapa('compor'); } })
          .catch(() => {});
      }
      return () => setTabBarVisible(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setTabBarVisible, gruposParam, fotoParam])
  );

  // ── fluxo=skincare: Foto do dia e saída ──────────────────────────────────────
  // `fddLivre`: ainda não há Foto do dia hoje (lido ao abrir). `fddNossa`: este caminho já
  // salvou a de hoje — refazer a foto substitui a dele.
  const fddLivre = useRef<Promise<boolean> | null>(null);
  const fddNossa = useRef(false);
  const saindo = useRef(false);
  const [vez, setVez] = useState(0);   // remonta o convite a cada abertura (sem fechar velho)
  useFocusEffect(
    useCallback(() => {
      saindo.current = false;
      fddNossa.current = false;
      fddLivre.current = skincare
        ? getUserId().then((uid) => (uid ? temFotoDoDia(uid).then((tem) => !tem) : false))
        : null;
      setVez((v) => v + 1);
    }, [skincare])
  );
  const salvarFotoDoDia = (base64: string) => {
    void (async () => {
      const uid = await getUserId();
      if (!uid) return;
      if (!fddNossa.current) {
        if (!(await (fddLivre.current ?? Promise.resolve(false)))) return;
        fddNossa.current = true;
      }
      await saveRoutinePhoto(uid, base64);
    })().catch((e) => console.warn('[foto do dia] falhou ao salvar', e));
  };
  // Fim do caminho: carta(s) a raspar, uma depois da outra, e então o destino.
  const terminar = async (destino: string) => {
    if (saindo.current) return;
    saindo.current = true;
    await abrirCartasEDepois(router, destino);
  };

  // ── 80d · câmera ──────────────────────────────────────────────────────────
  const [perm, pedirPerm] = useCameraPermissions();
  useEffect(() => { if (perm && !perm.granted && perm.canAskAgain) void pedirPerm(); }, [perm, pedirPerm]);
  const cam = useRef<CameraView>(null);
  const [frente, setFrente] = useState(true);
  const [flash, setFlash] = useState(false);
  const [branco, setBranco] = useState(false);
  const atirando = useRef(false);
  const giro = useRef(new Animated.Value(0)).current;   // -1 → 0 → 1 = -90° → 0 → 90°
  const visorO = useRef(new Animated.Value(1)).current;
  const icGiro = useRef(new Animated.Value(0)).current;

  const inverter = () => {
    haptics.tap();
    const trocar = () => setFrente((f) => !f);
    if (rm) {
      Animated.timing(visorO, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
        trocar();
        Animated.timing(visorO, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      });
      return;
    }
    icGiro.setValue(0);
    Animated.timing(icGiro, { toValue: 1, duration: 300, easing: EO, useNativeDriver: true }).start();
    giro.setValue(0);
    Animated.timing(giro, { toValue: 1, duration: 150, easing: EIN, useNativeDriver: true }).start(() => {
      trocar();
      giro.setValue(-1);
      Animated.timing(giro, { toValue: 0, duration: 180, easing: EO, useNativeDriver: true }).start();
    });
  };

  const disparar = async () => {
    if (atirando.current) return;
    atirando.current = true;
    haptics.action();
    try {
      let uri: string | null = null;
      if (__DEV__ && !Device.isDevice) {
        // Simulador não tem câmera: em dev, a galeria fornece a foto.
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 });
        uri = r.canceled ? null : r.assets?.[0]?.uri ?? null;
      } else {
        const pic = await cam.current?.takePictureAsync({ quality: 0.8 });
        uri = pic?.uri ?? null;
      }
      if (!uri) return;
      const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1080 } }], {
        compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true,
      });
      if (!small.base64) return;
      setBranco(true);
      setFoto({ uri: small.uri, base64: small.base64 });
      if (skincare) salvarFotoDoDia(small.base64);
      // Sem grupo (fluxo=skincare): em vez do Novo check-in, o convite para criar um.
      const semGrupo = skincare && grupos != null && grupos.length === 0;
      setTimeout(() => { setBranco(false); setEtapa(semGrupo ? 'convite' : 'compor'); }, 200);
    } catch (e) {
      console.warn('[check-in] foto falhou', e);
    } finally {
      atirando.current = false;
    }
  };

  // ── Novo check-in (12/nov/2026, build 1.62; referência do produto: print de outro app) ───
  // Topo: voltar (câmera), "Novo check-in" e "Publicar". A foto no meio com o lápis (tirar
  // outra); à esquerda os grupos ("Em N grupos" — toque abre a folha para desmarcar; todos
  // começam marcados) e à direita "Válido". Embaixo: Título (sem descrição) e, no fluxo do
  // skincare, as estatísticas (duração, passos, produtos e a lista dos passos). Sem NIKS
  // Points. A rotina é a do skincare (fora dele, a do horário) e a hora é a de publicar.
  const jaFeitas = (typeof feitas === 'string' ? feitas.split(',') : []) as ('am' | 'pm')[];
  const [sel, setSel] = useState<string[] | null>(null);   // null = todos
  const [rotina, setRotina] = useState<'am' | 'pm'>('am');
  const [publicando, setPublicando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [folhaGrupos, setFolhaGrupos] = useState(false);
  const folhaV = useRef(new Animated.Value(0)).current;
  const fotoSubida = useRef<{ uri: string; path: string } | null>(null);
  const fotoIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (etapa !== 'compor') return;
    const pref = rotinaParam === 'am' || rotinaParam === 'pm' ? rotinaParam : getRoutinePeriodForNow(new Date());
    const r = jaFeitas.includes(pref) && !jaFeitas.includes(pref === 'am' ? 'pm' : 'am') ? (pref === 'am' ? 'pm' : 'am') : pref;
    setRotina(r);
    fotoIn.setValue(rm ? 1 : 0);
    if (!rm) Animated.spring(fotoIn, { toValue: 1, damping: 14, stiffness: 180, mass: 1, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);

  // fluxo=skincare: se a lista de grupos só chegou (vazia) depois da foto, vira o convite.
  useEffect(() => {
    if (skincare && etapa === 'compor' && grupos != null && grupos.length === 0) setEtapa('convite');
  }, [skincare, etapa, grupos]);

  const meus = grupos ?? [];
  const escolhidos = sel ? meus.filter((g) => sel.includes(g.id)) : meus;
  const gruposLabel = escolhidos.length === 0 ? 'Nenhum grupo' : escolhidos.length === 1 ? escolhidos[0].nome : `Em ${escolhidos.length} grupos`;
  const alternarGrupo = (id: string) => {
    haptics.select();
    const atuais = escolhidos.map((g) => g.id);
    setSel(atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]);
  };
  const abrirGrupos = (v: boolean) => {
    if (v) { haptics.tap(); setFolhaGrupos(true); }
    Animated.timing(folhaV, { toValue: v ? 1 : 0, duration: rm ? 160 : v ? 340 : 220, easing: v ? EFOLHA : EO, useNativeDriver: true })
      .start(({ finished }) => { if (finished && !v) setFolhaGrupos(false); });
  };

  // O skincare que acabou de ser concluído (só no fluxo do skincare e do mesmo período).
  const feito = skincare && (rotinaParam === 'am' || rotinaParam === 'pm') ? ultimoSkincare(rotinaParam) : null;
  const estLocal: EstatisticasCheckin | null = feito ? {
    periodo: feito.periodo,
    duracao_s: feito.duracao_s,
    n_passos: feito.passos.length,
    n_produtos: feito.passos.filter((p) => p.marca || p.produto).length,
    passos: feito.passos.map((p) => ({ nome: p.nome ?? undefined, marca: p.marca ?? undefined, produto: p.produto ?? undefined, img: p.img ? { url: p.img } : undefined })),
  } : null;

  const publicar = async () => {
    if (!foto || publicando) return;
    if (!escolhidos.length) { Alert.alert('Escolha um grupo'); return; }
    if (jaFeitas.includes(rotina)) { Alert.alert(`Você já fez o check-in da rotina ${rotina === 'am' ? 'matinal' : 'noturna'} hoje`); return; }
    haptics.action();
    setPublicando(true);
    try {
      // A foto sobe uma vez só: se o publicar falhar depois, tentar de novo reaproveita o
      // mesmo arquivo (antes cada tentativa subia outra cópia e deixava órfãs no bucket).
      const path = fotoSubida.current?.uri === foto.uri ? fotoSubida.current.path : await subirFoto('checkin', foto.base64);
      fotoSubida.current = { uri: foto.uri, path };
      const r = await publicarCheckin({
        foto_path: path, rotina, grupos: escolhidos.map((g) => g.id), hora_exibida: new Date().toISOString(),
        titulo: titulo.trim() || undefined,
        // Com estatísticas, o servidor escreve a descrição (para quem ainda está na 1.61).
        descricao: !feito && skincare && typeof descricaoParam === 'string' && descricaoParam ? descricaoParam.slice(0, 280) : undefined,
        estatisticas: feito ? {
          duracao_s: feito.duracao_s,
          passos: feito.passos.slice(0, 20).map((p) => ({ nome: p.nome, marca: p.marca, produto: p.produto, ref: p.ref ?? null })),
        } : undefined,
      });
      if (!r.ok) {
        console.warn('[check-in] recusado pelo servidor:', r.motivo);
        haptics.error();
        if (r.motivo === 'filtro' || r.motivo === 'filtro_indisponivel') {
          if (r.motivo === 'filtro') fotoSubida.current = null;
          Alert.alert(r.motivo === 'filtro' ? 'Essa foto não pode ser publicada no grupo. Tente outra.' : 'Não conseguimos conferir essa foto agora. Tente de novo.');
        } else if (r.motivo === 'foto') {
          // O arquivo não está lá (subida interrompida): a próxima tentativa sobe de novo.
          fotoSubida.current = null;
          Alert.alert('A foto não chegou', 'Tente publicar de novo. Se continuar, tire outra foto.');
        } else if (r.motivo === 'ja_fez') {
          Alert.alert(`Você já fez o check-in da rotina ${rotina === 'am' ? 'matinal' : 'noturna'} hoje`, 'Escolha a outra rotina ou volte amanhã.');
        } else if (r.motivo === 'grupos') {
          await invalidarGrupos();
          Alert.alert('Você não está mais nesse grupo', 'Escolha outro grupo para publicar.');
        } else {
          Alert.alert('Não deu para publicar agora', 'Tente de novo em instantes.');
        }
        return;
      }
      trackFora('checkin_feito', { rotina, grupos: r.grupos.length, com_estatisticas: Boolean(feito), com_titulo: Boolean(titulo.trim()), carta: Boolean(r.carta_id) });
      void invalidarMissoes(); // desafio 4: o check-in também registra o skincare
      // O check-in conta como o skincare do período (o servidor já registrou). A home, a
      // semana e a aba Rotina leem o histórico do CELULAR: sem gravar aqui, quem fazia o
      // check-in pelo grupo voltava à home com o "Iniciar skincare" ainda disponível
      // (10/nov/2026). Idempotente — no fluxo do skincare a rotina já estava gravada.
      await markRoutineDone(rotina);
      void clearRoutineFlow(rotina);
      void invalidarCartas().finally(() => reagendarLembretes());
      await Promise.all([invalidarGrupos(), ...r.grupos.map((g) => invalidarGrupos(g))]);
      if (skincare) {
        // Carta(s) e, no fim, o mural do 1º grupo publicado (na ordem da lista escolhida).
        const gid = escolhidos.map((g) => g.id).find((id) => r.grupos.includes(id)) ?? r.grupos[0];
        // Pontos do check-in (e do skincare que ele registrou): com a carta de hoje para raspar,
        // sobem junto com ela; sem carta, a barra sobe no mural.
        ganhouPontos(r.pontos, { segurar: true });
        await terminar(gid ? `/grupo?id=${gid}&de=home` : '/home');
        return;
      }
      if (r.carta_id) {
        ganhouPontos(r.pontos, { segurar: true });   // sobem junto com a carta, depois de raspar
        // A carta abre POR CIMA (`push`), e o `depois` diz para onde ir quando ela fechar.
        // ⚠️ Nunca `replace` (10/nov/2026): a carta é um modal do Stack RAIZ, então o
        // `replace` trocava a (app) INTEIRA por ela; ao fechar, o `navigate(depois)`
        // empilhava uma (app) nova sobre o modal e o app todo virava uma folha do iOS.
        // O `depois` vai sempre: sem ele, o `back()` da carta voltaria para esta tela.
        router.push({ pathname: '/(carta)/carta', params: { id: r.carta_id, depois: destino } } as any);
      } else {
        ganhouPontos(r.pontos);                       // sem carta: a barra sobe já
        sair();
      }
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      console.warn('[check-in] publicar falhou:', msg);
      haptics.error();
      // Só é "internet" quando a requisição nem saiu; o resto é do servidor ou da sessão.
      if (/network request failed|failed to fetch|timed? ?out|offline/i.test(msg)) {
        Alert.alert('Sem conexão', 'Confira a internet e tente de novo.');
      } else if (/sem sessão|unauthorized|jwt|HTTP 401/i.test(msg)) {
        Alert.alert('Sua sessão expirou', 'Feche e abra o NIKS de novo para publicar.');
      } else {
        Alert.alert('Não deu para publicar agora', 'Tente de novo em instantes.');
      }
    } finally {
      setPublicando(false);
    }
  };

  if (etapa === 'cam' || etapa === 'convite') {
    const convite = etapa === 'convite';
    const rot = giro.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-90deg', '0deg', '90deg'] });
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar style="light" />
        <TouchableOpacity activeOpacity={0.6} onPress={() => { haptics.tap(); sair(); }} style={[styles.close, { top: y(56) }]} accessibilityLabel="Fechar">
          <Icon size={26} color="#fff" sw={2} d={['M18 6 6 18M6 6l12 12']} />
        </TouchableOpacity>
        <Animated.View style={[styles.vf, { top: y(108), opacity: visorO, transform: [{ perspective: 1200 }, { rotateY: rot }] }]}>
          {perm?.granted && (
            <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={frente ? 'front' : 'back'} mirror={frente} flash={flash ? 'on' : 'off'} />
          )}
          {/* Convite (sem grupo): a foto tirada fica parada no visor, atrás da folha. */}
          {convite && foto && <Image source={{ uri: foto.uri }} style={StyleSheet.absoluteFill} />}
        </Animated.View>
        <View style={[styles.camNote, { top: y(652) }]}>
          <Cadeado color="rgba(255,255,255,0.8)" />
          <Text style={styles.camNoteT}>Só as integrantes do grupo veem sua foto</Text>
        </View>
        <View style={[styles.controls, { top: y(692) }]}>
          <TouchableOpacity activeOpacity={0.6} onPress={() => { haptics.tap(); setFlash((f) => !f); }} style={styles.side} accessibilityLabel={flash ? 'Desligar flash' : 'Ligar flash'}>
            {flash
              ? <Icon size={26} color="#fff" sw={1.8} d={['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z']} />
              : <Icon size={26} color="#fff" sw={1.8} d={['M10.513 4.856 13.12 2.17a.5.5 0 0 1 .86.46l-1.377 4.317', 'M15.656 10H20a1 1 0 0 1 .78 1.63l-1.72 1.773', 'M16.273 16.273 10.88 21.83a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4a1 1 0 0 1-.78-1.63l4.507-4.643', 'm2 2 20 20']} />}
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} onPress={disparar} style={styles.shutter} accessibilityLabel="Tirar foto">
            <View style={styles.shutterIn} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.6} onPress={inverter} style={styles.side} accessibilityLabel="Inverter câmera">
            <Animated.View style={{ transform: [{ rotate: icGiro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
              <Icon size={26} color="#fff" sw={1.8} d={['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5']} />
            </Animated.View>
          </TouchableOpacity>
        </View>
        {branco && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} pointerEvents="none" />}
        {skincare && (
          <FolhaCompartilhar
            key={vez}
            aberta={convite}
            onCompartilhar={() => {}}
            onCriarGrupo={() => { void terminar('/seus-grupos?criar=1'); }}
            onFechar={() => { void terminar('/home'); }}
          />
        )}
      </View>
    );
  }

  const passosLista = estLocal?.passos ?? [];
  const minutos = estLocal?.duracao_s != null ? duracaoPorExtenso(estLocal.duracao_s * 1000) : null;
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.topo, { top: y(54) }]}>
        <TouchableOpacity activeOpacity={0.7} disabled={publicando} onPress={() => { haptics.tap(); setEtapa('cam'); }} style={styles.topoLado} accessibilityLabel="Voltar para a câmera">
          <Icon size={26} color={INK} sw={2} d={['m15 18-6-6 6-6']} />
        </TouchableOpacity>
        <Text style={styles.titleT}>Novo check-in</Text>
        <TouchableOpacity activeOpacity={0.6} disabled={publicando} onPress={publicar} style={[styles.topoLado, { alignItems: 'flex-end' }]} accessibilityLabel="Publicar">
          {publicando ? <ActivityIndicator color={PINK} /> : <Text style={styles.publicarT}>Publicar</Text>}
        </TouchableOpacity>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={{ position: 'absolute', top: y(98), left: 0, right: 0, bottom: 0 }}
        contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
      >
        {/* Grupos · foto (lápis = tirar outra) · Válido */}
        <View style={styles.heroi}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => abrirGrupos(true)} style={styles.heroiLado} accessibilityLabel={`Grupos: ${gruposLabel}. Toque para escolher`}>
            <View style={styles.bolinhas}>
              {escolhidos.slice(0, 3).map((g, i) => <MiniBanner key={g.id} g={g} tamanho={36} redondo style={[styles.bolinha, i > 0 && { marginLeft: -10 }]} />)}
              {escolhidos.length === 0 && <View style={[styles.bolinha, styles.bolinhaVazia]}><Icon size={16} color={MUTE} sw={2.2} d={['M12 5v14M5 12h14']} /></View>}
            </View>
            <Text style={styles.heroiT} numberOfLines={2}>{gruposLabel}</Text>
          </TouchableOpacity>
          <View>
            <Animated.View style={[styles.shot, { opacity: fotoIn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }), transform: [{ scale: fotoIn.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
              {foto && <Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%' }} />}
            </Animated.View>
            <TouchableOpacity activeOpacity={0.7} disabled={publicando} onPress={() => { haptics.tap(); setEtapa('cam'); }} style={styles.lapis} accessibilityLabel="Tirar outra foto">
              <Icon size={18} color={INK} sw={2} d={['M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z']} />
            </TouchableOpacity>
          </View>
          <View style={styles.heroiLado}>
            <View style={styles.valido}><Icon size={14} color="#fff" sw={3.4} d={['M20 6 9 17l-5-5']} /></View>
            <Text style={styles.heroiT}>Válido</Text>
          </View>
        </View>

        <View style={[styles.cardBranco, { marginTop: 8 }]}>
          <TextInput value={titulo} onChangeText={setTitulo} placeholder="Título" placeholderTextColor={MUTE} maxLength={60} style={styles.titleIn} returnKeyType="done" selectionColor={PINK} />
        </View>

        {estLocal && (
          <View style={styles.cardBranco}>
            {minutos && <LinhaInfo icone={ICO_TEMPO} rotulo="Duração" valor={minutos} />}
            <LinhaInfo icone={ICO_PASSOS} rotulo="Passos" valor={String(estLocal.n_passos ?? passosLista.length)} borda={!!minutos} />
            <LinhaInfo icone={ICO_PRODUTO} rotulo="Produtos" valor={String(estLocal.n_produtos ?? 0)} borda />
          </View>
        )}

        {passosLista.length > 0 && (
          <View style={[styles.cardBranco, { paddingHorizontal: 16, paddingVertical: 4 }]}>
            <LinhasPassos passos={passosLista} />
          </View>
        )}
      </ScrollView>

      {/* Folha dos grupos: todos começam marcados; ela desmarca os que não quer. */}
      {folhaGrupos && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, styles.veu, { opacity: folhaV }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => abrirGrupos(false)} accessibilityLabel="Fechar" />
          </Animated.View>
          <Animated.View style={[styles.folha, { paddingBottom: insets.bottom + 16, transform: [{ translateY: folhaV.interpolate({ inputRange: [0, 1], outputRange: [rm ? 0 : 520, 0] }) }], opacity: rm ? folhaV : 1 }]}>
            <View style={styles.alca} />
            <Text style={styles.folhaTitulo}>Em quais grupos vai aparecer?</Text>
            <ScrollView style={styles.folhaLista} bounces={false}>
              {meus.map((g, i) => {
                const on = escolhidos.some((x) => x.id === g.id);
                return (
                  <TouchableOpacity key={g.id} activeOpacity={0.7} onPress={() => alternarGrupo(g.id)} style={styles.folhaLinha} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <MiniBanner g={g} tamanho={44} />
                    <View style={[styles.folhaLinhaTexto, i < meus.length - 1 && styles.folhaFio]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.folhaNome} numberOfLines={1}>{g.nome}</Text>
                        <Text style={styles.folhaSub}>{g.total <= 1 ? 'Só você' : `${g.total} integrantes`}</Text>
                      </View>
                      <View style={[styles.marca, on && styles.marcaOn]}>
                        {on && <Icon size={13} color="#fff" sw={3.4} d={['M20 6 9 17l-5-5']} />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity activeOpacity={0.85} disabled={!escolhidos.length} onPress={() => { haptics.tap(); abrirGrupos(false); }} style={[styles.pronto, !escolhidos.length && { opacity: 0.4 }]}>
              <Text style={styles.prontoT}>{escolhidos.length ? 'Pronto' : 'Escolha um grupo'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const ICO_TEMPO = ['M12 6v6l4 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'];
const ICO_PASSOS = ['M13 5h8', 'M13 12h8', 'M13 19h8', 'm3 17 2 2 4-4', 'm3 7 2 2 4-4'];
const ICO_PRODUTO = ['M10 2h4', 'M12 2v3', 'M8 8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z', 'M8 13h8'];

function LinhaInfo({ icone, rotulo, valor, borda }: { icone: string[]; rotulo: string; valor: string; borda?: boolean }) {
  return (
    <View style={styles.info}>
      <Icon size={22} color={PINK} sw={1.9} d={icone} />
      <View style={[styles.infoTexto, borda && styles.infoBorda]}>
        <Text style={styles.infoRotulo}>{rotulo}</Text>
        <Text style={styles.infoValor}>{valor}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F1F4' },

  // 81i
  close: { position: 'absolute', left: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  vf: { position: 'absolute', left: 0, right: 0, height: 528, overflow: 'hidden', backgroundColor: '#1a1418' },
  camNote: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  camNoteT: { fontSize: 13, lineHeight: 17, color: 'rgba(255,255,255,0.8)' },
  controls: { position: 'absolute', left: 0, right: 0, height: 84, flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', padding: 5 },
  shutterIn: { flex: 1, borderRadius: 39, backgroundColor: '#fff' },

  // Novo check-in
  topo: { position: 'absolute', left: 8, right: 16, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 4 },
  topoLado: { width: 92, height: 44, justifyContent: 'center' },
  titleT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  publicarT: { color: PINK, fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  heroi: { flexDirection: 'row', alignItems: 'center' },
  heroiLado: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  heroiT: { fontSize: 15, lineHeight: 19, letterSpacing: -0.25, color: INK, textAlign: 'center' },
  bolinhas: { flexDirection: 'row', height: 40, alignItems: 'center' },
  bolinha: { borderWidth: 2, borderColor: '#F6F1F4' },
  bolinhaVazia: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  valido: { width: 26, height: 26, borderRadius: 13, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  shot: {
    width: 128, height: 170, borderRadius: 16, borderWidth: 3, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#FCE3EE',
    boxShadow: '0px 10px 24px rgba(200,60,120,0.16)',
  },
  lapis: {
    position: 'absolute', alignSelf: 'center', bottom: -18, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', boxShadow: '0px 4px 12px rgba(18,18,18,0.12)',
  },
  cardBranco: { borderRadius: 16, backgroundColor: '#fff', overflow: 'hidden', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)' },
  titleIn: { height: 54, paddingHorizontal: 16, fontSize: 17, fontWeight: '600', color: INK, letterSpacing: -0.4 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16 },
  infoTexto: { flex: 1, height: 54, paddingRight: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoBorda: { borderTopWidth: 1, borderTopColor: 'rgba(18,18,18,0.07)' },
  infoRotulo: { fontSize: 17, letterSpacing: -0.35, color: INK },
  infoValor: { fontSize: 17, letterSpacing: -0.35, color: MUTE, fontVariant: ['tabular-nums'] },
  veu: { backgroundColor: 'rgba(18,18,18,0.34)', zIndex: 40 },
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41, paddingTop: 8, paddingHorizontal: 16,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F6F1F4',
  },
  alca: { width: 36, height: 5, borderRadius: 100, backgroundColor: '#DCD3D8', alignSelf: 'center' },
  folhaTitulo: { marginTop: 16, textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  folhaLista: { marginTop: 14, maxHeight: 340, flexGrow: 0, borderRadius: 16, backgroundColor: '#fff' },
  folhaLinha: { height: 68, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  folhaLinhaTexto: { flex: 1, minWidth: 0, height: 68, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  folhaFio: { borderBottomWidth: 1, borderBottomColor: 'rgba(18,18,18,0.07)' },
  folhaNome: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.4, color: INK },
  folhaSub: { fontSize: 13, lineHeight: 17, color: MUTE },
  marca: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D9CFD5', alignItems: 'center', justifyContent: 'center' },
  marcaOn: { backgroundColor: PINK, borderColor: PINK },
  pronto: { marginTop: 14, height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  prontoT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
});
