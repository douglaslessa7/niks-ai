import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Camera, Utensils } from 'lucide-react-native';

export default function Analise() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 48 }}>

          {/* Header */}
          <Text style={{ fontSize: 32, fontWeight: '700', color: '#1D3A44', marginBottom: 32 }}>
            Análise
          </Text>

          {/* Skin Scan Card */}
          <TouchableOpacity
            onPress={() => router.push('/(scan)/scan-prep')}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 32,
              minHeight: 280,
              marginBottom: 16,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 1,
            }}
          >
            {/* Camera Icon */}
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: '#1D3A44',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Camera size={40} color="#1D3A44" strokeWidth={1.5} />
            </View>

            <Text style={{ fontSize: 24, fontWeight: '700', color: '#1D3A44', marginBottom: 8, textAlign: 'center' }}>
              Escanear Pele
            </Text>
            <Text style={{ fontSize: 17, color: '#8A8A8E', textAlign: 'center', marginBottom: 16, maxWidth: 280 }}>
              Tire uma selfie e receba sua análise completa
            </Text>
            <Text style={{ fontSize: 13, color: '#7CB69D', textAlign: 'center' }}>
              Último scan: 5 de março — Score: 82
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <Text style={{ fontSize: 15, color: '#8A8A8E' }}>ou</Text>
          </View>

          {/* Food Scan Card */}
          <TouchableOpacity
            activeOpacity={0.85}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 32,
              minHeight: 260,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 1,
            }}
          >
            {/* Food Camera Icon */}
            <View style={{ position: 'relative', width: 80, height: 80, marginBottom: 16 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: '#FB7B6B',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Utensils size={32} color="#FB7B6B" strokeWidth={1.5} />
              </View>
              <View
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 999,
                  padding: 4,
                }}
              >
                <Camera size={16} color="#FB7B6B" strokeWidth={1.5} />
              </View>
            </View>

            <Text style={{ fontSize: 24, fontWeight: '700', color: '#FB7B6B', marginBottom: 8, textAlign: 'center' }}>
              Escanear Refeição
            </Text>
            <Text style={{ fontSize: 17, color: '#8A8A8E', textAlign: 'center', marginBottom: 16, maxWidth: 280 }}>
              Fotografe sua comida e descubra o impacto na sua pele
            </Text>
            <Text style={{ fontSize: 13, color: '#FB7B6B', textAlign: 'center' }}>
              3 alimentos escaneados esta semana
            </Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
