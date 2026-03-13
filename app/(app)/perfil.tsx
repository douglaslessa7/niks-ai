import { View, Text, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Settings,
  ChevronRight,
  Crown,
  Bell,
  Star,
  LogOut,
  Mail,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export default function Perfil() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [nome, setNome] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.email) setEmail(data.user.email);
        const userId = data?.user?.id;
        if (!userId) return;
        supabase
          .from('users')
          .select('nome')
          .eq('id', userId)
          .single()
          .then(({ data: userData }) => {
            if (userData?.nome) setNome(userData.nome);
            else setNome(null);
          });
      });
    }, [])
  );

  const initial = nome ? nome[0].toUpperCase() : '?';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* Top Bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1D3A44' }}>NIKS AI</Text>
            </View>
            <TouchableOpacity style={{ padding: 8 }}>
              <Settings size={24} color="#8A8A8E" />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 24 }}>

            {/* Profile Header Card */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/set-name' as any)}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 20,
                marginBottom: 24,
                marginTop: 8,
                borderWidth: 1,
                borderColor: '#F0F0F0',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
                elevation: 2,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                {/* Avatar */}
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: '#FB7B6B',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    shadowColor: 'rgba(251,123,109,1)',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 3,
                  }}
                >
                  <Text style={{ fontSize: 28, fontWeight: '500', color: '#FFFFFF' }}>{initial}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  {/* Premium badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Crown size={14} color="#CBA052" fill="#CBA052" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#8A8A8E' }}>Premium</Text>
                  </View>

                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#1D3A44', lineHeight: 24 }}>
                    {nome ? nome : 'Toque para definir'}
                  </Text>
                  <Text style={{ fontSize: 14, color: '#8A8A8E', marginTop: 2 }}>
                    seu nome e usuário
                  </Text>
                </View>
              </View>

              <ChevronRight size={20} color="#8A8A8E" style={{ flexShrink: 0 }} />
            </TouchableOpacity>

            {/* Assinatura */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D3A44', marginBottom: 12, paddingHorizontal: 4 }}>
                Assinatura
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderWidth: 1,
                  borderColor: '#F0F0F0',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#FB7B6B',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    shadowColor: 'rgba(251,123,109,1)',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                  }}
                >
                  <Crown size={20} color="#FFFFFF" fill="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1D3A44', marginBottom: 2 }}>
                    Gerenciar assinatura
                  </Text>
                  <Text style={{ fontSize: 12, color: '#8A8A8E' }}>
                    Acesse os detalhes do seu plano Premium
                  </Text>
                </View>
                <ChevronRight size={20} color="#8A8A8E" />
              </TouchableOpacity>
            </View>

            {/* Seu e-mail */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D3A44', marginBottom: 12, paddingHorizontal: 4 }}>
                Seu e-mail
              </Text>
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#F0F0F0',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <Text style={{ fontSize: 15, color: '#1D3A44' }}>{email ?? ''}</Text>
              </View>
            </View>

            {/* Notificações */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D3A44', marginBottom: 12, paddingHorizontal: 4 }}>
                Notificações
              </Text>
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: '#F0F0F0',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                  }}
                >
                  <Bell size={20} color="#8A8A8E" strokeWidth={2} />
                  <Text style={{ flex: 1, fontSize: 15, color: '#1D3A44' }}>Ative as Notificações</Text>
                  <ChevronRight size={20} color="#8A8A8E" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Suporte */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D3A44', marginBottom: 12, paddingHorizontal: 4 }}>
                Suporte
              </Text>
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: '#F0F0F0',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    Alert.alert(
                      'Fale conosco',
                      'Mande a sua pergunta ou feedback para o nosso e-mail suporte@niksai.com.br',
                      [
                        { text: 'Fechar', style: 'cancel' },
                        {
                          text: 'Enviar e-mail',
                          onPress: () => Linking.openURL('mailto:suporte@niksai.com.br'),
                        },
                      ]
                    )
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: '#F0F0F0',
                  }}
                >
                  <Mail size={20} color="#8A8A8E" strokeWidth={2} />
                  <Text style={{ flex: 1, fontSize: 15, color: '#1D3A44' }}>Fale conosco</Text>
                  <ChevronRight size={20} color="#8A8A8E" />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                  }}
                >
                  <Star size={20} color="#8A8A8E" strokeWidth={2} />
                  <Text style={{ flex: 1, fontSize: 15, color: '#1D3A44' }}>Avaliar o app</Text>
                  <ChevronRight size={20} color="#8A8A8E" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign Out + Version */}
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
              <TouchableOpacity activeOpacity={0.8} onPress={signOut}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <LogOut size={18} color="#D4183D" />
                  <Text style={{ fontSize: 16, fontWeight: '500', color: '#D4183D' }}>Sair da conta</Text>
                </View>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: '#8A8A8E' }}>NIKS AI v1.0.0</Text>
            </View>

          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
