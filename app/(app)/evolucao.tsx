import { SafeAreaView } from 'react-native-safe-area-context'
import { ScrollView, View, Text, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { TrendingUp, Flame, Camera } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { Colors } from '../../constants/colors'
import Svg, { Polyline, Circle } from 'react-native-svg'

// TIPOS
type ScanPoint = { date: string; score: number; imageUri?: string }
type LastScan = { score: number; skin_type: string; date: string; imageUri?: string }

export default function Evolucao() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [streak, setStreak] = useState(0)
  const [scans, setScans] = useState<ScanPoint[]>([])
  const [lastScan, setLastScan] = useState<LastScan | null>(null)

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [])
  )

  async function loadData() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Busca últimos 5 skin scans
      const { data: skinScans } = await supabase
        .from('skin_scans')
        .select('skin_score, created_at, foto_url, full_result')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (skinScans && skinScans.length > 0) {
        const points: ScanPoint[] = skinScans.reverse().map(s => ({
          date: new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          score: s.skin_score,
          imageUri: s.foto_url,
        }))
        setScans(points)

        const latest = skinScans[skinScans.length - 1]
        setLastScan({
          score: latest.skin_score,
          skin_type: latest.full_result?.skin_type_detected ?? 'Mista',
          date: new Date(latest.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
          imageUri: latest.foto_url,
        })
      }

      // Calcula streak de routine_completions
      const { data: completions } = await supabase
        .from('routine_completions')
        .select('completed_at')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })

      if (completions && completions.length > 0) {
        const dates = [...new Set(completions.map(c => c.completed_at))].sort().reverse()
        let count = 0
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        for (let i = 0; i < dates.length; i++) {
          const d = new Date(dates[i])
          d.setHours(0, 0, 0, 0)
          const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
          if (diff === i || diff === i + 1) {
            count++
          } else {
            break
          }
        }
        setStreak(count)
      }
    } finally {
      setLoading(false)
    }
  }

  // Sparkline SVG simples
  function Sparkline({ points }: { points: ScanPoint[] }) {
    if (points.length < 2) return null
    const W = 280, H = 80, PAD = 8
    const scores = points.map(p => p.score)
    const min = Math.min(...scores) - 10
    const max = Math.max(...scores) + 10
    const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2))
    const ys = scores.map(s => H - PAD - ((s - min) / (max - min)) * (H - PAD * 2))
    const polyPoints = xs.map((x, i) => `${x},${ys[i]}`).join(' ')

    return (
      <Svg width={W} height={H}>
        <Polyline points={polyPoints} fill="none" stroke={Colors.scanBtn} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <Circle key={i} cx={x} cy={ys[i]} r={4} fill={Colors.scanBtn} />
        ))}
      </Svg>
    )
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color={Colors.scanBtn} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="pt-4 pb-6">
          <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.tabActive }}>
            Evolução
          </Text>
        </View>

        {/* Card Streak */}
        <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF5F4', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <Flame size={24} color={Colors.scanBtn} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-baseline">
              <Text style={{ fontSize: 36, fontWeight: '800', color: Colors.tabActive }}>{streak}</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.tabActive, marginLeft: 6 }}>dias seguidos</Text>
            </View>
            <Text style={{ fontSize: 13, color: Colors.gray, marginTop: 2 }}>
              {streak === 0 ? 'Complete sua rotina hoje para começar 🌱' : 'rotina concluída — continue assim!'}
            </Text>
          </View>
        </View>

        {/* Card Gráfico */}
        <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.tabActive, marginBottom: 2 }}>Seu Skin Score</Text>
          <Text style={{ fontSize: 13, color: Colors.gray, marginBottom: 16 }}>últimas análises</Text>
          {scans.length >= 2 ? (
            <>
              <Sparkline points={scans} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                {scans.map((p, i) => (
                  <Text key={i} style={{ fontSize: 11, color: Colors.gray }}>{p.date}</Text>
                ))}
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <TrendingUp size={32} color={Colors.disabled} />
              <Text style={{ fontSize: 14, color: Colors.gray, textAlign: 'center', marginTop: 12 }}>
                Faça mais análises para{'\n'}ver sua evolução aqui
              </Text>
            </View>
          )}
        </View>

        {/* Card Último Scan */}
        {lastScan && (
          <View style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20, marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.tabActive, marginBottom: 16 }}>Última Análise</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {lastScan.imageUri ? (
                <Image source={{ uri: lastScan.imageUri }} style={{ width: 60, height: 60, borderRadius: 12 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: Colors.lightGray, alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={24} color={Colors.gray} />
                </View>
              )}
              <View style={{ marginLeft: 16, flex: 1 }}>
                <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.scanBtn }}>{lastScan.score}</Text>
                <Text style={{ fontSize: 14, color: Colors.tabActive, fontWeight: '600', textTransform: 'capitalize' }}>Pele {lastScan.skin_type}</Text>
                <Text style={{ fontSize: 12, color: Colors.gray }}>{lastScan.date}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(app)/skin-result')}
              style={{ marginTop: 16, borderWidth: 1.5, borderColor: Colors.scanBtn, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: Colors.scanBtn, fontWeight: '600', fontSize: 14 }}>Ver análise completa</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
