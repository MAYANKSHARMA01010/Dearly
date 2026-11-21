import { useCallback, useEffect, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
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
import { InlineNotice } from '../../components/layout/ScreenSections';

/** @param {{service?:typeof authService}} [props] */
export default function LoginScreen({ service = authService } = {}) {
  const auth = useAuth(); const theme = useTheme(); const action = useAsyncAction();
  const [country, setCountry] = useState(/** @type {import('libphonenumber-js').CountryCode} */ ('IN'));
  const [phone, setPhone] = useState(''); const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(/** @type {import('../../services/auth/contracts').Challenge | null} */ (null));
  const [now, setNow] = useState(() => Date.now()); const [retryAt, setRetryAt] = useState(0);
  const [fieldError, setFieldError] = useState('');
  const [waitingSince, setWaitingSince] = useState(0);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void service.prepareOtp(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [service]));
  const [requestPhase,setRequestPhase] = useState(/** @type {'connecting'|'requesting'|null} */(null));
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const resendSeconds = Math.max(0, Math.ceil((Math.max(challenge?.resendAt ?? 0, retryAt) - now) / 1000));
  const expired = Boolean(challenge && Date.parse(challenge.expiresAt) <= now);
  const request = () => {
    const parsed = parsePhoneNumberFromString(phone.trim(), { defaultCountry: country, extract: false });
    if (!parsed?.isValid() || parsed.country !== country || parsed.ext) { setFieldError('Enter a valid phone number for the selected country.'); return; }
    setFieldError(''); setWaitingSince(Date.now()); Keyboard.dismiss();
    void action.run(async (signal) => {
      try { const next = await service.requestOtp(phone.trim(), country, signal, (phase)=>{if(!signal.aborted)setRequestPhase(phase);}); if (!signal.aborted) { setNow(Date.now()); setChallenge(next); } }
      catch (error) { if (error instanceof ApiError && error.status === 429) setRetryAt(Date.now() + (error.retryAfterSeconds ?? 60) * 1000); throw error; }
    });
  };
  const verify = () => {
    if (!challenge || !/^\d{6}$/.test(code) || expired) { setFieldError(expired ? 'This code expired. Request a new one.' : 'Enter the six-digit code.'); return; }
    setFieldError(''); setRequestPhase(null); Keyboard.dismiss();
    void action.run(async (signal) => { const response = await service.verifyOtp(challenge.challengeId, code, signal); if (!signal.aborted) await auth.session.establish(response, signal); });
  };
  const resend = () => {
    if (!challenge || resendSeconds > 0) return;
    setCode(''); setFieldError(''); setWaitingSince(Date.now());
    void action.run(async (signal) => {
      try { const next = await service.resendOtp(challenge.challengeId, signal, (phase)=>{if(!signal.aborted)setRequestPhase(phase);}); if (!signal.aborted) { setNow(Date.now()); setChallenge(next); } }
      catch (error) { if (error instanceof ApiError) setRetryAt(Date.now() + (error.retryAfterSeconds ?? 60) * 1000); throw error; }
    });
  };
  return <Screen>
    <Stack.Screen options={{ title: challenge ? 'Verify phone' : 'Sign in', gestureEnabled: !action.busy || requestPhase === 'connecting', headerBackVisible: !action.busy || requestPhase === 'connecting' }} />
    <View style={{ gap: spacing.sm, paddingTop: spacing.md }}>
      <Text variant="headlineMedium" accessibilityRole="header" style={{ fontWeight: '600' }}>{challenge ? 'Check your WhatsApp' : 'Your phone number'}</Text>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>{challenge
        ? `Enter the six-digit code for the number ending ${phone.replace(/\D/g, '').slice(-4)}.`
        : 'We’ll send a six-digit code on WhatsApp. The same number signs you in or creates your account.'}</Text>
      {challenge?.dispatch === 'simulated' ? <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Local test login. No message was sent.</Text> : null}
    </View>
    {!challenge ? <View style={{ gap: spacing.md }}>
      <CountryPicker value={country} onChange={setCountry} disabled={action.busy} />
      <AppTextField label="Phone number" value={phone} onChangeText={(text) => { setPhone(text); setFieldError(''); }} keyboardType="phone-pad"
        textContentType="telephoneNumber" autoComplete="tel" maxLength={32} disabled={action.busy} errorText={fieldError} />
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Use a number that has WhatsApp. No password needed.</Text>
      <AppButton mode="contained" loading={action.busy} disabled={action.busy || !phone.trim() || resendSeconds > 0} onPress={request}>
        {action.busy ? requestPhase === 'connecting' ? 'Connecting…' : 'Sending code…' : resendSeconds > 0 ? `Try again in ${resendSeconds}s` : 'Send code on WhatsApp'}
      </AppButton>
    </View> : <View style={{ gap: spacing.md }}>
      {challenge.developmentCode ? <InlineNotice><Text selectable accessibilityLabel={`Local test code ${challenge.developmentCode}`}>Local test code: {challenge.developmentCode}</Text></InlineNotice> : null}
      <AppTextField label="Six-digit code" value={code} onChangeText={(text) => { setCode(text.replace(/\D/g, '').slice(0, 6)); setFieldError(''); }}
        keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} disabled={action.busy}
        contentStyle={{ textAlign: 'center', letterSpacing: 6, fontVariant: ['tabular-nums'] }}
        errorText={fieldError || (expired ? 'This code expired. Request a new code below.' : '')} />
      <Text variant="bodyMedium" style={{ color: expired ? theme.colors.error : theme.colors.onSurfaceVariant }}>{expired ? 'This code has expired. Request a new code.' : `Expires at ${new Date(challenge.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`}</Text>
      <AppButton mode="contained" loading={action.busy && requestPhase === null} disabled={action.busy || code.length !== 6 || expired} onPress={verify}>Continue</AppButton>
      <AppButton mode="text" loading={action.busy && requestPhase !== null} disabled={action.busy || resendSeconds > 0} onPress={resend}>{action.busy && requestPhase ? requestPhase === 'connecting' ? 'Connecting…' : 'Sending code…' : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Request a new code'}</AppButton>
      <AppButton disabled={action.busy} onPress={() => { setChallenge(null); setCode(''); setFieldError(''); action.clearError(); }}>Change phone number</AppButton>
    </View>}
    {action.busy && requestPhase === 'connecting' ? <View style={{ gap: spacing.sm }}>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.onSurfaceVariant }}>{now - waitingSince >= 10000
        ? 'Verification is taking longer than usual to connect. No code has been requested yet.'
        : 'Preparing WhatsApp verification…'}</Text>
      <AppButton onPress={action.cancel}>Stop waiting</AppButton>
    </View> : null}
    {action.error ? <InlineNotice error>{action.error}</InlineNotice> : null}
    {auth.message && !challenge ? <Text accessibilityLiveRegion="polite" variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{auth.message}</Text> : null}
  </Screen>;
}
