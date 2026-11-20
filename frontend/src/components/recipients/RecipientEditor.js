import { useState } from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import AppButton from '../common/AppButton';
import AppTextField from '../forms/AppTextField';
import CountryPicker from '../forms/CountryPicker';
import { saveRecipient, recipientKey } from '../../services/drafts/contracts';
import { spacing } from '../../theme';

/** @typedef {import('../../services/drafts/contracts').Recipient} Recipient */
/** @param {{ recipients: Recipient[], ownerId: string, onChange: (recipients: Recipient[]) => void, onEntryChange: (pending: boolean) => void, disabled?: boolean }} props */
export default function RecipientEditor({ recipients, ownerId, onChange, onEntryChange, disabled }) {
  const theme = useTheme();
  const [type, setType] = useState(/** @type {'SELF'|'PHONE'|'EMAIL'|'USER'|null} */ (null));
  const [value, setValue] = useState(''); const [label, setLabel] = useState('');
  const [country, setCountry] = useState(/** @type {import('libphonenumber-js').CountryCode} */ ('IN'));
  const [error, setError] = useState('');
  const [editingIndex, setEditingIndex] = useState(/** @type {number|null} */ (null));
  const closeEntry = () => { setType(null); setEditingIndex(null); setValue(''); setLabel(''); setError(''); onEntryChange(false); };
  /** @param {Recipient} recipient @param {number} index */
  const edit = (recipient, index) => {
    setEditingIndex(index); setType(recipient.type); setLabel(recipient.label ?? '');
    setValue(recipient.type === 'PHONE' ? recipient.phone ?? '' : recipient.type === 'EMAIL' ? recipient.email ?? '' : recipient.type === 'USER' ? recipient.userId ?? '' : '');
    setCountry(recipient.country ?? 'IN'); setError(''); onEntryChange(true);
  };
  /** @param {Recipient} recipient */
  const add = (recipient) => {
    try {
      onChange(saveRecipient(recipients, recipient, ownerId, editingIndex)); closeEntry();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check this recipient.'); }
  };
  /** @param {Recipient} r */
  const destination = (r) => r.type === 'SELF' ? 'Me' : r.type === 'PHONE' ? r.phone : r.type === 'EMAIL' ? r.email : r.unavailable ? 'Account unavailable — remove or replace' : `Dearly ID: ${r.userId}`;
  const entryForm = type ? <View style={{ gap: spacing.md }}>
      <Text variant="titleMedium">{editingIndex === null ? 'Add recipient' : 'Edit recipient'}</Text>
      <Text>{editingIndex === null ? 'Add or cancel this recipient before saving the draft.' : 'Update or cancel this edit, then save the draft to keep your changes.'}</Text>
      {type === 'PHONE' ? <CountryPicker value={country} onChange={setCountry} disabled={disabled} /> : null}
      {type !== 'SELF' ? <AppTextField label={type === 'PHONE' ? 'Recipient phone number' : type === 'EMAIL' ? 'Recipient email' : 'Dearly account ID'} value={value} onChangeText={setValue}
        keyboardType={type === 'PHONE' ? 'phone-pad' : type === 'EMAIL' ? 'email-address' : 'default'} autoCapitalize="none" autoCorrect={false}
        maxLength={type === 'PHONE' ? 32 : type === 'EMAIL' ? 254 : 36} disabled={disabled} /> : <Text>Yourself uses your signed-in Dearly account. You can change the display name below.</Text>}
      {type === 'USER' ? <Text variant="bodyMedium">Ask them to share their Dearly ID from their profile. No contact search is performed.</Text> : null}
      <AppTextField label="Recipient name (optional)" value={label} onChangeText={setLabel} maxLength={80} disabled={disabled} />
      <AppButton mode="contained" disabled={disabled || (type !== 'SELF' && !value.trim())} onPress={() => add(type === 'SELF' ? { type, label } : type === 'PHONE' ? { type, phone: value, country, label } : type === 'EMAIL' ? { type, email: value, label } : { type, userId: value.trim(), label })}>{editingIndex === null ? 'Add recipient' : 'Update recipient'}</AppButton>
      <AppButton disabled={disabled} onPress={closeEntry}>{editingIndex === null ? 'Cancel recipient' : 'Cancel edit'}</AppButton>
      {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text> : null}
    </View> : null;
  return <View style={{ gap: spacing.md }}>
    <Text variant="titleLarge" accessibilityRole="header">Recipients ({recipients.length}/50)</Text>
    {!recipients.length ? <Text variant="bodyMedium">Add someone now, or leave recipients empty while you draft.</Text> : null}
    {recipients.map((r, index) => <View key={`${recipientKey(r, ownerId)}:${index}`} style={{ gap: spacing.sm }}>
      <Text variant="titleMedium">{r.label || destination(r)}</Text>
      {r.label ? <Text>{destination(r)}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <AppButton icon="pencil-outline" disabled={disabled || type !== null} accessibilityLabel={`Edit recipient ${r.label || destination(r)}`} onPress={() => edit(r, index)}>Edit</AppButton>
      <AppButton disabled={disabled || type !== null} accessibilityLabel={`Remove recipient ${r.label || destination(r)}`} onPress={() => onChange(recipients.filter((_, i) => i !== index))}>Remove</AppButton>
      </View>
      {editingIndex === index ? entryForm : null}
    </View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      <AppButton mode="outlined" disabled={disabled || type !== null} onPress={() => add({ type: 'SELF' })}>Add myself</AppButton>
      {/** @type {const} */ (['PHONE', 'EMAIL', 'USER']).map((kind) => <AppButton mode="outlined" key={kind} disabled={disabled || type !== null} onPress={() => { setEditingIndex(null); setType(kind); onEntryChange(true); setValue(''); setLabel(''); setError(''); }}>
        {kind === 'PHONE' ? 'Add phone' : kind === 'EMAIL' ? 'Add email' : 'Add Dearly user'}
      </AppButton>)}
    </View>
    {editingIndex === null ? entryForm : null}
    {!type && error ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{error}</Text> : null}
    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Drafts stay private. Adding a recipient does not send or share this message.</Text>
  </View>;
}
