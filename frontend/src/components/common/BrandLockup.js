import { Image, View } from 'react-native';
import { Text } from 'react-native-paper';
import dearlyMark from '../../../assets/dearly-mark.png';

/** Shared app brand; adjacent wordmark supplies the accessible name once. */
export default function BrandLockup() {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Image source={dearlyMark} accessible={false}
      style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#FFFBFE' }} />
    <Text variant="titleLarge" style={{ fontWeight: '600' }}>Dearly</Text>
  </View>;
}
