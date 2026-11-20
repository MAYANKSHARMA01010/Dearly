import { View } from 'react-native';
import AppTextField from './AppTextField';
import { spacing } from '../../theme';
/** Web fallback; native apps resolve the calendar/clock implementation.
 * @param {{date:string,time:string,timezone:string,onChange:(value:{date:string,time:string})=>void,disabled?:boolean}} props
 */
export default function ScheduleDateTimeFields({ date, time, onChange, disabled }) {
  return <View style={{ gap: spacing.md }}>
    <AppTextField label="Date (YYYY-MM-DD)" value={date} onChangeText={(value) => onChange({ date: value, time })} maxLength={10} disabled={disabled} />
    <AppTextField label="Time (24-hour HH:mm)" value={time} onChangeText={(value) => onChange({ date, time: value })} maxLength={5} disabled={disabled} />
  </View>;
}
