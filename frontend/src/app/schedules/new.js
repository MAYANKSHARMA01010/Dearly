import { useLocalSearchParams, useRouter } from 'expo-router';
import ScheduleFormScreen from '../../screens/schedules/ScheduleFormScreen';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
import { uuid } from '../../services/drafts/contracts';
export default function NewSchedule() {
  const { draftId } = useLocalSearchParams();
  const router = useRouter();
  return typeof draftId === 'string' && uuid.test(draftId) ? (
    <ScheduleFormScreen key={draftId} id={draftId} />
  ) : (
    <Screen>
      <StateView
        title="Choose a saved draft"
        description="Open a draft before planning a schedule."
        actionLabel="Your drafts"
        onAction={() => router.replace('/drafts')}
      />
    </Screen>
  );
}
