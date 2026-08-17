import { View, Text, TouchableOpacity, ScrollView, Linking, Alert, Image } from 'react-native';
import { requestAppReview } from '../../lib/storeReview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import {
  Nunito_800ExtraBold, Nunito_700Bold, Nunito_600SemiBold,
  Nunito_500Medium, Nunito_400Regular,
} from '@expo-google-fonts/nunito';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import {
  ChevronRight,
  Crown,
  Bell,
  Star,
  LogOut,
  Mail,
  Trash2,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useAppStore } from '../../store/onboarding';
import { requestPushPermission, savePushToken } from '../../lib/notifications';
import { useCachedQuery } from '../../lib/cache';
import { haptics } from '../../lib/haptics';

// ── Color tokens (novo design system NIKS — home/protocolo/chat) ──────────────
const INK        = '#121212';
const INK_SOFT   = '#515151';
const INK_MUTE   = '#818181';
const INK_FAINT  = '#B5B5B5';
const CORAL      = '#FF9D9D';                 // rosa da marca
const CORAL_DEEP = '#F2808E';                 // rosa mais fundo (eyebrows/premium)
const CORAL_TINT = 'rgba(255,157,157,0.14)';  // wash do rosa (chips de ícone)
const CARD_BD    = '#E3E3E6';
const WHITE       = '#FFFFFF';
const DANGER      = '#D4183D';                 // vermelho semântico (apagar/sair)
const DANGER_TINT = 'rgba(212,24,61,0.10)';
const HAIRLINE    = 'rgba(18,18,18,0.06)';

// ── Chip de ícone (quadrado arredondado tintado, padrão do novo design) ───────
function IconChip({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: danger ? DANGER_TINT : CORAL_TINT,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </View>
  );
}

// ── Linha de configuração dentro de um card ───────────────────────────────────
function Row({
  icon, label, onPress, danger, hairline, fSemi,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
  hairline?: boolean;
  fSemi?: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderBottomWidth: hairline ? 1 : 0,
        borderBottomColor: HAIRLINE,
      }}
    >
      <IconChip danger={danger}>{icon}</IconChip>
      <Text style={{ flex: 1, fontFamily: fSemi, fontSize: 15, color: danger ? DANGER : INK, letterSpacing: -0.2 }}>
        {label}
      </Text>
      <ChevronRight size={20} color={danger ? DANGER : INK_FAINT} />
    </TouchableOpacity>
  );
}

// ── Rótulo de seção (eyebrow uppercase) ───────────────────────────────────────
function SectionLabel({ children, fBold }: { children: React.ReactNode; fBold?: string }) {
  return (
    <Text
      style={{
        fontFamily: fBold,
        fontSize: 12,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: INK_MUTE,
        marginBottom: 10,
        paddingLeft: 4,
      }}
    >
      {children}
    </Text>
  );
}

const CARD: any = {
  backgroundColor: WHITE,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: CARD_BD,
  overflow: 'hidden',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.03,
  shadowRadius: 8,
  elevation: 1,
};

export default function Perfil() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const [nome, setNome] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const setTabBarTheme = useAppStore((s) => s.setTabBarTheme);

  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_700Bold,
    Nunito_600SemiBold,
    Nunito_500Medium,
    Nunito_400Regular,
  });
  const fXBold = fontsLoaded ? 'Nunito_800ExtraBold' : undefined;
  const fBold  = fontsLoaded ? 'Nunito_700Bold'      : undefined;
  const fSemi  = fontsLoaded ? 'Nunito_600SemiBold'  : undefined;
  const fMed   = fontsLoaded ? 'Nunito_500Medium'    : undefined;

  // Garante navbar clara ao focar (o protocolo pode deixá-la escura ao sair)
  useFocusEffect(
    useCallback(() => {
      setTabBarTheme('light');
    }, [setTabBarTheme])
  );

  // Nome + e-mail vêm do cache: a tela abre preenchida e revalida em silêncio.
  // Antes eram 2 requisições (`auth.getUser` + `users`) a CADA foco da aba.
  const fetchPerfil = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u?.id) return { nome: null, email: null };
    const { data: userData } = await supabase
      .from('users')
      .select('nome')
      .eq('id', u.id)
      .single();
    return { nome: userData?.nome ?? null, email: u.email ?? null };
  }, []);

  const { data: perfil } = useCachedQuery(`perfil:${user?.id ?? 'anon'}`, fetchPerfil, {
    staleMs: 5 * 60_000, // nome/e-mail quase nunca mudam
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.nome);
    setEmail(perfil.email);
  }, [perfil]);

  const handleNotifications = async () => {
    haptics.tap();
    const { status } = await Notifications.getPermissionsAsync();

    if (status === 'granted') {
      // Já tem permissão — abre Ajustes para o usuário gerenciar
      Alert.alert(
        'Notificações ativas',
        'Suas notificações já estão ativadas. Para gerenciá-las, acesse os Ajustes do seu iPhone.',
        [
          { text: 'Fechar', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => Linking.openURL('app-settings:') },
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
        'Para receber notificações, ative-as nos Ajustes do seu iPhone.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => Linking.openURL('app-settings:') },
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
            await deleteAccount();
            router.replace('/');
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

  const initial = nome ? nome[0].toUpperCase() : '?';
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: WHITE }}>
      {/* Header — logo NIKS (sparkle) + wordmark, centrado (padrão do novo design) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 6,
          paddingBottom: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: HAIRLINE,
        }}
      >
        <Image
          source={require('../../assets/home/niks-logo.png')}
          style={{ width: 24, height: 24, resizeMode: 'contain', tintColor: CORAL }}
        />
        <Text style={{ marginLeft: 8, fontFamily: fXBold, fontSize: 20, color: INK, letterSpacing: -0.6 }}>
          NIKS
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20 }}>

          {/* Card de perfil (hero) */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { haptics.tap(); router.push('/set-name' as any); }}
            style={{
              ...CARD,
              borderRadius: 22,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              marginBottom: 28,
            }}
          >
            {/* Avatar coral com inicial */}
            <LinearGradient
              colors={['#FFB4B4', CORAL]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                shadowColor: CORAL,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
                elevation: 3,
              }}
            >
              <Text style={{ fontFamily: fXBold, fontSize: 26, color: WHITE }}>{initial}</Text>
            </LinearGradient>

            <View style={{ flex: 1 }}>
              {/* Selo Premium */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: 5,
                  backgroundColor: CORAL_TINT,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 100,
                  marginBottom: 7,
                }}
              >
                <Crown size={12} color={CORAL_DEEP} fill={CORAL_DEEP} />
                <Text style={{ fontFamily: fBold, fontSize: 11, color: CORAL_DEEP, letterSpacing: 0.2 }}>
                  Premium
                </Text>
              </View>

              <Text style={{ fontFamily: fXBold, fontSize: 20, color: INK, letterSpacing: -0.4, lineHeight: 24 }}>
                {nome ? nome : 'Toque para definir'}
              </Text>
              <Text style={{ fontFamily: fMed, fontSize: 13, color: INK_MUTE, marginTop: 2 }}>
                Toque para editar seu perfil
              </Text>
            </View>

            <ChevronRight size={20} color={INK_FAINT} style={{ flexShrink: 0 }} />
          </TouchableOpacity>

          {/* Assinatura */}
          <View style={{ marginBottom: 26 }}>
            <SectionLabel fBold={fBold}>Assinatura</SectionLabel>
            <View style={CARD}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { haptics.tap(); Linking.openURL('itms-apps://apps.apple.com/account/subscriptions'); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 }}
              >
                <IconChip>
                  <Crown size={19} color={CORAL_DEEP} fill={CORAL_DEEP} />
                </IconChip>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fSemi, fontSize: 15, color: INK, letterSpacing: -0.2 }}>
                    Gerenciar assinatura
                  </Text>
                  <Text style={{ fontFamily: fMed, fontSize: 12.5, color: INK_MUTE, marginTop: 2 }}>
                    Acesse os detalhes do seu plano Premium
                  </Text>
                </View>
                <ChevronRight size={20} color={INK_FAINT} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Seu e-mail */}
          <View style={{ marginBottom: 26 }}>
            <SectionLabel fBold={fBold}>Seu e-mail</SectionLabel>
            <View style={CARD}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <IconChip>
                  <Mail size={19} color={CORAL_DEEP} strokeWidth={2} />
                </IconChip>
                <Text style={{ flex: 1, fontFamily: fSemi, fontSize: 15, color: INK, letterSpacing: -0.2 }}>
                  {email ?? ''}
                </Text>
              </View>
              <Row
                icon={<Trash2 size={19} color={DANGER} strokeWidth={2} />}
                label="Apagar minha conta"
                onPress={handleDeleteAccount}
                danger
                fSemi={fSemi}
              />
            </View>
          </View>

          {/* Notificações */}
          <View style={{ marginBottom: 26 }}>
            <SectionLabel fBold={fBold}>Notificações</SectionLabel>
            <View style={CARD}>
              <Row
                icon={<Bell size={19} color={CORAL_DEEP} strokeWidth={2} />}
                label="Ative as Notificações"
                onPress={handleNotifications}
                fSemi={fSemi}
              />
            </View>
          </View>

          {/* Suporte */}
          <View style={{ marginBottom: 26 }}>
            <SectionLabel fBold={fBold}>Suporte</SectionLabel>
            <View style={CARD}>
              <Row
                icon={<Mail size={19} color={CORAL_DEEP} strokeWidth={2} />}
                label="Fale conosco"
                onPress={handleSupport}
                hairline
                fSemi={fSemi}
              />
              <Row
                icon={<Star size={19} color={CORAL_DEEP} strokeWidth={2} />}
                label="Avaliar o app"
                onPress={() => { haptics.tap(); requestAppReview(); }}
                fSemi={fSemi}
              />
            </View>
          </View>

          {/* Sair + versão */}
          <View style={{ alignItems: 'center', gap: 14, paddingTop: 8, paddingBottom: 24 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSignOut}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 100,
                borderWidth: 1,
                borderColor: 'rgba(212,24,61,0.25)',
                backgroundColor: DANGER_TINT,
                alignSelf: 'stretch',
              }}
            >
              <LogOut size={18} color={DANGER} />
              <Text style={{ fontFamily: fBold, fontSize: 15, color: DANGER, letterSpacing: -0.2 }}>
                Sair da conta
              </Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: fMed, fontSize: 11, color: INK_FAINT }}>NIKS v{appVersion}</Text>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
