import { createNotificationService } from '../../services/notifications/service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, usePreventRemove, useRouter } from 'expo-router';
import {
  Checkbox,
  IconButton,
  List,
  RadioButton,
  Dialog,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import Screen from '../../components/layout/Screen';
import { InlineNotice, ScreenHeading, ScreenSection } from '../../components/layout/ScreenSections';
import AppButton from '../../components/common/AppButton';
import AppTextField from '../../components/forms/AppTextField';
import ScheduleDateTimeFields from '../../components/forms/ScheduleDateTimeFields';
import { recipientChannel, reviewBlockers } from '../../services/schedules/selection';
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
  const [phoneChannels, setPhoneChannels] = useState(
    /** @type {Record<string,string>} */ ({}),
  );
  const [smsConsent, setSmsConsent] = useState(false),
    [smsAvailable, setSmsAvailable] = useState(false),
    [smsStatus, setSmsStatus] = useState('DISABLED');
  const [whatsappConsent, setWhatsappConsent] = useState(false),
    [whatsappAvailable, setWhatsappAvailable] = useState(false),
    [whatsappStatus, setWhatsappStatus] = useState('DISABLED');
  /** @param {import('../../services/schedules/contracts').ScheduleRecipient} r */
  const channelFor = (r) => recipientChannel(r, phoneChannels);
  const [emailAvailable, setEmailAvailable] = useState(false),
    [emailLocalOnly, setEmailLocalOnly] = useState(false);
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
          const [message, capabilities, preferences] = await Promise.all([
            reschedule ? api.read(id, signal) : api.source(id, signal),
            api.capabilities(signal),
            createNotificationService(session).preferences(signal),
          ]);
          if (signal.aborted) return;
          const zone = message.timezone ?? user?.timezone ?? 'UTC';
          const wall = message.localDateTime ?? defaultWallTime(zone);
          setSource(message);
          setTimezone(zone);
          setDate(wall.slice(0, 10));
          setTime(wall.slice(11, 16));
          setPhoneChannels(
            Object.fromEntries(
              message.recipients
                .filter((r) => r.type === 'PHONE')
                .map((r) => [
                  r.id,
                  message.deliveries.find((d) => d.recipientId === r.id)
                    ?.channel ?? (!reschedule && ((preferences.defaultPhoneChannel === 'SMS' && capabilities.smsAvailable) || (preferences.defaultPhoneChannel === 'WHATSAPP' && capabilities.whatsappAvailable)) ? preferences.defaultPhoneChannel : 'IN_APP'),
                ]),
            ),
          );
          setWhatsappConsent(false);
          setSmsAvailable(capabilities.smsAvailable);
          setSmsStatus(capabilities.smsStatus);
          setWhatsappAvailable(capabilities.whatsappAvailable);
          setWhatsappStatus(capabilities.whatsappStatus);
          setAvailable(capabilities.inAppAvailable);
          setEmailAvailable(capabilities.emailAvailable);
          setEmailLocalOnly(capabilities.emailLocalOnly);
          setWorkerOnline(capabilities.workerOnline);
          setReview(null);
          setTouched(false);
        } finally {
          if (!signal.aborted) setLoaded(true);
        }
      }),
    [api, id, reschedule, run, user?.timezone, session],
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
  const included = source?.recipients ?? [];
  const hasWhatsapp = included.some((r) => channelFor(r) === 'WHATSAPP');
  const hasSms = included.some((r) => channelFor(r) === 'SMS');
  const hasExternal = included.some((r) => ['EMAIL', 'WHATSAPP', 'SMS'].includes(channelFor(r)));
  const blockers = reviewBlockers({ recipients: included, phoneChannels, available, emailAvailable, whatsappAvailable, smsAvailable, whatsappConsent, smsConsent, date, time, timezone });
  const preview = () =>
    run(async (signal) => {
      if (!source) return;
      const choice = {
        version: source.version,
        localDateTime: `${date}T${time}`,
        timezone,
        ...(hasWhatsapp
          ? { whatsappConsent }
          : {}),
        ...(hasSms ? { smsConsent } : {}),
        ...(!reschedule && {
          deliveries: included
            .map((r) => ({
              recipientId: r.id,
              channels: [channelFor(r)],
            })),
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
      <Stack.Screen options={{ headerBackVisible: false, headerLeft: () => <IconButton icon="arrow-left" accessibilityLabel="Back to schedules" disabled={action.busy} onPress={() => router.replace('/schedules')} /> }} />
      <ScreenHeading title={reschedule ? 'Choose a new time' : 'Plan a delivery time'} description={reschedule ? "Review a new delivery time for this saved message." : "Choose when this message should begin delivery. Confirm the actual time before scheduling."} />
      {reschedule ? <InlineNotice>
        Current schedule: {scheduleLabel(source.scheduledFor ?? '', source.timezone ?? 'UTC')} · {source.timezone}.
        {' '}{source.deliveryEnabled ? 'Your existing schedule stays active until you confirm a new time.' : 'This existing plan stays paused until you confirm a new time.'}
      </InlineNotice> : null}
      {!workerOnline ? (
        <InlineNotice>
          The delivery service is offline. Confirmed schedules stay saved
          and can begin delivery when the service resumes.
        </InlineNotice>
      ) : null}
      <ScreenSection title={reschedule ? "New delivery time" : "Delivery time"} description={source.subject || 'Untitled message'}>
      <ScheduleDateTimeFields date={date} time={time} timezone={timezone} disabled={action.busy} onChange={(next) => { changed(); setDate(next.date); setTime(next.time); }} />
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
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Times use this timezone. Choose at least one minute ahead. The next step confirms the exact delivery time.
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
      </ScreenSection>
      <ScreenSection title="Delivery choices" description={reschedule ? "Recipients and channels stay unchanged. To change them, cancel the schedule and return it to drafts." : "Every recipient saved in this draft is included. Change recipients in the draft."}>
      {source.recipients.map((recipient) => {
        const label = recipient.label || (recipient.type === 'SELF' ? 'Myself' : recipient.type === 'PHONE' ? recipient.phone : recipient.type === 'EMAIL' ? recipient.email : 'Dearly user');
        const destination = recipient.type === 'PHONE' ? recipient.phone : recipient.type === 'EMAIL' ? recipient.email : recipient.type === 'USER' ? `Dearly ID: ${recipient.userId}` : 'Your Dearly inbox';
        return <View key={recipient.id} style={{ gap: spacing.sm, borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: 12, padding: spacing.sm }}>
          <Text variant="titleMedium" style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, fontWeight: '600' }}>{label || 'Recipient'}</Text>
          <Text variant="bodyMedium" style={{ paddingHorizontal: spacing.md, color: theme.colors.onSurfaceVariant }}>{destination}</Text>
          {recipient.type === 'PHONE' ? <View>
            <Text variant="labelLarge" style={{ paddingHorizontal: spacing.md }}>Send through</Text>
            <RadioButton.Group value={channelFor(recipient)} onValueChange={(value) => { changed(); setWhatsappConsent(false); setSmsConsent(false); setPhoneChannels((old) => ({ ...old, [recipient.id]: value })); }}>
              <RadioButton.Item mode="android" position="leading" labelStyle={{ textAlign: 'left' }} label={available ? 'Dearly inbox' : 'Dearly inbox · unavailable'} value="IN_APP" disabled={action.busy || reschedule || !available} />
              <RadioButton.Item mode="android" position="leading" labelStyle={{ textAlign: 'left' }} label={whatsappAvailable ? 'WhatsApp' : 'WhatsApp · sender unavailable'} value="WHATSAPP" disabled={action.busy || reschedule || !whatsappAvailable} />
              <RadioButton.Item mode="android" position="leading" labelStyle={{ textAlign: 'left' }} label={smsAvailable ? 'SMS' : 'SMS · phone unavailable'} value="SMS" disabled={action.busy || reschedule || !smsAvailable} />
            </RadioButton.Group>
          </View> : <Text variant="bodyMedium" style={{ paddingHorizontal: spacing.md }}>Send through: {recipient.type === 'EMAIL' ? 'Email' : 'Dearly inbox'}</Text>}
          {recipient.unavailable ? <Text style={{ color: theme.colors.error, paddingHorizontal: spacing.md }}>Account unavailable. Correct or remove this recipient in the draft.</Text> : null}
        </View>;
      })}
      {!source.recipients.length ? <InlineNotice>Add at least one recipient in the draft before scheduling.</InlineNotice> : null}
      <List.Accordion title="Privacy and delivery details" titleNumberOfLines={2} style={{ backgroundColor: theme.colors.background }}>
        <View style={{ gap: spacing.sm, padding: spacing.md }}>
          <Text variant="bodyMedium">Dearly inbox delivery needs an existing verified account. It does not send SMS or WhatsApp.</Text>
          <Text variant="bodyMedium">Private links expire after seven days. Anyone with the link can open them. Provider acceptance does not confirm delivery. You can revoke links from message details.</Text>
          <Text variant="bodyMedium">To change recipients or attachments, return to the draft and save it, then review again. Clock-change times that are skipped or repeated must be adjusted.</Text>
        </View>
      </List.Accordion>
      {hasExternal && emailLocalOnly ? <InlineNotice>Private links from this local backend open only on this Mac. Use the hosted backend for recipients on other devices.</InlineNotice> : null}
      {hasWhatsapp || hasSms ? <View style={{ gap: spacing.sm }}>
        <Text variant="titleMedium" accessibilityRole="header">Permission to send</Text>
        {hasWhatsapp ? <>
          <Text variant="bodyMedium">WhatsApp sender: {whatsappStatus === 'READY' ? 'Ready' : 'Needs attention'}.</Text>
          <Checkbox.Item mode="android" position="leading" labelStyle={{ textAlign: 'left' }} label="I have permission to send WhatsApp messages to these recipients" status={whatsappConsent ? 'checked' : 'unchecked'} disabled={action.busy} onPress={() => { changed(); setWhatsappConsent((v) => !v); }} />
        </> : null}
        {hasSms ? <>
          <Text variant="bodyMedium">SMS sender: {smsStatus === 'READY' ? 'Ready' : 'Phone needs attention'}. The sender phone and SIM must stay online. Carrier limits apply.</Text>
          <Checkbox.Item mode="android" position="leading" labelStyle={{ textAlign: 'left' }} label="I have permission to send SMS to these recipients" status={smsConsent ? 'checked' : 'unchecked'} disabled={action.busy} onPress={() => { changed(); setSmsConsent((v) => !v); }} />
        </> : null}
      </View> : null}
      </ScreenSection>
      {blockers.length ? <InlineNotice>{blockers.join('\n')}</InlineNotice> : <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Ready to review {included.length} recipient{included.length === 1 ? '' : 's'}. You’ll confirm before anything is scheduled.</Text>}
      <AppButton
        icon="calendar-search" mode={review ? "outlined" : "contained"}
        disabled={action.busy || blockers.length > 0}
        loading={action.busy && !review}
        onPress={() => {
          void preview();
        }}
      >
        Review schedule
      </AppButton>
      {review ? (
        <View style={{ gap: spacing.md, padding: spacing.md, borderRadius: 16, backgroundColor: theme.colors.secondaryContainer }}>
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
            {review.data.deliveries.length} recipient{review.data.deliveries.length === 1 ? '' : 's'}
          </Text>
          {review.data.message.recipients.filter((r) => review.data.deliveries.some((d) => d.recipientId === r.id)).map((recipient) => (
            <Text key={recipient.id}>
              {recipient.label ||
                (recipient.type === 'SELF'
                  ? 'Myself'
                  : recipient.type === 'PHONE'
                    ? recipient.phone
                    : recipient.type === 'EMAIL'
                      ? recipient.email
                      : `Dearly account ${recipient.userId}`)}{' '}
              ·{' '}
              {recipient.type === 'EMAIL'
                ? 'Email'
                : channelFor(recipient) === 'WHATSAPP'
                  ? 'WhatsApp'
                  : channelFor(recipient) === 'SMS' ? 'SMS' : 'In-app'}
            </Text>
          ))}
          {review.data.message.attachments.map((file) => (
            <Text key={file.id}>{file.name} · saved privately</Text>
          ))}
          <Text>
            Review valid until{' '}
            {new Date(review.data.expiresAt).toLocaleTimeString()}. Confirming
            enables the reviewed delivery channels.
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
          <InlineNotice error>{action.error}</InlineNotice>
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
