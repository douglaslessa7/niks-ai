import { View, Text, TouchableOpacity, ScrollView, Image, FlatList, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback, useRef } from 'react';
import { ChevronRight, Utensils, Settings, CheckSquare, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore, ScanResult } from '../../store/onboarding';
import { ScanModal } from '../../components/scan/ScanModal';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';

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
  full_result: ScanResult | null;
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

function getProtocolDate(): string {
  const now = new Date();
  now.setHours(now.getHours() - 3);
  return now.toISOString().split('T')[0];
}

function scorePillStyle(score: number): { bg: string; text: string } {
  if (score >= 70) return { bg: '#E8F5E9', text: '#2E7D32' };
  if (score >= 40) return { bg: '#FFF8E1', text: '#F57F17' };
  return { bg: '#FFEBEE', text: '#C62828' };
}

type ScanSlide = {
  id: string;
  foto_url: string;
  full_result: ScanResult;
  created_at: string;
};

const RING_R = 22;
const RING_CIRC = 2 * Math.PI * RING_R;

function SkinScoreRing({ score }: { score: number }) {
  const offset = RING_CIRC * (1 - score / 100);
  return (
    <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={52} height={52} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={26} cy={26} r={RING_R} stroke="#F0EEEA" strokeWidth={5} fill="none" />
        <Circle
          cx={26} cy={26} r={RING_R}
          stroke={Colors.scanBtn} strokeWidth={5} fill="none"
          strokeDasharray={RING_CIRC} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.tabActive }}>{score}</Text>
      </View>
    </View>
  );
}

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

      <View style={{ position: 'absolute', top: 16, right: 16, backgroundColor: Colors.scanBtn, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: Colors.white }}>{item.full_result.skin_score}</Text>
      </View>

      <View style={{ position: 'absolute', bottom: 58, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {scans.map((_, i) => (
          <View
            key={i}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === activeIndex ? Colors.white : 'rgba(255,255,255,0.3)' }}
          />
        ))}
      </View>

      <View style={{ position: 'absolute', bottom: 14, left: 20, right: 20 }}>
        <TouchableOpacity
          onPress={onVerResultado}
          activeOpacity={0.85}
          style={{ height: 36, borderRadius: 999, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.tabActive }}>Ver resultado</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SECTION_LABEL_STYLE = {
  fontSize: 11,
  fontWeight: '600' as const,
  color: Colors.gray,
  letterSpacing: 0.8,
  marginBottom: 8,
};

const CARD_STYLE = {
  backgroundColor: Colors.white,
  borderRadius: 16,
  borderWidth: 0.5,
  borderColor: 'rgba(0,0,0,0.07)',
  padding: 14,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
};

export default function Home() {
  const router = useRouter();
  const { setSelectedScan, setSelectedFoodResult, protocolResult } = useAppStore();
  const [scanOpen, setScanOpen] = useState(false);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const CARD_WIDTH = Math.min(SCREEN_WIDTH, 393) - 48;

  const [nome, setNome] = useState<string | null>(null);
  const [meals, setMeals] = useState<FoodScan[]>([]);
  const [scans, setScans] = useState<ScanSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [protocolProgress, setProtocolProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const flatListRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user || !active) return;

          // Fetch user name
          const { data: userData } = await supabase
            .from('users')
            .select('nome')
            .eq('id', user.id)
            .single();
          if (active && userData?.nome) setNome(userData.nome);

          // Fetch today's food scans (reset at 2h30)
          const todayStart = getTodayStart().toISOString();
          const { data: foodData } = await supabase
            .from('food_scans')
            .select('id, meal_name, meal_score, meal_label, created_at, image_url, full_result')
            .eq('user_id', user.id)
            .gte('created_at', todayStart)
            .order('created_at', { ascending: false });
          if (active && foodData) setMeals(foodData as FoodScan[]);

          // Fetch skin scans
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

            // Repair scan with broken local photo url
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

          // Load protocol progress from AsyncStorage
          if (protocolResult) {
            const todayDate = getProtocolDate();
            const morningKey = `protocolo_check_${todayDate}_morning`;
            const nightKey = `protocolo_check_${todayDate}_night`;
            const [morningData, nightData] = await Promise.all([
              AsyncStorage.getItem(morningKey),
              AsyncStorage.getItem(nightKey),
            ]);
            const morningDone = morningData ? (JSON.parse(morningData) as number[]).length : 0;
            const nightDone = nightData ? (JSON.parse(nightData) as number[]).length : 0;
            const total = (protocolResult.morning?.length ?? 0) + (protocolResult.night?.length ?? 0);
            if (active) setProtocolProgress({ done: morningDone + nightDone, total });
          }
        } catch (e) {
          console.warn('Failed to fetch home data:', e);
        }
      })();
      return () => { active = false; };
    }, [protocolResult])
  );

  const latestScan = scans[0] ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.cardBg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* ── TOP BAR ── */}
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <NiksLogo size={32} />
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.tabActive, letterSpacing: 0.5 }}>
                  NIKS AI
                </Text>
                <Text style={{ fontSize: 13, color: Colors.gray, marginTop: 1 }}>
                  {nome ? `Oi, ${nome}!` : 'Olá!'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(app)/perfil' as any)}
              activeOpacity={0.8}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: Colors.lightGray,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Settings size={18} color={Colors.gray} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 24, gap: 20 }}>

            {/* ── SUA PELE ── */}
            <View>
              <Text style={SECTION_LABEL_STYLE}>SUA PELE</Text>
              <View style={CARD_STYLE}>
                {latestScan ? (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedScan({ result: latestScan.full_result, imageUri: latestScan.foto_url });
                      router.push('/(app)/skin-result' as any);
                    }}
                    activeOpacity={0.85}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
                  >
                    <SkinScoreRing score={latestScan.full_result.skin_score} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.tabActive, marginBottom: 3 }}>
                        Skin Score
                      </Text>
                      {latestScan.full_result.headline ? (
                        <Text style={{ fontSize: 10, color: Colors.gray, marginBottom: 5 }} numberOfLines={2}>
                          {latestScan.full_result.headline}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.scanBtn }} />
                        <Text style={{ fontSize: 10, color: Colors.scanBtn, fontWeight: '500' }}>
                          Última análise:{' '}
                          {new Date(latestScan.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </Text>
                      </View>
                    </View>
                    <ChevronRight size={18} color={Colors.disabled} strokeWidth={1.8} />
                  </TouchableOpacity>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.lightGray, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 20 }}>✨</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: Colors.gray, flex: 1 }}>
                      Faça seu primeiro scan
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── PROTOCOLO DE HOJE ── */}
            <View>
              <Text style={SECTION_LABEL_STYLE}>PROTOCOLO DE HOJE</Text>
              <TouchableOpacity
                onPress={() => router.push('/(app)/protocolo' as any)}
                activeOpacity={0.85}
                style={CARD_STYLE}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF5F4', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckSquare size={22} color={Colors.scanBtn} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.tabActive, marginBottom: 6 }}>
                      {protocolProgress.total > 0 ? 'Sua rotina' : 'Configure seu protocolo'}
                    </Text>
                    {protocolProgress.total > 0 ? (
                      <>
                        <View style={{ height: 4, backgroundColor: Colors.lightGray, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                          <View
                            style={{
                              height: '100%',
                              width: `${Math.round((protocolProgress.done / protocolProgress.total) * 100)}%`,
                              backgroundColor: Colors.scanBtn,
                              borderRadius: 2,
                            }}
                          />
                        </View>
                        <Text style={{ fontSize: 12, color: Colors.gray }}>
                          {protocolProgress.done} de {protocolProgress.total} passos concluídos hoje
                        </Text>
                      </>
                    ) : (
                      <View style={{ height: 4, backgroundColor: Colors.lightGray, borderRadius: 2 }} />
                    )}
                  </View>
                  <ChevronRight size={18} color={Colors.disabled} strokeWidth={1.8} />
                </View>
              </TouchableOpacity>
            </View>

            {/* ── REFEIÇÕES DE HOJE ── */}
            <View>
              <Text style={SECTION_LABEL_STYLE}>REFEIÇÕES DE HOJE</Text>

              <View style={CARD_STYLE}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.tabActive, marginBottom: 12 }}>
                  Impacto na pele
                </Text>

                {meals.length === 0 ? (
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
                  <View style={{ gap: 10 }}>
                    {meals.map((meal) => {
                      const pill = scorePillStyle(meal.meal_score);
                      return (
                        <TouchableOpacity
                          key={meal.id}
                          onPress={() => {
                            if (meal.full_result) setSelectedFoodResult(meal.full_result);
                            router.push('/(scan)/food-report' as any);
                          }}
                          activeOpacity={0.85}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                        >
                          {meal.image_url ? (
                            <Image source={{ uri: meal.image_url }} style={{ width: 32, height: 32, borderRadius: 8 }} />
                          ) : (
                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.lightGray, alignItems: 'center', justifyContent: 'center' }}>
                              <Utensils size={15} color={Colors.gray} strokeWidth={1.8} />
                            </View>
                          )}
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: Colors.tabActive }} numberOfLines={1}>
                            {meal.meal_name}
                          </Text>
                          <Text style={{ fontSize: 12, color: Colors.gray, marginRight: 8 }}>
                            {new Date(meal.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: pill.bg }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: pill.text }}>{meal.meal_score}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

          </View>

          {/* ── BOTÃO SCANEAR ── */}
          <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
            <TouchableOpacity
              onPress={() => setScanOpen(true)}
              activeOpacity={0.85}
              style={{
                height: 60,
                borderRadius: 999,
                backgroundColor: Colors.scanBtn,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                shadowColor: Colors.scanBtnShadow,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.4,
                shadowRadius: 24,
                elevation: 8,
              }}
            >
              <Plus size={26} color={Colors.white} strokeWidth={2.5} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.white }}>Scanear</Text>
            </TouchableOpacity>
          </View>

          {/* ── ÚLTIMO SCAN — CARROSSEL ── */}
          <View style={{ marginTop: 28 }}>
            <Text style={[SECTION_LABEL_STYLE, { paddingHorizontal: 24, marginBottom: 12 }]}>ÚLTIMO SCAN</Text>
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
