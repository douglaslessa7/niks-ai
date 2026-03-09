import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

export function BackButton() {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      activeOpacity={0.7}
      className="w-10 h-10 rounded-full bg-[#F5F5F7] items-center justify-center"
    >
      <ChevronLeft size={20} color="#1A1A1A" />
    </TouchableOpacity>
  );
}
