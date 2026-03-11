import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Settings, Plus, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { useAppStore } from '../../store/onboarding';
import { ScanModal } from '../../components/scan/ScanModal';

function NiksLogo({ size = 32 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 120 120" width={size} height={size}>
      <G stroke="#1D3A44" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M 20 42 L 20 32 A 12 12 0 0 1 32 20 L 42 20" />
        <Path d="M 100 42 L 100 32 A 12 12 0 0 0 88 20 L 78 20" />
        <Path d="M 20 78 L 20 88 A 12 12 0 0 0 32 100 L 42 100" />
        <Path d="M 100 78 L 100 88 A 12 12 0 0 1 88 100 L 78 100" />
      </G>
      <Path
        d="M 60 26 C 74 26, 82 37, 84 50 C 88 50, 90 52, 90 55 C 90 58, 88 60, 84 60 C 82 76, 72 90, 60 94 C 48 90, 38 76, 36 60 C 32 60, 30 58, 30 55 C 30 52, 32 50, 36 50 C 38 37, 46 26, 60 26 Z"
        fill="none"
        stroke="#1D3A44"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M 42 46 Q 47 44 52 46" fill="none" stroke="#1D3A44" strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M 78 46 Q 73 44 68 46" fill="none" stroke="#1D3A44" strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M 53 77 Q 60 80 67 77" fill="none" stroke="#1D3A44" strokeWidth={2.5} strokeLinecap="round" />
      <G fill="#1D3A44">
        <Circle cx={60} cy={36} r={2.5} />
        <Circle cx={50} cy={38} r={1.5} />
        <Circle cx={70} cy={38} r={1.5} />
        <Circle cx={44} cy={62} r={2.5} />
        <Circle cx={76} cy={62} r={2.5} />
      </G>
    </Svg>
  );
}

const MOCK_MEALS = [
  {
    id: 'salada-mediterranea',
    name: 'Salada mediterrânea',
    time: '12:47',
    score: 92,
    imageUri:
      'https://images.unsplash.com/photo-1649531794884-b8bb1de72e68?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  },
  {
    id: 'bowl-de-frutas',
    name: 'Bowl de frutas',
    time: '08:23',
    score: 85,
    imageUri:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  },
];

export default function Home() {
  const router = useRouter();
  const { scanImageUri, scanResult } = useAppStore();
  const [scanOpen, setScanOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* === TOP BAR === */}
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <NiksLogo size={32} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1D3A44' }}>NIKS AI</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} style={{ padding: 8 }}>
              <Settings size={24} color="#8A8A8E" strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          {/* === SEÇÃO "HOJE" (ÚLTIMAS REFEIÇÕES) === */}
          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1D3A44', marginBottom: 12 }}>Hoje</Text>

            <View style={{ gap: 10 }}>
              {MOCK_MEALS.map((meal) => (
                <TouchableOpacity
                  key={meal.id}
                  onPress={() =>
                    router.push({ pathname: '/(scan)/food-report', params: { foodId: meal.id } } as any)
                  }
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.06,
                    shadowRadius: 8,
                    elevation: 2,
                  }}
                >
                  <Image
                    source={{ uri: meal.imageUri }}
                    style={{ width: 56, height: 56, borderRadius: 12 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#1D3A44' }}>{meal.name}</Text>
                    <Text style={{ fontSize: 13, color: '#8A8A8E', marginTop: 2 }}>{meal.time}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: '#7CB69D' }}>{meal.score}</Text>
                      <Text style={{ fontSize: 11, color: '#8A8A8E' }}>/100</Text>
                    </View>
                    <ChevronRight size={20} color="#8A8A8E" strokeWidth={1.8} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* === BOTÃO SCANEAR === */}
          <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
            <TouchableOpacity
              onPress={() => setScanOpen(true)}
              activeOpacity={0.85}
              style={{
                height: 60,
                borderRadius: 999,
                backgroundColor: '#FB7B6B',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                shadowColor: '#FB7B6B',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 24,
                elevation: 8,
              }}
            >
              <Plus size={26} color="white" strokeWidth={2.5} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#FFFFFF' }}>Scanear</Text>
            </TouchableOpacity>
          </View>

          {/* === SKIN SCORE CARD (foto da última análise) === */}
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <View
              style={{
                height: 280,
                borderRadius: 20,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 16,
                elevation: 4,
              }}
            >
              {scanImageUri ? (
                <Image
                  source={{ uri: scanImageUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ width: '100%', height: '100%', backgroundColor: '#C8C0B8' }} />
              )}

              {/* Gradiente overlay */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.65)']}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 }}
              />

              {/* "Última análise feita" */}
              <View style={{ position: 'absolute', top: 16, left: 16 }}>
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>Última análise feita</Text>
              </View>

              {/* Pagination dots */}
              <View
                style={{
                  position: 'absolute',
                  bottom: 58,
                  left: 0,
                  right: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' }} />
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
              </View>

              {/* Botão "Ver resultado" */}
              <View style={{ position: 'absolute', bottom: 14, left: 20, right: 20 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (scanResult) router.push('/(scan)/results' as any);
                  }}
                  activeOpacity={0.85}
                  style={{
                    height: 36,
                    borderRadius: 999,
                    backgroundColor: '#FFFFFF',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#1D3A44' }}>Ver resultado</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

        </View>
      </ScrollView>

      <ScanModal isOpen={scanOpen} onClose={() => setScanOpen(false)} />
    </SafeAreaView>
  );
}
