import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useFocusedResource } from '../../hooks/useFocusedResource';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { createMailboxService } from '../../services/mailboxes/service';
import { eventLabel } from '../../services/mailboxes/contracts';
import {
  scheduleLabel,
  scheduleStatusLabel,
} from '../../services/schedules/contracts';
import Screen from '../../components/layout/Screen';
import { InlineNotice, ScreenHeading, ScreenSection } from '../../components/layout/ScreenSections';
import AppButton from '../../components/common/AppButton';
import StateView from '../../components/common/StateView';
import PrivateAttachmentViewer from '../../components/media/PrivateAttachmentViewer';
import { spacing } from '../../theme';
/** @param {{id:string,received:boolean}} props */
export default function MailboxDetailScreen({ id, received }) {
  return received ? <ReceivedMessage id={id} /> : <OwnedMessage id={id} />;
}
/** @param {string|null} value */
const when = (value) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';
/** @param {{id:string}} props */
function OwnedMessage({ id }) {
  const { session } = useAuth(),
    router = useRouter(),
    theme = useTheme();
  const api = useMemo(() => createMailboxService(session), [session]);
  const load = useFocusedResource(
    useCallback((signal) => api.owned(id, signal), [api, id]),
  );
  const action = useAsyncAction();
  const [older, setOlder] = useState(
    /** @type {{page:import('../../services/mailboxes/contracts').History,source:import('../../services/mailboxes/contracts').History}|null} */ (
      null
    ),
  );
  const refresh = () => {
    setOlder(null);
    void load.refresh();
  };
  const data = load.data,
    activeOlder = Boolean(older && older.source === data?.history),
    history = activeOlder ? older?.page : data?.history;
  const next = () =>
    action.run(async (signal) => {
      if (!history?.nextCursor || !data) return;
      const page = await api.history(id, history.nextCursor, signal);
      if (!signal.aborted) setOlder({ page, source: data.history });
    });
  if (!data)
    return (
      <Screen>
        <StateView
          loading={load.loading}
          title={load.loading ? 'Opening message' : 'Message unavailable'}
          description={load.error || 'Checking your private message.'}
          actionLabel={!load.loading ? 'Try again' : undefined}
          onAction={refresh}
        />
        <AppButton onPress={() => router.replace('/mailboxes')}>Your mailboxes</AppButton>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ headerBackVisible: false, headerLeft: () => <IconButton icon="arrow-left" accessibilityLabel="Back to mailboxes" onPress={() => router.replace('/mailboxes')} /> }} />
      <ScreenHeading title={data.subject || 'Untitled message'} description={`${data.status === 'DRAFT' ? 'Draft' : scheduleStatusLabel(data.status)} · Version ${data.version}`} />
      {data.status === 'PARTIALLY_DELIVERED' ? (
        <InlineNotice>
          Some recipients received this message; others did not. Check each
          delivery below.
        </InlineNotice>
      ) : null}
      <View style={{ gap: spacing.md }}>
      <Text variant="bodyLarge" selectable>
        {data.text ||
          (data.attachments.length
            ? 'Attachment-only message'
            : 'No message text yet')}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Occasion: {data.occasion || 'None'}</Text>
      </View>
      <ScreenSection title="Timing">
      <Text>
        Created {when(data.createdAt)}
        {'\n'}Updated {when(data.updatedAt)}
      </Text>
      {data.scheduledFor && data.timezone ? (
        <>
          <Text variant="titleMedium">
            {scheduleLabel(data.scheduledFor, data.timezone)}
          </Text>
          <Text>
            {data.timezone} · Universal time {data.scheduledFor}
          </Text>
        </>
      ) : null}
      {data.status === 'SCHEDULED' && !data.deliveryEnabled ? (
        <Text>
          This plan is paused. Review and confirm a new delivery time to
          activate it.
        </Text>
      ) : null}
      </ScreenSection>
      {data.status === 'DRAFT' ? (
        <AppButton
          mode="contained"
          onPress={() =>
            router.push({ pathname: '/drafts/[id]', params: { id } })
          }
        >
          Edit draft
        </AppButton>
      ) : ['SCHEDULED', 'CANCELED'].includes(data.status) ? (
        <AppButton
          mode="contained"
          onPress={() =>
            router.push({ pathname: '/schedules/[id]', params: { id } })
          }
        >
          {data.status === 'CANCELED'
            ? 'Open canceled schedule'
            : 'Manage schedule'}
        </AppButton>
      ) : (
        <Text>Delivery has started. Editing and cancellation are locked.</Text>
      )}
      <ScreenSection title="Recipients and delivery">
      {!data.recipients.length ? <Text>No recipients selected.</Text> : null}
      {data.recipients.map((r) => (
        <View key={r.id} style={{ gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.outlineVariant }}>
          <Text variant="titleMedium">
            {r.label ||
              (r.type === 'SELF'
                ? 'Myself'
                : r.type === 'PHONE'
                  ? r.phone
                  : r.type === 'EMAIL'
                    ? r.email
                    : r.userId || 'Unavailable account')}
          </Text>
          {r.unavailable ? <Text>Account unavailable</Text> : null}
          {data.deliveries
            .filter((d) => d.recipientId === r.id)
            .map((d) => (
              <View key={d.channel} style={{ gap: spacing.xs }}>
                <Text>
                  {d.channel === 'IN_APP'
                    ? 'In-app'
                    : d.channel === 'WHATSAPP'
                      ? 'WhatsApp'
                      : d.channel}{' '}
                  ·{' '}
                  {
                    {
                      PENDING: 'Not delivered',
                      DISPATCHING: 'Delivery in progress',
                      RETRYING: 'Waiting for another attempt',
                      DELIVERED:
                        d.channel === 'WHATSAPP'
                          ? 'WhatsApp notification delivered'
                          : d.channel === 'SMS' ? 'SMS delivery confirmed' : 'Delivered in app',
                      FAILED: 'Delivery failed',
                      UNAVAILABLE: 'Channel unavailable',
                      SUBMITTED: d.channel === 'EMAIL' ? 'Submitted to Gmail; inbox delivery unconfirmed' : d.channel === 'SMS' ? 'Queued by SMS gateway; carrier delivery unconfirmed' : 'Submitted to WhatsApp; device delivery unconfirmed',
                      UNKNOWN:
                        'Send result uncertain; automatic resend stopped',
                    }[
                      /** @type {'PENDING'|'DISPATCHING'|'RETRYING'|'DELIVERED'|'FAILED'|'UNAVAILABLE'|'SUBMITTED'|'UNKNOWN'} */ (
                        d.outcome
                      )
                    ]
                  }
                </Text>
                {d.deliveredAt ? (
                  <Text>
                    Delivered {when(d.deliveredAt)}
                    {'\n'}
                    {d.openedAt
                      ? `Marked as opened ${when(d.openedAt)}`
                      : 'No recorded opened status'}
                  </Text>
                ) : null}
                {['EMAIL', 'WHATSAPP', 'SMS'].includes(d.channel) ? (
                  <>
                    {d.notificationSentAt ? <Text>Carrier accepted SMS {when(d.notificationSentAt)}</Text> : null}
                    {d.notificationReadAt ? (
                      <Text>
                        WhatsApp notification read {when(d.notificationReadAt)}
                      </Text>
                    ) : null}
                    {d.submittedAt ? (
                      <Text>Submitted {when(d.submittedAt)}</Text>
                    ) : null}
                    <Text>
                      {d.openedAt
                        ? `Private content opened ${when(d.openedAt)}`
                        : 'No recorded link opening'}
                    </Text>
                    {d.errorCode ? <Text>Reason: {d.errorCode}</Text> : null}
                    {d.expiresAt ? (
                      <Text>
                        {d.revokedAt
                          ? 'Link revoked'
                          : `Link expires ${when(d.expiresAt)}`}
                      </Text>
                    ) : null}
                    {d.intentId && d.expiresAt && !d.revokedAt ? (
                      <AppButton
                        disabled={action.busy}
                        onPress={() => {
                          void action.run(async (signal) => {
                            await api.revokeLink(d.intentId ?? '', signal);
                            if (!signal.aborted) refresh();
                          });
                        }}
                      >
                        Revoke private link
                      </AppButton>
                    ) : null}
                  </>
                ) : null}
                {d.attempt ? (
                  <Text>
                    Attempt {d.attempt.number} ·{' '}
                    {d.attempt.state.toLowerCase().replaceAll('_', ' ')}
                    {d.attempt.errorCode
                      ? ` · ${d.attempt.errorCode.toLowerCase().replaceAll('_', ' ')}`
                      : ''}
                  </Text>
                ) : null}
              </View>
            ))}
          {!data.deliveries.some((d) => d.recipientId === r.id) ? (
            <Text>No delivery choice confirmed.</Text>
          ) : null}
        </View>
      ))}
      </ScreenSection>
      {data.status === 'DRAFT' ? (
        <Text>
          Only ready attachments are shown here. Use the draft editor to finish
          or remove pending uploads.
        </Text>
      ) : null}
      <PrivateAttachmentViewer
        key={data.attachments.map((a) => a.id).join(':')}
        items={data.attachments}
        contentPath={(aid) => api.contentPath(id, aid, false)}
      />
      <ScreenSection title="Activity">
      {!history?.items.length ? <Text>No recorded activity.</Text> : null}
      {history?.items.map((e) => (
        <View key={e.id} style={{ gap: spacing.xs, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant }}>
          <Text variant="titleMedium">{eventLabel(e.kind)}</Text>
          <Text>
            {when(e.occurredAt)} · Version {e.version}
          </Text>
        </View>
      ))}
      {history?.nextCursor ? (
        <AppButton
          loading={action.busy}
          disabled={action.busy || load.loading}
          onPress={() => {
            void next();
          }}
        >
          Older activity
        </AppButton>
      ) : null}
      {activeOlder ? (
        <AppButton
          disabled={action.busy || load.loading}
          onPress={() => setOlder(null)}
        >
          Latest activity
        </AppButton>
      ) : null}
      </ScreenSection>
      {load.error || action.error ? (
        <InlineNotice error>
          {load.error || action.error} Previously loaded details are still
          shown.
        </InlineNotice>
      ) : null}
      <AppButton
        loading={load.loading}
        disabled={load.loading || action.busy}
        onPress={refresh}
      >
        Reload message and outcomes
      </AppButton>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Delivered confirms in-app availability. Opened records a recipient’s
        explicit choice; it does not prove they read or understood the message.
        Provider acceptance, confirmed delivery and private-link opening are separate outcomes.
      </Text>
    </Screen>
  );
}
/** @param {{id:string}} props */
function ReceivedMessage({ id }) {
  const { session } = useAuth(),
    router = useRouter(),
    theme = useTheme();
  const api = useMemo(() => createMailboxService(session), [session]);
  const load = useFocusedResource(
    useCallback((signal) => api.received(id, signal), [api, id]),
  );
  const action = useAsyncAction();
  const data = load.data;
  const mark = () =>
    action.run(async (signal) => {
      await api.markOpened(id, signal);
      if (!signal.aborted) await load.refresh();
    });
  if (!data)
    return (
      <Screen>
        <StateView
          loading={load.loading}
          title={
            load.loading ? 'Opening delivered message' : 'Message unavailable'
          }
          description={load.error || 'Checking this delivery belongs to you.'}
          actionLabel={!load.loading ? 'Try again' : undefined}
          onAction={() => {
            void load.refresh();
          }}
        />
        <AppButton
          onPress={() =>
            router.replace({
              pathname: '/mailboxes',
              params: { box: 'received' },
            })
          }
        >
          Received messages
        </AppButton>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ headerBackVisible: false, headerLeft: () => <IconButton icon="arrow-left" accessibilityLabel="Back to received" onPress={() => router.replace({ pathname: '/mailboxes', params: { box: 'received' } })} /> }} />
      <ScreenHeading title={data.subject || 'Untitled message'} />
      <View style={{ gap: spacing.xs }}>
      <Text variant="titleMedium">
        From{' '}
        {data.senderIsSelf ? 'yourself' : data.senderName || 'a Dearly member'}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Delivered {when(data.deliveredAt)}</Text>
      </View>
      <Text variant="bodyLarge" selectable>{data.text || 'Attachment-only message'}</Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Occasion: {data.occasion || 'None'}</Text>
      <ScreenSection title="Scheduled time">
      <Text>
        {scheduleLabel(data.scheduledFor, data.timezone)}
        {'\n'}
        {data.timezone} · Universal time {data.scheduledFor}
      </Text>
      </ScreenSection>
      <PrivateAttachmentViewer
        key={data.attachments.map((a) => a.id).join(':')}
        items={data.attachments}
        contentPath={(aid) => api.contentPath(id, aid, true)}
      />
      <ScreenSection title="Your delivery activity">
      <Text>Delivered in Dearly: {when(data.deliveredAt)}</Text>
      <Text>
        {data.openedAt
          ? `Marked as opened: ${when(data.openedAt)}`
          : 'Not marked as opened'}
      </Text>
      {!data.openedAt ? (
        <>
          <InlineNotice>
            You can read this message without sharing an opened status. Marking
            it lets the sender know you opened it.
          </InlineNotice>
          <AppButton
            mode="contained"
            disabled={action.busy || load.loading}
            loading={action.busy}
            onPress={() => {
              void mark();
            }}
          >
            Mark as opened
          </AppButton>
        </>
      ) : null}
      </ScreenSection>
      {load.error || action.error ? (
        <InlineNotice error>
          {load.error || action.error} Reload to check the saved state before
          retrying. This action is never repeated automatically.
        </InlineNotice>
      ) : null}
      <AppButton
        icon="refresh" disabled={action.busy || load.loading}
        loading={load.loading}
        onPress={() => {
          void load.refresh();
        }}
      >
        Reload delivered message
      </AppButton>
    </Screen>
  );
}
