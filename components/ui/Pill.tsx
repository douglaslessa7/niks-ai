import { TouchableOpacity, Text } from 'react-native';

interface PillProps {
  selected: boolean;
  onPress: () => void;
  children: string;
}

export function Pill({ selected, onPress, children }: PillProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`px-4 py-3 rounded-full items-center justify-center ${
        selected ? 'bg-[#1A1A1A]' : 'bg-[#F5F5F7]'
      }`}
    >
      <Text
        className={`text-[15px] font-medium text-center ${
          selected ? 'text-white' : 'text-[#1A1A1A]'
        }`}
      >
        {children}
      </Text>
    </TouchableOpacity>
  );
}
