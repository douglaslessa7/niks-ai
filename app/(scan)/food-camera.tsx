import { View, Text, TouchableOpacity, Animated, Easing, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { X, Zap, ZapOff, Image as ImageIcon } from 'lucide-react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

type ZoomLevel = 0.5 | 1 | 2;

function FoodScanIcon({ size = 28, color = '#1A1A1A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Circle cx={14} cy={14} r={8.5} stroke={color} strokeWidth={1.5} />
      <Circle cx={14} cy={14} r={5.5} stroke={color} strokeWidth={1.2} />
      <Line x1={3.5} y1={6} x2={3.5} y2={22} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={2} y1={6} x2={2} y2={11} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Line x1={5} y1={6} x2={5} y2={11} stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M2 11 Q3.5 13 5 11" stroke={color} strokeWidth={1.2} strokeLinecap="round" fill="none" />
      <Line x1={24.5} y1={6} x2={24.5} y2={22} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M24.5 6 C26.5 7 26.5 12 24.5 13" stroke={color} strokeWidth={1.2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export default function FoodCamera() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const FRAME_SIZE = Math.round(width * 0.88);
  const SCAN_TRAVEL = FRAME_SIZE - 16;
  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [flash, setFlash] = useState(false);
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: SCAN_TRAVEL,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const handleCapture = () => {
    router.push('/(scan)/loading' as any);
  };

  const zoomLevels: ZoomLevel[] = [0.5, 1, 2];

  return (
    <View style={{ flex: 1, backgroundColor: '#111111' }}>
      {/* ===== TOP CONTROLS ===== */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 60,
          paddingBottom: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={20} color="white" strokeWidth={2.5} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>?</Text>
        </TouchableOpacity>
      </View>

      {/* ===== SCANNING FRAME (center) ===== */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 112, paddingBottom: 266 }}>
        <View style={{ position: 'relative', width: FRAME_SIZE, height: FRAME_SIZE }}>
          {/* Corner brackets — top-left */}
          <View style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>
          {/* Corner brackets — top-right */}
          <View style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>
          {/* Corner brackets — bottom-left */}
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>
          {/* Corner brackets — bottom-right */}
          <View style={{ position: 'absolute', bottom: 0, right: 0, width: 44, height: 44 }}>
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'white', borderRadius: 2 }} />
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 3, backgroundColor: 'white', borderRadius: 2 }} />
          </View>

          {/* Subtle inner border */}
          <View
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              borderRadius: 4,
            }}
          />

          {/* Animated coral scan line */}
          <Animated.View
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              height: 2,
              borderRadius: 1,
              backgroundColor: '#FB7B6B',
              shadowColor: '#FB7B6B',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 6,
              transform: [{ translateY: scanAnim }],
              top: 8,
            }}
          />

          {/* Instruction text below frame */}
          <View style={{ position: 'absolute', bottom: -36, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' }}>
              Posicione o alimento no centro
            </Text>
          </View>
        </View>
      </View>

      {/* ===== BOTTOM SECTION ===== */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 48 }}>
        {/* Zoom controls */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {zoomLevels.map((z) => (
            <TouchableOpacity
              key={z}
              onPress={() => setZoom(z)}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 5,
                borderRadius: 999,
                minWidth: 48,
                alignItems: 'center',
                backgroundColor: zoom === z ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.45)',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: zoom === z ? '#1A1A1A' : 'rgba(255,255,255,0.85)',
                }}
              >
                {z}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mode selector — food only */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24 }}>
          <View
            style={{
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.95)',
              minWidth: 100,
            }}
          >
            <FoodScanIcon size={22} color="#1A1A1A" />
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#1A1A1A', textAlign: 'center' }}>
              Escanear comida
            </Text>
          </View>
        </View>

        {/* Camera controls row: flash | shutter | gallery */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 48,
          }}
        >
          {/* Flash toggle */}
          <TouchableOpacity
            onPress={() => setFlash(!flash)}
            activeOpacity={0.8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {flash ? (
              <Zap size={20} color="#FFD700" strokeWidth={2} fill="#FFD700" />
            ) : (
              <ZapOff size={20} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />
            )}
          </TouchableOpacity>

          {/* Shutter button */}
          <TouchableOpacity
            onPress={handleCapture}
            activeOpacity={0.9}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              borderWidth: 3,
              borderColor: 'rgba(255,255,255,0.85)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: 'rgba(255,255,255,0.92)',
              }}
            />
          </TouchableOpacity>

          {/* Gallery button */}
          <TouchableOpacity
            onPress={handleCapture}
            activeOpacity={0.8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ImageIcon size={20} color="rgba(255,255,255,0.8)" strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
