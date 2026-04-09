import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Colors } from '../../constants/colors';

export function BackButton() {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      activeOpacity={0.7}
      style={{ backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border }}
      className="w-10 h-10 rounded-full items-center justify-center"
    >
      <ChevronLeft size={20} color={Colors.black} />
    </TouchableOpacity>
  );
}
