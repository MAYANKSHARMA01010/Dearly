import { useLocalSearchParams, useRouter } from 'expo-router';
import ScheduleFormScreen from '../../screens/schedules/ScheduleFormScreen';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
import { uuid } from '../../services/drafts/contracts';
export default function Reschedule() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  return typeof id === 'string' && uuid.test(id) ? (
    <ScheduleFormScreen key={id} id={id} reschedule />
  ) : (
    <Screen>
      <StateView
        title="Schedule unavailable"
        description="Choose a saved schedule."
        actionLabel="Your schedules"
        onAction={() => router.replace('/schedules')}
      />
    </Screen>
  );
}
