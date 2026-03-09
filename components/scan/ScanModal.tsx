import { Modal, View, Text, TouchableOpacity, Animated, Pressable, useWindowDimensions } from 'react-native';
import { useEffect, useRef } from 'react';
import { Camera, Utensils, X, Trophy } from 'lucide-react-native';
import { useRouter } from 'expo-router';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScanModal({ isOpen, onClose }: ScanModalProps) {
  const router = useRouter();
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [isOpen]);

  const handleScanFood = () => {
    onClose();
    router.push('/(scan)/camera?mode=food' as any);
  };

  const handleScanFace = () => {
    onClose();
    router.push('/(scan)/scan-prep' as any);
  };

  return (
    <Modal transparent visible={isOpen} animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
      >
        <Animated.View
          style={{ opacity: opacityAnim, transform: [{ scale: scaleAnim }] }}
        >
          <Pressable onPress={() => {}} style={{ paddingHorizontal: 16, paddingBottom: 110 }}>
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.12,
                shadowRadius: 32,
                elevation: 8,
              }}
            >
              {/* Close button */}
              <View className="items-end mb-2">
                <TouchableOpacity
                  onPress={onClose}
                  className="w-8 h-8 rounded-full bg-[#F6F4EE] items-center justify-center"
                >
                  <X size={18} color="#8A8A8E" strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {/* Grid of options */}
              <View className="flex-row gap-3">
                {/* Scan Food */}
                <TouchableOpacity
                  onPress={handleScanFood}
                  activeOpacity={0.9}
                  className="flex-1 bg-[#F6F4EE] rounded-[16px] p-6 items-center gap-3"
                  style={{ overflow: 'visible' }}
                >
                  {/* "Mais usado" badge */}
                  <View
                    style={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      backgroundColor: '#FFD700',
                      borderRadius: 100,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      zIndex: 10,
                    }}
                  >
                    <Trophy size={10} color="#1D3A44" strokeWidth={2.5} fill="#1D3A44" />
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#1D3A44', letterSpacing: -0.2 }}>
                      MAIS USADO
                    </Text>
                  </View>

                  <View
                    className="w-14 h-14 rounded-full bg-white items-center justify-center"
                    style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                  >
                    <Utensils size={26} color="#FB7B6B" strokeWidth={2} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D3A44', textAlign: 'center', lineHeight: 18 }}>
                    Analisar{'\n'}alimento
                  </Text>
                </TouchableOpacity>

                {/* Scan Face */}
                <TouchableOpacity
                  onPress={handleScanFace}
                  activeOpacity={0.9}
                  className="flex-1 bg-[#F6F4EE] rounded-[16px] p-6 items-center gap-3"
                >
                  <View
                    className="w-14 h-14 rounded-full bg-white items-center justify-center"
                    style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                  >
                    <Camera size={26} color="#B8A9C9" strokeWidth={2} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1D3A44', textAlign: 'center', lineHeight: 18 }}>
                    Analisar{'\n'}pele
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
