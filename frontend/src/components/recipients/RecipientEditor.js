import { useState } from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import AppButton from '../common/AppButton';
import AppTextField from '../forms/AppTextField';
import CountryPicker from '../forms/CountryPicker';
import { normalizeRecipient, recipientKey } from '../../services/drafts/contracts';
import { spacing } from '../../theme';

/** @typedef {import('../../services/drafts/contracts').Recipient} Recipient */
/** @param {{ recipients: Recipient[], ownerId: string, onChange: (recipients: Recipient[]) => void, onEntryChange: (pending: boolean) => void, disabled?: boolean }} props */
export default function RecipientEditor({ recipients, ownerId, onChange, onEntryChange, disabled }) {
  const theme = useTheme();
  const [type, setType] = useState(/** @type {'PHONE'|'EMAIL'|'USER'|null} */ (null));
  const [value, setValue] = useState(''); const [label, setLabel] = useState('');
  const [country, setCountry] = useState(/** @type {import('libphonenumber-js').CountryCode} */ ('IN'));
  const [error, setError] = useState('');
  /** @param {Recipient} recipient */
  const add = (recipient) => {
    try {
      if (recipients.length >= 50) throw new Error('Choose up to 50 recipients.');
      const normalized = normalizeRecipient(recipient, ownerId);
      if (recipients.some((r) => recipientKey(r, ownerId) === recipientKey(normalized, ownerId))) throw new Error('This recipient is already added.');
      onChange([...recipients, normalized]); setValue(''); setLabel(''); setType(null); onEntryChange(false); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check this recipient.'); }
  };
  /** @param {Recipient} r */
  const destination = (r) => r.type === 'SELF' ? 'Me' : r.type === 'PHONE' ? r.phone : r.type === 'EMAIL' ? r.email : r.unavailable ? 'Account unavailable — remove or replace' : `Dearly ID: ${r.userId}`;
  return <View style={{ gap: spacing.md }}>
    <Text variant="titleLarge" accessibilityRole="header">Recipients ({recipients.length}/50)</Text>
    {!recipients.length ? <Text variant="bodyMedium">Add someone now, or leave recipients empty while you draft.</Text> : null}
    {recipients.map((r, index) => <View key={`${recipientKey(r, ownerId)}:${index}`} style={{ gap: spacing.sm }}>
      <Text variant="titleMedium">{r.label || destination(r)}</Text>
      {r.label ? <Text>{destination(r)}</Text> : null}
      <AppButton disabled={disabled} accessibilityLabel={`Remove recipient ${r.label || destination(r)}`} onPress={() => onChange(recipients.filter((_, i) => i !== index))}>Remove</AppButton>
    </View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      <AppButton mode="outlined" disabled={disabled} onPress={() => add({ type: 'SELF' })}>Add myself</AppButton>
      {/** @type {const} */ (['PHONE', 'EMAIL', 'USER']).map((kind) => <AppButton mode="outlined" key={kind} disabled={disabled || type !== null} onPress={() => { setType(kind); onEntryChange(true); setValue(''); setLabel(''); setError(''); }}>
        {kind === 'PHONE' ? 'Add phone' : kind === 'EMAIL' ? 'Add email' : 'Add Dearly user'}
      </AppButton>)}
    </View>
    {type ? <View style={{ gap: spacing.md }}>
      <Text>Add or cancel this recipient before saving the draft.</Text>
      {type === 'PHONE' ? <CountryPicker value={country} onChange={setCountry} disabled={disabled} /> : null}
      <AppTextField label={type === 'PHONE' ? 'Recipient phone number' : type === 'EMAIL' ? 'Recipient email' : 'Dearly account ID'} value={value} onChangeText={setValue}
        keyboardType={type === 'PHONE' ? 'phone-pad' : type === 'EMAIL' ? 'email-address' : 'default'} autoCapitalize="none" autoCorrect={false}
        maxLength={type === 'PHONE' ? 32 : type === 'EMAIL' ? 254 : 36} disabled={disabled} />
      {type === 'USER' ? <Text variant="bodyMedium">Ask them to share their Dearly ID from their profile. No contact search is performed.</Text> : null}
      <AppTextField label="Recipient name (optional)" value={label} onChangeText={setLabel} maxLength={80} disabled={disabled} />
      <AppButton mode="contained" disabled={disabled || !value.trim()} onPress={() => add(type === 'PHONE' ? { type, phone: value, country, label } : type === 'EMAIL' ? { type, email: value, label } : { type, userId: value.trim(), label })}>Add recipient</AppButton>
      <AppButton disabled={disabled} onPress={() => { setType(null); onEntryChange(false); setError(''); }}>Cancel recipient</AppButton>
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text> : null}
    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Drafts stay private. Adding a recipient does not send or share this message.</Text>
  </View>;
}
