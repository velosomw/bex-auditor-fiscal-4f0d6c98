// Shared brand tokens for BEx Auditoria auth emails.
// Keep aligned with src/index.css design tokens.

export const LOGO_URL =
  'https://mrvizydgxysaxazhmfqk.supabase.co/storage/v1/object/public/email-assets/logo-bex.jpeg'

export const brand = {
  navy: '#121f3a',          // hsl(222, 47%, 14%) — Deep Navy
  navyDark: '#0a1226',
  blue: '#1a7af0',          // hsl(217, 91%, 50%) — Vibrant Blue
  blueDark: '#0f5fc7',
  text: '#1c2540',
  muted: '#5b6478',
  border: '#e3e7ef',
  bgSoft: '#f4f6fa',
  white: '#ffffff',
  fontHeading:
    "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif",
  fontBody:
    "Inter, 'Segoe UI', Helvetica, Arial, sans-serif",
}

export const styles = {
  main: {
    backgroundColor: brand.white,
    fontFamily: brand.fontBody,
    margin: 0,
    padding: '32px 0',
  },
  container: {
    width: '100%',
    maxWidth: '560px',
    margin: '0 auto',
    backgroundColor: brand.white,
    border: `1px solid ${brand.border}`,
    borderRadius: '14px',
    overflow: 'hidden',
  },
  header: {
    background: `linear-gradient(135deg, ${brand.navy} 0%, #1c2c52 100%)`,
    padding: '28px 32px',
    textAlign: 'center' as const,
  },
  logo: {
    width: '64px',
    height: '64px',
    borderRadius: '12px',
    margin: '0 auto 14px',
    display: 'block',
  },
  brandMark: {
    color: brand.white,
    fontFamily: brand.fontHeading,
    fontSize: '20px',
    fontWeight: 800 as const,
    letterSpacing: '0.5px',
    margin: 0,
  },
  brandTagline: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '12px',
    margin: '6px 0 0',
    letterSpacing: '1.2px',
    textTransform: 'uppercase' as const,
  },
  body: { padding: '36px 32px 28px' },
  h1: {
    fontFamily: brand.fontHeading,
    fontSize: '22px',
    fontWeight: 700 as const,
    color: brand.text,
    margin: '0 0 18px',
  },
  text: {
    fontSize: '15px',
    color: brand.muted,
    lineHeight: '1.6',
    margin: '0 0 20px',
  },
  link: { color: brand.blue, textDecoration: 'underline' },
  button: {
    background: `linear-gradient(135deg, ${brand.blue} 0%, ${brand.blueDark} 100%)`,
    color: brand.white,
    fontSize: '15px',
    fontWeight: 600 as const,
    borderRadius: '10px',
    padding: '14px 28px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  divider: {
    borderTop: `1px solid ${brand.border}`,
    margin: '28px 0 20px',
  },
  footer: {
    fontSize: '12px',
    color: '#8a93a6',
    lineHeight: '1.5',
    margin: 0,
  },
  footerStrip: {
    backgroundColor: brand.bgSoft,
    padding: '18px 32px',
    textAlign: 'center' as const,
    fontSize: '11px',
    color: '#8a93a6',
  },
  code: {
    fontFamily: "'Courier New', monospace",
    fontSize: '28px',
    fontWeight: 700 as const,
    color: brand.navy,
    letterSpacing: '6px',
    backgroundColor: brand.bgSoft,
    border: `1px solid ${brand.border}`,
    borderRadius: '10px',
    padding: '16px 20px',
    textAlign: 'center' as const,
    margin: '0 0 24px',
    display: 'block',
  },
}
