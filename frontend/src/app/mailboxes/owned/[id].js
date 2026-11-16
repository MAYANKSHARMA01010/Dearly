import { useLocalSearchParams, useRouter } from 'expo-router';
import MailboxDetailScreen from '../../../screens/mailboxes/MailboxDetailScreen';
import { uuid } from '../../../services/drafts/contracts';
import Screen from '../../../components/layout/Screen';
import StateView from '../../../components/common/StateView';
export default function DetailRoute() {
  const { id } = useLocalSearchParams(),
    router = useRouter();
  if (typeof id !== 'string' || !uuid.test(id))
    return (
      <Screen>
        <StateView
          title="Invalid message address"
          description="Choose a message from your mailboxes."
          actionLabel="Your mailboxes"
          onAction={() => router.replace('/mailboxes')}
        />
      </Screen>
    );
  return <MailboxDetailScreen key={id} id={id} received={false} />;
}
