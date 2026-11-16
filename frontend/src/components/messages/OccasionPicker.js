import { useState } from 'react';
import { View } from 'react-native';
import { Menu } from 'react-native-paper';
import AppButton from '../common/AppButton';
import AppTextField from '../forms/AppTextField';
import { spacing } from '../../theme';

const options = ['Birthday', 'Anniversary', 'Just because'];
/** @param {{ value: string|null, onChange: (value: string|null) => void, disabled?: boolean }} props */
export default function OccasionPicker({ value, onChange, disabled }) {
  const [visible, setVisible] = useState(false);
  const custom = value !== null && !options.includes(value);
  return <View style={{ gap: spacing.md }}>
    <Menu visible={visible} onDismiss={() => setVisible(false)} anchor={<AppButton mode="outlined" disabled={disabled} onPress={() => setVisible(true)}>Occasion: {custom ? 'Custom' : value || 'None'}</AppButton>}>
      {[null, ...options, ''].map((option) => <Menu.Item key={option ?? 'none'} title={option === null ? 'No occasion' : option === '' ? 'Custom occasion' : option}
        onPress={() => { onChange(option); setVisible(false); }} />)}
    </Menu>
    {custom ? <AppTextField label="Custom occasion" value={value ?? ''} onChangeText={onChange} maxLength={80} disabled={disabled} /> : null}
  </View>;
}
