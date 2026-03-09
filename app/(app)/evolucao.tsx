import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Flame } from 'lucide-react-native';
import Svg, { Polyline } from 'react-native-svg';

type TimeFilter = '7D' | '1M' | '3M' | '6M' | 'Tudo';

function generateHeatmapData() {
  const days: { value: 'full' | 'partial' | 'missed' | null; isToday: boolean }[] = [];
  const daysInMonth = 31; // March
  const startDay = 6; // March 1, 2026 is Saturday

  for (let i = 0; i < startDay; i++) {
    days.push({ value: null, isToday: false });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = i === 8;
    let value: 'full' | 'partial' | 'missed' | null;

    if (i > 8) {
      value = null;
    } else if (i === 3 || i === 6) {
      value = 'missed';
    } else if (i === 2 || i === 7) {
      value = 'partial';
    } else {
      value = 'full';
    }

    days.push({ value, isToday });
  }

  return days;
}

const heatmapData = generateHeatmapData();
const weekDayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const filters: TimeFilter[] = ['7D', '1M', '3M', '6M', 'Tudo'];

// Build heatmap rows (7 cols per row)
function buildRows<T>(data: T[], cols: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < data.length; i += cols) {
    rows.push(data.slice(i, i + cols));
  }
  return rows;
}

export default function Evolucao() {
  const [selectedFilter, setSelectedFilter] = useState<TimeFilter>('1M');

  const heatmapRows = buildRows(heatmapData, 7);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View style={{ maxWidth: 393, width: '100%', alignSelf: 'center', paddingHorizontal: 24, paddingTop: 48 }}>

          {/* Header */}
          <Text style={{ fontSize: 32, fontWeight: '700', color: '#1D3A44', marginBottom: 24 }}>
            Sua Evolução
          </Text>

          {/* Time Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 2, marginBottom: 24 }}
          >
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: selectedFilter === filter ? '#FB7B6B' : '#FFFFFF',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: selectedFilter === filter ? '#FFFFFF' : '#1D3A44' }}>
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Score Overview Card */}
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 1,
            }}
          >
            <View>
              <Text style={{ fontSize: 48, fontWeight: '700', color: '#1D3A44', lineHeight: 52, marginBottom: 4 }}>
                82
              </Text>
              <Text style={{ fontSize: 17, color: '#1D3A44', marginBottom: 4 }}>Skin Score</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 13, color: '#7CB69D' }}>↑</Text>
                <Text style={{ fontSize: 13, color: '#7CB69D' }}>+12 desde o início</Text>
              </View>
            </View>

            {/* Sparkline */}
            <Svg width={128} height={64} viewBox="0 0 128 64">
              <Polyline
                points="0,50 20,45 40,42 60,35 80,30 100,20 128,10"
                fill="none"
                stroke="#7CB69D"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>

          {/* Photo Comparison Section */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#1D3A44', marginBottom: 16 }}>
              Comparação Visual
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
              {/* Day 1 */}
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 999,
                    backgroundColor: '#D1D5DB',
                    marginBottom: 8,
                    opacity: 0.6,
                  }}
                />
                <Text style={{ fontSize: 13, color: '#8A8A8E' }}>Dia 1</Text>
              </View>

              {/* Arrow */}
              <Text style={{ fontSize: 24, fontWeight: '700', color: '#FB7B6B' }}>→</Text>

              {/* Today */}
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 999,
                    backgroundColor: '#7CB69D',
                    marginBottom: 8,
                  }}
                />
                <Text style={{ fontSize: 13, color: '#8A8A8E' }}>Hoje</Text>
              </View>
            </View>

            <Text style={{ fontSize: 13, color: '#8A8A8E', textAlign: 'center', marginBottom: 16 }}>
              Deslize para comparar
            </Text>

            {/* AI Insight Card */}
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                padding: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#7CB69D',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 1,
              }}
            >
              <Text style={{ fontSize: 15, color: '#1D3A44' }}>
                <Text style={{ fontWeight: '600' }}>IA detectou: </Text>
                Manchas reduziram 30%, hidratação melhorou 15% desde o início
              </Text>
            </View>
          </View>

          {/* Consistency Section */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#1D3A44' }}>Consistência</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#FB7B6B',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }}
              >
                <Flame size={12} color="#FFFFFF" fill="#FFFFFF" />
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFFFFF' }}>14 dias</Text>
              </View>
            </View>

            {/* Calendar Heatmap */}
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                padding: 16,
                marginBottom: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 1,
              }}
            >
              {/* Week day labels */}
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {weekDayLabels.map((day, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: '#8A8A8E' }}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Heatmap rows */}
              {heatmapRows.map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  {row.map((day, colIndex) => {
                    let bgColor = 'transparent';
                    if (day.value === 'full') bgColor = '#7CB69D';
                    else if (day.value === 'partial') bgColor = 'rgba(124,182,157,0.3)';
                    else if (day.value === 'missed') bgColor = '#E5E7EB';

                    return (
                      <View key={colIndex} style={{ flex: 1, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 4,
                            backgroundColor: bgColor,
                            borderWidth: day.isToday ? 2 : 0,
                            borderColor: '#FB7B6B',
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 13, color: '#7CB69D' }}>92% de consistência este mês</Text>
          </View>

          {/* Badges/Achievements */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#1D3A44', marginBottom: 16 }}>
              Conquistas
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 16, paddingBottom: 2 }}
            >
              {/* Earned badges */}
              <View style={{ alignItems: 'center', minWidth: 64 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    backgroundColor: '#FB7B6B',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <Text style={{ fontSize: 28 }}>🔥</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#1D3A44', textAlign: 'center' }}>7 Dias</Text>
              </View>

              <View style={{ alignItems: 'center', minWidth: 64 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    backgroundColor: '#FBBF24',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <Text style={{ fontSize: 28 }}>⭐</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#1D3A44', textAlign: 'center' }}>30 Dias</Text>
              </View>

              {/* Locked badges */}
              <View style={{ alignItems: 'center', minWidth: 64, opacity: 0.4 }}>
                <View style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 28 }}>💎</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#8A8A8E', textAlign: 'center' }}>Pele Nota 10</Text>
              </View>

              <View style={{ alignItems: 'center', minWidth: 64, opacity: 0.4 }}>
                <View style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 28 }}>🧪</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#8A8A8E', textAlign: 'center' }}>Expert</Text>
              </View>
            </ScrollView>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
