

# Plano: Reforco de Seguranca contra Bots e Scraping

## Objetivo
Proteger o site contra bots de scraping, tentativas de copia de codigo-fonte e analise automatizada da plataforma.

## Alteracoes Planejadas

### 1. Atualizar `robots.txt` - Restringir acesso de bots
Permitir apenas bots de busca conhecidos (Google, Bing) e redes sociais (para previews de links). Bloquear todos os outros bots e scrapers, incluindo bots de IA (GPTBot, CCBot, etc.). Proteger rotas sensitiveis como `/dashboard`, `/audit`, `/login`, `/gestor-ia`.

### 2. Adicionar meta tags de seguranca no `index.html`
- `X-Robots-Tag` via meta para controlar indexacao
- Content Security Policy basica via meta tag
- Referrer Policy restritiva
- Desabilitar cache de paginas sensiveis

### 3. Criar script de protecao anti-scraping (`src/lib/security.ts`)
Funcoes para:
- **Desabilitar clique direito** (context menu) em areas sensiveis
- **Bloquear atalhos de teclado** como Ctrl+U (ver codigo), Ctrl+S (salvar), Ctrl+Shift+I (DevTools), F12
- **Desabilitar selecao de texto** via CSS em conteudo sensivel
- **Detectar DevTools aberto** e exibir alerta

### 4. Adicionar CSS anti-copia no `src/index.css`
- `user-select: none` em areas de conteudo sensivel da plataforma (dashboard, auditoria)
- `-webkit-print-color-adjust` para dificultar impressao
- Desabilitar arrastar imagens

### 5. Integrar protecoes no `src/main.tsx`
Importar e ativar as funcoes de seguranca no carregamento inicial da aplicacao.

---

## Detalhes Tecnicos

### robots.txt atualizado
```text
User-agent: Googlebot
Allow: /
Disallow: /dashboard
Disallow: /audit
Disallow: /login
Disallow: /user
Disallow: /gestor-ia
Disallow: /modelo-matematico
Disallow: /select-role

User-agent: Bingbot
Allow: /
Disallow: /dashboard
Disallow: /audit
Disallow: /login
Disallow: /user
Disallow: /gestor-ia

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: *
Disallow: /dashboard
Disallow: /audit
Disallow: /login
Disallow: /user
Disallow: /gestor-ia
Disallow: /modelo-matematico
```

### Meta tags de seguranca
- `<meta name="robots" content="noarchive, noimageindex">`
- `<meta http-equiv="X-Content-Type-Options" content="nosniff">`
- `<meta name="referrer" content="strict-origin-when-cross-origin">`

### Script de protecao
- Event listeners para `contextmenu`, `keydown` (F12, Ctrl+U, Ctrl+Shift+I/J/C)
- CSS classes utilitarias para `no-select`, `no-drag`, `no-print`

### Arquivos afetados
- `public/robots.txt` - Restringir bots
- `index.html` - Meta tags de seguranca
- `src/lib/security.ts` - Novo arquivo com funcoes de protecao
- `src/index.css` - Classes CSS anti-copia
- `src/main.tsx` - Ativar protecoes

