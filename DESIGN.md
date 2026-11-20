# Dearly — Native UI refinement

Purpose: private messages composed now and delivered at a chosen future moment.
Refine existing React Native phone screens; preserve the product's familiar violet
identity, account boundaries, working message flows and native navigation.

## Appearance

Follow the device's light/dark appearance. Preserve Material 3 semantic colors.
Light: primary #6750A4, background/surface #FFFBFE, foreground #1C1B1F.
Dark: primary #D0BCFF, background/surface #1C1B1F, foreground #E6E1E5.
Use the matching existing Paper secondary/container/outline/error colors for roles.
Use the accent for the primary action and active/selected states, not decoration.

## Typography and layout

Native system type: platform fonts, regular/medium/semibold hierarchy, scalable
text. Main headings 28–32, section headings 20–22, body 16, supporting text 14.
24-point horizontal phone margins, 16-point within related groups, 24–32 points
between sections. Compact layouts reflow with font scaling and landscape.
Safe-area and keyboard-aware scrolling; readable maximum width 600 points.

## Controls and surfaces

Keep React Native Paper inputs/buttons and Expo Router navigation. Use a minimum
48-point touch target; inputs at least 56 points high. Preserve familiar contained,
outlined and text action hierarchy. Use 12–16-point rounded content surfaces;
buttons can retain the established Material pill shape. Use semantic dividers or
a subtle border rather than combining heavy shadows and borders.
Consistent Material icon family. No decorative emoji, artificial counters,
marketing claims, nested cards or repeated large action buttons for navigation.

## Product hierarchy

One clear primary action per screen. Group mailbox navigation separately from
account settings. Keep edit/confirm/destructive actions unambiguous. Preserve
recipient, channel, timezone, due-time and delivery-outcome distinctions.
Use honest empty/loading/error/offline/stale states and explicit recovery actions.
Real content is account-owned; prototypes use synthetic names and messages only.

## Implementation boundaries

Visual proposals are guidance for native components, not HTML to paste into the
app. Do not change providers, authentication, scheduling, ownership checks or data
contracts while polishing UI. Never embed credentials or private content in design
prompts or render fixtures.
