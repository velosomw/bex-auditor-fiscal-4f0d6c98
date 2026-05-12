/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_brand.ts'

interface EmailChangeEmailProps {
  siteName: string
  siteUrl?: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteUrl, oldEmail, newEmail, confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme a alteração do seu e-mail na BEx Auditoria</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandMark}>BEx Auditoria</Text>
          <Text style={styles.brandTagline}>Alteração de e-mail da conta</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirme a alteração de e-mail</Heading>
          <Text style={styles.text}>
            Recebemos uma solicitação para alterar o e-mail da sua conta na BEx Auditoria de{' '}
            <Link href={`mailto:${oldEmail}`} style={styles.link}>{oldEmail}</Link>{' '}
            para{' '}
            <Link href={`mailto:${newEmail}`} style={styles.link}>{newEmail}</Link>.
          </Text>
          <Text style={styles.text}>
            Clique no botão abaixo para confirmar a alteração:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Confirmar alteração
          </Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            Se você não solicitou esta alteração, proteja sua conta imediatamente alterando sua senha
            e contate nosso suporte.
          </Text>
        </Section>
        <Section style={styles.footerStrip}>
          © {new Date().getFullYear()} BEx Auditoria · <Link href={siteUrl || 'https://bexbrasil.online'} style={{ color: '#5b6478' }}>bexbrasil.online</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
