import { useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Dialog, Portal, Text, useTheme } from 'react-native-paper';
import AppButton from '../common/AppButton';
import { pickerWallTime, wallTimePickerValue } from '../../services/schedules/selection';
import { spacing } from '../../theme';

/** @param {{date:string,time:string,timezone:string,onChange:(value:{date:string,time:string})=>void,disabled?:boolean}} props */
export default function ScheduleDateTimeFields({ date, time, timezone, onChange, disabled }) {
  const theme = useTheme();
  const [mode, setMode] = useState(/** @type {'date'|'time'|null} */ (null));
  const [pending, setPending] = useState(() => wallTimePickerValue(date, time));
  /** @param {'date'|'time'} field @param {Date} value */
  const apply = (field, value) => {
    const next = pickerWallTime(value);
    onChange(field === 'date' ? { date: next.date, time } : { date, time: next.time });
  };
  /** @param {'date'|'time'} field */
  const open = (field) => {
    Keyboard.dismiss();
    const value = wallTimePickerValue(date, time);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value, mode: field, display: field === 'date' ? 'calendar' : 'clock', timeZoneName: 'UTC', is24Hour: false, onValueChange: (_event, next) => apply(field, next) });
    } else { setPending(value); setMode(field); }
  };
  const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(wallTimePickerValue(date, time));
  const timeLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(wallTimePickerValue(date, time));
  return <View style={{ gap: spacing.md }}>
    <View style={{ gap: spacing.xs }}><Text variant="labelLarge">Date</Text><AppButton icon="calendar-month-outline" mode="outlined" style={{ borderRadius: 12 }} disabled={disabled} accessibilityLabel={`Choose delivery date, ${dateLabel}`} onPress={() => open('date')}>{dateLabel}</AppButton></View>
    <View style={{ gap: spacing.xs }}><Text variant="labelLarge">Time · AM/PM</Text><AppButton icon="clock-outline" mode="outlined" style={{ borderRadius: 12 }} disabled={disabled} accessibilityLabel={`Choose delivery time, ${timeLabel}`} onPress={() => open('time')}>{timeLabel}</AppButton></View>
    <Portal><Dialog visible={mode !== null} onDismiss={() => setMode(null)}>
      <Dialog.Title>{mode === 'date' ? 'Choose delivery date' : 'Choose delivery time'}</Dialog.Title>
      <Dialog.Content>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Delivery timezone: {timezone}</Text>
        {mode ? <DateTimePicker key={mode} value={pending} mode={mode} display={mode === 'date' ? 'inline' : 'spinner'} timeZoneName="UTC" locale={mode === 'time' ? 'en-US' : undefined} themeVariant={theme.dark ? 'dark' : 'light'} accentColor={theme.colors.primary} textColor={theme.colors.onSurface} style={{ height: mode === 'date' ? 340 : 200 }} onValueChange={(_event, next) => setPending(next)} /> : null}
      </Dialog.Content>
      <Dialog.Actions><AppButton onPress={() => setMode(null)}>Cancel</AppButton><AppButton onPress={() => { if (mode) apply(mode, pending); setMode(null); }}>Done</AppButton></Dialog.Actions>
    </Dialog></Portal>
  </View>;
}
