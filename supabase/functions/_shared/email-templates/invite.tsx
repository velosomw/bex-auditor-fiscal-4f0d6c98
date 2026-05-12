/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles, LOGO_URL } from './_brand.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para a BEx Auditoria</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.brandMark}>BEx Auditoria</Text>
          <Text style={styles.brandTagline}>Convite de acesso à plataforma</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Você foi convidado</Heading>
          <Text style={styles.text}>
            Um administrador da{' '}
            <Link href={siteUrl} style={styles.link}><strong>BEx Auditoria</strong></Link>{' '}
            convidou você para acessar a plataforma de auditoria inteligente.
          </Text>
          <Text style={styles.text}>
            Aceite o convite, defina sua senha e comece a usar os relatórios Kanitz, BEx Solvência
            e BEx-RJ junto ao nosso Auditor Contábil Sênior IA.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Aceitar convite
          </Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            Se você não esperava este convite, pode ignorar esta mensagem com segurança.
          </Text>
        </Section>
        <Section style={styles.footerStrip}>
          © {new Date().getFullYear()} BEx Auditoria · <Link href={siteUrl} style={{ color: '#5b6478' }}>bexbrasil.online</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
