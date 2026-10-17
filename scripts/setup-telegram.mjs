// Secrets are read from the process environment only; never supplied as CLI arguments or printed.
const {TELEGRAM_BOT_TOKEN:token,TELEGRAM_WEBHOOK_SECRET:secret,TELEGRAM_WEBHOOK_URL:url}=process.env;
if (!token || !secret || !url) throw Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TELEGRAM_WEBHOOK_URL securely.');
if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw Error('Webhook secret must be 32–256 URL-safe characters.');
const target=new URL(url);
if(target.protocol!=='https:' || target.pathname!=='/telegram/webhook' || target.search || target.hash || target.username || target.password)throw Error('Use the deployed HTTPS /telegram/webhook endpoint.');
async function call(method,body){
 try {
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  const d=await r.json();if(!r.ok||!d.ok)throw Error();return d.result;
 }catch{throw Error(`Telegram ${method} failed; check configuration. Secret values are omitted.`);}
}
const me=await call('getMe',{});
await call('setWebhook',{url,secret_token:secret,allowed_updates:['message'],max_connections:1,drop_pending_updates:false});
const status=await call('getWebhookInfo',{});
if(status.url!==url)throw Error('Webhook verification failed.');
console.log(`Webhook registered for @${me.username}. Pending updates: ${status.pending_update_count}.`);
if(status.last_error_date)console.log('Telegram reports a previous delivery error. Verify the deployed endpoint and secrets.');
