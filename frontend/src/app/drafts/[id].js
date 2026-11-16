import { useLocalSearchParams, useRouter } from 'expo-router';
import DraftEditorScreen from '../../screens/messages/DraftEditorScreen';
import { uuid } from '../../services/drafts/contracts';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
export default function SavedDraftRoute() {
  const { id } = useLocalSearchParams(); const router = useRouter();
  if (typeof id !== 'string' || !uuid.test(id)) return <Screen><StateView title="Invalid draft address" description="Choose a draft from your list." actionLabel="Your drafts" onAction={() => router.replace('/drafts')} /></Screen>;
  return <DraftEditorScreen key={id} draftId={id} />;
}
