import { ReactNode } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';

interface OptionCardProps {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
  icon?: ReactNode;
  subtitle?: string;
}

export function OptionCard({ selected, onPress, children, icon, subtitle }: OptionCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`w-full px-5 py-4 rounded-[14px] ${
        selected ? 'bg-[#1A1A1A]' : 'bg-[#F5F5F7]'
      }`}
    >
      <View className="flex-row items-center gap-3">
        {icon && <View className="shrink-0">{icon}</View>}
        <View className="flex-1">
          <Text
            className={`text-[17px] font-semibold ${
              selected ? 'text-white' : 'text-[#1A1A1A]'
            }`}
          >
            {children}
          </Text>
          {subtitle && (
            <Text
              className={`text-[13px] mt-0.5 ${
                selected ? 'text-white/70' : 'text-[#717182]'
              }`}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
