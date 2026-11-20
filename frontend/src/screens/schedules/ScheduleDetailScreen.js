import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { Dialog, IconButton, Portal, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import { InlineNotice, ScreenHeading, ScreenSection } from '../../components/layout/ScreenSections';
import { spacing } from '../../theme';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import AppTextField from '../../components/forms/AppTextField';
import AttachmentPanel from '../../components/media/AttachmentPanel';
import { useAuth } from '../../context/AuthContext';
import { useDraftWorkspace } from '../../context/DraftWorkspaceContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { createScheduleService } from '../../services/schedules/service';
import {
  scheduleLabel,
  scheduleStatusLabel,
} from '../../services/schedules/contracts';
const noGuard = () => {};
/** @param {{id:string}} props */
export default function ScheduleDetailScreen({ id }) {
  const { session } = useAuth();
  const { workspace } = useDraftWorkspace();
  const router = useRouter(),
    theme = useTheme();
  const api = useMemo(() => createScheduleService(session), [session]);
  const action = useAsyncAction(),
    { run } = action;
  const [message, setMessage] = useState(
    /** @type {import('../../services/schedules/contracts').Message|null} */ (
      null
    ),
  );
  const [loaded, setLoaded] = useState(false),
    [editing, setEditing] = useState(false),
    [reopened, setReopened] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [subject, setSubject] = useState(''),
    [text, setText] = useState(''),
    [occasion, setOccasion] = useState('');
  const [confirm, setConfirm] = useState(
    /** @type {'cancel'|'reopen'|'reload'|null} */ (null),
  );
  const [repeat, setRepeat] = useState(
    /** @type {{run:()=>void}|null} */ (null),
  );
  const dirty =
    editing &&
    Boolean(message) &&
    (subject !== (message?.subject ?? '') ||
      text !== message?.text ||
      occasion !== (message?.occasion ?? ''));
  usePreventRemove(!reopened && (dirty || action.busy), (event) =>
    setRepeat({ run: event.repeat }),
  );
  const accept = useCallback(
    /** @param {import('../../services/schedules/contracts').Message} value */ (
      value,
    ) => {
      setCheckedAt(Date.now());
      setMessage(value);
      setSubject(value.subject ?? '');
      setText(value.text);
      setOccasion(value.occasion ?? '');
      setEditing(false);
    },
    [],
  );
  const load = useCallback(
    () =>
      run(async (signal) => {
        try {
          const value = await api.read(id, signal);
          if (!signal.aborted) accept(value);
        } finally {
          if (!signal.aborted) setLoaded(true);
        }
      }),
    [run, api, id, accept],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (reopened) router.replace({ pathname: '/drafts/[id]', params: { id } });
  }, [reopened, id, router]);
  const save = () =>
    run(async (signal) => {
      if (!message) return;
      const value = await api.edit(
        id,
        message.version,
        {
          subject: subject.trim() || null,
          text,
          occasion: occasion.trim() || null,
        },
        signal,
      );
      if (!signal.aborted) accept(value);
    });
  const perform = () => {
    const intent = confirm;
    setConfirm(null);
    if (intent === 'reload') {
      void load();
      return;
    }
    void run(async (signal) => {
      if (!message) return;
      if (intent === 'cancel') {
        const value = await api.cancel(id, message.version, signal);
        if (!signal.aborted) accept(value);
      }
      if (intent === 'reopen') {
        await api.reopen(id, message.version, signal);
        if (!signal.aborted) {
          workspace.forget(id);
          setReopened(true);
        }
      }
    });
  };
  if (!message)
    return (
      <Screen>
        <StateView
          loading={!loaded || action.busy}
          title="Open scheduled message"
          description={action.error || 'Checking the current schedule.'}
          actionLabel={loaded && !action.busy ? 'Try again' : undefined}
          onAction={() => {
            void load();
          }}
        />
        <AppButton onPress={() => router.replace('/schedules')}>
          Your schedules
        </AppButton>
      </Screen>
    );
  return (
    <Screen>
      <Stack.Screen options={{ headerBackVisible: false, headerLeft: () => <IconButton icon="arrow-left" accessibilityLabel="Back to schedules" disabled={action.busy} onPress={() => router.replace('/schedules')} /> }} />
      <ScreenHeading title={message.status === 'CANCELED' ? 'Schedule canceled' : 'Your scheduled message'} description={scheduleStatusLabel(message.status)} />
      <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: 16, backgroundColor: theme.colors.secondaryContainer }}>
      <Text>
        Version {message.version} · {scheduleStatusLabel(message.status)}
      </Text>
      <Text variant="titleLarge">
        {scheduleLabel(message.scheduledFor ?? '', message.timezone ?? 'UTC')}
      </Text>
      <Text>
        {message.timezone} · {message.localDateTime}
      </Text>
      <Text selectable>Universal time: {message.scheduledFor}</Text>
      </View>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Once delivery starts, editing and cancellation are locked. Delivered
        means available in the recipient’s Dearly inbox; it does not mean
        opened.
      </Text>
      {message.status === 'SCHEDULED' && !message.deliveryEnabled ? (
        <InlineNotice>
          This older plan is paused. Reschedule and confirm a new review to
          enable delivery.
        </InlineNotice>
      ) : null}
      {message.status === 'SCHEDULED' &&
      message.deliveryEnabled &&
      Date.parse(message.scheduledFor ?? '') < checkedAt ? (
        <InlineNotice>
          The scheduled time has passed. This message is waiting to be claimed.
          You can still reschedule or cancel until dispatch starts.
        </InlineNotice>
      ) : null}
      {message.status === 'CANCELED' ? (
        <Text>
          Canceled at {new Date(message.canceledAt ?? '').toLocaleString()}.
          This schedule will not be dispatched.
        </Text>
      ) : null}
      <ScreenSection title="Message">
      {editing ? (
        <>
          <Text>Unsaved edits — save before leaving.</Text>
          <AppTextField
            label="Subject (optional)"
            value={subject}
            onChangeText={setSubject}
            maxLength={160}
            disabled={action.busy}
          />
          <AppTextField
            label="Message"
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={6}
            maxLength={20000}
            disabled={action.busy}
            style={{ minHeight: 160 }}
          />
          <AppTextField
            label="Occasion (optional)"
            value={occasion}
            onChangeText={setOccasion}
            maxLength={80}
            disabled={action.busy}
          />
          <AppButton
            mode="contained"
            loading={action.busy}
            disabled={action.busy || !dirty}
            onPress={() => {
              void save();
            }}
          >
            Save message edits
          </AppButton>
          <AppButton disabled={action.busy} onPress={() => accept(message)}>
            Discard message edits
          </AppButton>
        </>
      ) : (
        <>
          <Text variant="headlineSmall">
            {message.subject || 'Untitled message'}
          </Text>
          <Text selectable>{message.text || 'Attachment-only message'}</Text>
          <Text>Occasion: {message.occasion || 'None'}</Text>
        </>
      )}
      </ScreenSection>
      <ScreenSection title="Recipients">
      {message.recipients.map((r) => (
        <Text key={r.id}>
          {r.label ||
            (r.type === 'SELF'
              ? 'Myself'
              : ((r.type === 'PHONE'
                  ? r.phone
                  : r.type === 'EMAIL'
                    ? r.email
                    : r.userId) ?? 'Unavailable account'))}{' '}
          ·{' '}
          {r.type === 'EMAIL'
            ? 'Email'
            : message.deliveries.find((d) => d.recipientId === r.id)
                  ?.channel === 'WHATSAPP'
              ? 'WhatsApp'
              : message.deliveries.find((d) => d.recipientId === r.id)?.channel === 'SMS' ? 'SMS' : 'In-app'}
          {r.unavailable ? ' · Account unavailable' : ''}
        </Text>
      ))}
      </ScreenSection>
      {message.status === 'SCHEDULED' ? (
        <>
          <AppButton
            icon="pencil-outline" mode="outlined" disabled={action.busy || editing}
            onPress={() => setEditing(true)}
          >
            Edit message
          </AppButton>
          <AppButton
            mode="contained"
            disabled={action.busy || dirty}
            onPress={() =>
              router.replace({
                pathname: '/schedules/reschedule',
                params: { id },
              })
            }
          >
            Reschedule
          </AppButton>
          <AppButton
            textColor={theme.colors.error} icon="calendar-remove"
            disabled={action.busy || dirty}
            onPress={() => setConfirm('cancel')}
          >
            Cancel schedule
          </AppButton>
          <Text>
            To change recipients, channels or attachments, cancel and move this
            message back to drafts. You’ll review a new schedule afterward.
          </Text>
        </>
      ) : message.status === 'CANCELED' ? (
        <AppButton
          mode="contained"
          disabled={action.busy}
          onPress={() => setConfirm('reopen')}
        >
          Move back to drafts
        </AppButton>
      ) : (
        <Text>
          Dispatch has started. This message cannot return to drafts. Reload to
          check its current outcome.
        </Text>
      )}
      {action.error ? (
        <InlineNotice error>
          {action.error} Your local edits remain here. Reload to check the saved
          state before retrying an uncertain action.
        </InlineNotice>
      ) : null}
      <AppButton
        disabled={action.busy}
        onPress={() => {
          if (dirty) setConfirm('reload');
          else void load();
        }}
      >
        Reload current schedule
      </AppButton>
      <AttachmentPanel
        draftId={id}
        readOnly
        disabled={action.busy}
        onGuardChange={noGuard}
      />
      <Portal>
        <Dialog visible={confirm !== null} onDismiss={() => setConfirm(null)}>
          <Dialog.Title>
            {confirm === 'cancel'
              ? 'Cancel this schedule?'
              : confirm === 'reopen'
                ? 'Move back to drafts?'
                : 'Discard edits and reload?'}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {confirm === 'cancel'
                ? 'The saved schedule will be canceled. The message and its private attachments stay available to you.'
                : confirm === 'reopen'
                  ? 'The old schedule and delivery choices will be cleared. Edit the draft, then review and confirm a new schedule.'
                  : 'Your local message edits will be replaced by the saved version.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton onPress={() => setConfirm(null)}>
              Keep current view
            </AppButton>
            <AppButton textColor={confirm === 'cancel' ? theme.colors.error : undefined} onPress={perform}>
              {confirm === 'cancel'
                ? 'Confirm cancellation'
                : confirm === 'reopen'
                  ? 'Return to drafts'
                  : 'Reload saved version'}
            </AppButton>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={Boolean(repeat)} onDismiss={() => setRepeat(null)}>
          <Dialog.Title>
            {action.busy ? 'Please wait' : 'Discard unsaved edits?'}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {action.busy
                ? 'Wait for the current request to finish.'
                : 'Only your local edits will be lost. The saved schedule stays unchanged.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton onPress={() => setRepeat(null)}>Keep editing</AppButton>
            {!action.busy ? (
              <AppButton
                onPress={() => {
                  const next = repeat;
                  accept(message);
                  setRepeat(null);
                  next?.run();
                }}
              >
                Discard and leave
              </AppButton>
            ) : null}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}
