import { useEffect, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Stack } from 'expo-router';
import { Text, useTheme } from 'react-native-paper';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import Screen from '../../components/layout/Screen';
import AppButton from '../../components/common/AppButton';
import AppTextField from '../../components/forms/AppTextField';
import CountryPicker from '../../components/forms/CountryPicker';
import { authService } from '../../services/auth/authService';
import { useAuth } from '../../context/AuthContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { ApiError } from '../../api/client';
import { spacing } from '../../theme';

export default function LoginScreen() {
  const auth = useAuth(); const theme = useTheme(); const action = useAsyncAction();
  const [country, setCountry] = useState(/** @type {import('libphonenumber-js').CountryCode} */ ('IN'));
  const [phone, setPhone] = useState(''); const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(/** @type {import('../../services/auth/contracts').Challenge | null} */ (null));
  const [now, setNow] = useState(() => Date.now()); const [retryAt, setRetryAt] = useState(0);
  const [fieldError, setFieldError] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const resendSeconds = Math.max(0, Math.ceil((Math.max(challenge?.resendAt ?? 0, retryAt) - now) / 1000));
  const expired = Boolean(challenge && Date.parse(challenge.expiresAt) <= now);
  const request = () => {
    const parsed = parsePhoneNumberFromString(phone.trim(), { defaultCountry: country, extract: false });
    if (!parsed?.isValid() || parsed.country !== country || parsed.ext) { setFieldError('Enter a valid phone number for the selected country.'); return; }
    setFieldError(''); Keyboard.dismiss();
    void action.run(async (signal) => {
      try { const next = await authService.requestOtp(phone.trim(), country, signal); if (!signal.aborted) { setNow(Date.now()); setChallenge(next); } }
      catch (error) { if (error instanceof ApiError && error.status === 429) setRetryAt(Date.now() + (error.retryAfterSeconds ?? 60) * 1000); throw error; }
    });
  };
  const verify = () => {
    if (!challenge || !/^\d{6}$/.test(code) || expired) { setFieldError(expired ? 'This code expired. Request a new one.' : 'Enter the six-digit code.'); return; }
    setFieldError(''); Keyboard.dismiss();
    void action.run(async (signal) => { const response = await authService.verifyOtp(challenge.challengeId, code, signal); if (!signal.aborted) await auth.session.establish(response, signal); });
  };
  const resend = () => {
    if (!challenge || resendSeconds > 0) return;
    setCode(''); setFieldError('');
    void action.run(async (signal) => {
      try { const next = await authService.resendOtp(challenge.challengeId, signal); if (!signal.aborted) { setNow(Date.now()); setChallenge(next); } }
      catch (error) { if (error instanceof ApiError) setRetryAt(Date.now() + (error.retryAfterSeconds ?? 60) * 1000); throw error; }
    });
  };
  return <Screen>
    <Stack.Screen options={{ title: challenge ? 'Verify phone' : 'Sign in', gestureEnabled: !action.busy, headerBackVisible: !action.busy }} />
    <View style={{ gap: spacing.md }}>
      <Text variant="headlineMedium" accessibilityRole="header">{challenge ? 'Enter your code' : 'Your number, your Dearly'}</Text>
      <Text variant="bodyLarge">{challenge ? `Verify ${phone.trim()} to continue.` : 'Sign in or create an account with your phone number.'}</Text>
      {challenge?.channel === 'whatsapp' ? <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Check WhatsApp for your six-digit verification code.</Text> : challenge?.dispatch === 'simulated' ? <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Local test login. No message was sent.</Text> : null}
    </View>
    {!challenge ? <>
      <CountryPicker value={country} onChange={setCountry} disabled={action.busy} />
      <AppTextField label="Phone number" value={phone} onChangeText={(text) => { setPhone(text); setFieldError(''); }} keyboardType="phone-pad"
        textContentType="telephoneNumber" autoComplete="tel" maxLength={32} disabled={action.busy} errorText={fieldError} />
      <AppButton mode="contained" loading={action.busy} disabled={action.busy || !phone.trim() || resendSeconds > 0} onPress={request}>
        {resendSeconds > 0 ? `Try again in ${resendSeconds}s` : 'Get verification code'}
      </AppButton>
    </> : <>
      {challenge.developmentCode ? <Text variant="bodyLarge" selectable accessibilityLabel={`Local test code ${challenge.developmentCode}`}>Local test code: {challenge.developmentCode}</Text> : null}
      <AppTextField label="Verification code" value={code} onChangeText={(text) => { setCode(text.replace(/\D/g, '').slice(0, 6)); setFieldError(''); }}
        keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} disabled={action.busy}
        errorText={fieldError || (expired ? 'This code expired. Request a new code below.' : '')} />
      <Text variant="bodyMedium">{expired ? 'Code expired.' : `Code expires in ${Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 60000))} min.`}</Text>
      <AppButton mode="contained" loading={action.busy} disabled={action.busy || code.length !== 6 || expired} onPress={verify}>Verify and sign in</AppButton>
      <AppButton mode="outlined" disabled={action.busy || resendSeconds > 0} onPress={resend}>{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Request a new code'}</AppButton>
      <AppButton disabled={action.busy} onPress={() => { setChallenge(null); setCode(''); setFieldError(''); action.clearError(); }}>Change phone number</AppButton>
    </>}
    {action.error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{action.error}</Text> : null}
    {auth.message ? <Text accessibilityLiveRegion="polite">{auth.message}</Text> : null}
  </Screen>;
}
