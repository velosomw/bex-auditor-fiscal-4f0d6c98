/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'

export interface BrandConfig {
  brand_name: string
  tagline: string
  logo_url: string
  primary_color: string
  primary_color_dark: string
  header_bg_from: string
  header_bg_to: string
  text_color: string
  muted_color: string
  footer_url: string
  footer_label: string
  logo_width?: number
  logo_height?: number
  logo_radius?: number
  logo_align?: 'left' | 'center' | 'right'
  logo_object_fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  logo_show?: boolean
  logo_padding?: number
  logo_bg_color?: string
}

export interface TemplateContent {
  subject: string
  preview_text: string
  header_subtitle: string
  heading: string
  intro_html: string
  body_html: string
  button_label: string
  footer_html: string
}

export interface DynamicEmailProps {
  brand: BrandConfig
  content: TemplateContent
  confirmationUrl?: string
  token?: string
}

const fontHeading = "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif"
const fontBody = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"

// Render an HTML snippet from DB safely-ish: we trust admins editing this content.
const RawHtml = ({ html, style }: { html: string; style?: React.CSSProperties }) => (
  <div style={style} dangerouslySetInnerHTML={{ __html: html }} />
)

export const DynamicEmail = ({ brand, content, confirmationUrl, token }: DynamicEmailProps) => {
  const logoW = brand.logo_width ?? 64
  const logoH = brand.logo_height ?? 64
  const logoR = brand.logo_radius ?? 12
  const logoAlign = brand.logo_align ?? 'center'
  const logoFit = brand.logo_object_fit ?? 'cover'
  const logoPad = brand.logo_padding ?? 0
  const logoBg = brand.logo_bg_color ?? 'transparent'
  const headerTextAlign: 'left' | 'center' | 'right' = logoAlign
  const logoMargin =
    logoAlign === 'center' ? '0 auto 14px' :
    logoAlign === 'right' ? '0 0 14px auto' : '0 0 14px 0'

  const styles = {
    main: { backgroundColor: '#ffffff', fontFamily: fontBody, margin: 0, padding: '32px 0' } as React.CSSProperties,
    container: { width: '100%', maxWidth: '560px', margin: '0 auto', backgroundColor: '#ffffff', border: '1px solid #e3e7ef', borderRadius: '14px', overflow: 'hidden' } as React.CSSProperties,
    header: { background: `linear-gradient(135deg, ${brand.header_bg_from} 0%, ${brand.header_bg_to} 100%)`, padding: '28px 32px', textAlign: headerTextAlign },
    logo: { width: `${logoW}px`, height: `${logoH}px`, borderRadius: `${logoR}px`, margin: logoMargin, display: 'block', objectFit: logoFit, padding: `${logoPad}px`, backgroundColor: logoBg } as React.CSSProperties,
    brandMark: { color: '#ffffff', fontFamily: fontHeading, fontSize: '20px', fontWeight: 800 as const, letterSpacing: '0.5px', margin: 0 } as React.CSSProperties,
    brandTagline: { color: 'rgba(255,255,255,0.7)', fontSize: '12px', margin: '6px 0 0', letterSpacing: '1.2px', textTransform: 'uppercase' as const } as React.CSSProperties,
    body: { padding: '36px 32px 28px' } as React.CSSProperties,
    h1: { fontFamily: fontHeading, fontSize: '22px', fontWeight: 700 as const, color: brand.text_color, margin: '0 0 18px' } as React.CSSProperties,
    text: { fontSize: '15px', color: brand.muted_color, lineHeight: '1.6', margin: '0 0 20px' } as React.CSSProperties,
    button: { background: `linear-gradient(135deg, ${brand.primary_color} 0%, ${brand.primary_color_dark} 100%)`, color: '#ffffff', fontSize: '15px', fontWeight: 600 as const, borderRadius: '10px', padding: '14px 28px', textDecoration: 'none', display: 'inline-block' } as React.CSSProperties,
    divider: { borderTop: '1px solid #e3e7ef', margin: '28px 0 20px' } as React.CSSProperties,
    footer: { fontSize: '12px', color: '#8a93a6', lineHeight: '1.5', margin: 0 } as React.CSSProperties,
    footerStrip: { backgroundColor: '#f4f6fa', padding: '18px 32px', textAlign: 'center' as const, fontSize: '11px', color: '#8a93a6' } as React.CSSProperties,
    code: { fontFamily: "'Courier New', monospace", fontSize: '28px', fontWeight: 700 as const, color: brand.header_bg_from, letterSpacing: '6px', backgroundColor: '#f4f6fa', border: '1px solid #e3e7ef', borderRadius: '10px', padding: '16px 20px', textAlign: 'center' as const, margin: '0 0 24px', display: 'block' } as React.CSSProperties,
    linkBox: { fontSize: '12px', color: brand.muted_color, lineHeight: '1.5', wordBreak: 'break-all' as const, backgroundColor: '#f4f6fa', border: '1px solid #e3e7ef', borderRadius: '8px', padding: '10px 12px', margin: '16px 0 0' } as React.CSSProperties,
  }

  const showLogo = (brand.logo_show ?? true) && !!brand.logo_url

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{content.preview_text}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            {brand.logo_url ? (
              <Img src={brand.logo_url} alt={brand.brand_name} width="64" height="64" style={styles.logo} />
            ) : null}
            <Text style={styles.brandMark}>{brand.brand_name}</Text>
            <Text style={styles.brandTagline}>{content.header_subtitle || brand.tagline}</Text>
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>{content.heading}</Heading>
            {content.intro_html ? <RawHtml html={content.intro_html} style={styles.text} /> : null}
            {content.body_html ? <RawHtml html={content.body_html} style={styles.text} /> : null}
            {token ? <Text style={styles.code}>{token}</Text> : null}
            {confirmationUrl && content.button_label ? (
              <Button style={styles.button} href={confirmationUrl}>{content.button_label}</Button>
            ) : null}
            <div style={styles.divider} />
            <RawHtml html={content.footer_html} style={styles.footer} />
          </Section>
          <Section style={styles.footerStrip}>
            © {new Date().getFullYear()} {brand.brand_name} · <Link href={brand.footer_url} style={{ color: '#5b6478' }}>{brand.footer_label}</Link>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default DynamicEmail
