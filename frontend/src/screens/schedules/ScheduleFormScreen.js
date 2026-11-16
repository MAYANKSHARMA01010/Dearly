import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { usePreventRemove, useRouter } from 'expo-router';
import { Checkbox, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import AppTextField from '../../components/forms/AppTextField';
import StateView from '../../components/common/StateView';
import { useAuth } from '../../context/AuthContext';
import { useDraftWorkspace } from '../../context/DraftWorkspaceContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { ApiError } from '../../api/client';
import { createScheduleService } from '../../services/schedules/service';
import {
  scheduleLabel,
  defaultWallTime,
} from '../../services/schedules/contracts';
import { spacing } from '../../theme';

/** @param {{id:string,reschedule?:boolean}} props */
export default function ScheduleFormScreen({ id, reschedule = false }) {
  const { session, user } = useAuth();
  const { workspace } = useDraftWorkspace();
  const router = useRouter(),
    theme = useTheme();
  const api = useMemo(() => createScheduleService(session), [session]);
  const action = useAsyncAction();
  const { run } = action;
  const [source, setSource] = useState(
    /** @type {import('../../services/schedules/contracts').Message|null} */ (
      null
    ),
  );
  const [date, setDate] = useState(''),
    [time, setTime] = useState(''),
    [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [selected, setSelected] = useState(/** @type {string[]} */ ([]));
  const [workerOnline, setWorkerOnline] = useState(false);
  const [available, setAvailable] = useState(false),
    [loaded, setLoaded] = useState(false),
    [touched, setTouched] = useState(false),
    [completed, setCompleted] = useState(false);
  const [reload, setReload] = useState(false);
  const [review, setReview] = useState(
    /** @type {{data:import('../../services/schedules/contracts').Review,choice:import('../../services/schedules/contracts').Choice}|null} */ (
      null
    ),
  );
  const [repeat, setRepeat] = useState(
    /** @type {{run:()=>void}|null} */ (null),
  );
  usePreventRemove(!completed && (touched || action.busy), (event) =>
    setRepeat({ run: event.repeat }),
  );
  const load = useCallback(
    () =>
      run(async (signal) => {
        try {
          const [message, capabilities] = await Promise.all([
            reschedule ? api.read(id, signal) : api.source(id, signal),
            api.capabilities(signal),
          ]);
          if (signal.aborted) return;
          const zone = message.timezone ?? user?.timezone ?? 'UTC';
          const wall = message.localDateTime ?? defaultWallTime(zone);
          setSource(message);
          setTimezone(zone);
          setDate(wall.slice(0, 10));
          setTime(wall.slice(11, 16));
          setSelected(
            message.recipients
              .filter(
                (r) =>
                  ['SELF', 'USER', 'PHONE'].includes(r.type) && !r.unavailable,
              )
              .map((r) => r.id),
          );
          setAvailable(capabilities.inAppAvailable);
          setWorkerOnline(capabilities.workerOnline);
          setReview(null);
          setTouched(false);
        } finally {
          if (!signal.aborted) setLoaded(true);
        }
      }),
    [api, id, reschedule, run, user?.timezone],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (completed)
      router.replace({ pathname: '/schedules/[id]', params: { id } });
  }, [completed, id, router]);
  const changed = () => {
    setTouched(true);
    setReview(null);
    action.clearError();
  };
  const preview = () =>
    run(async (signal) => {
      if (!source) return;
      const choice = {
        version: source.version,
        localDateTime: `${date}T${time}`,
        timezone,
        ...(!reschedule && {
          deliveries: source.recipients
            .filter((r) => selected.includes(r.id))
            .map((r) => ({ recipientId: r.id, channels: ['IN_APP'] })),
        }),
      };
      const data = await api.preview(id, choice, reschedule, signal);
      if (!signal.aborted) {
        setReview({ data, choice });
        setTouched(true);
      }
    });
  const confirm = () =>
    run(async (signal) => {
      if (!review) return;
      if (Date.parse(review.data.expiresAt) <= Date.now()) {
        setReview(null);
        throw new ApiError(
          'This review expired. Review the schedule again.',
          'configuration',
        );
      }
      const result = await api.confirm(
        id,
        review.choice,
        review.data.reviewToken,
        reschedule,
        signal,
      );
      if (!signal.aborted && result.status === 'SCHEDULED') {
        workspace.forget(id);
        setCompleted(true);
      }
    });
  if (!source)
    return (
      <Screen>
        <StateView
          loading={!loaded || action.busy}
          title="Prepare your schedule"
          description={
            action.error || 'Loading your saved message and delivery options.'
          }
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
      <AppButton
        disabled={action.busy}
        onPress={() => router.replace('/schedules')}
      >
        Back to schedules
      </AppButton>
      <Text variant="headlineMedium" accessibilityRole="header">
        {reschedule ? 'Choose a new time' : 'Plan a delivery time'}
      </Text>
      <Text>
        Confirming enables delivery to Dearly inboxes at or after the chosen
        time. Delivery continues when this app is closed.
      </Text>
      {!workerOnline ? (
        <Text accessibilityRole="alert">
          The delivery service is offline. Your schedule stays saved and
          delivery will resume when the service is available.
        </Text>
      ) : null}
      <Text variant="titleMedium">{source.subject || 'Untitled message'}</Text>
      <AppTextField
        label="Date (YYYY-MM-DD)"
        value={date}
        onChangeText={(value) => {
          changed();
          setDate(value);
        }}
        maxLength={10}
        autoCapitalize="none"
        disabled={action.busy}
      />
      <AppTextField
        label="Time (24-hour HH:mm)"
        value={time}
        onChangeText={(value) => {
          changed();
          setTime(value);
        }}
        maxLength={5}
        autoCapitalize="none"
        disabled={action.busy}
      />
      <AppTextField
        label="Timezone"
        value={timezone}
        onChangeText={(value) => {
          changed();
          setTimezone(value);
        }}
        maxLength={80}
        autoCapitalize="none"
        autoCorrect={false}
        disabled={action.busy}
      />
      <Text>
        For example, Asia/Kolkata or America/New_York. Choose at least one
        minute ahead and within ten years. Times skipped or repeated by clock
        changes are rejected.
      </Text>
      <AppButton
        disabled={action.busy}
        onPress={() => {
          changed();
          setTimezone(user?.timezone ?? 'UTC');
        }}
      >
        Use my profile timezone
      </AppButton>
      <Text variant="titleLarge" accessibilityRole="header">
        Delivery choices
      </Text>
      {source.recipients.map((recipient) => {
        const supported =
          ['SELF', 'USER', 'PHONE'].includes(recipient.type) &&
          !recipient.unavailable;
        const label =
          recipient.label ||
          (recipient.type === 'SELF'
            ? 'Myself'
            : recipient.type === 'PHONE'
              ? recipient.phone
              : recipient.type === 'EMAIL'
                ? recipient.email
                : `Dearly account ${recipient.userId}`);
        return (
          <View key={recipient.id} style={{ gap: spacing.sm }}>
            <Checkbox.Item
              label={`${label} · In-app`}
              status={selected.includes(recipient.id) ? 'checked' : 'unchecked'}
              disabled={action.busy || reschedule || !supported || !available}
              onPress={() => {
                changed();
                setSelected((old) =>
                  old.includes(recipient.id)
                    ? old.filter((value) => value !== recipient.id)
                    : [...old, recipient.id],
                );
              }}
            />
            {!supported ? (
              <Text style={{ color: theme.colors.error }}>
                This recipient cannot use in-app delivery. Update recipients in
                drafts.
              </Text>
            ) : null}
          </View>
        );
      })}
      <Text>
        Phone recipients need an existing verified Dearly account. In-app does
        not send an SMS or WhatsApp message. SMS, WhatsApp and email delivery
        are unavailable. Recipient and attachment changes require returning to
        drafts and reviewing a new schedule.
      </Text>
      <AppButton
        mode="contained"
        disabled={
          action.busy ||
          !available ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !/^\d{2}:\d{2}$/.test(time)
        }
        loading={action.busy && !review}
        onPress={() => {
          void preview();
        }}
      >
        Review schedule
      </AppButton>
      {review ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="headlineSmall" accessibilityRole="header">
            Confirm the actual time
          </Text>
          <Text variant="titleLarge">
            {scheduleLabel(
              review.data.resolved.scheduledFor,
              review.data.resolved.timezone,
            )}
          </Text>
          <Text>
            {review.data.resolved.timezone} · UTC{review.data.resolved.offset}
          </Text>
          <Text selectable>
            Universal time: {review.data.resolved.scheduledFor}
          </Text>
          <Text variant="titleMedium">
            {review.data.message.subject || 'Untitled message'}
          </Text>
          <Text selectable>
            {review.data.message.text || 'Attachment-only message'}
          </Text>
          <Text>
            Occasion: {review.data.message.occasion || 'None'} ·{' '}
            {review.data.message.attachments.length} attachments ·{' '}
            {review.data.deliveries.length} in-app recipients
          </Text>
          {review.data.message.recipients.map((recipient) => (
            <Text key={recipient.id}>
              {recipient.label ||
                (recipient.type === 'SELF'
                  ? 'Myself'
                  : recipient.type === 'PHONE'
                    ? recipient.phone
                    : `Dearly account ${recipient.userId}`)}{' '}
              · In-app
            </Text>
          ))}
          {review.data.message.attachments.map((file) => (
            <Text key={file.id}>{file.name} · saved privately</Text>
          ))}
          <Text>
            Review valid until{' '}
            {new Date(review.data.expiresAt).toLocaleTimeString()}. Confirming
            enables in-app delivery.
          </Text>
          <AppButton
            mode="contained"
            disabled={action.busy}
            loading={action.busy}
            onPress={() => {
              void confirm();
            }}
          >
            {reschedule ? 'Confirm new time' : 'Confirm schedule'}
          </AppButton>
        </View>
      ) : null}
      {action.error ? (
        <>
          <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>
            {action.error}
          </Text>
          <Text>
            If confirmation could not be verified, check saved schedules before
            changing this request. Retrying the same confirmation does not
            create another schedule.
          </Text>
          <AppButton onPress={() => router.push('/schedules')}>
            Check saved schedules
          </AppButton>
          <AppButton disabled={action.busy} onPress={() => setReload(true)}>
            Reload saved message
          </AppButton>
        </>
      ) : null}
      <Portal>
        <Dialog visible={reload} onDismiss={() => setReload(false)}>
          <Dialog.Title>Reload saved message?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Your unsaved schedule choices and review will be cleared. The
              latest saved message and delivery choices will be loaded.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton onPress={() => setReload(false)}>Keep choices</AppButton>
            <AppButton
              onPress={() => {
                setReload(false);
                setReview(null);
                void load();
              }}
            >
              Reload and clear choices
            </AppButton>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={Boolean(repeat)} onDismiss={() => setRepeat(null)}>
          <Dialog.Title>
            {action.busy ? 'Please wait' : 'Leave schedule choices?'}
          </Dialog.Title>
          <Dialog.Content>
            <Text>
              {action.busy
                ? 'Wait for the current request to finish.'
                : 'These unsaved choices will be lost. A confirmed schedule stays saved.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton onPress={() => setRepeat(null)}>
              Keep reviewing
            </AppButton>
            {!action.busy ? (
              <AppButton
                onPress={() => {
                  const next = repeat;
                  setTouched(false);
                  setRepeat(null);
                  next?.run();
                }}
              >
                Leave without saving
              </AppButton>
            ) : null}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}
