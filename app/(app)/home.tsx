import { View, Text, TouchableOpacity, ScrollView, Image, FlatList, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback, useRef } from 'react';
import { Plus, ChevronRight, Utensils } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { useAppStore, ScanResult } from '../../store/onboarding';
import { ScanModal } from '../../components/scan/ScanModal';
import { supabase } from '../../lib/supabase';

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

type FoodScan = {
  id: string;
  meal_name: string;
  meal_score: number;
  meal_label: string;
  created_at: string;
  image_url: string | null;
  full_result: any | null;
};

function getTodayStart(): Date {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(2, 30, 0, 0);
  if (now < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff;
}

type ScanSlide = {
  id: string;
  foto_url: string;
  full_result: ScanResult;
  created_at: string;
};

function ScanSlideItem({
  item,
  cardWidth,
  scans,
  activeIndex,
  onVerResultado,
}: {
  item: ScanSlide;
  cardWidth: number;
  scans: ScanSlide[];
  activeIndex: number;
  onVerResultado: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const isValidUrl = item.foto_url.startsWith('http');

  return (
    <View
      style={{
        width: cardWidth,
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
      {isValidUrl && !imgError ? (
        <Image
          source={{ uri: item.foto_url }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <View style={{ width: '100%', height: '100%', backgroundColor: '#C8C0B8' }} />
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.65)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 }}
      />

      <View style={{ position: 'absolute', top: 16, left: 16 }}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
          {new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </Text>
      </View>

      <View style={{ position: 'absolute', top: 16, right: 16, backgroundColor: '#FB7B6B', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: 'white' }}>{item.full_result.skin_score}</Text>
      </View>

      <View style={{ position: 'absolute', bottom: 58, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {scans.map((_, i) => (
          <View
            key={i}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === activeIndex ? '#FFFFFF' : 'rgba(255,255,255,0.3)' }}
          />
        ))}
      </View>

      <View style={{ position: 'absolute', bottom: 14, left: 20, right: 20 }}>
        <TouchableOpacity
          onPress={onVerResultado}
          activeOpacity={0.85}
          style={{ height: 36, borderRadius: 999, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1D3A44' }}>Ver resultado</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { setSelectedScan, setSelectedFoodResult } = useAppStore();
  const [scanOpen, setScanOpen] = useState(false);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const CARD_WIDTH = Math.min(SCREEN_WIDTH, 393) - 48;

  const [meals, setMeals] = useState<FoodScan[]>([]);
  const [scans, setScans] = useState<ScanSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !active) return;
          // Buscar refeições do dia (reset às 2h30)
          const todayStart = getTodayStart().toISOString();
          const { data: foodData } = await supabase
            .from('food_scans')
            .select('id, meal_name, meal_score, meal_label, created_at, image_url, full_result')
            .eq('user_id', user.id)
            .gte('created_at', todayStart)
            .order('created_at', { ascending: false });
          if (active && foodData) setMeals(foodData as FoodScan[]);

          const { data } = await supabase
            .from('skin_scans')
            .select('id, foto_url, full_result, created_at')
            .eq('user_id', user.id)
            .not('full_result', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5);
          if (active && data) {
            const fetchedScans = data as ScanSlide[];
            setScans(fetchedScans);

            // Reparar scan do onboarding com foto_url local inválido (uma única vez)
            const { skinScanId, skinImageBase64: b64 } = useAppStore.getState();
            const brokenScan = fetchedScans.find(
              (s) => s.id === skinScanId && !s.foto_url.startsWith('http')
            );
            if (brokenScan && b64) {
              try {
                const path = `${user.id}/${Date.now()}.jpg`;
                const binaryStr = atob(b64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                const { error: upErr } = await supabase.storage
                  .from('scans').upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
                if (!upErr) {
                  const { data: signed } = await supabase.storage.from('scans').createSignedUrl(path, 31536000);
                  const fotoUrl = signed?.signedUrl ?? supabase.storage.from('scans').getPublicUrl(path).data.publicUrl;
                  await supabase.from('skin_scans').update({ foto_url: fotoUrl }).eq('id', brokenScan.id);
                  if (active) setScans((prev) => prev.map((s) => s.id === brokenScan.id ? { ...s, foto_url: fotoUrl } : s));
                }
              } catch (e) { console.warn('Failed to repair scan photo:', e); }
            }
          }
        } catch (e) {
          console.warn('Failed to fetch scan history:', e);
        }
      })();
      return () => { active = false; };
    }, [])
  );

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
          </View>

          {/* === SEÇÃO "HOJE" (ÚLTIMAS REFEIÇÕES) === */}
          <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1D3A44', marginBottom: 12 }}>Hoje</Text>

            {meals.length === 0 ? (
              /* Empty State */
              <View style={{
                backgroundColor: '#FDFDFD',
                borderRadius: 24,
                borderWidth: 1,
                borderColor: '#F0F0F0',
                minHeight: 180,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.02,
                shadowRadius: 10,
                elevation: 1,
              }}>
                {/* Stacked cards illustration */}
                <View style={{ width: 200, height: 72, marginBottom: 24, alignItems: 'center' }}>
                  {/* Back card */}
                  <View style={{ position: 'absolute', bottom: -8, width: '85%', height: '100%', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#F5F5F5', opacity: 0.5 }} />
                  {/* Middle card */}
                  <View style={{ position: 'absolute', bottom: -4, width: '92%', height: '100%', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#F5F5F5', opacity: 0.8 }} />
                  {/* Front card */}
                  <View style={{ position: 'absolute', bottom: 0, width: '100%', height: '100%', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#F0F0F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden' }}>
                      <Image
                        source={{ uri: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200&q=80' }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={{ height: 10, backgroundColor: '#F2F2F2', borderRadius: 99, width: '85%' }} />
                      <View style={{ height: 10, backgroundColor: '#F2F2F2', borderRadius: 99, width: '60%' }} />
                    </View>
                  </View>
                </View>
                <Text style={{ fontSize: 14, color: '#8A8A8E', textAlign: 'center', maxWidth: 240, lineHeight: 20 }}>
                  <Text style={{ color: '#1D3A44', fontWeight: '600' }}>Escaneie sua refeição{'\n'}</Text>
                  e veja o efeito real dela na sua pele.
                </Text>
              </View>
            ) : (
              /* Lista de refeições do dia */
              <View style={{ gap: 10 }}>
                {meals.map((meal) => (
                  <TouchableOpacity
                    key={meal.id}
                    onPress={() => {
                      if (meal.full_result) setSelectedFoodResult(meal.full_result);
                      router.push('/(scan)/food-report' as any);
                    }}
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
                    {meal.image_url ? (
                      <Image source={{ uri: meal.image_url }} style={{ width: 56, height: 56, borderRadius: 12 }} />
                    ) : (
                      <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: '#F3F3F5', alignItems: 'center', justifyContent: 'center' }}>
                        <Utensils size={22} color="#8A8A8E" strokeWidth={1.8} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#1D3A44' }}>{meal.meal_name}</Text>
                      <Text style={{ fontSize: 13, color: '#8A8A8E', marginTop: 2 }}>
                        {new Date(meal.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#FB7B6B' }}>{meal.meal_score}</Text>
                        <Text style={{ fontSize: 11, color: '#8A8A8E' }}>/100</Text>
                      </View>
                      <ChevronRight size={20} color="#8A8A8E" strokeWidth={1.8} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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

          {/* === CARROSSEL DE SCANS === */}
          <View style={{ marginTop: 24 }}>
            {scans.length === 0 ? (
              <View style={{ paddingHorizontal: 24 }}>
                <View
                  style={{
                    height: 280,
                    borderRadius: 20,
                    backgroundColor: '#C8C0B8',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.12,
                    shadowRadius: 16,
                    elevation: 4,
                  }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
                    Nenhuma análise ainda
                  </Text>
                </View>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={scans}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_WIDTH + 16}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
                onMomentumScrollEnd={(e) => {
                  const newIndex = Math.round(
                    e.nativeEvent.contentOffset.x / (CARD_WIDTH + 16)
                  );
                  setActiveIndex(newIndex);
                }}
                renderItem={({ item }) => (
                  <ScanSlideItem
                    item={item}
                    cardWidth={CARD_WIDTH}
                    scans={scans}
                    activeIndex={activeIndex}
                    onVerResultado={() => {
                      setSelectedScan({ result: item.full_result, imageUri: item.foto_url });
                      router.push('/(app)/skin-result' as any);
                    }}
                  />
                )}
              />
            )}
          </View>

        </View>
      </ScrollView>

      <ScanModal isOpen={scanOpen} onClose={() => setScanOpen(false)} />
    </SafeAreaView>
  );
}
