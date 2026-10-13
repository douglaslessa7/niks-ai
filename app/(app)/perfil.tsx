// ─────────────────────────────────────────────────────────────────────────────
// Perfil — na identidade da home nova (38e/51a, alarme 44a, progresso 43d):
// fundo degradê de lib/homeTheme (dia/noite), cabeçalho fixo que ganha fundo ao
// rolar, cartões de vidro com contorno rosa e fonte SF Pro (sistema), rosa #FF5EA8.
// Não há um frame de perfil no Claude Design — a tela monta as peças desse sistema.
//   • Topo: foto (a mesma da home: foto_home_url ?? último scan) ou inicial, nome,
//     selo Premium. Tocar → folha de ações do sistema (estilo Apple): "Mudar foto de
//     perfil" (galeria → `(foto)/ajustar-foto`, enquadra no círculo) ou "Mudar nome"
//     (→ set-name).
//   • Seções: Mudar o horário da minha rotina (os 2 cartões do Alarme —
//     components/rotina/HorariosRotina; aqui enquanto o card do Alarme está ocultado
//     na home) · Assinatura · Sua conta (e-mail, notificações) · Suporte.
//   • Sair da conta (pílula) + "Apagar minha conta" (link) + versão.
// Vermelho #D4183D continua como cor SEMÂNTICA de ação destrutiva.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, Alert, Image, StyleSheet, ActionSheetIOS, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';
import {
  ChevronRight,
  Crown,
  Bell,
  Star,
  LogOut,
  Mail,
  MessageCircle,
  Pencil,
  Sparkles,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { requestAppReview, manageSubscriptionsUrl } from '../../lib/storeReview';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../store/onboarding';
import { requestPushPermission, savePushToken } from '../../lib/notifications';
import { useCachedQuery } from '../../lib/cache';
import { haptics } from '../../lib/haptics';
import { usePickProfilePhoto } from '../../lib/profilePhoto';
import { clearHomeTutorialSeenOnServer } from '../../lib/homeTutorial';
import { BG_STOPS, homeTheme, isNightTheme } from '../../lib/homeTheme';
import HorariosRotina from '../../components/rotina/HorariosRotina';

const INK = '#121212';
const INK_MUTE = '#8A8A93';
const CHEVRON = '#B5ADB1';
const PINK = '#FF5EA8';
const PINK_TEXT = '#E8468F';
const PINK_DEEP = '#C0206A';
const LINE = 'rgba(192,32,106,0.10)';
const DANGER = '#D4183D'; // vermelho semântico (apagar/sair)
const AVATAR = 96;

type PerfilData = { nome: string | null; email: string | null; fotoUrl: string | null };

// Cartão de vidro do design: branco 58% + desfoque + contorno rosa + sombra rosada.
// A sombra fica no wrapper e o recorte do desfoque no de dentro (README #20).
function Glass({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.glass, style]}>
      <View style={styles.glassClip}>
        <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
        {children}
      </View>
    </View>
  );
}

// Linha de um cartão: círculo rosa com ícone branco + texto (+ subtítulo) + seta.
// Sem `onPress` vira linha estática (sem seta).
function Row({
  icon, label, sub, onPress, line,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onPress?: () => void;
  line?: boolean;
}) {
  const content = (
    <>
      <View style={styles.iconCircle}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {onPress ? <ChevronRight size={20} color={CHEVRON} /> : null}
      {line ? <View style={styles.rowLine} /> : null}
    </>
  );
  return onPress ? (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} style={styles.row}>{content}</TouchableOpacity>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

const ICON = { size: 19, color: '#FFFFFF', strokeWidth: 2 } as const;

export default function Perfil() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut, deleteAccount } = useAuth();
  const [nome, setNome] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);
  const replayHomeTutorial = useAppStore((s) => s.replayHomeTutorial); // só usado no atalho de __DEV__

  // Garante navbar clara ao focar (o protocolo pode deixá-la escura ao sair)
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
    }, [setTabBarTheme])
  );

  // Nome + e-mail + foto vêm do cache: a tela abre preenchida e revalida em silêncio.
  // A foto segue a mesma regra da home: a escolhida na galeria tem precedência
  // ABSOLUTA; sem ela, a do último scan.
  const fetchPerfil = useCallback(async (): Promise<PerfilData> => {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u?.id) return { nome: null, email: null, fotoUrl: null };
    const [userRes, scanRes] = await Promise.all([
      supabase.from('users').select('nome, foto_home_url').eq('id', u.id).maybeSingle(),
      supabase
        .from('skin_scans')
        .select('foto_url')
        .eq('user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      nome: userRes.data?.nome ?? null,
      email: u.email ?? null,
      fotoUrl: userRes.data?.foto_home_url ?? scanRes.data?.foto_url ?? null,
    };
  }, []);

  const { data: perfil } = useCachedQuery<PerfilData>(`perfil:${user?.id ?? 'anon'}`, fetchPerfil, {
    staleMs: 5 * 60_000, // nome/e-mail/foto quase nunca mudam
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome);
    setEmail(perfil.email);
    // Cache gravado pela versão anterior da tela não tem `fotoUrl`.
    setFotoUrl(perfil.fotoUrl ?? null);
  }, [perfil]);

  // Cabeçalho fixo: transparente no topo; ao rolar ganha o fundo rosado + linha.
  const [scrolled, setScrolled] = useState(false);

  const handleNotifications = async () => {
    haptics.tap();
    const { status } = await Notifications.getPermissionsAsync();

    if (status === 'granted') {
      // Já tem permissão — abre Ajustes para o usuário gerenciar
      Alert.alert(
        'Notificações ativas',
        'Suas notificações já estão ativadas. Para gerenciá-las, acesse os ajustes do seu celular.',
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    // Ainda não tem permissão — pede e salva o token
    const token = await requestPushPermission();

    if (token) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await savePushToken(user.id, token);
      Alert.alert('Notificações ativadas!', 'Você receberá lembretes da sua rotina de skincare.');
    } else {
      // Usuário recusou — direciona para Ajustes
      Alert.alert(
        'Permissão necessária',
        'Para receber notificações, ative-as nos ajustes do seu celular.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const handleDeleteAccount = () => {
    haptics.warning();
    Alert.alert(
      'Apagar minha conta',
      'Você tem certeza que deseja apagar a sua conta? Essa ação é irreversível.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar conta',
          style: 'destructive',
          onPress: async () => {
            // Sem try/catch, uma falha na exclusão deixava a pessoa na tela sem
            // nenhuma mensagem — e o router.replace rodava como se tivesse dado
            // certo. Agora a conta só é considerada apagada se não houve erro.
            try {
              await deleteAccount();
              router.replace('/');
            } catch (e) {
              console.warn('[perfil] Falha ao apagar conta:', e);
              Alert.alert(
                'Não foi possível apagar',
                'Sua conta NÃO foi apagada. Verifique sua conexão e tente novamente.'
              );
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    haptics.warning();
    Alert.alert(
      'Sair da conta',
      'Tem certeza que deseja sair da sua conta? Para entrar novamente, será necessário fazer login com seu e-mail e senha.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleSupport = () => {
    haptics.tap();
    Alert.alert(
      'Fale conosco',
      'Mande a sua pergunta ou feedback para o nosso e-mail support@niksaiapp.com',
      [
        { text: 'Fechar', style: 'cancel' },
        { text: 'Enviar e-mail', onPress: () => Linking.openURL('mailto:support@niksaiapp.com') },
      ]
    );
  };

  const editName = () => { haptics.tap(); router.push('/set-name' as any); };
  const pickPhoto = usePickProfilePhoto();

  // Tocar na foto/nome: folha de ações nativa do iOS (no Android, o alerta do sistema).
  const openEditOptions = () => {
    haptics.tap();
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Mudar foto de perfil', 'Mudar nome', 'Cancelar'], cancelButtonIndex: 2 },
        (i) => {
          if (i === 0) pickPhoto();
          else if (i === 1) editName();
        },
      );
      return;
    }
    Alert.alert('Editar perfil', undefined, [
      { text: 'Mudar foto de perfil', onPress: () => { pickPhoto(); } },
      { text: 'Mudar nome', onPress: editName },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const initial = nome ? nome.trim()[0]?.toUpperCase() ?? '?' : '?';
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const headerH = insets.top + 15 + 36 + 10;

  // Noturno a partir das 18h, como a home (38f).
  const theme = homeTheme(isNightTheme(), 'rgba(255,226,236,0.40)');

  return (
    <View style={{ flex: 1, backgroundColor: theme.base }}>
      <StatusBar style="dark" />
      <LinearGradient colors={theme.bg} locations={BG_STOPS} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.circleWhite} pointerEvents="none" />
      <View style={[styles.circleBlob, { backgroundColor: theme.blob }]} pointerEvents="none" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { const v = e.nativeEvent.contentOffset.y > 8; if (v !== scrolled) setScrolled(v); }}
        contentContainerStyle={{ paddingTop: headerH, paddingBottom: 53 + insets.bottom + 32 }}
      >
        {/* ── Topo: foto + nome + Premium ─────────────────────────────────── */}
        <TouchableOpacity activeOpacity={0.85} onPress={openEditOptions} style={styles.hero} accessibilityLabel="Editar foto ou nome">
          <View style={styles.avatarShadow}>
            {fotoUrl ? (
              <Image source={{ uri: fotoUrl }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={['#FF8DBD', PINK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.avatar, styles.avatarCenter]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </LinearGradient>
            )}
            <View style={styles.editBadge}>
              <Pencil size={13} color="#FFFFFF" strokeWidth={2.4} />
            </View>
          </View>

          <Text style={styles.name} numberOfLines={1}>{nome || 'Toque para definir'}</Text>

          <View style={styles.premium}>
            <Crown size={13} color={PINK_DEEP} fill={PINK_DEEP} />
            <Text style={styles.premiumText}>Premium</Text>
          </View>
        </TouchableOpacity>

        {/* ── Horário da rotina (os mesmos cartões do Alarme) ─────────────── */}
        <Text style={styles.sectionTitle}>Mudar o horário da minha rotina</Text>
        <HorariosRotina />

        {/* ── Assinatura ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Assinatura</Text>
        <Glass style={styles.card}>
          <Row
            icon={<Crown {...ICON} />}
            label="Gerenciar assinatura"
            sub="Detalhes do seu plano Premium"
            onPress={() => { haptics.tap(); Linking.openURL(manageSubscriptionsUrl()); }}
          />
        </Glass>

        {/* ── Sua conta ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Sua conta</Text>
        <Glass style={styles.card}>
          <Row icon={<Mail {...ICON} />} label={email ?? ''} sub="Seu e-mail" line />
          <Row
            icon={<Bell {...ICON} />}
            label="Notificações"
            sub="Lembretes da sua rotina"
            onPress={handleNotifications}
          />
        </Glass>

        {/* ── Suporte ─────────────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Suporte</Text>
        <Glass style={styles.card}>
          <Row icon={<MessageCircle {...ICON} />} label="Fale conosco" onPress={handleSupport} line />
          <Row
            icon={<Star {...ICON} />}
            label="Avaliar o app"
            onPress={() => { haptics.tap(); requestAppReview(); }}
          />
        </Glass>

        {/* ── Só em desenvolvimento ────────────────────────────────────────
            O tutorial de primeiro acesso é uma-vez-só e fica gravado em disco
            (store persistido), então testá-lo de novo exigiria reinstalar o
            app — igual ao `scanTutorialSeen` e ao consentimento de IA. Este
            atalho rearma e leva para a home. Some sozinho em qualquer build de
            release: não há nada para reverter antes de subir. */}
        {__DEV__ && (
          <>
            <Text style={styles.sectionTitle}>Desenvolvimento</Text>
            <Glass style={styles.card}>
              <Row
                icon={<Sparkles {...ICON} />}
                label="Rever tutorial da home"
                onPress={async () => {
                  haptics.tap();
                  // ⚠️ Limpar SÓ o flag local não basta: a home lê
                  // `users.home_tutorial_seen_at` e trancaria tudo de novo na
                  // primeira busca. Limpa a coluna (e o cache da home) ANTES de
                  // navegar — por isso este é aguardado.
                  await clearHomeTutorialSeenOnServer().catch(() => {});
                  replayHomeTutorial();
                  router.push('/home' as any); // mesma forma de trocar de aba que a navbar usa
                }}
              />
            </Glass>
          </>
        )}

        {/* ── Sair · apagar conta · versão ────────────────────────────────── */}
        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.8} onPress={handleSignOut} style={styles.signOut}>
            <LogOut size={18} color={DANGER} strokeWidth={2} />
            <Text style={styles.signOutText}>Sair da conta</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.6} onPress={handleDeleteAccount} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Apagar minha conta</Text>
          </TouchableOpacity>
          <Text style={styles.version}>NIKS v{appVersion}</Text>
        </View>
      </ScrollView>

      {/* ── Cabeçalho fixo: "Perfil" ─────────────────────────────────────────
          Transparente no topo; ao rolar, rosado + desfoque + linha (como o
          progresso) — sem o desfoque o conteúdo aparece por trás do .94. */}
      <View style={[styles.header, { paddingTop: insets.top + 15 }, scrolled && styles.headerScrolled]}>
        {scrolled && (
          <>
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.header }]} />
          </>
        )}
        <Text style={styles.headerTitle}>Perfil</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circleWhite: {
    position: 'absolute', width: 620, height: 620, borderRadius: 310,
    left: -330, top: 250, backgroundColor: 'rgba(255,255,255,0.42)',
  },
  circleBlob: {
    position: 'absolute', width: 560, height: 560, borderRadius: 280,
    left: 190, top: -90, // cor: `theme.blob` (dia/noite)
  },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 10,
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent',
  },
  headerScrolled: { borderBottomColor: LINE },
  headerTitle: { height: 36, lineHeight: 36, fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: INK },

  hero: { alignItems: 'center', marginTop: 14, marginHorizontal: 18 },
  avatarShadow: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    shadowColor: PINK_DEEP, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 14,
  },
  avatar: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#F6D3E1',
  },
  avatarCenter: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 38, fontWeight: '700', letterSpacing: -0.8, color: '#FFFFFF' },
  editBadge: {
    position: 'absolute', right: 0, bottom: 2, width: 30, height: 30, borderRadius: 15,
    backgroundColor: PINK, borderWidth: 2.5, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent',
  },
  name: { marginTop: 14, fontSize: 26, fontWeight: '700', lineHeight: 31, letterSpacing: -0.6, color: INK },
  premium: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,94,168,0.35)',
  },
  premiumText: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, color: PINK_DEEP },

  sectionTitle: {
    marginTop: 28, paddingHorizontal: 18, fontSize: 20, fontWeight: '600', lineHeight: 24, letterSpacing: -0.5, color: INK,
  },
  card: { marginTop: 10, marginHorizontal: 18 },
  glass: {
    borderRadius: 18,
    shadowColor: PINK_DEEP, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.09, shadowRadius: 12,
  },
  glassClip: {
    borderRadius: 18, overflow: 'hidden',
    borderWidth: 2, borderColor: PINK, backgroundColor: 'rgba(255,255,255,0.58)',
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowLine: { position: 'absolute', left: 64, right: 0, bottom: 0, height: 1, backgroundColor: LINE },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 16, fontWeight: '500', lineHeight: 20, letterSpacing: -0.3, color: INK },
  rowSub: { marginTop: 1, fontSize: 13, lineHeight: 17, letterSpacing: -0.1, color: INK_MUTE },

  footer: { marginTop: 34, marginHorizontal: 18, alignItems: 'center' },
  signOut: {
    alignSelf: 'stretch', height: 50, borderRadius: 100, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(212,24,61,0.22)',
    shadowColor: '#783C48', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  signOutText: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, color: DANGER },
  deleteBtn: { marginTop: 8, height: 40, paddingHorizontal: 12, justifyContent: 'center' },
  deleteText: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2, color: DANGER, opacity: 0.85 },
  version: { marginTop: 4, fontSize: 12, letterSpacing: -0.1, color: CHEVRON },
});
