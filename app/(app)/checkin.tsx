import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, Animated, Easing, StyleSheet, AccessibilityInfo, TextInput,
  ActionSheetIOS, Alert, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
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

// ─────────────────────────────────────────────────────────────────────────────
// Check-in do grupo — réplica de 80d (câmera) e 80w (Novo check-in) do Claude Design
// (NiksGrupoV2.dc.html). A foto é obrigatória e vem só da câmera, na hora: sem galeria
// e sem "só marcar" (no simulador de dev, a galeria faz o papel da câmera, como na
// "Foto do dia"). Câmera: visor de 520 pt, flash à esquerda, disparador, inverter à
// direita (o visor gira 90° em 150 ms, troca e volta em 180 ms). Novo check-in: a foto
// entra com mola (0,9 → 1), título (60) e descrição (280), Grupos (padrão: todos),
// Hora do check-in (só o horário EXIBIDO, ±15 min, nunca no futuro nem antes da virada
// das 04:00) e Rotina, Matinal ou Noturna (a que ela já postou hoje fica apagada: é 1
// por rotina por dia). Publicar sobe a foto (bucket privado, URL assinada), publica e
// abre a carta para raspar (80e); sem carta nova (já ganhou a de hoje), volta ao grupo.
// ─────────────────────────────────────────────────────────────────────────────

const INK = '#121212';
const PINK = '#FF5EA8';
const MUTE = '#818181';
const LOGO = require('../../assets/home/score-logo-pink.png');
const EO = Easing.bezier(0.23, 1, 0.32, 1);
const EIO = Easing.bezier(0.77, 0, 0.175, 1);
const EIN = Easing.bezier(0.55, 0, 1, 0.45);
const PASSO = 15;

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

function BolinhaGrupo({ g, first }: { g: GrupoResumo; first: boolean }) {
  const rosa = g.banner === 'niks-2';
  return (
    <View style={[styles.gDot, !first && { marginLeft: -9 }, { experimental_backgroundImage: rosa ? 'linear-gradient(120deg, #FF5EA8 0%, #FF8CC0 55%, #FFC2DB 100%)' : 'linear-gradient(150deg, #FFE1EE 0%, #FBCDE5 38%, #EBD6FB 66%, #FFD9EA 100%)' }]}>
      {g.banner === 'foto' && g.banner_url
        ? <Image source={{ uri: g.banner_url }} style={StyleSheet.absoluteFill} />
        : <Image source={LOGO} style={{ width: 16, height: 16, tintColor: rosa ? '#fff' : undefined }} />}
    </View>
  );
}

export default function Checkin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const rm = useReduceMotion();
  // Do fim da rotina (3.6, "Compartilhar com o grupo?"): `rotina`, `grupos` (ids) e,
  // na manhã, `foto` (a Foto do dia que ela acabou de tirar) → abre direto no Novo check-in.
  const { feitas, de, grupo, rotina: rotinaParam, grupos: gruposParam, foto: fotoParam } = useLocalSearchParams<{
    feitas?: string; de?: string; grupo?: string; rotina?: string; grupos?: string; foto?: string;
  }>();
  const sair = () => router.navigate((
    de === 'grupo' && grupo ? { pathname: '/grupo', params: { id: grupo } } : de === 'rotina' ? '/protocolo' : '/grupos'
  ) as any);
  const setTabBarVisible = useAppStore((s) => s.setTabBarVisible);
  const { data: grupos } = useMeusGrupos();
  const y = (v: number) => insets.top + v - 54;

  const [etapa, setEtapa] = useState<'cam' | 'compor'>('cam');
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
      setTimeout(() => { setBranco(false); setEtapa('compor'); }, 200);
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
  const fotoIn = useRef(new Animated.Value(0)).current;
  const rotX = useRef(new Animated.Value(0)).current;
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
    rotX.setValue(r === 'pm' ? 1 : 0);
    fotoIn.setValue(rm ? 1 : 0);
    if (!rm) Animated.spring(fotoIn, { toValue: 1, damping: 14, stiffness: 180, mass: 1, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);

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

  const inicioDia = sessionDate();
  inicioDia.setHours(4, 0, 0, 0);
  const passo = (d: number) => new Date(hora.getTime() + d * PASSO * 60000);
  const podeAntes = passo(-1) >= inicioDia;
  const podeDepois = passo(1) <= new Date();
  const tocarHora = () => {
    haptics.tap();
    const v = !abrirHora;
    setAbrirHora(v);
    Animated.timing(pick, { toValue: v ? 1 : 0, duration: rm ? 0 : 300, easing: EIO, useNativeDriver: false }).start();
    Animated.timing(chev, { toValue: v ? 1 : 0, duration: rm ? 0 : 300, easing: EIO, useNativeDriver: true }).start();
  };
  const mudarHora = (d: number) => {
    if ((d < 0 && !podeAntes) || (d > 0 && !podeDepois)) return;
    haptics.select();
    setHora(passo(d));
  };

  const escolherRotina = (r: 'am' | 'pm') => {
    if (r === rotina || jaFeitas.includes(r)) return;
    haptics.select();
    setRotina(r);
    Animated.timing(rotX, { toValue: r === 'pm' ? 1 : 0, duration: rm ? 0 : 320, easing: EO, useNativeDriver: true }).start();
  };

  const publicar = async () => {
    if (!foto || publicando) return;
    if (!escolhidos.length) { Alert.alert('Escolha um grupo'); return; }
    if (jaFeitas.includes(rotina)) { Alert.alert(`Você já fez o check-in da rotina ${rotina === 'am' ? 'matinal' : 'noturna'} hoje`); return; }
    haptics.action();
    setPublicando(true);
    try {
      const path = await subirFoto('checkin', foto.base64);
      const r = await publicarCheckin({
        foto_path: path, rotina, grupos: escolhidos.map((g) => g.id), hora_exibida: hora.toISOString(),
        titulo: titulo.trim() || undefined, descricao: descricao.trim() || undefined,
      });
      if (!r.ok) {
        Alert.alert(r.motivo === 'ja_fez' ? 'Você já fez o check-in dessa rotina hoje' : 'Não deu para publicar agora', 'Tente de novo em instantes.');
        return;
      }
      trackFora('checkin_feito', { rotina, grupos: r.grupos.length, com_titulo: Boolean(titulo.trim()), carta: Boolean(r.carta_id) });
      await Promise.all([invalidarGrupos(), ...r.grupos.map((g) => invalidarGrupos(g))]);
      if (r.carta_id) router.replace(`/(carta)/carta?id=${r.carta_id}` as any);
      else sair();
    } catch (e) {
      console.warn('[check-in] publicar falhou', e);
      Alert.alert('Não deu para publicar agora', 'Confira a internet e tente de novo.');
    } finally {
      setPublicando(false);
    }
  };

  if (etapa === 'cam') {
    const rot = giro.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-90deg', '0deg', '90deg'] });
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar style="light" />
        <TouchableOpacity activeOpacity={0.6} onPress={() => { haptics.tap(); sair(); }} style={[styles.close, { top: y(60) }]} accessibilityLabel="Fechar">
          <Icon size={24} color="#fff" sw={2} d={['M18 6 6 18M6 6l12 12']} />
        </TouchableOpacity>
        <Animated.View style={[styles.vf, { top: y(112), opacity: visorO, transform: [{ perspective: 1200 }, { rotateY: rot }] }]}>
          {perm?.granted && (
            <CameraView ref={cam} style={StyleSheet.absoluteFill} facing={frente ? 'front' : 'back'} mirror={frente} flash={flash ? 'on' : 'off'} />
          )}
        </Animated.View>
        <View style={[styles.camNote, { top: y(648) }]}>
          <Cadeado color="rgba(255,255,255,0.78)" />
          <Text style={styles.camNoteT}>Só as integrantes do grupo veem sua foto</Text>
        </View>
        <View style={[styles.controls, { top: y(690) }]}>
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
      </View>
    );
  }

  const linha = (r: 'am' | 'pm') => ({ color: rotina === r ? '#fff' : jaFeitas.includes(r) ? '#C9C2C6' : '#515151' });
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient colors={['#FCE3EE', '#FDD5E6', '#FCDFEA', '#F9F1F4']} locations={[0, 0.45, 0.72, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleBlob} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: 60 }}>
          <View style={styles.head}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); setEtapa('cam'); }} style={styles.roundBtn} accessibilityLabel="Voltar para a câmera">
              <Icon size={18} color={INK} sw={2} d={['m15 18-6-6 6-6']} />
            </TouchableOpacity>
            <Text style={styles.headT} pointerEvents="none">Novo check-in</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={publicar} disabled={publicando} hitSlop={10} accessibilityLabel="Publicar">
              {publicando ? <ActivityIndicator color={PINK} /> : <Text style={styles.publicar}>Publicar</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.shotWrap}>
            <Animated.View style={[styles.shot, { opacity: fotoIn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }), transform: [{ scale: fotoIn.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
              {foto && <Image source={{ uri: foto.uri }} style={{ width: '100%', height: '100%' }} />}
            </Animated.View>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); setEtapa('cam'); }} style={styles.retake} accessibilityLabel="Tirar outra foto">
              <Icon size={18} color={PINK} sw={2} d={['M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z', 'm15 5 4 4']} />
            </TouchableOpacity>
          </View>

          <View style={styles.fields}>
            <TextInput value={titulo} onChangeText={setTitulo} placeholder="Título" placeholderTextColor={MUTE} maxLength={60} style={styles.titleIn} returnKeyType="next" />
            <View style={styles.sep16} />
            <TextInput value={descricao} onChangeText={setDescricao} placeholder="Descrição (opcional)" placeholderTextColor={MUTE} maxLength={280} multiline style={styles.descIn} textAlignVertical="top" />
          </View>

          <View style={styles.opts}>
            <TouchableOpacity activeOpacity={meus.length > 1 ? 0.6 : 1} onPress={escolherGrupos} style={styles.rowG}>
              <Icon size={21} color={PINK} sw={1.9} d={['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75']}>
                <Circle cx={9} cy={7} r={4} fill="none" stroke={PINK} strokeWidth={1.9} />
              </Icon>
              <Text style={styles.rowT}>Grupos</Text>
              <View style={{ flexDirection: 'row' }}>
                {escolhidos.slice(0, 3).map((g, i) => <BolinhaGrupo key={g.id} g={g} first={i === 0} />)}
              </View>
              <Text style={styles.rowV} numberOfLines={1}>{gruposLabel}</Text>
              {meus.length > 1 && <Icon size={14} color={MUTE} sw={2.4} d={['M9 6l6 6-6 6']} />}
            </TouchableOpacity>
            <View style={styles.sep49} />
            <TouchableOpacity activeOpacity={0.6} onPress={tocarHora} style={styles.rowH} accessibilityLabel="Hora do check-in">
              <Icon size={21} color={PINK} sw={1.9} d={['M12 7v5l3 2']}>
                <Circle cx={12} cy={12} r={9} fill="none" stroke={PINK} strokeWidth={1.9} />
              </Icon>
              <Text style={styles.rowT}>Hora do check-in</Text>
              <Text style={[styles.rowV, { color: abrirHora ? PINK : MUTE, fontVariant: ['tabular-nums'] }]}>{`Hoje, ${hm(hora)}`}</Text>
              <Animated.View style={{ transform: [{ rotate: chev.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>
                <Icon size={14} color={MUTE} sw={2.4} d={['M9 6l6 6-6 6']} />
              </Animated.View>
            </TouchableOpacity>
            <Animated.View style={{ height: pick.interpolate({ inputRange: [0, 1], outputRange: [0, 144] }), overflow: 'hidden' }}>
              <View style={styles.picker}>
                <View style={styles.pickerSel} />
                <TouchableOpacity activeOpacity={0.6} disabled={!podeAntes} onPress={() => mudarHora(-1)} style={styles.pickRow} accessibilityLabel="15 minutos antes">
                  <Text style={[styles.pickSide, !podeAntes && { opacity: 0.35 }]}>{hm(passo(-1))}</Text>
                </TouchableOpacity>
                <View style={styles.pickRow}><Text style={styles.pickCur}>{hm(hora)}</Text></View>
                <TouchableOpacity activeOpacity={0.6} disabled={!podeDepois} onPress={() => mudarHora(1)} style={styles.pickRow} accessibilityLabel="15 minutos depois">
                  <Text style={[styles.pickSide, !podeDepois && { opacity: 0.35 }]}>{hm(passo(1))}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
            <View style={styles.sep49} />
            <View style={styles.rowR}>
              {rotina === 'am'
                ? <Icon size={21} color={PINK} sw={1.9} d={['M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41']}><Circle cx={12} cy={12} r={4} fill="none" stroke={PINK} strokeWidth={1.9} /></Icon>
                : <Icon size={21} color={PINK} sw={1.9} d={['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z']} />}
              <Text style={styles.rowT}>Rotina</Text>
              <View style={styles.seg}>
                <Animated.View style={[styles.segPill, { transform: [{ translateX: rotX.interpolate({ inputRange: [0, 1], outputRange: [0, 87] }) }] }]} />
                <View style={{ flexDirection: 'row', height: 30 }}>
                  <TouchableOpacity activeOpacity={1} onPress={() => escolherRotina('am')} style={styles.segItem} accessibilityState={{ selected: rotina === 'am', disabled: jaFeitas.includes('am') }}>
                    <Text style={[styles.segT, linha('am')]}>Matinal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={1} onPress={() => escolherRotina('pm')} style={styles.segItem} accessibilityState={{ selected: rotina === 'pm', disabled: jaFeitas.includes('pm') }}>
                    <Text style={[styles.segT, linha('pm')]}>Noturna</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.note}>
            <Cadeado color={MUTE} />
            <Text style={styles.noteT}>Só as integrantes do grupo veem sua foto</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9F1F4' },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280, left: 190, top: -90,
    experimental_backgroundImage: 'radial-gradient(circle at 30% 75%, rgba(255,170,205,0.34), rgba(255,255,255,0.2))',
  },
  circleWhite: { position: 'absolute', width: 620, height: 620, borderRadius: 310, left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)' },

  // 80d
  close: { position: 'absolute', left: 14, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  vf: { position: 'absolute', left: 0, right: 0, height: 520, overflow: 'hidden', backgroundColor: '#1a1418' },
  camNote: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  camNoteT: { fontSize: 13, color: 'rgba(255,255,255,0.78)', letterSpacing: -0.1 },
  controls: { position: 'absolute', left: 0, right: 0, height: 84, flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', padding: 5 },
  shutterIn: { flex: 1, borderRadius: 40, backgroundColor: '#fff' },

  // 80w
  head: { height: 36, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', zIndex: 1,
    boxShadow: '0px 4px 14px rgba(120,60,72,0.10)',
  },
  headT: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },
  publicar: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: PINK },
  shotWrap: { marginTop: 22, height: 234, alignItems: 'center' },
  shot: {
    width: 150, height: 204, borderRadius: 20, borderWidth: 3, borderColor: '#fff', overflow: 'hidden', backgroundColor: '#F4F4F4',
    boxShadow: '0px 14px 30px rgba(200,60,120,0.22)',
  },
  retake: {
    position: 'absolute', top: 184, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 6px 16px rgba(120,60,72,0.16)',
  },
  fields: { marginTop: 18, marginHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: '#fff', overflow: 'hidden' },
  titleIn: { height: 54, paddingHorizontal: 16, fontSize: 17, color: INK, letterSpacing: -0.3 },
  sep16: { height: 1, marginLeft: 16, backgroundColor: 'rgba(18,18,18,0.08)' },
  descIn: { height: 118, paddingTop: 14, paddingBottom: 14, paddingHorizontal: 16, fontSize: 16, lineHeight: 21, color: INK, letterSpacing: -0.2 },
  opts: { marginTop: 12, marginHorizontal: 18, borderRadius: 18, borderWidth: 1.5, borderColor: PINK, backgroundColor: '#fff', overflow: 'hidden' },
  rowG: { height: 60, paddingLeft: 16, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowH: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowR: { height: 56, paddingLeft: 16, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowT: { flex: 1, fontSize: 16, fontWeight: '500', letterSpacing: -0.3, color: INK },
  rowV: { maxWidth: 150, fontSize: 15, color: MUTE, letterSpacing: -0.2 },
  sep49: { height: 1, marginLeft: 49, backgroundColor: 'rgba(18,18,18,0.08)' },
  gDot: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#fff', overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0px 2px 6px rgba(200,60,120,0.18)',
  },
  picker: { marginHorizontal: 16, marginBottom: 12, height: 132 },
  pickerSel: { position: 'absolute', left: 0, right: 0, top: 44, height: 44, borderRadius: 12, backgroundColor: '#FFF0F7' },
  pickRow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  pickSide: { fontSize: 19, color: '#B5B5B5', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  pickCur: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5, color: INK, fontVariant: ['tabular-nums'] },
  seg: { width: 180, height: 36, borderRadius: 100, backgroundColor: '#F6EEF2', padding: 3 },
  segPill: { position: 'absolute', top: 3, left: 3, width: 87, height: 30, borderRadius: 100, backgroundColor: PINK, boxShadow: '0px 4px 10px rgba(255,94,168,0.35)' },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segT: { fontSize: 14, fontWeight: '600' },
  note: { marginTop: 14, marginHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  noteT: { fontSize: 13, color: MUTE, letterSpacing: -0.1 },
});
