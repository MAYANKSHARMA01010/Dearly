import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { InlineNotice } from '../layout/ScreenSections';
import { spacing } from '../../theme';
/** @param {{info:import('../../services/cache/reads').ReadInfo|null,error?:string,loading?:boolean}} props */
export default function SnapshotStatus({info,error='',loading=false}) {
  const theme=useTheme();
  if(!info)return null;
  const time=(/** @type {number} */ value)=>new Date(value).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
  return <View style={{gap:spacing.sm}}>
    <Text variant="bodySmall" accessibilityLiveRegion="polite" style={{color:theme.colors.onSurfaceVariant}}>
      {loading?'Checking for updates…':`${info.source==='device'?'Saved on this device':'Checked with Dearly'} · ${time(info.fetchedAt)}`}
    </Text>
    {error?<InlineNotice error>{error} This copy is available until {time(info.expiresAt)}. Connect and refresh for current information.</InlineNotice>:null}
  </View>;
}
