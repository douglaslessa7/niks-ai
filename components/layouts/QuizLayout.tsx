import { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProgressBar } from '../ui/ProgressBar';
import { BackButton } from '../ui/BackButton';

interface QuizLayoutProps {
  progress: number;
  showBack?: boolean;
  children: ReactNode;
}

export function QuizLayout({ progress, showBack = true, children }: QuizLayoutProps) {
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: 'transparent' }}>
      <View className="flex-1 max-w-[393px] w-full mx-auto">
        {/* Progress bar and back button row */}
        <View className="pt-4 px-6">
          {showBack && <BackButton />}
          <View className="mt-4">
            <ProgressBar progress={progress} />
          </View>
        </View>

        <View className="flex-1 px-6">
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}
