import { useLocalSearchParams, useRouter } from 'expo-router';
import ScheduleDetailScreen from '../../screens/schedules/ScheduleDetailScreen';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
import { uuid } from '../../services/drafts/contracts';
export default function ScheduleDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  return typeof id === 'string' && uuid.test(id) ? (
    <ScheduleDetailScreen key={id} id={id} />
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
