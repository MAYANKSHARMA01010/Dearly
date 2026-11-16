import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import AppButton from '../common/AppButton';
import { openDocument, readText } from '../../services/attachments/device';
import { spacing } from '../../theme';

/** @param {{uri:string}} props */
function AudioPreview({ uri }) {
  const player = useAudioPlayer(uri); const status = useAudioPlayerStatus(player);
  return <View style={{ gap:spacing.sm }}>{status.error ? <Text accessibilityRole="alert">Audio cannot play on this device. Try a compatible M4A recording.</Text> : null}<Text>{status.currentTime.toFixed(1)} / {status.duration.toFixed(1)} seconds</Text>
    <AppButton disabled={!status.isLoaded} onPress={() => { if (status.playing) player.pause(); else { if (status.didJustFinish) void player.seekTo(0); player.play(); } }}>{status.playing ? 'Pause audio' : 'Play audio'}</AppButton>
    <AppButton disabled={!status.isLoaded} onPress={() => { player.pause(); void player.seekTo(0); }}>Restart audio</AppButton>
  </View>;
}
/** @param {{uri:string}} props */
function VideoPreview({ uri }) {
  const player = useVideoPlayer(uri); const [error, setError] = useState(false);
  useEffect(() => { const subscription = player.addListener('statusChange', (event) => setError(event.status === 'error')); return () => subscription.remove(); }, [player]);
  return <View style={{ gap:spacing.sm }}><VideoView player={player} nativeControls contentFit="contain" style={{ width:'100%', height:240 }} />{error ? <Text accessibilityRole="alert">This video cannot play on this device. Try a compatible MP4 video.</Text> : null}</View>;
}
/** @param {{uri:string,mime:string,name:string}} props */
export default function MediaPreview({ uri, mime, name }) {
  const [text, setText] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (mime === 'text/plain') void readText(uri).then((value) => { if (active) setText(value); }, () => { if (active) setError('Text preview could not be opened.'); });
    return () => { active = false; };
  }, [uri, mime]);
  if (mime.startsWith('image/')) return <View><Image source={{ uri }} accessibilityLabel={`Photo attachment ${name}`} resizeMode="contain" onError={() => setError('Photo preview could not be opened.')} style={{ width:'100%', height:240 }} />{error ? <Text accessibilityRole="alert">{error}</Text> : null}</View>;
  if (mime.startsWith('audio/')) return <AudioPreview uri={uri} />;
  if (mime.startsWith('video/')) return <VideoPreview uri={uri} />;
  return <View style={{ gap:spacing.md }}>{mime === 'text/plain' ? <><Text selectable>{text}</Text><Text variant="bodySmall">Text preview shows up to 65,536 characters.</Text></> : <Text>Open this PDF in a document viewer using your device’s file menu.</Text>}
    <AppButton onPress={() => { void openDocument(uri, mime).catch(() => setError('A document viewer could not be opened. Try another app.')); }}>Open or share file</AppButton>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
