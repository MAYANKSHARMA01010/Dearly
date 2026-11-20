import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min';
import countryNames from 'i18n-iso-countries/langs/en.json';
import { List, Modal, Portal, Searchbar, Text, useTheme } from 'react-native-paper';
import AppButton from '../common/AppButton';
import { spacing } from '../../theme';

const names = /** @type {Record<string, string | string[]>} */ (countryNames.countries);
const extraNames = /** @type {Record<string, string>} */ ({ AC: 'Ascension Island', TA: 'Tristan da Cunha', XK: 'Kosovo' });
const countries = getCountries().map((code) => {
  const name = names[code] ?? extraNames[code] ?? code;
  return { code, name: Array.isArray(name) ? name[0] : name, calling: getCountryCallingCode(code) };
})
  .sort((a, b) => a.name.localeCompare(b.name));
/** @param {{ value: import('libphonenumber-js').CountryCode, onChange: (country: import('libphonenumber-js').CountryCode) => void, disabled?: boolean }} props */
export default function CountryPicker({ value, onChange, disabled }) {
  const [visible, setVisible] = useState(false); const [search, setSearch] = useState(''); const theme = useTheme();
  const selected = countries.find((c) => c.code === value);
  return <>
    <AppButton mode="outlined" icon="chevron-down" contentStyle={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }} style={{ borderRadius: 12 }} disabled={disabled} accessibilityLabel={`Country: ${selected?.name}, plus ${selected?.calling}`} onPress={() => { setSearch(''); setVisible(true); }}>
      {selected?.name} (+{selected?.calling})
    </AppButton>
    <Portal><Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={{ margin: spacing.lg, padding: spacing.lg, backgroundColor: theme.colors.surface, borderRadius: 12, maxHeight: '80%' }}>
      <View style={{ gap: spacing.md }}>
        <Text variant="titleLarge" accessibilityRole="header">Choose your country</Text>
        <Searchbar placeholder="Search countries" accessibilityLabel="Search countries" value={search} onChangeText={setSearch} autoCapitalize="none" />
        <FlatList style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled" data={countries.filter((c) => `${c.name} ${c.code} +${c.calling}`.toLowerCase().includes(search.toLowerCase()))}
          keyExtractor={(item) => item.code} renderItem={({ item }) => <List.Item title={item.name} description={`+${item.calling}`} accessibilityRole="button"
            accessibilityLabel={`${item.name}, plus ${item.calling}`} onPress={() => { onChange(item.code); setVisible(false); }} />} />
        <AppButton onPress={() => setVisible(false)}>Cancel</AppButton>
      </View>
    </Modal></Portal>
  </>;
}
