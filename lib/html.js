/**
 * 单文件 HTML 报告（v2 UI）：数据内嵌，双击即开，不依赖宿主。
 */

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

/**
 * @param {{inventory: object, updates: object|null, generatedAt: string}} data
 * @returns {string}
 */
export function renderHtml({ inventory, updates, generatedAt }) {
  const payload = JSON.stringify({ inventory, updates }).replace(/</g, '\\u003c')
  const outdated = updates ? updates.outdated.length : 0

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSH 插件体检</title>
<style>
  :root{
    --bg:#0b0f14; --panel:#11161d; --panel2:#151b24; --fg:#e6edf3; --muted:#8b949e;
    --line:#232b36; --accent:#58a6ff; --accent2:#3fb950;
    --high:#f85149; --medium:#d29922; --low:#3fb950;
    --radius:12px;
  }
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1200px 600px at 50% -200px,#16202c 0%,var(--bg) 60%);
       color:var(--fg);font:14px/1.55 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  .wrap{max-width:1040px;margin:0 auto;padding:34px 22px 70px}
  header{display:flex;align-items:flex-start;gap:14px;margin-bottom:22px}
  .logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#1f6feb,#3fb950);
        display:flex;align-items:center;justify-content:center;font-size:19px;flex:none}
  h1{font-size:19px;margin:0;letter-spacing:.2px}
  .sub{color:var(--muted);font-size:12px;margin-top:3px;word-break:break-all}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0 26px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px}
  .card .k{color:var(--muted);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
  .card .v{font-size:24px;font-weight:650;margin-top:2px;font-variant-numeric:tabular-nums}
  .card .v.warn{color:var(--medium)} .card .v.ok{color:var(--low)}
  .bar{position:sticky;top:0;z-index:5;background:linear-gradient(180deg,rgba(11,15,20,.97),rgba(11,15,20,.86));
       backdrop-filter:blur(8px);padding:12px 0 10px;margin-bottom:6px;border-bottom:1px solid var(--line)}
  .tabs{display:flex;gap:8px;margin-bottom:10px}
  .tab{padding:6px 15px;border-radius:999px;border:1px solid var(--line);background:var(--panel);
       color:var(--muted);cursor:pointer;font-size:13px;transition:.15s}
  .tab:hover{color:var(--fg);border-color:#3a4656}
  .tab.on{border-color:var(--accent);color:var(--accent);background:rgba(88,166,255,.08)}
  .tools{display:flex;gap:10px;align-items:center}
  input.search{flex:1;padding:9px 13px;border-radius:9px;border:1px solid var(--line);
               background:var(--panel);color:var(--fg);outline:none;font-size:13px}
  input.search:focus{border-color:var(--accent)}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
  .chip{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);
        color:var(--muted);cursor:pointer}
  .chip:hover{color:var(--fg)} .chip.on{color:var(--accent);border-color:var(--accent)}
  .group{margin-top:18px}
  .ghead{display:flex;align-items:center;gap:8px;margin-bottom:6px;color:var(--muted);
         font-size:11px;letter-spacing:.1em;text-transform:uppercase}
  .ghead .n{background:var(--panel2);border:1px solid var(--line);border-radius:999px;
            padding:0 7px;font-size:10px;line-height:16px;color:var(--muted)}
  .row{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid transparent;
       border-radius:9px}
  .row:hover{background:var(--panel);border-color:var(--line)}
  .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}
  .ver{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;flex:none}
  .badge{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid currentColor;flex:none}
  .badge.ui{color:var(--accent)} .badge.off{color:var(--muted)}
  .upd{border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin-top:10px;background:var(--panel)}
  .upd .top{display:flex;align-items:center;gap:10px}
  .upd .diff{font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px}
  .upd ul{margin:7px 0 0;padding-left:16px;color:var(--muted);font-size:12px}
  .risk{width:3px;align-self:stretch;border-radius:2px;flex:none}
  .risk.high{background:var(--high)} .risk.medium{background:var(--medium)} .risk.low{background:var(--low)}
  .empty{color:var(--muted);padding:26px 0;text-align:center}
  .note{margin-top:34px;color:#586470;font-size:11px;text-align:center}
  code{background:var(--panel2);padding:1px 5px;border-radius:4px}
  @media(max-width:720px){.stats{grid-template-columns:repeat(2,1fr)}}
</style></head>
<body><div class="wrap">
  <header>
    <div class="logo">🩺</div>
    <div>
      <h1>DSH 插件体检</h1>
      <div class="sub">${esc(inventory.dir)} · 生成于 ${esc(generatedAt)}</div>
    </div>
  </header>

  <div class="stats">
    <div class="card"><div class="k">已装插件</div><div class="v">${inventory.total}</div></div>
    <div class="card"><div class="k">loader 行</div><div class="v">${inventory.loaderCount}</div></div>
    <div class="card"><div class="k">能力分类</div><div class="v">${inventory.groups.length}</div></div>
    <div class="card"><div class="k">可更新</div><div class="v ${outdated ? 'warn' : 'ok'}">${updates ? outdated : '—'}</div></div>
  </div>

  <div class="bar">
    <div class="tabs">
      <button class="tab on" data-tab="inv">装机清单</button>
      <button class="tab" data-tab="upd">更新风险</button>
    </div>
    <div class="tools"><input class="search" id="q" placeholder="搜索插件名 / 分类…"></div>
    <div class="chips" id="chips"></div>
  </div>

  <div id="view"></div>
  <div class="note">只读报告 · dsh-preflight</div>
</div>
<script>
const DATA = ${payload};
let tab='inv', q='', cat='';
const el=(s)=>document.querySelector(s);
const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function drawChips(){
  if(tab!=='inv'){ el('#chips').innerHTML=''; return; }
  const cats=DATA.inventory.groups.map(g=>g.category);
  el('#chips').innerHTML=['全部',...cats].map(c=>{
    const on=(c==='全部'&&!cat)||c===cat;
    return '<span class="chip'+(on?' on':'')+'" data-cat="'+(c==='全部'?'':esc(c))+'">'+esc(c)+'</span>';
  }).join('');
  el('#chips').querySelectorAll('.chip').forEach(n=>n.onclick=()=>{cat=n.dataset.cat;draw();});
}

function drawInv(){
  const inv=DATA.inventory, out=[];
  for(const g of inv.groups){
    if(cat && g.category!==cat) continue;
    const items=g.items.filter(it=>!q||(it.bundle+' '+(it.categories||[]).join(' ')).toLowerCase().includes(q));
    if(!items.length) continue;
    out.push('<div class="group"><div class="ghead">'+esc(g.category)+'<span class="n">'+items.length+'</span></div>');
    for(const it of items){
      out.push('<div class="row"><span class="name" title="'+esc(it.summary)+'">'+esc(it.bundle)+'</span>'
        +(it.hasClient?'<span class="badge ui">UI</span>':'')
        +(it.disabled?'<span class="badge off">停用</span>':'')
        +'<span class="ver">v'+esc(it.version)+'</span></div>');
    }
    out.push('</div>');
  }
  if(inv.missing&&inv.missing.length)
    out.push('<div class="group"><div class="ghead" style="text-transform:none">宿主自带</div><div style="color:var(--muted);font-size:12px">'+esc(inv.missing.join(' · '))+'</div></div>');
  return out.join('')||'<div class="empty">没有匹配项</div>';
}

function drawUpd(){
  const up=DATA.updates;
  if(!up) return '<div class="empty">生成报告时没联网检查更新</div>';
  if(!up.outdated.length) return '<div class="empty">没有需要更新的插件</div>';
  const out=[];
  for(const u of up.outdated){
    if(q && !u.bundle.toLowerCase().includes(q)) continue;
    out.push('<div class="upd"><div class="top">'
      +'<span class="risk '+u.grade.level+'"></span>'
      +'<span class="name">'+esc(u.bundle)+'</span>'
      +'<span class="badge '+u.grade.level+'" style="color:var(--'+u.grade.level+')">'+esc(u.grade.label)+'</span>'
      +'<span class="diff">'+esc(u.current)+' → '+esc(u.latest)+'</span></div>');
    if(u.newly&&u.newly.length){
      out.push('<ul>'+u.newly.slice(0,4).map(f=>'<li>'+esc(f.title)+'</li>').join('')+'</ul>');
    }
    out.push('</div>');
  }
  if(up.unknown&&up.unknown.length)
    out.push('<div class="group"><div class="ghead" style="text-transform:none">非 npm 发布</div><div style="color:var(--muted);font-size:12px">'+esc(up.unknown.join(' · '))+'</div></div>');
  return out.join('')||'<div class="empty">没有匹配项</div>';
}

function draw(){
  el('#view').innerHTML=tab==='inv'?drawInv():drawUpd();
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  drawChips();
}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;draw();});
el('#q').oninput=e=>{q=e.target.value.trim().toLowerCase();draw();};
draw();
</script>
</body></html>`
}
