import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet, AccessibilityInfo, TextInput,
  ActionSheetIOS, Alert, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { haptics } from '../../lib/haptics';
import { trackFora } from '../../lib/mixpanel/MixpanelProvider';
import { getRoutinePeriodForNow, sessionDate } from '../../lib/routineProgress';
import { invalidarGrupos, publicarCheckin, subirFoto, useMeusGrupos, type GrupoResumo } from '../../lib/gruposServidor';
import { invalidarMissoes } from '../../lib/missoes';
import RodaHora from '../../components/grupos/RodaHora';
import FolhaCompartilhar from '../../components/grupos/FolhaCompartilhar';
import { getUserId } from '../../lib/currentUser';
import { saveRoutinePhoto, temFotoDoDia } from '../../lib/routinePhotos';
import { abrirCartasEDepois } from '../../lib/concluirSkincare';
import { ganhouPontos } from '../../lib/pontosAnimacao';

// ─────────────────────────────────────────────────────────────────────────────
// Check-in do grupo — réplica de 81i (câmera) e 81j (Novo check-in) do Claude Design
// (NiksGrupoFlo.dc.html, rodada 81; antes 80d/80w). A foto é obrigatória e vem só da câmera, na hora: sem galeria
// e sem "só marcar" (no simulador de dev, a galeria faz o papel da câmera, como na
// "Foto do dia"). Câmera: visor de 520 pt, flash à esquerda, disparador, inverter à
// direita (o visor gira 90° em 150 ms, troca e volta em 180 ms). Novo check-in: a foto
// entra com mola (0,9 → 1), título (60) e descrição (280), Grupos (padrão: todos),
// Hora do check-in (só o horário EXIBIDO; roda de horas e minutos, nunca no futuro nem
// antes da virada das 04:00) e Rotina, Matinal ou Noturna (a que ela já postou hoje fica apagada: é 1
// por rotina por dia). Publicar sobe a foto (bucket privado, URL assinada), publica e
// abre a carta para raspar (80e); sem carta nova (já ganhou a de hoje), volta ao grupo.
//
// `fluxo=skincare` (05/nov/2026) — o fim do "Iniciar skincare" da home, depois de a rotina já
// estar concluída (`(app)/skincare`). A foto também vale como Foto do dia (manhã e noite; a
// PRIMEIRA do dia vale: com uma já salva hoje, esta vai só para o check-in; refazer aqui
// troca a que este caminho salvou). Fechar a câmera volta para a home. Chega aqui só quem
// escolheu um grupo na folha "Compartilhar com o grupo?" da lista (`grupos` = esse grupo): o
// Novo check-in de sempre, com a rotina do período marcada; publicou → carta(s) → mural do 1º
// grupo publicado. Sem grupo, o convite já aparece na lista, sem câmera; o convite daqui
// (por cima da foto) fica só de reserva, se a lista de grupos chegar vazia depois da foto.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIO = Easing.bezier(0.77, 0, 0.175, 1);
const EIN = Easing.bezier(0.55, 0, 1, 0.45);

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

const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

function BolinhaGrupo({ g }: { g: GrupoResumo }) {
  const rosa = g.banner === 'niks-2';
  return (
    <View style={[styles.gDot, { experimental_backgroundImage: rosa ? 'linear-gradient(120deg, #FF5EA8 0%, #FF8CC0 55%, #FFC2DB 100%)' : 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)' }]}>
      {g.banner === 'foto' && g.banner_url ? <Image source={{ uri: g.banner_url }} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

export default function Checkin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rm = useReduceMotion();
  // Do fim da rotina (3.6, "Compartilhar com o grupo?"): `rotina`, `grupos` (ids) e,
  // na manhã, `foto` (a Foto do dia que ela acabou de tirar) → abre direto no Novo check-in.
  const { feitas, de, grupo, rotina: rotinaParam, grupos: gruposParam, foto: fotoParam, fluxo } = useLocalSearchParams<{
    feitas?: string; de?: string; grupo?: string; rotina?: string; grupos?: string; foto?: string; fluxo?: string;
  }>();
  const skincare = fluxo === 'skincare';
  // fluxo=skincare: fechar a câmera termina o fluxo — a carta de hoje abre sozinha e depois a home.
  const sair = () => (skincare ? void terminar('/home') : router.navigate((
    de === 'grupo' && grupo ? { pathname: '/grupo', params: { id: grupo } } : de === 'rotina' ? '/protocolo' : '/grupos'
  ) as any));
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

  // ── 80w · Novo check-in ───────────────────────────────────────────────────
  const jaFeitas = (typeof feitas === 'string' ? feitas.split(',') : []) as ('am' | 'pm')[];
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [sel, setSel] = useState<string[] | null>(null);   // null = todos
  const [rotina, setRotina] = useState<'am' | 'pm'>('am');
  const [hora, setHora] = useState(() => new Date());
  const [abrirHora, setAbrirHora] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const fotoSubida = useRef<{ uri: string; path: string } | null>(null);
  const fotoIn = useRef(new Animated.Value(0)).current;
  const pick = useRef(new Animated.Value(0)).current;
  const chev = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (etapa !== 'compor') return;
    const agora = new Date();
    agora.setSeconds(0, 0);
    setHora(agora);
    setAbrirHora(false);
    pick.setValue(0); chev.setValue(0);
    const pref = rotinaParam === 'am' || rotinaParam === 'pm' ? rotinaParam : getRoutinePeriodForNow(agora);
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
  const gruposLabel = escolhidos.length === 0 ? 'Nenhum grupo' : escolhidos.length === 1 ? escolhidos[0].nome : `${escolhidos.length} grupos`;
  const escolherGrupos = () => {
    haptics.tap();
    if (meus.length < 2) return;
    const opts = ['Todos os grupos', ...meus.map((g) => g.nome), 'Cancelar'];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Em quais grupos vai aparecer?', options: opts, cancelButtonIndex: opts.length - 1 },
      (i) => { if (i === 0) setSel(null); else if (i < opts.length - 1) setSel([meus[i - 1].id]); },
    );
  };

  const formRef = useRef<ScrollView>(null);
  // Limites da roda: do início do dia de sessão (04:00) até agora (fixado ao abrir).
  const [limites, setLimites] = useState(() => {
    const ini = sessionDate(); ini.setHours(4, 0, 0, 0);
    return { min: ini, max: new Date() };
  });
  const tocarHora = () => {
    haptics.tap();
    const v = !abrirHora;
    if (v) { const ini = sessionDate(); ini.setHours(4, 0, 0, 0); setLimites({ min: ini, max: new Date() }); }
    setAbrirHora(v);
    // A roda abre embaixo do formulário: rola para ela ficar à vista, acima do Publicar.
    if (v) setTimeout(() => formRef.current?.scrollToEnd({ animated: !rm }), rm ? 0 : 320);
    Animated.timing(pick, { toValue: v ? 1 : 0, duration: rm ? 0 : 300, easing: EIO, useNativeDriver: false }).start();
    Animated.timing(chev, { toValue: v ? 1 : 0, duration: rm ? 0 : 300, easing: EIO, useNativeDriver: true }).start();
  };

  const escolherRotina = (r: 'am' | 'pm') => {
    if (r === rotina || jaFeitas.includes(r)) return;
    haptics.select();
    setRotina(r);
  };

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
        foto_path: path, rotina, grupos: escolhidos.map((g) => g.id), hora_exibida: hora.toISOString(),
        titulo: titulo.trim() || undefined, descricao: descricao.trim() || undefined,
      });
      if (!r.ok) {
        console.warn('[check-in] recusado pelo servidor:', r.motivo);
        haptics.error();
        if (r.motivo === 'foto') {
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
      trackFora('checkin_feito', { rotina, grupos: r.grupos.length, com_titulo: Boolean(titulo.trim()), carta: Boolean(r.carta_id) });
      void invalidarMissoes(); // desafio 4: o check-in também registra o skincare
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
        router.replace(`/(carta)/carta?id=${r.carta_id}` as any);
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

  const fundoPub = 38 + Math.max(0, insets.bottom - 34);
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); setEtapa('cam'); }} style={[styles.back, { top: y(54) }]} accessibilityLabel="Voltar para a câmera">
        <Icon size={26} color={INK} sw={2} d={['m15 18-6-6 6-6']} />
      </TouchableOpacity>
      <View pointerEvents="none" style={[styles.titleRow, { top: y(54) }]}><Text style={styles.titleT}>Novo check-in</Text></View>
      <KeyboardAvoidingView behavior="padding" style={{ position: 'absolute', top: y(98), left: 0, right: 0, bottom: fundoPub + 62 }}>
        <ScrollView ref={formRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          <View style={styles.shotWrap}>
            <Animated.View style={[styles.shot, { opacity: fotoIn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }), transform: [{ scale: fotoIn.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}>
              {foto && <Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%' }} />}
            </Animated.View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); setEtapa('cam'); }} style={styles.retake} accessibilityLabel="Tirar outra foto">
              <Icon size={17} color={INK} sw={2} d={['M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z']} />
            </TouchableOpacity>
          </View>

          <View style={styles.cardBranco}>
            <TextInput value={titulo} onChangeText={setTitulo} placeholder="Título" placeholderTextColor={MUTE} maxLength={60} style={styles.titleIn} returnKeyType="next" selectionColor={PINK} />
            <View style={styles.sep} />
            <TextInput value={descricao} onChangeText={setDescricao} placeholder="Descrição (opcional)" placeholderTextColor={MUTE} maxLength={280} multiline style={styles.descIn} textAlignVertical="top" selectionColor={PINK} />
          </View>

          <View style={[styles.cardBranco, { padding: 16 }]}>
            <Text style={styles.cardT}>Rotina</Text>
            <View style={styles.chips}>
              {(['am', 'pm'] as const).map((r) => {
                const sel = rotina === r;
                const feita = jaFeitas.includes(r);
                return (
                  <TouchableOpacity
                    key={r}
                    activeOpacity={0.7}
                    disabled={feita}
                    onPress={() => escolherRotina(r)}
                    style={[styles.chip, { borderColor: sel ? PINK : 'rgba(255,94,168,0)' }, feita && { opacity: 0.45 }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel, disabled: feita }}
                  >
                    <View style={styles.chipIcon}>
                      {r === 'am'
                        ? <Icon size={16} color={PINK} sw={2.2} d={['M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41']}><Circle cx={12} cy={12} r={4} fill="none" stroke={PINK} strokeWidth={2.2} /></Icon>
                        : <Icon size={16} color={PINK} sw={2.2} d={['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z']} />}
                    </View>
                    <Text style={styles.chipT}>{r === 'am' ? 'Matinal' : 'Noturna'}</Text>
                    {sel && (
                      <View style={styles.chipCheck}><Icon size={10} color="#fff" sw={4} d={['M20 6 9 17l-5-5']} /></View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.cardBranco}>
            <TouchableOpacity activeOpacity={meus.length > 1 ? 0.7 : 1} onPress={escolherGrupos} style={styles.linha}>
              <Text style={styles.linhaT}>Grupos</Text>
              <View style={{ flexDirection: 'row', paddingLeft: 8 }}>
                {escolhidos.slice(0, 3).map((g) => <BolinhaGrupo key={g.id} g={g} />)}
              </View>
              <Text style={styles.linhaV} numberOfLines={1}>{gruposLabel}</Text>
              <Icon size={16} color="#B5B5B5" sw={2.4} d={['m9 18 6-6-6-6']} />
            </TouchableOpacity>
            <View style={styles.sep} />
            <TouchableOpacity activeOpacity={0.7} onPress={tocarHora} style={styles.linha} accessibilityLabel="Hora do check-in">
              <Text style={styles.linhaT}>Hora do check-in</Text>
              <Text style={[styles.linhaV, { color: abrirHora ? PINK : MUTE, fontVariant: ['tabular-nums'] }]}>{`Hoje, ${hm(hora)}`}</Text>
              <Animated.View style={{ transform: [{ rotate: chev.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>
                <Icon size={16} color="#B5B5B5" sw={2.4} d={['m9 18 6-6-6-6']} />
              </Animated.View>
            </TouchableOpacity>
            <Animated.View style={{ height: pick.interpolate({ inputRange: [0, 1], outputRange: [0, 144] }), overflow: 'hidden' }}>
              <View style={styles.picker}>
                {abrirHora && <RodaHora valor={hora} min={limites.min} max={limites.max} onChange={setHora} />}
              </View>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <TouchableOpacity activeOpacity={0.85} onPress={publicar} disabled={publicando} style={[styles.publicar, { bottom: fundoPub }]} accessibilityLabel="Publicar">
        {publicando ? <ActivityIndicator color="#fff" /> : <Text style={styles.publicarT}>Publicar</Text>}
      </TouchableOpacity>
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

  // 81j
  back: { position: 'absolute', left: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  titleRow: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleT: { fontSize: 17, fontWeight: '600', letterSpacing: -0.4, color: INK },
  shotWrap: { alignSelf: 'center', width: 148, height: 196, marginBottom: 8 },
  shot: {
    width: 148, height: 196, borderRadius: 16, borderWidth: 3, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#FCE3EE',
    boxShadow: '0px 10px 24px rgba(200,60,120,0.18)',
  },
  retake: {
    position: 'absolute', right: -12, bottom: -10, width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 4px 12px rgba(18,18,18,0.12)',
  },
  cardBranco: { borderRadius: 16, backgroundColor: '#fff', overflow: 'hidden', boxShadow: '0px 1px 2px rgba(18,18,18,0.04)' },
  titleIn: { height: 52, paddingHorizontal: 16, fontSize: 17, fontWeight: '600', color: INK, letterSpacing: -0.4 },
  sep: { height: 1, marginHorizontal: 16, backgroundColor: 'rgba(18,18,18,0.07)' },
  descIn: { height: 92, paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16, fontSize: 16, lineHeight: 21, color: INK, letterSpacing: -0.2 },
  cardT: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.4, color: INK },
  chips: { marginTop: 12, flexDirection: 'row', gap: 10 },
  chip: {
    height: 42, paddingLeft: 6, paddingRight: 16, borderRadius: 100, borderWidth: 2, backgroundColor: '#FFEAF3',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  chipIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFD1E5', alignItems: 'center', justifyContent: 'center' },
  chipT: { fontSize: 16, letterSpacing: -0.3, color: INK },
  chipCheck: {
    position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#fff', backgroundColor: PINK,
    alignItems: 'center', justifyContent: 'center',
  },
  linha: { height: 56, paddingLeft: 16, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  linhaT: { flex: 1, fontSize: 16, letterSpacing: -0.3, color: INK },
  linhaV: { maxWidth: 150, fontSize: 15, color: MUTE },
  gDot: { width: 26, height: 26, marginLeft: -8, borderRadius: 13, borderWidth: 2, borderColor: '#fff', overflow: 'hidden' },
  picker: { marginHorizontal: 16, marginBottom: 12, height: 132 },
  publicar: { position: 'absolute', left: 16, right: 16, height: 50, borderRadius: 100, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  publicarT: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.4 },
});
