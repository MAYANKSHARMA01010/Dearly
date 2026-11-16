import { Button } from 'react-native-paper';
import { layout } from '../../theme';

/** @param {import('react').ComponentProps<typeof Button>} props */
export default function AppButton({ contentStyle, ...props }) {
  return <Button {...props} contentStyle={[{ minHeight: layout.minimumTouchTarget }, contentStyle]} />;
}
