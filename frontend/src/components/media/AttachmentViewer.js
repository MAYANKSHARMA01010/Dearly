import {useEffect,useState} from 'react';
import {Modal,View,AppState} from 'react-native';
import { IconButton, PaperProvider, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import {mediaPlaybackInfo,discardLocal} from '../../services/attachments/device';
import MediaPreview from './MediaPreview';
import {useAuth} from '../../context/AuthContext';
import { mediaIdentity } from './AttachmentRow';
import { darkTheme, spacing } from '../../theme';

/** @param {{uri:string,mime:string,name:string,onClose:()=>void}} props */
export default function AttachmentViewer({ uri, mime, name, onClose }) {
  const theme = useTheme();
  const {status,session}=useAuth();
  const [info]=useState(()=>mediaPlaybackInfo(uri));
  const [expired,setExpired]=useState(false);
  const needsAccessCheck=expired || (Boolean(info) && status!=='authenticated');
  useEffect(()=>session.subscribe(()=>{if(info && session.getSnapshot().status!=='authenticated')setExpired(true);}),[info,session]);
  useEffect(()=>{
    if(!info)return;
    const timer=setTimeout(()=>setExpired(true),Math.max(0,info.expiresAt-Date.now()));
    const subscription=AppState.addEventListener('change',state=>{if(state==='active' && Date.now()>=info.expiresAt)setExpired(true);});
    return()=>{clearTimeout(timer);subscription.remove();};
  },[info]);
  useEffect(()=>{if(expired && info)void discardLocal(uri);},[expired,info,uri]);
  // Photos and video need a stable viewing surround, independent of app appearance.
  const immersive = mime.startsWith('image/') || mime.startsWith('video/');
  const viewerTheme = immersive ? darkTheme : theme;
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}
    supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <PaperProvider theme={viewerTheme}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: viewerTheme.colors.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar style={viewerTheme.dark ? 'light' : 'dark'} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: spacing.md, paddingVertical: spacing.xs, gap: spacing.sm }}>
            <IconButton icon="close" size={24} accessibilityLabel="Close attachment" onPress={onClose} style={{ width: 48, height: 48 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="titleMedium" numberOfLines={1} accessibilityRole="header">{name}</Text>
              <Text variant="bodySmall" style={{ color: viewerTheme.colors.onSurfaceVariant }}>{mediaIdentity(mime).label}</Text>
            </View>
          </View>
          {needsAccessCheck?<View style={{flex:1,justifyContent:'center',padding:spacing.lg,gap:spacing.md}}><Text variant="titleLarge" accessibilityRole="header">Open the attachment again</Text><Text>Access needs another check. Close this viewer and reopen the attachment while connected.</Text></View>:<MediaPreview key={uri} uri={uri} mime={mime} name={name} />}
          {info && !needsAccessCheck?<View style={{paddingHorizontal:spacing.md,paddingVertical:spacing.sm}}><Text variant="bodySmall" style={{color:viewerTheme.colors.onSurfaceVariant}}>{info.cacheHit?'Opened from a saved download':'Downloaded and verified'} · Available until {new Date(info.expiresAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true})}</Text></View>:null}
        </SafeAreaView>
      </GestureHandlerRootView>
    </PaperProvider>
  </Modal>;
}
