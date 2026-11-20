import { useCallback, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { Text, Switch, List, RadioButton, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useFocusedResource } from '../../hooks/useFocusedResource';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import Screen from '../../components/layout/Screen';
import { InlineNotice, InsetGroup, NavigationRow, ScreenHeading, ScreenSection } from '../../components/layout/ScreenSections';
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
      <ScreenSection title="Message updates">
      <InsetGroup>
      <List.Item accessible={false} titleNumberOfLines={2} descriptionNumberOfLines={3} style={{ minHeight: 80 }}
        title="In-app notifications"
        description="Keep new activity in your notification list"
        right={() => (
          <View style={{ minHeight: 48, minWidth: 48, marginLeft: 16, justifyContent: 'center' }}><Switch
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
          /></View>
        )}
      />
      <List.Item accessible={false} titleNumberOfLines={2} descriptionNumberOfLines={3} style={{ minHeight: 80 }}
        title="Push alerts"
        description="Generic alerts without private message content"
        right={() => (
          <View style={{ minHeight: 48, minWidth: 48, marginLeft: 16, justifyContent: 'center' }}><Switch
            accessibilityLabel="Push alerts"
            disabled={action.busy || !value.inAppAlerts}
            value={value.pushAlerts}
            onValueChange={(pushAlerts) =>
              setValue((v) => ({ ...v, pushAlerts }))
            }
          /></View>
        )}
      />
      </InsetGroup>
      <Text>
        Turning alerts off does not cancel scheduled messages or stop inbox
        delivery. Existing notifications stay available.
      </Text>
      </ScreenSection>
      <ScreenSection title="New phone recipients">
      <InsetGroup>
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
      </InsetGroup>
      <Text>
        This preselects the channel for new schedules when available. Every
        recipient still needs review and consent. Saved schedules keep their
        original choices.
      </Text>
      <Text>
        No automatic fallback: if a channel fails, Dearly does not send through
        a second channel.
      </Text>
      </ScreenSection>
      <AppButton
        icon="content-save-outline" mode="contained"
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
      <ScreenSection title="This device" description="Save your choices, then enable push here. Your phone will ask for permission if needed.">
      <AppButton
        icon="bell-outline" mode="outlined" disabled={action.busy || !value.pushAlerts}
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
      </ScreenSection>
      {notice ? <InlineNotice>{notice}</InlineNotice> : null}
      {action.error ? (
        <InlineNotice error>{action.error}</InlineNotice>
      ) : null}
      <Divider />
      <ScreenSection title="Your account">
      <InsetGroup><NavigationRow title="Profile and timezone" icon="account-outline" onPress={() => router.push('/profile')} /></InsetGroup>
      <AppButton
        onPress={() => {
          void action.run(() => session.logout());
        }}
      >
        Sign out on this device
      </AppButton>
      </ScreenSection>
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
      <ScreenHeading title="Settings" description="Choose how Dearly keeps you updated." />
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
