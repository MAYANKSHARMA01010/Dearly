import { useEffect, useState } from 'react';
import { AppState, Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ActivityIndicator, Icon, IconButton, Text, useTheme } from 'react-native-paper';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import AppButton from '../common/AppButton';
import { openDocument, readText } from '../../services/attachments/device';
import { layout, spacing } from '../../theme';

/** @param {number} seconds */
function clock(seconds) {
  const value = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** @param {{message:string,onRetry:()=>void}} props */
function PreviewFailure({ message, onRetry }) {
  const theme = useTheme();
  return <View style={styles.failure}>
    <Icon source="alert-circle-outline" size={32} color={theme.colors.onSurfaceVariant} />
    <Text variant="titleMedium">Unable to open this attachment</Text>
    <Text accessibilityRole="alert" style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant }}>{message}</Text>
    <AppButton icon="refresh" mode="outlined" onPress={onRetry}>Try again</AppButton>
  </View>;
}

/** @param {{uri:string,name:string}} props */
function PhotoPreview({ uri, name }) {
  const theme = useTheme();
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const scale = useSharedValue(1), savedScale = useSharedValue(1);
  const x = useSharedValue(0), y = useSharedValue(0), startX = useSharedValue(0), startY = useSharedValue(0);
  const width = useSharedValue(0), height = useSharedValue(0);
  const pinch = Gesture.Pinch().onStart(() => { savedScale.value = scale.value; })
    .onUpdate((event) => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * event.scale));
      x.value = Math.max(-width.value * (scale.value - 1) / 2, Math.min(width.value * (scale.value - 1) / 2, x.value));
      y.value = Math.max(-height.value * (scale.value - 1) / 2, Math.min(height.value * (scale.value - 1) / 2, y.value));
    });
  const pan = Gesture.Pan().onStart(() => { startX.value = x.value; startY.value = y.value; })
    .onUpdate((event) => {
      x.value = Math.max(-width.value * (scale.value - 1) / 2, Math.min(width.value * (scale.value - 1) / 2, startX.value + event.translationX));
      y.value = Math.max(-height.value * (scale.value - 1) / 2, Math.min(height.value * (scale.value - 1) / 2, startY.value + event.translationY));
    });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd((_event, success) => {
    if (success) { scale.value = scale.value > 1 ? 1 : 2; x.value = 0; y.value = 0; }
  });
  const transform = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  /** @param {number} delta */
  const zoom = (delta) => { scale.set(delta === 0 ? 1 : Math.min(4, Math.max(1, scale.get() + delta))); x.set(0); y.set(0); };
  if (error) return <PreviewFailure message="This photo could not be loaded. Close it and open the attachment again if retrying does not help." onRetry={() => { setError(false); setLoaded(false); setAttempt(attempt + 1); }} />;
  return <View style={styles.fill}>
    <View style={styles.photoStage} onLayout={(event) => { width.value = event.nativeEvent.layout.width; height.value = event.nativeEvent.layout.height; zoom(0); }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
        <Animated.View style={[styles.fill, transform]}>
          <Image key={attempt} source={{ uri }} accessibilityLabel={`Photo: ${name}`} resizeMode="contain" style={styles.fill}
            onLoad={() => setLoaded(true)} onError={() => setError(true)} />
        </Animated.View>
      </GestureDetector>
      {!loaded ? <View pointerEvents="none" style={styles.loadingOverlay}><ActivityIndicator accessibilityLabel="Loading photo" /></View> : null}
    </View>
    <View style={styles.photoFooter}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>Pinch or double tap to zoom</Text>
      <View style={styles.transport}>
        <IconButton icon="magnify-minus-outline" accessibilityLabel="Zoom out" disabled={!loaded} onPress={() => zoom(-0.5)} style={styles.touch} />
        <AppButton disabled={!loaded} onPress={() => zoom(0)}>Fit photo</AppButton>
        <IconButton icon="magnify-plus-outline" accessibilityLabel="Zoom in" disabled={!loaded} onPress={() => zoom(0.5)} style={styles.touch} />
      </View>
    </View>
  </View>;
}

/** @param {{duration:number,current:number,disabled:boolean,onSeek:(seconds:number)=>void}} props */
function AudioTimeline({ duration, current, disabled, onSeek }) {
  const theme = useTheme();
  const [width, setWidth] = useState(1), [drag, setDrag] = useState(/** @type {number|null} */ (null));
  const fraction = Math.max(0, Math.min(1, (drag ?? current) / (duration || 1)));
  /** @param {number} location */
  const timeAt = (location) => Math.max(0, Math.min(duration, location / width * duration));
  return <View>
    <View style={styles.timeline} accessible accessibilityRole="adjustable" accessibilityLabel="Audio position"
      aria-valuemin={0} aria-valuemax={Math.max(1, duration)} aria-valuenow={Math.min(current, duration)} aria-valuetext={`${clock(drag ?? current)} of ${clock(duration)}`}
      accessibilityState={{ disabled }} accessibilityValue={{ min: 0, max: Math.max(1, duration), now: Math.min(current, duration), text: `${clock(drag ?? current)} of ${clock(duration)}` }}
      accessibilityActions={[{ name: 'increment', label: 'Forward 15 seconds' }, { name: 'decrement', label: 'Back 15 seconds' }]}
      onAccessibilityAction={(event) => { if (!disabled) onSeek(Math.max(0, Math.min(duration, current + (event.nativeEvent.actionName === 'increment' ? 15 : -15)))); }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={(event) => setDrag(timeAt(event.nativeEvent.locationX))}
      onResponderMove={(event) => setDrag(timeAt(event.nativeEvent.locationX))}
      onResponderRelease={(event) => { onSeek(timeAt(event.nativeEvent.locationX)); setDrag(null); }} onResponderTerminate={() => setDrag(null)}>
      <View pointerEvents="none" style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }]}>
        <View style={{ height: 4, width: `${fraction * 100}%`, backgroundColor: theme.colors.primary }} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: `${fraction * 100}%`, backgroundColor: disabled ? theme.colors.outline : theme.colors.primary }]} />
    </View>
    <View style={styles.times}>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>{clock(drag ?? current)}</Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>{clock(duration)}</Text>
    </View>
  </View>;
}

/** @param {{uri:string,name:string,onRetry:()=>void}} props */
function AudioPreview({ uri, name, onRetry }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const wide = width > height && height < 600;
  const player = useAudioPlayer(uri), status = useAudioPlayerStatus(player);
  const [failure, setFailure] = useState('');
  useEffect(() => { const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') player.pause(); }); return () => listener.remove(); }, [player]);
  /** @param {number} seconds */
  const seek = (seconds) => { void player.seekTo(Math.max(0, Math.min(status.duration, seconds))).catch(() => setFailure('The audio position could not be changed. Try opening it again.')); };
  const play = async () => {
    try { if (status.playing) player.pause(); else { if (status.didJustFinish || status.currentTime >= status.duration) await player.seekTo(0); player.play(); } }
    catch { setFailure('This audio could not play on this device. Try opening it again.'); }
  };
  if (status.error || failure) return <PreviewFailure message={failure || 'This audio cannot play on this device. Try opening the attachment again.'} onRetry={onRetry} />;
  return <ScrollView contentContainerStyle={styles.audioPage}>
    <View style={[styles.audioPlayer, { flexDirection: wide ? 'row' : 'column' }]}>
      <View style={{ width: wide ? '40%' : '100%', alignItems: 'center', gap: spacing.md }}>
      <View style={[styles.audioMark, { backgroundColor: theme.colors.surfaceVariant }]}><Icon source="music-note-outline" size={48} color={theme.colors.onSurfaceVariant} /></View>
      <Text variant="titleLarge" style={{ textAlign: 'center' }}>{name}</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }} accessibilityLiveRegion="polite">
        {status.error || failure ? 'Playback unavailable' : !status.isLoaded ? 'Loading audio…' : status.isBuffering ? 'Buffering…' : status.playing ? 'Playing' : status.didJustFinish ? 'Finished' : status.currentTime > 0 ? 'Paused' : 'Ready to listen'}
      </Text>
      </View>
      <View style={{ width: wide ? '56%' : '100%', gap: spacing.lg }}>
      <View style={{ width: '100%' }}><AudioTimeline duration={status.duration} current={status.currentTime} disabled={!status.isLoaded || Boolean(status.error)} onSeek={seek} /></View>
      <View style={styles.transport}>
        <IconButton icon="rewind-15" size={28} accessibilityLabel="Back 15 seconds" disabled={!status.isLoaded || Boolean(status.error)} onPress={() => seek(status.currentTime - 15)} style={styles.touch} />
        {!status.isLoaded && !status.error ? <View style={styles.playButton}><ActivityIndicator accessibilityLabel="Loading audio" /></View> :
          <IconButton icon={status.playing ? 'pause' : status.didJustFinish ? 'replay' : 'play'} mode="contained" size={36} containerColor={theme.colors.primary} iconColor={theme.colors.onPrimary}
            accessibilityLabel={status.playing ? 'Pause audio' : status.didJustFinish ? 'Replay audio' : 'Play audio'} disabled={Boolean(status.error)} onPress={() => { void play(); }} style={styles.playButton} />}
        <IconButton icon="fast-forward-15" size={28} accessibilityLabel="Forward 15 seconds" disabled={!status.isLoaded || Boolean(status.error)} onPress={() => seek(status.currentTime + 15)} style={styles.touch} />
      </View>
      </View>
    </View>
  </ScrollView>;
}

/** @param {{uri:string}} props */
function VideoPreview({ uri }) {
  const player = useVideoPlayer(uri);
  const [status, setStatus] = useState(player.status);
  useEffect(() => {
    const subscription = player.addListener('statusChange', (event) => setStatus(event.status));
    const app = AppState.addEventListener('change', (state) => { if (state !== 'active') player.pause(); });
    return () => { subscription.remove(); app.remove(); };
  }, [player]);
  if (status === 'error') return <PreviewFailure message="This video cannot play on this device. Close it and try opening the attachment again." onRetry={() => { void player.replaceAsync(uri).catch(() => setStatus('error')); }} />;
  return <View style={styles.fill}>
    <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} allowsPictureInPicture={false} style={styles.fill} />
    {status === 'loading' ? <View pointerEvents="none" style={styles.loadingOverlay}><ActivityIndicator accessibilityLabel="Loading video" /></View> : null}
  </View>;
}

/** @param {{uri:string,mime:string,name:string}} props */
export default function MediaPreview({ uri, mime, name }) {
  const [text, setText] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (mime === 'text/plain') void readText(uri).then((value) => { if (active) setText(value); }, () => { if (active) setError('Text preview could not be opened.'); });
    return () => { active = false; };
  }, [uri, mime]);
  if (mime.startsWith('image/')) return <PhotoPreview uri={uri} name={name} />;
  if (mime.startsWith('audio/')) return <AudioPreview key={`${uri}:${attempt}`} uri={uri} name={name} onRetry={() => setAttempt(attempt + 1)} />;
  if (mime.startsWith('video/')) return <VideoPreview uri={uri} />;
  return <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
    {mime === 'text/plain' ? <><Text selectable>{text}</Text><Text variant="bodySmall">Text preview shows up to 65,536 characters.</Text></> : <Text>Open this PDF in another app to view it.</Text>}
    <AppButton icon="open-in-new" mode="outlined" onPress={() => { void openDocument(uri, mime).catch(() => setError('A document viewer could not be opened. Try another app.')); }}>Open in another app</AppButton>
    <Text variant="bodySmall">Another app may keep its own copy. Clearing Dearly’s downloads does not remove exported files.</Text>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  photoStage: { flex: 1, overflow: 'hidden' },
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  photoFooter: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  touch: { width: 48, height: 48, margin: 0 },
  playButton: { width: 72, height: 72, borderRadius: 36, margin: 0, alignItems: 'center', justifyContent: 'center' },
  audioPage: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  audioPlayer: { alignSelf: 'center', alignItems: 'center', width: '100%', maxWidth: layout.contentWidth, gap: spacing.lg, paddingVertical: spacing.lg },
  audioMark: { width: 104, height: 104, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  timeline: { height: 48, justifyContent: 'center', marginHorizontal: spacing.sm },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  thumb: { width: 14, height: 14, borderRadius: 7, position: 'absolute', top: 17, marginLeft: -7 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  failure: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
});
