import { View } from 'react-native';
import { Icon, List, Text, useTheme } from 'react-native-paper';
import { spacing } from '../../theme';

/** @param {{title:string,description?:string,icon?:import('react').ComponentProps<typeof Icon>['source']}} props */
export function ScreenHeading({ title, description, icon }) {
  const theme = useTheme();
  return <View style={{ gap: spacing.sm }}>
    {icon ? <Icon source={icon} size={32} color={theme.colors.primary} /> : null}
    <Text variant="headlineMedium" accessibilityRole="header" style={{ fontWeight: '600' }}>{title}</Text>
    {description ? <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text> : null}
  </View>;
}

/** @param {{title:string,description?:string,children:import('react').ReactNode}} props */
export function ScreenSection({ title, description, children }) {
  const theme = useTheme();
  return <View style={{ gap: spacing.md }}>
    <View style={{ gap: spacing.xs }}>
      <Text variant="titleLarge" accessibilityRole="header" style={{ fontWeight: '600' }}>{title}</Text>
      {description ? <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text> : null}
    </View>
    {children}
  </View>;
}

/** @param {{children:import('react').ReactNode}} props */
export function InsetGroup({ children }) {
  const theme = useTheme();
  return <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface, overflow: 'hidden' }}>{children}</View>;
}

/** @param {{title:string,description?:string,icon:import('react').ComponentProps<typeof Icon>['source'],onPress:()=>void,count?:number,accessibilityLabel?:string}} props */
export function NavigationRow({ title, description, icon, onPress, count, accessibilityLabel }) {
  const theme = useTheme();
  return <List.Item title={title} description={description} descriptionNumberOfLines={2}
    titleStyle={{ fontWeight: '500' }} style={{ minHeight: 72, paddingHorizontal: spacing.sm }}
    accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress}
    left={(props) => <List.Icon {...props} icon={icon} color={theme.colors.onSurfaceVariant} />}
    right={() => <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {typeof count === 'number' ? <Text variant="titleMedium" style={{ fontVariant: ['tabular-nums'], color: theme.colors.primary }}>{count}</Text> : null}
      <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
    </View>} />;
}

/** @param {{children:import('react').ReactNode,error?:boolean}} props */
export function InlineNotice({ children, error = false }) {
  const theme = useTheme();
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"
    style={{ padding: spacing.md, borderRadius: 12, backgroundColor: error ? theme.colors.errorContainer : theme.colors.secondaryContainer }}>
    <Text variant="bodyMedium" style={{ color: error ? theme.colors.onErrorContainer : theme.colors.onSecondaryContainer }}>{children}</Text>
  </View>;
}
