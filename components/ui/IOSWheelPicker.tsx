import { useRef, useCallback } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface IOSWheelPickerProps {
  values: string[];
  selectedValue: string;
  onChange: (value: string) => void;
  width?: number;
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5; // 2 above + selected + 2 below
const PADDING = ITEM_HEIGHT * 2; // 88pt

export function IOSWheelPicker({
  values,
  selectedValue,
  onChange,
  width = 100,
}: IOSWheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = values.indexOf(selectedValue);

  // Scroll to selected value on mount
  const handleLayout = useCallback(() => {
    const index = values.indexOf(selectedValue);
    if (index !== -1 && scrollRef.current) {
      scrollRef.current.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
    }
  }, [selectedValue, values]);

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollTop = e.nativeEvent.contentOffset.y;
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    const snappedIndex = Math.max(0, Math.min(index, values.length - 1));
    onChange(values[snappedIndex]);
  };

  return (
    <View style={{ width, height: ITEM_HEIGHT * VISIBLE_ITEMS, overflow: 'hidden' }}>
      {/* Selection indicator */}
      <View
        style={{
          position: 'absolute',
          top: PADDING,
          left: 0,
          right: 0,
          height: ITEM_HEIGHT,
          backgroundColor: '#F5F5F7',
          borderRadius: 12,
        }}
        pointerEvents="none"
      />

      {/* Scrollable list */}
      <ScrollView
        ref={scrollRef}
        onLayout={handleLayout}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{
          paddingTop: PADDING,
          paddingBottom: PADDING,
        }}
      >
        {values.map((value, index) => {
          const distance = Math.abs(index - selectedIndex);
          const opacity = Math.max(0.3, 1 - distance * 0.35);
          return (
            <View
              key={value}
              style={{
                height: ITEM_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                opacity,
              }}
            >
              <Text style={{ fontSize: 17, color: '#1A1A1A' }}>{value}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Top fade */}
      <LinearGradient
        colors={['#FFFFFF', 'rgba(255,255,255,0)']}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: PADDING,
          zIndex: 3,
        }}
        pointerEvents="none"
      />

      {/* Bottom fade */}
      <LinearGradient
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: PADDING,
          zIndex: 3,
        }}
        pointerEvents="none"
      />
    </View>
  );
}
