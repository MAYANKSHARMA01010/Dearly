import {useCallback,useState} from 'react';
import {Platform} from 'react-native';
import {Dialog,Portal,Text} from 'react-native-paper';
import {useFocusEffect} from 'expo-router';
import {useAuth} from '../../context/AuthContext';
import {useAsyncAction} from '../../hooks/useAsyncAction';
import {clearDownloadedMedia,downloadedMediaStats} from '../../services/attachments/device';
import {InlineNotice,ScreenSection} from '../layout/ScreenSections';
import AppButton from '../common/AppButton';
/** @typedef {{bytes:number,count:number,limit:number}} MediaStats */
export default function MediaStorageSection(){
 const {session}=useAuth();const action=useAsyncAction();
 const [stats,setStats]=useState(/** @type {MediaStats|null} */(null));
 const [error,setError]=useState('');
 useFocusEffect(useCallback(()=>{let active=true;void downloadedMediaStats(session).then(value=>{if(active){setStats(value);setError('');}},()=>{if(active)setError('Downloaded media storage could not be checked. You can clear it and try again.');});return()=>{active=false;};},[session]));
 return <MediaStoragePanel stats={stats} error={error || action.error} busy={action.busy} onClear={()=>{void action.run(async()=>{await clearDownloadedMedia();setStats(await downloadedMediaStats(session));setError('');});}}/>;
}
/** Storage presentation also supports an unavailable-index recovery state.
 * @param {{stats:MediaStats|null,error:string,busy:boolean,onClear:()=>void}} props */
export function MediaStoragePanel({stats,error,busy,onClear}){
 const [confirm,setConfirm]=useState(false);
 return <ScreenSection title="Downloaded media" description="Copies on this device help attachments open faster.">
  {Platform.OS==='web'?<Text>Browser downloads last only while open. Reusable encrypted downloads are available in the Android and iOS app.</Text>:<>
   <Text accessibilityLiveRegion="polite">{stats?`${(stats.bytes/1048576).toFixed(1)} MB across ${stats.count} downloaded attachments`:'Checking downloaded media…'}</Text>
   <Text>Up to 250 MB. Copies can be reused for up to 7 days. Access is checked online each time you open an attachment.</Text>
  </>}
  {error?<InlineNotice error>{error}</InlineNotice>:null}
  <AppButton icon="delete-outline" mode="outlined" disabled={busy} loading={busy} onPress={()=>setConfirm(true)}>Clear downloaded media</AppButton>
  <Text variant="bodySmall">Server attachments and pending uploads or recordings are kept.</Text>
  <Portal><Dialog visible={confirm} onDismiss={()=>{if(!busy)setConfirm(false);}}>
   <Dialog.Title>Clear downloaded media?</Dialog.Title>
   <Dialog.Content><Text>Remove downloaded copies from this device. They can be downloaded again after checking access. Pending uploads and recordings will be kept.</Text></Dialog.Content>
   <Dialog.Actions><AppButton disabled={busy} onPress={()=>setConfirm(false)}>Keep files</AppButton><AppButton disabled={busy} onPress={()=>{setConfirm(false);onClear();}}>Clear downloads</AppButton></Dialog.Actions>
  </Dialog></Portal>
 </ScreenSection>;
}
