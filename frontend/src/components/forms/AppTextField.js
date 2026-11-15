import { View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

/** @param {Omit<import('react').ComponentProps<typeof TextInput>, 'error' | 'label'> & { label: string, errorText?: string }} props */
export default function AppTextField({ label, errorText, accessibilityLabel, ...props }) {
  return (
    <View>
      <TextInput {...props} mode="outlined" label={label} accessibilityLabel={accessibilityLabel ?? label} error={Boolean(errorText)} />
      {errorText ? <HelperText type="error" accessibilityLiveRegion="polite">{errorText}</HelperText> : null}
    </View>
  );
}
