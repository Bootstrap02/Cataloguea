// A small control page for the run: a status board and buttons (Pause, Continue, Stop, Send to server, Get from server).
// It listens ONLY on this computer (127.0.0.1), so nobody else can reach it; on a server you open it through the SSH tunnel.
// Open http://localhost:4545 while the run is going. No passwords or tokens: it is not reachable from outside.
const http = require('node:http');

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cataloguea La Liga</title>
<style>
:root{color-scheme:light dark;--bg:#f4f6fb;--card:#fff;--ink:#101828;--mute:#667085;--line:#e4e7ec;--green:#067647;--amber:#b54708;--red:#b42318;--blue:#175cd3}
@media (prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#151b2e;--ink:#eef2ff;--mute:#9aa4bf;--line:#26304d}}
body{margin:0;font:16px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
main{max-width:760px;margin:0 auto;padding:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
h1{font-size:18px;margin:0 0 8px}.state{font-size:26px;font-weight:700}.mute{color:var(--mute);font-size:14px}
.row{display:flex;flex-wrap:wrap;gap:8px}button{flex:1 1 140px;padding:14px 10px;font-size:16px;font-weight:600;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button.go{background:var(--green);color:#fff;border-color:var(--green)}button.warn{background:var(--amber);color:#fff;border-color:var(--amber)}button.stop{background:var(--red);color:#fff;border-color:var(--red)}
pre{white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:340px;overflow:auto;margin:0}
.msg{margin-top:8px;min-height:20px;color:var(--blue)}
</style></head><body><main>
<div class="card"><h1>Cataloguea La Liga</h1><div class="state" id="state">...</div><div class="mute" id="phase"></div><div class="mute" id="meta"></div>
<div class="row" style="margin-top:10px"><button class="warn" onclick="act('pause')">Pause after this round</button><button class="go" onclick="act('resume')">Continue</button>
<button class="stop" onclick="act('stop')">Stop after this round</button></div>
<div class="row" style="margin-top:8px"><button onclick="act('push')">Send to server</button><button onclick="act('pull')">Get from server (when paused)</button>
<button onclick="if(confirm('Stop NOW? A round with bets placed stays open.'))act('stop-now')">Stop now</button></div><div class="msg" id="msg"></div></div>
<div class="card"><h1>Strategy memory</h1><div id="strategy" class="mute"></div></div>
<div class="card"><h1>Last round</h1><pre id="report">nothing yet</pre></div>
<div class="card"><h1>Log</h1><pre id="log"></pre></div></main>
<script>
const $=(i)=>document.getElementById(i);
async function refresh(){try{const r=await fetch('/api/status');const s=await r.json();
$('state').textContent=s.state;$('phase').textContent=s.phase+(s.round?' - '+s.round.name:'');
const n=(s.session||{});$('meta').textContent='Session: '+n.rounds+' round(s), staked N'+n.staked+', returned N'+n.returned+', net '+(n.returned-n.staked>=0?'+':'-')+'N'+Math.abs(n.returned-n.staked)+(s.account?' | account: '+s.account:'')+(s.balance!=null?' | balance N'+s.balance:'')+(s.sync?' | sync: '+s.sync:'');
const g=s.strategy||{};$('strategy').textContent=(g.winners||[]).map(w=>w+' base N'+Math.round((g.bases||{})[w])).join(', ')+' | teams with a deficit: '+g.teamsWithDeficit+' | big deficits: '+g.bigDeficits+' | bank N'+Math.round(g.bank||0)+' | rounds settled: '+g.roundsSettled+(g.openRound?' | A ROUND IS OPEN':'');
$('report').textContent=s.lastReport||'nothing yet';const L=$('log');const atEnd=L.scrollTop+L.clientHeight>=L.scrollHeight-20;L.textContent=(s.log||[]).join('\\n');if(atEnd)L.scrollTop=L.scrollHeight;}catch(e){$('state').textContent='not connected';}}
async function act(a){const r=await fetch('/api/'+a,{method:'POST',headers:{'X-Panel':'1'}});const j=await r.json();$('msg').textContent=j.message||'';refresh();}
refresh();setInterval(refresh,2000);
</script></body></html>`;

function createControlPanel({ controller, actions = {}, extras = async () => ({}), getLog = () => [], port = 4545, host = '127.0.0.1' }) {
  const allowedHost = (value) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(value || ''));
  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    try {
      if (!allowedHost(req.headers.host)) return send(403, { message: 'This page is only for this computer.' });
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/') return send(200, PAGE, 'text/html; charset=utf-8');
      if (req.method === 'GET' && path === '/api/status') return send(200, { ...controller.status(), ...(await extras()), log: getLog().slice(-150) });
      if (req.method === 'POST' && path.startsWith('/api/')) {
        if (req.headers['x-panel'] !== '1') return send(403, { message: 'Missing the panel header.' });   // stops other web pages from pressing the buttons
        const name = path.slice(5);
        const action = actions[name];
        if (!action) return send(404, { message: `No such action: ${name}` });
        return send(200, (await action()) || { ok: true });
      }
      return send(404, { message: 'Not found' });
    } catch (error) {
      return send(500, { message: error.message });
    }
  });
  return {
    start: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(server.address().port); });
    }),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// Single keys at the terminal while the run is going (see the line printed at the start).
const KEY_ACTIONS = { p: 'pause', c: 'resume', s: 'stop', x: 'stop-now', u: 'push', d: 'pull', h: 'help', '?': 'help' };
const keyAction = (key) => KEY_ACTIONS[String(key || '').toLowerCase()] || null;

module.exports = { createControlPanel, keyAction, KEY_ACTIONS };
