# BERMAN BOT COMPLETO

## Subir
npm install
npm start
Abra http://localhost:3000 - o painel e o servidor sao o MESMO lugar.

## Render
- Suba esta pasta no GitHub
- Render > New Web Service > Start: npm start
- Env: OPENAI_API_KEY, META_AI_API_KEY, WEBHOOK_SECRET=berman-123, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
- Abra a URL do Render: o painel ja abre conectado. Clique CONECTAR com campo vazio.

## TradingView
Webhook: https://SUA-URL.onrender.com/webhook/tradingview
Header x-webhook-secret: berman-123

## Regra
Sem chave = bloqueia e avisa SEM_CHAVE. So libera Meta ✅ + ChatGPT ✅ + Berman ✅.
