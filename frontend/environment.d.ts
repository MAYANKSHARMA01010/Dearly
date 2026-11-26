// NativeWind loads CSS for Metro; it has no JavaScript exports to typecheck.
declare module '*.css';

// Metro bundles static PNG imports as native image sources.
declare module '*.png' {
  const source: import('react-native').ImageSourcePropType;
  export default source;
}
