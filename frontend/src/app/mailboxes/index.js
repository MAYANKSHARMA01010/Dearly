import { useLocalSearchParams } from 'expo-router';
import MailboxListScreen from '../../screens/mailboxes/MailboxListScreen';
import { boxes } from '../../services/mailboxes/contracts';
export default function MailboxesRoute() {
  const { box } = useLocalSearchParams();
  const selected =
    typeof box === 'string' &&
    boxes.includes(
      /** @type {import('../../services/mailboxes/contracts').Box} */ (box),
    )
      ? /** @type {import('../../services/mailboxes/contracts').Box} */ (box)
      : 'created';
  return <MailboxListScreen key={selected} initialBox={selected} />;
}
