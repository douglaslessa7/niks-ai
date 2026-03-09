import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Scan,
  AlertCircle,
  Moon,
  Bell,
  Globe,
  Crown,
  Receipt,
  MessageCircle,
  Star,
  Share2,
  ChevronRight,
} from 'lucide-react-native';
import { ReactNode } from 'react';

interface SettingRow {
  icon: ReactNode;
  label: string;
  badge?: { text: string; color: string };
  isPremium?: boolean;
}

interface Section {
  title: string;
  rows: SettingRow[];
}

const profileSections: Section[] = [
  {
    title: 'Meu Perfil',
    rows: [
      { icon: <User size={20} color="#1D3A44" />, label: 'Dados pessoais' },
      { icon: <Scan size={20} color="#1D3A44" />, label: 'Tipo de pele: Mista' },
      { icon: <AlertCircle size={20} color="#1D3A44" />, label: 'Alergias e sensibilidades' },
    ],
  },
  {
    title: 'Preferências',
    rows: [
      { icon: <Moon size={20} color="#1D3A44" />, label: 'Aparência: Claro' },
      { icon: <Bell size={20} color="#1D3A44" />, label: 'Notificações' },
      { icon: <Globe size={20} color="#1D3A44" />, label: 'Idioma: Português' },
    ],
  },
  {
    title: 'Assinatura',
    rows: [
      {
        icon: <Crown size={20} color="#FB7B6B" />,
        label: 'NIKS AI Premium',
        badge: { text: 'Ativo', color: '#7CB69D' },
        isPremium: true,
      },
      { icon: <Receipt size={20} color="#1D3A44" />, label: 'Gerenciar assinatura' },
    ],
  },
  {
    title: 'Suporte',
    rows: [
      { icon: <MessageCircle size={20} color="#1D3A44" />, label: 'Ajuda e FAQ' },
      { icon: <Star size={20} color="#1D3A44" />, label: 'Avaliar o app' },
      { icon: <Share2 size={20} color="#1D3A44" />, label: 'Convidar amigos' },
    ],
  },
];

export default function Perfil() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 48 }}>

          {/* Avatar Section */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            {/* Avatar */}
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 999,
                backgroundColor: '#FB7B6B',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <Text style={{ fontSize: 32, fontWeight: '700', color: '#FFFFFF' }}>MA</Text>
            </View>

            <Text style={{ fontSize: 22, fontWeight: '700', color: '#1D3A44', marginBottom: 4 }}>
              Maria Almeida
            </Text>
            <Text style={{ fontSize: 13, color: '#8A8A8E', marginBottom: 16 }}>
              Membro desde Mar 2026
            </Text>

            {/* Stats Row */}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              {[
                { value: '82', label: 'Skin Score' },
                { value: '14', label: 'Dias seguidos' },
                { value: '23', label: 'Scans feitos' },
              ].map((stat, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 12,
                    padding: 12,
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  <Text style={{ fontSize: 24, fontWeight: '700', color: '#1D3A44', marginBottom: 4 }}>
                    {stat.value}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#8A8A8E', textAlign: 'center' }}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Settings Sections */}
          {profileSections.map((section, sectionIndex) => (
            <View key={sectionIndex} style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1D3A44', marginBottom: 12, paddingHorizontal: 8 }}>
                {section.title}
              </Text>

              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  overflow: 'hidden',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                {section.rows.map((row, rowIndex) => (
                  <TouchableOpacity
                    key={rowIndex}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      borderBottomWidth: rowIndex !== section.rows.length - 1 ? 1 : 0,
                      borderBottomColor: '#F6F4EE',
                    }}
                  >
                    <View style={{ flexShrink: 0 }}>{row.icon}</View>

                    <Text
                      style={{
                        flex: 1,
                        fontSize: 17,
                        color: row.isPremium ? '#FB7B6B' : '#1D3A44',
                        fontWeight: row.isPremium ? '700' : '400',
                      }}
                    >
                      {row.label}
                    </Text>

                    {row.badge && (
                      <View
                        style={{
                          backgroundColor: row.badge.color,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF' }}>
                          {row.badge.text}
                        </Text>
                      </View>
                    )}

                    <ChevronRight size={20} color="#8A8A8E" style={{ flexShrink: 0 }} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          {/* Sign Out and Version */}
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
            <TouchableOpacity activeOpacity={0.8}>
              <Text style={{ fontSize: 17, fontWeight: '500', color: '#E85D5D' }}>Sair da conta</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 11, color: '#8A8A8E' }}>NIKS AI v1.0.0</Text>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
