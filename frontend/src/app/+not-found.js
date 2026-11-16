import { useRouter } from 'expo-router';
import Screen from '../components/layout/Screen';
import StateView from '../components/common/StateView';

export default function NotFoundScreen() {
  const router = useRouter();
  return <Screen><StateView title="This page isn’t here" description="Head back to Dearly to continue."
    actionLabel="Go to Dearly" onAction={() => router.replace('/')} /></Screen>;
}
