/**
 * The UI kit — the fixed grammar (UX.md §3).
 *
 * Imported by the app and by modules as `@wbcom/mobile-core/ui`. These are React Native
 * components, so this entry is NOT re-exported from the package's node barrel (index.ts) —
 * it would drag react-native into the node test env. The pure decision functions behind
 * them (resolveButtonTreatment, selectAsyncState) ARE on the node barrel and unit-tested.
 *
 * A module picks from this vocabulary; it never draws its own header, button, or state.
 */

export { Button } from './Button';
export type { ButtonProps } from './Button';
export { AsyncBoundary } from './AsyncBoundary';
export type { AsyncBoundaryProps } from './AsyncBoundary';
export {
  EmptyState,
  ErrorState,
  InlineSpinner,
  OfflineBar,
  OfflineState,
  Skeleton,
} from './states';
export type { EmptyStateProps } from './states';
export { ConfirmSheetProvider, useConfirm } from './ConfirmSheet';
export type { ConfirmOptions } from './ConfirmSheet';
export { ToastProvider, useToast } from './Toast';
export { ActionSheet } from './ActionSheet';
export type { ActionSheetProps, SheetAction } from './ActionSheet';
export { Avatar } from './Avatar';
export type { AvatarProps } from './Avatar';
export { ScreenHeader } from './ScreenHeader';
export type { ScreenHeaderProps } from './ScreenHeader';
export { ListRow } from './ListRow';
export type { ListRowProps } from './ListRow';
export { Badge, Chip } from './Badge';
export type { ChipProps } from './Badge';
export { FormField } from './FormField';
export type { FormFieldProps } from './FormField';
export { OptionCard } from './OptionCard';
export type { OptionCardProps } from './OptionCard';

export type { ButtonVariant } from './buttonStyle';
