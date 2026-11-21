import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';
import { layout, spacing } from '../../theme';

/** @param {{ children: import('react').ReactNode, includeTopInset?:boolean }} props */
export default function Screen({ children, includeTopInset = false }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={includeTopInset ? ['top', 'bottom', 'left', 'right'] : ['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1 }} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <View className="flex-1 w-full self-center" style={{ maxWidth: layout.contentWidth, padding: spacing.lg, gap: spacing.lg }}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
