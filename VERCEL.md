# Deploy na Vercel

## Variaveis de ambiente

Configure no painel da Vercel em `Project Settings > Environment Variables`:

```env
FORTPAY_API_TOKEN=seu_token_da_fortpay
FORTPAY_OFFER_HASH=hash_da_oferta
FORTPAY_PRODUCT_HASH=hash_do_produto
FORTPAY_PRODUCT_TITLE=Pagamento PIX
PIX_AMOUNT=500
ADMIN_TOKEN=senha_forte_para_o_painel_admin
```

`PIX_AMOUNT` e o valor fixo usado em producao quando nao houver Vercel KV.

## Painel admin em producao

Na Vercel, arquivos locais nao devem ser usados como banco de dados. Por isso:

- sem Vercel KV, altere o valor pelo `PIX_AMOUNT` no painel da Vercel;
- com Vercel KV, configure tambem:

```env
KV_REST_API_URL=sua_url_do_kv
KV_REST_API_TOKEN=seu_token_do_kv
```

Com KV e `ADMIN_TOKEN` configurados, o `/admin.html` consegue salvar o valor online. Sem `ADMIN_TOKEN`, alteracoes no valor ficam bloqueadas em producao.

## Rotas

- Checkout: `/`
- Admin: `/admin.html`
- Gerar Pix: `/api/pix`
- Configuracao do valor: `/api/settings`

## Teste local

```powershell
npm run check
node server.js
```
