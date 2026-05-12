/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_brand.ts'

interface MagicLinkEmailProps {
  siteName: string
  siteUrl?: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteUrl, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu link de acesso à BEx Auditoria</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandMark}>BEx Auditoria</Text>
          <Text style={styles.brandTagline}>Acesso seguro · sem senha</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Seu link de acesso</Heading>
          <Text style={styles.text}>
            Use o botão abaixo para entrar na plataforma BEx Auditoria. O link é pessoal,
            de uso único e expira em alguns minutos.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Entrar na plataforma
          </Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            Se você não solicitou este link, ignore este e-mail com segurança.
          </Text>
        </Section>
        <Section style={styles.footerStrip}>
          © {new Date().getFullYear()} BEx Auditoria · <Link href={siteUrl || 'https://bexbrasil.online'} style={{ color: '#5b6478' }}>bexbrasil.online</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
