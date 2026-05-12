import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { DynamicEmail, type BrandConfig, type TemplateContent } from '../_shared/email-templates/dynamic.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SAMPLE = {
  recipient: 'usuario@exemplo.com',
  oldEmail: 'antigo@exemplo.com',
  newEmail: 'novo@exemplo.com',
  confirmationUrl: 'https://bexbrasil.online/confirmar?token=demo',
  token: '482931',
}

function interpolate(s: string): string {
  return (s || '')
    .replaceAll('{{recipient}}', SAMPLE.recipient)
    .replaceAll('{{oldEmail}}', SAMPLE.oldEmail)
    .replaceAll('{{newEmail}}', SAMPLE.newEmail)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    )
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json().catch(() => ({}))
    const brand = body.brand as BrandConfig
    const content = body.content as TemplateContent
    const templateType = String(body.template_type ?? 'signup')

    if (!brand || !content) {
      return new Response(JSON.stringify({ error: 'Missing brand or content' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const interpolated: TemplateContent = {
      ...content,
      preview_text: interpolate(content.preview_text),
      header_subtitle: interpolate(content.header_subtitle),
      heading: interpolate(content.heading),
      intro_html: interpolate(content.intro_html),
      body_html: interpolate(content.body_html),
      footer_html: interpolate(content.footer_html),
    }

    const html = await renderAsync(
      React.createElement(DynamicEmail, {
        brand,
        content: interpolated,
        confirmationUrl: templateType === 'reauthentication' ? undefined : SAMPLE.confirmationUrl,
        token: templateType === 'reauthentication' ? SAMPLE.token : undefined,
      })
    )

    return new Response(html, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Render error'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
