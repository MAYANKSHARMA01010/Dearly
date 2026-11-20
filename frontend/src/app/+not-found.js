import { useRouter } from 'expo-router';
import Screen from '../components/layout/Screen';
import { ScreenHeading } from '../components/layout/ScreenSections';
import AppButton from '../components/common/AppButton';

export default function NotFoundScreen() {
  const router = useRouter();
  return <Screen>
    <ScreenHeading icon="file-search-outline" title="This page isn’t here" description="The link may be incomplete or no longer available." />
    <AppButton icon="home-outline" mode="contained" onPress={() => router.replace('/')}>Go to Dearly</AppButton>
  </Screen>;
}
