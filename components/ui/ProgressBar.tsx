import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { Colors } from '../../constants/colors';

interface ProgressBarProps {
  progress: number; // 0-100
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const widthAnim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterpolated = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={{ backgroundColor: Colors.lightGray }} className="relative w-full h-[2px]">
      <Animated.View
        style={{ width: widthInterpolated, backgroundColor: Colors.scanBtn }}
        className="absolute top-0 left-0 h-[4px]"
      />
    </View>
  );
}
