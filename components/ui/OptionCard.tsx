import { ReactNode, useEffect } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { Colors } from '../../constants/colors';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

interface OptionCardProps {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  icon?: ReactNode;
  subtitle?: string;
  index?: number;
}

export function OptionCard({ selected, onPress, children, icon, subtitle, index = 0 }: OptionCardProps) {
  const translateY = useSharedValue(35);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = 35;
    opacity.value = 0;

    // Slide up with spring — slight overshoot for premium "landing" feel
    translateY.value = withDelay(
      index * 130,
      withSpring(0, { mass: 0.8, damping: 14, stiffness: 120 })
    );

    // Fade in with timing — decoupled from spring for clean opacity
    opacity.value = withDelay(
      index * 130,
      withTiming(1, { duration: 400 })
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{ backgroundColor: selected ? Colors.scanBtn : Colors.lightGray }}
        className="w-full px-5 py-4 rounded-[14px]"
      >
        <View className="flex-row items-center gap-3">
          {icon && <View className="shrink-0">{icon}</View>}
          <View className="flex-1">
            <Text
              style={{ color: selected ? Colors.white : Colors.black }}
              className="text-[17px] font-semibold"
            >
              {children}
            </Text>
            {subtitle && (
              <Text
                style={{ color: selected ? 'rgba(255,255,255,0.7)' : Colors.muted }}
                className="text-[13px] mt-0.5"
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
