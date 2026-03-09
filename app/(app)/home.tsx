import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Sun, Moon, Flame, Bell, ChevronRight, Check } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getGreetingEmoji() {
  const h = new Date().getHours();
  if (h < 12) return '☀️';
  if (h < 18) return '🌤️';
  return '🌙';
}

function getWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i);
    days.push({
      label: labels[d.getDay()],
      date: d.getDate(),
      isPast: i < dayOfWeek,
      isToday: i === dayOfWeek,
      isFuture: i > dayOfWeek,
    });
  }
  return days;
}

function SkinScoreRing({ score, size = 70 }: { score: number; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#7CB69D"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: '700', color: '#1D3A44', lineHeight: 28 }}>
          {score}
        </Text>
      </View>
    </View>
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: 11, color: '#8A8A8E', width: 60 }}>{label}</Text>
      <View style={{ flex: 1, height: 4, backgroundColor: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ width: `${value}%`, height: '100%', backgroundColor: color, borderRadius: 999 }} />
      </View>
      <Text style={{ fontSize: 11, width: 22, textAlign: 'right', color, fontWeight: '600' }}>
        {value}
      </Text>
    </View>
  );
}

function FoodItem({
  foodId,
  name,
  badgeType,
  calories,
  time,
  imageUri,
  onPress,
}: {
  foodId: string;
  name: string;
  badgeType: 'boost' | 'neutro';
  calories: number;
  time: string;
  imageUri: string;
  onPress: (id: string) => void;
}) {
  const isBoost = badgeType === 'boost';
  return (
    <TouchableOpacity
      onPress={() => onPress(foodId)}
      activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 4, borderRadius: 8 }}
    >
      <Image
        source={{ uri: imageUri }}
        style={{ width: 48, height: 48, borderRadius: 8 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#1D3A44' }}>{name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: isBoost ? 'rgba(124,182,157,0.1)' : 'rgba(255,215,0,0.1)',
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 8 }}>{isBoost ? '🟢' : '🟡'}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: isBoost ? '#7CB69D' : '#B8860B' }}>
              {isBoost ? 'Skin Boost' : 'Neutro'}
            </Text>
          </View>
          <Text style={{ fontSize: 9, color: '#8A8A8E' }}>{calories} cal</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 9, color: '#8A8A8E' }}>{time}</Text>
        <ChevronRight size={14} color="#8A8A8E" strokeWidth={2} style={{ marginTop: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

export default function Home() {
  const weekDays = useMemo(() => getWeekDays(), []);
  const isAfternoon = new Date().getHours() >= 12;
  const router = useRouter();

  const handleFoodClick = (foodId: string) => {
    router.push({ pathname: '/(scan)/food-report', params: { foodId } } as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center' }}>

          {/* === 1. TOP BAR === */}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#1D3A44', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>N</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1D3A44' }}>NIKS AI</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <Flame size={13} color="#FB7B6B" fill="#FB7B6B" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FB7B6B' }}>14</Text>
              </View>
              <TouchableOpacity activeOpacity={0.8} style={{ position: 'relative' }}>
                <Bell size={20} color="#1D3A44" strokeWidth={1.8} />
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    backgroundColor: '#FB7B6B',
                    borderRadius: 999,
                  }}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* === 2. WEEKLY CALENDAR STRIP === */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              {weekDays.map((day, i) => (
                <View key={i} style={{ flexDirection: 'column', alignItems: 'center', width: 38 }}>
                  <Text style={{ fontSize: 10, color: '#8A8A8E', marginBottom: 4 }}>{day.label}</Text>
                  {day.isPast && (
                    <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: '#7CB69D', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>{day.date}</Text>
                    </View>
                  )}
                  {day.isToday && (
                    <View style={{ width: 32, height: 32, borderRadius: 999, borderWidth: 2, borderColor: '#FB7B6B', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1D3A44' }}>{day.date}</Text>
                    </View>
                  )}
                  {day.isFuture && (
                    <View style={{ width: 30, height: 30, borderRadius: 999, borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#C4C4C6' }}>{day.date}</Text>
                    </View>
                  )}
                  {day.isPast && <Check size={9} color="#7CB69D" strokeWidth={3} style={{ marginTop: 2 }} />}
                  {day.isToday && <Text style={{ fontSize: 9, fontWeight: '600', color: '#FB7B6B', marginTop: 2 }}>Hoje</Text>}
                  {day.isFuture && <View style={{ height: 11, marginTop: 2 }} />}
                </View>
              ))}
            </View>
          </View>

          {/* === 3. SKIN SCORE + METRICS CARD === */}
          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <SkinScoreRing score={82} size={70} />
                  <Text style={{ fontSize: 11, color: '#8A8A8E', textAlign: 'center', marginTop: 2 }}>
                    Skin Score
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 7 }}>
                  <MetricBar label="Hidratação" value={70} color="#7CB69D" />
                  <MetricBar label="Oleosidade" value={45} color="#FB7B6B" />
                  <MetricBar label="Textura" value={88} color="#7CB69D" />
                </View>
              </View>
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#7CB69D' }}>↑ +3 esta semana</Text>
                <TouchableOpacity activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#FB7B6B' }}>Ver detalhes</Text>
                  <ChevronRight size={11} color="#FB7B6B" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* === 4. GREETING + CONTEXT === */}
          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1D3A44', lineHeight: 21 }}>
              {getGreeting()}, Maria {getGreetingEmoji()}
            </Text>
            <Text style={{ fontSize: 13, color: '#8A8A8E', lineHeight: 18 }}>
              {isAfternoon ? 'Sua rotina da noite tem 4 passos hoje' : 'Sua rotina da manhã tem 5 passos hoje'}
            </Text>
          </View>

          {/* === 5. ROUTINE CARD === */}
          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                overflow: 'hidden',
                flexDirection: 'row',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View style={{ width: 4, backgroundColor: '#FB7B6B' }} />
              <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
                {/* Header + count */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: 'rgba(251,123,107,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                      {isAfternoon ? <Moon size={14} color="#FB7B6B" /> : <Sun size={14} color="#FB7B6B" />}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44' }}>
                      {isAfternoon ? 'Rotina da Noite' : 'Rotina da Manhã'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44' }}>2/5</Text>
                </View>
                {/* Segmented progress */}
                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 8 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <View
                      key={i}
                      style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: i < 2 ? '#7CB69D' : '#E5E7EB' }}
                    />
                  ))}
                </View>
                {/* Next step */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14 }}>💧</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#1D3A44', flex: 1 }}>
                    Próximo:{' '}
                    <Text style={{ fontWeight: '600' }}>Sérum Vitamina C</Text>
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#FB7B6B' }}>Continuar →</Text>
                </View>
              </View>
            </View>
          </View>

          {/* === 6. FOOD ANALYSIS CARD === */}
          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
                elevation: 2,
              }}
            >
              <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1D3A44', lineHeight: 18 }}>
                  Impacto na sua pele
                </Text>
                <Text style={{ fontSize: 11, color: '#8A8A8E', lineHeight: 16, marginBottom: 12 }}>
                  Veja como cada alimento afeta você
                </Text>

                {/* Food list */}
                <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#1D3A44', marginBottom: 8 }}>
                    Últimas análises
                  </Text>
                  <View style={{ gap: 8 }}>
                    <FoodItem
                      foodId="salada-mediterranea"
                      name="Salada mediterrânea"
                      badgeType="boost"
                      calories={245}
                      time="12:47"
                      imageUri="https://images.unsplash.com/photo-1649531794884-b8bb1de72e68?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400"
                      onPress={handleFoodClick}
                    />
                    <FoodItem
                      foodId="torrada-abacate"
                      name="Torrada de abacate"
                      badgeType="neutro"
                      calories={320}
                      time="08:15"
                      imageUri="https://images.unsplash.com/photo-1609158087148-3bae840bcfda?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400"
                      onPress={handleFoodClick}
                    />
                    <FoodItem
                      foodId="salmao-grelhado"
                      name="Salmão grelhado"
                      badgeType="boost"
                      calories={380}
                      time="Ontem"
                      imageUri="https://images.unsplash.com/photo-1580959375944-abd7e991f971?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400"
                      onPress={handleFoodClick}
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
