import { useState } from 'react';
import { Keyboard } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import AppTextField from '../../components/forms/AppTextField';
import { useAuth } from '../../context/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';

export default function ProfileScreen() {
  const { user, session } = useAuth(); const router = useRouter(); const action = useAsyncAction();
  const [name, setName] = useState(user?.name ?? ''); const [email, setEmail] = useState(user?.email ?? '');
  const [timezone, setTimezone] = useState(user?.name ? user.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [validation, setValidation] = useState(''); const [notice, setNotice] = useState('');
  const save = () => {
    try { new Intl.DateTimeFormat('en', { timeZone: timezone.trim() }); }
    catch { setValidation('Enter a valid timezone, such as Asia/Kolkata.'); return; }
    if (!name.trim()) { setValidation('Enter your name to continue.'); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setValidation('Enter a valid email address or leave it empty.'); return; }
    setValidation(''); setNotice(''); Keyboard.dismiss();
    void action.run(async (signal) => {
      await session.updateProfile({ name: name.trim(), email: email.trim() || null, timezone: timezone.trim() });
      if (signal.aborted) return;
      setNotice('Profile saved.'); if (!user?.name) router.replace('/');
    });
  };
  return <Screen>
    <Text variant="headlineMedium" accessibilityRole="header">{user?.name ? 'Your profile' : 'Make Dearly yours'}</Text>
    <Text variant="bodyLarge">{user?.name ? 'Keep your delivery details up to date.' : 'Add your name and timezone to finish setting up.'}</Text>
    <AppTextField label="Phone number" value={user?.phone ?? ''} editable={false} />
    <AppTextField label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={80} disabled={action.busy} />
    <AppTextField label="Email for delivery (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
      autoCorrect={false} autoComplete="email" textContentType="emailAddress" maxLength={254} disabled={action.busy} />
    <Text variant="bodyMedium">Email is an unverified delivery destination. You always sign in with your phone.</Text>
    <AppTextField label="Timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} maxLength={100} disabled={action.busy} />
    <Text variant="bodyMedium">For example, Asia/Kolkata or Europe/London.</Text>
    {validation || action.error ? <Text accessibilityRole="alert">{validation || action.error}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
    <AppButton mode="contained" onPress={save} loading={action.busy} disabled={action.busy}>Save profile</AppButton>
    <AppButton mode="outlined" disabled={action.busy} onPress={() => { void action.run(async () => { await session.logout(); }); }}>Sign out</AppButton>
  </Screen>;
}
