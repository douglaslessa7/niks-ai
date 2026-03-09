import { TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';

interface CTAButtonProps {
  text: string;
  to?: string;
  disabled?: boolean;
  onPress?: () => void;
}

export function CTAButton({ text, to, disabled = false, onPress }: CTAButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
    if (to) {
      router.push(to as any);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.85}
      className={`w-full py-4 rounded-[14px] items-center justify-center ${
        disabled ? 'bg-[#D1D5DB]' : 'bg-[#1A1A1A]'
      }`}
    >
      <Text className="text-white text-[17px] font-semibold">{text}</Text>
    </TouchableOpacity>
  );
}
