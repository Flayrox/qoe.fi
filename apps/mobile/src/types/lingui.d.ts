// Type declarations for compiled Lingui catalogs (mirrors
// packages/i18n/src/catalog.d.ts, needed in the mobile program for
// relative *.js catalog imports pulled in from @qoe/i18n).
declare module '*.js' {
  const content: {
    messages: Record<string, string>;
  };
  export default content;
}
