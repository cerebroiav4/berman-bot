// BERMAN BOT - SERVIDOR REAL
// npm install express
// npm start
// Env: OPENAI_API_KEY, META_AI_API_KEY, META_AI_API_URL, META_AI_MODEL, WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Meta AI real via Llama API (OpenAI-compat): https://api.llama.com/v1/chat/completions - sem chave = bloqueia, nunca finge APROVADO
const express = require('express');
const app = express();
app.use(express.json({limit:'1mb'}));
// CORS - permite o painel buscar /sinais de qualquer origem
app.use((req,res,next)=>{res.header('Access-Control-Allow-Origin','*');res.header('Access-Control-Allow-Headers','Content-Type, x-webhook-secret');res.header('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS') return res.sendStatus(200);next();});
const PAIRS = ["EURUSD","EURGBP","EURJPY","EURCHF","GBPUSD","GBPJPY","GBPCHF","GBPCAD","USDJPY","USDCAD","AUDUSD","AUDJPY","USDCHF","EURNZD","EURCAD","GBPNZD"];
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "berman-123";
let ultimo = {};
let historico = [];

function proximaEntrada(tf){
  const d = new Date(); d.setSeconds(0,0);
  const resto = d.getMinutes() % tf;
  if(resto!==0) d.setMinutes(d.getMinutes() + (tf - resto));
  else d.setMinutes(d.getMinutes() + tf);
  const exp = new Date(d.getTime() + tf*60000);
  const fmt = (x)=> x.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour12:false});
  return {entrada: fmt(d), expiracao: fmt(exp), entradaISO: d.toISOString(), expiracaoISO: exp.toISOString()};
}
function filtroBerman(d){
  const checks = [
    {nome:"Candle fechado / sem repintar", ok:true},
    {nome:"Volume acima da media", ok: Number(d.volume) > Number(d.volMedia||0)},
    {nome:"RSI 30-70", ok: Number(d.rsi)>30 && Number(d.rsi)<70},
    {nome:"Preco compativel com EMA200", ok: d.direcao==="CALL" ? Number(d.preco)>Number(d.ema200) : Number(d.preco)<Number(d.ema200)},
  ];
  const aprovados = checks.filter(c=>c.ok).length;
  return {checks, aprovados, total: checks.length, passou: aprovados===checks.length};
}
async function cerebroChatGPT(prompt){
  const key = process.env.OPENAI_API_KEY;
  if(!key) return {voto:null, motivo:"SEM_CHAVE - ChatGPT nao conectado", simulado:true};
  try{
    const r = await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"user",content:prompt}],temperature:0})});
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content || "";
    return {voto: txt.toUpperCase().includes("APROVADO") ? "APROVADO" : "REPROVADO", motivo: txt.slice(0,300), simulado:false};
  }catch(e){ return {voto:null, motivo:"ERRO_"+e.message, simulado:true}; }
}
async function cerebroMetaAI(prompt){
  const key = process.env.META_AI_API_KEY;
  const url = process.env.META_AI_API_URL || "https://api.llama.com/v1/chat/completions";
  const model = process.env.META_AI_MODEL || "Llama-4-Maverick-17B-128E-Instruct-FP8";
  if(!key) return {voto:null, motivo:"SEM_CHAVE - Meta AI nao conectada. Crie a chave em https://developers.meta.com / Llama API e coloque em META_AI_API_KEY", simulado:true};
  try{
    const r = await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model, messages:[{role:"user",content:prompt}], temperature:0, max_tokens:200})});
    const j = await r.json();
    if(!r.ok) return {voto:null, motivo:"ERRO_META_API_"+r.status+" - "+JSON.stringify(j).slice(0,300), simulado:true};
    const txt = j.choices?.[0]?.message?.content || j.completion_message?.content?.text || "";
    return {voto: String(txt).toUpperCase().includes("APROVADO") ? "APROVADO" : "REPROVADO", motivo: String(txt).slice(0,300), simulado:false, modelo:model};
  }catch(e){ return {voto:null, motivo:"ERRO_"+e.message, simulado:true}; }
}
app.post('/webhook/tradingview', async (req,res)=>{
  const d = req.body || {};
  if(req.headers['x-webhook-secret'] !== WEBHOOK_SECRET && d.secret !== WEBHOOK_SECRET) return res.status(401).json({ok:false, erro:"secret invalido"});
  const par = String(d.par||"").replace("OANDA:","").replace("FX:","").toUpperCase();
  const tf = parseInt(String(d.timeframe||"5").replace("m","")) || 5;
  if(![5,15,30].includes(tf)) return res.json({ok:false, erro:"timeframe deve ser 5,15 ou 30"});
  const chave = par+"_"+d.direcao;
  if(Date.now() - (ultimo[chave]||0) < 15*60*1000) return res.json({ok:false, bloqueado:"DUPLICADO_15MIN"});
  const filtro = filtroBerman({...d, par});
  if(!filtro.passou) return res.json({ok:false, bloqueado:"FILTRO_BERMAN", filtro});
  const prompt = `Analise Berman Trader. Par ${par} ${d.direcao} preco ${d.preco} RSI ${d.rsi} volume ${d.volume} vs media ${d.volMedia}. Responda APROVADO ou REPROVADO e motivo em 1 linha. So aprove se tendencia + estrutura + volume alinhados.`;
  const gpt = await cerebroChatGPT(prompt);
  const meta = await cerebroMetaAI(prompt);
  const decisao = (meta.voto==="APROVADO" && gpt.voto==="APROVADO");
  if(!decisao) return res.json({ok:false, bloqueado:"DIVERGENCIA_CEREBROS", meta, gpt, filtro});
  const tempo = proximaEntrada(tf);
  const sinal = {par, direcao:d.direcao, timeframe: tf+"M", entrada: tempo.entrada, expiracao: tempo.expiracao, entradaISO: tempo.entradaISO, expiracaoISO: tempo.expiracaoISO, preco: d.preco, filtro, meta, gpt, status:"AGUARDANDO_ENTRADA"};
  ultimo[chave]=Date.now(); historico.unshift(sinal);
  if(process.env.TELEGRAM_BOT_TOKEN){
    const msg = `🚨 SINAL BERMAN BOT\nPar: ${par}\nDireção: ${d.direcao} ${d.direcao==="CALL"?"⬆️":"⬇️"}\nTime: ${tf}M\nEntrada: ${tempo.entrada}\nExpiração: ${tempo.expiracao}\nConfluência: Meta AI ✅ + ChatGPT ✅ + Berman ✅`;
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID, text:msg})}).catch(()=>{});
  }
  return res.json({ok:true, sinal});
});
app.get('/sinais', (req,res)=> res.json(historico.slice(0,50)));
const path=require('path');
app.use(require('express').static(path.join(__dirname,'public')));
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Berman Bot rodando na porta", PORT));
