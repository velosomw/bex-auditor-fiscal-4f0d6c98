/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_brand.ts'

interface ReauthenticationEmailProps {
  token: string
  siteUrl?: string
}

export const ReauthenticationEmail = ({ token, siteUrl }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação BEx Auditoria</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandMark}>BEx Auditoria</Text>
          <Text style={styles.brandTagline}>Código de verificação</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirme sua identidade</Heading>
          <Text style={styles.text}>
            Use o código abaixo para confirmar sua identidade na plataforma BEx Auditoria:
          </Text>
          <Text style={styles.code}>{token}</Text>
          <Text style={styles.footer}>
            Este código expira em alguns minutos. Se você não solicitou esta verificação,
            ignore este e-mail e considere alterar sua senha.
          </Text>
        </Section>
        <Section style={styles.footerStrip}>
          © {new Date().getFullYear()} BEx Auditoria · <Link href={siteUrl || 'https://bexbrasil.online'} style={{ color: '#5b6478' }}>bexbrasil.online</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
