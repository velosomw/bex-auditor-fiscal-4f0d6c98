/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles, LOGO_URL } from './_brand.ts'

interface RecoveryEmailProps {
  siteName: string
  siteUrl?: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteUrl, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha de acesso à BEx Auditoria</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={LOGO_URL} alt="BEx Auditoria" width="64" height="64" style={styles.logo} />
          <Text style={styles.brandMark}>BEx Auditoria</Text>
          <Text style={styles.brandTagline}>Plataforma Auditoria Inteligente</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Redefinir sua senha</Heading>
          <Text style={styles.text}>
            Recebemos uma solicitação para redefinir a senha da sua conta na BEx Auditoria.
            Clique no botão abaixo para escolher uma nova senha:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Redefinir senha
          </Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            Por segurança, este link expira em breve. Se você não solicitou a redefinição, ignore
            este e-mail — sua senha permanecerá inalterada.
          </Text>
        </Section>
        <Section style={styles.footerStrip}>
          © {new Date().getFullYear()} BEx Auditoria · <Link href={siteUrl || 'https://bexbrasil.online'} style={{ color: '#5b6478' }}>bexbrasil.online</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
