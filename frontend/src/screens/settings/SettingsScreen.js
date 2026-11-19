import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { Text, Switch, List, RadioButton, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useFocusedResource } from '../../hooks/useFocusedResource';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import Screen from '../../components/layout/Screen';
import StateView from '../../components/common/StateView';
import AppButton from '../../components/common/AppButton';
import { createNotificationService } from '../../services/notifications/service';
import { registerPush } from '../../services/notifications/device';
/** @param {{initial:import('../../services/notifications/service').Preferences}} props */
function SettingsForm({ initial }) {
  const { session } = useAuth(),
    router = useRouter(),
    action = useAsyncAction();
  const [value, setValue] = useState(initial),
    [notice, setNotice] = useState('');
  return (
    <>
      <Text variant="titleLarge" accessibilityRole="header">
        Message updates
      </Text>
      <List.Item
        title="In-app notifications"
        description="Keep new activity in your notification list"
        right={() => (
          <Switch
            accessibilityLabel="In-app notifications"
            value={value.inAppAlerts}
            disabled={action.busy}
            onValueChange={(inAppAlerts) =>
              setValue((v) => ({
                ...v,
                inAppAlerts,
                pushAlerts: inAppAlerts ? v.pushAlerts : false,
              }))
            }
          />
        )}
      />
      <List.Item
        title="Push alerts"
        description="Generic alerts without private message content"
        right={() => (
          <Switch
            accessibilityLabel="Push alerts"
            disabled={action.busy || !value.inAppAlerts}
            value={value.pushAlerts}
            onValueChange={(pushAlerts) =>
              setValue((v) => ({ ...v, pushAlerts }))
            }
          />
        )}
      />
      <Text>
        Turning alerts off does not cancel scheduled messages or stop inbox
        delivery. Existing notifications stay available.
      </Text>
      <Divider />
      <Text variant="titleLarge" accessibilityRole="header">
        New phone recipients
      </Text>
      <RadioButton.Group
        value={value.defaultPhoneChannel}
        onValueChange={(channel) =>
          setValue((v) => ({
            ...v,
            defaultPhoneChannel: channel === 'SMS' ? 'SMS' : 'WHATSAPP',
          }))
        }
      >
        <RadioButton.Item
          label="WhatsApp"
          value="WHATSAPP"
          disabled={action.busy}
        />
        <RadioButton.Item label="SMS" value="SMS" disabled={action.busy} />
      </RadioButton.Group>
      <Text>
        This preselects the channel for new schedules when available. Every
        recipient still needs review and consent. Saved schedules keep their
        original choices.
      </Text>
      <Text>
        No automatic fallback: if a channel fails, Dearly does not send through
        a second channel.
      </Text>
      <AppButton
        mode="contained"
        loading={action.busy}
        disabled={action.busy}
        onPress={() => {
          void action.run(async () => {
            await createNotificationService(session).save(value);
            setNotice('Preferences saved.');
          });
        }}
      >
        Save preferences
      </AppButton>
      <AppButton
        disabled={action.busy || !value.pushAlerts}
        onPress={() => {
          void action.run(async () => {
            await createNotificationService(session).save(value);
            setNotice(await registerPush(session, true));
          });
        }}
      >
        Enable push on this device
      </AppButton>
      <AppButton
        onPress={() => {
          void Linking.openSettings().catch(() =>
            setNotice(
              'Open your phone Settings to change notification permission.',
            ),
          );
        }}
      >
        Open phone settings
      </AppButton>
      {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
      {action.error ? (
        <Text accessibilityRole="alert">{action.error}</Text>
      ) : null}
      <Divider />
      <Text variant="titleLarge" accessibilityRole="header">
        Your account
      </Text>
      <AppButton onPress={() => router.push('/profile')}>
        Edit profile and timezone
      </AppButton>
      <AppButton
        onPress={() => {
          void action.run(() => session.logout());
        }}
      >
        Sign out on this device
      </AppButton>
    </>
  );
}
export default function SettingsScreen() {
  const { session } = useAuth();
  const api = useMemo(() => createNotificationService(session), [session]);
  const { data, loading, error, refresh } = useFocusedResource(
    useCallback((signal) => api.preferences(signal), [api]),
  );
  return (
    <Screen>
      <Text variant="headlineMedium" accessibilityRole="header">
        Settings
      </Text>
      {data ? (
        <SettingsForm initial={data} />
      ) : (
        <StateView
          loading={loading}
          title={loading ? 'Loading preferences' : 'Preferences unavailable'}
          description={error || 'Checking your saved settings.'}
          actionLabel={!loading ? 'Try again' : undefined}
          onAction={() => {
            void refresh();
          }}
        />
      )}
    </Screen>
  );
}
