/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles, LOGO_URL } from './_brand.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme seu e-mail para acessar a BEx Auditoria</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={LOGO_URL} alt="BEx Auditoria" width="64" height="64" style={styles.logo} />
          <Text style={styles.brandMark}>BEx Auditoria</Text>
          <Text style={styles.brandTagline}>Inteligência Financeira · Auditor Contábil Sênior IA</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirme seu e-mail</Heading>
          <Text style={styles.text}>
            Recebemos sua solicitação de cadastro na plataforma BEx Auditoria com o e-mail{' '}
            <Link href={`mailto:${recipient}`} style={styles.link}>{recipient}</Link>.
          </Text>
          <Text style={styles.text}>
            Para ativar seu acesso ao painel de Contabilidade — onde você poderá cadastrar empresas
            vinculadas e executar auditorias com nossa IA — confirme seu e-mail clicando no botão abaixo:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Confirmar e-mail e acessar
          </Button>
          <div style={styles.divider} />
          <Text style={styles.footer}>
            Este link é válido por 24 horas. Se você não solicitou este cadastro, ignore esta mensagem
            com segurança — nenhuma conta será criada.
          </Text>
        </Section>
        <Section style={styles.footerStrip}>
          © {new Date().getFullYear()} BEx Auditoria · <Link href={siteUrl} style={{ color: '#5b6478' }}>bexbrasil.online</Link>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
