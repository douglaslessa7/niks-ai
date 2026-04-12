import { TouchableOpacity, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';

interface PillProps {
  selected: boolean;
  onPress: () => void;
  children: string;
}

export function Pill({ selected, onPress, children }: PillProps) {
  return (
    <TouchableOpacity
      onPress={async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      activeOpacity={0.8}
      style={{ backgroundColor: selected ? Colors.scanBtn : Colors.lightGray }}
      className="px-4 py-3 rounded-full items-center justify-center"
    >
      <Text
        style={{ color: selected ? Colors.white : Colors.black }}
        className="text-[15px] font-medium text-center"
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}
