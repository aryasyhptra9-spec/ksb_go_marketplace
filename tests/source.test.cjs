'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..','src');
const files=fs.readdirSync(root);
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=files.filter(n=>n.endsWith('.html'));
const gs=files.filter(n=>n.endsWith('.gs'));
const allHTML=html.map(read).join('\n');
const scriptsFrom=n=>[...read(n).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(x=>x[1]).filter(Boolean);

test('semua file Apps Script valid JavaScript',()=>{
  assert.ok(gs.length>=30);
  for(const f of gs) assert.doesNotThrow(()=>new vm.Script(read(f),{filename:f}),f);
});
test('script HTML valid dan tidak menyelipkan kode template sebagai JS',()=>{
  for(const f of html) for(const script of scriptsFrom(f)) {
    // Only Index embeds JSON expressions from Apps Script on purpose.
    const prepared=f==='Index.html'?script.replace(/<\?!=\s*(portalJson|webAppUrlJson)\s*\?>/g,'"TEST"'):script;
    assert.doesNotThrow(()=>new vm.Script(prepared,{filename:f}),f);
  }
});
test('template include tersedia dan masuk allowlist backend',()=>{
  const index=read('Index.html'),code=read('Code.gs');
  const names=[...index.matchAll(/include_\('([A-Za-z0-9_]+)'\)/g)].map(m=>m[1]);
  const allowMatch=code.match(/function\s+include_\(file\)\s*\{\s*var allowed\s*=\s*\[([^\]]+)\]/);
  assert.ok(allowMatch,'allowlist include_ harus tersedia');
  const allowed=new Set([...allowMatch[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map(x=>x[1]));
  for(const name of names) {assert.ok(files.includes(name+'.html'),name+' missing');assert.ok(allowed.has(name),name+' forbidden');}
});
test('Courier dimuat sebelum AuthUI dan Portal; tidak memakai runtime sementara',()=>{
  const s=read('Index.html');
  assert.ok(s.indexOf("include_('Courier')")>=0);
  assert.ok(s.indexOf("include_('Courier')")<s.indexOf("include_('AuthUIV5')"));
  assert.ok(s.indexOf("include_('AuthUIV5')")<s.indexOf("include_('PortalV8')"));
  assert.ok(!s.includes('CourierRuntimeV166'));
});
test('CSS portal dimuat pada HEAD, bukan bocor sebagai teks badan',()=>{
  const index=read('Index.html');
  assert.ok(index.indexOf("include_('Styles')")<index.indexOf('</head>'));
  assert.ok(!read('PortalV8.html').includes('<style>'));
  assert.ok(read('Styles.html').includes('.ksb-v8-header'));
  assert.ok(read('Styles.html').includes('.ksb-v9-role-grid'));
});
test('tombol statis dan form merujuk aksi/handler terdaftar',()=>{
  const actions=new Set([...allHTML.matchAll(/KSB\.actions\.([A-Za-z]\w*)\s*=/g)].map(m=>m[1]));
  const used=new Set([...allHTML.matchAll(/data-action=["']([\w.-]+)["']/g)].map(m=>m[1]));
  for(const m of allHTML.matchAll(/KSB\.btn\([^,]+,\s*["']([\w.-]+)["']/g))used.add(m[1]);
  const missing=[...used].filter(x=>!actions.has(x));
  assert.deepEqual(missing,[],`Missing buttons: ${missing.join(', ')}`);
  const forms=new Set([...allHTML.matchAll(/KSB\.forms\.([A-Za-z]\w*)\s*=/g)].map(m=>m[1]));
  const usedForms=new Set([...allHTML.matchAll(/data-form=["']([\w.-]+)["']/g)].map(m=>m[1]));
  assert.deepEqual([...usedForms].filter(x=>!forms.has(x)),[]);
});
test('modul Kurir hadir dan bisa menampilkan tombol klaim order',async()=>{
  const KSB={actions:{},forms:{},state:{user:{roles:['COURIER'],name:'UAT'},page:1,role:'COURIER'},
    h:s=>String(s??''),rup:n=>'Rp '+Number(n).toLocaleString('id-ID'),
    page:(name,body)=>name+'\n'+body,empty:(title,body='')=>title+body,
    call:async name=>name==='courier.available'?{items:[{id:'DLV_TEST',type:'MARKETPLACE',from_district:'Taliwang',to_district:'Maluk',shipping_fee:20000}]}:{},
    btn:()=>'<button></button>',accountView:()=>'',buyer:()=>'',seller:()=>'',admin:()=>'',goto:async()=>{},run:async f=>f()
  };
  const ctx=vm.createContext({KSB,window:{KSB},console,setTimeout,FormData:function(){},document:{}});
  for(const n of ['Courier.html','AuthUIV5.html']) {
    for(const script of scriptsFrom(n))vm.runInContext(script,ctx,{filename:n});
  }
  assert.equal(typeof ctx.KSB.actions.courierClaim,'function');
  assert.equal(typeof ctx.KSB.courier,'function');
  assert.ok((await ctx.KSB.courier('available',{})).includes('DLV_TEST'));
  assert.ok((await ctx.KSB.courier('available',{})).includes('data-action="courierClaim"'));
  assert.equal(ctx.window.KSB_COURIER_MODULE_OK,true);
});
test('status dan pengaman pembayaran penting tidak dihapus',()=>{
  assert.match(read('Orders.gs'),/ksbV10RequireCommerce_/);
  assert.match(read('Orders.gs'),/ksbIdempotent_/);
  assert.match(read('Couriers.gs'),/ksbWithLock_/);
  assert.match(read('CommerceV10.gs'),/LIVE_APPROVED/);
  assert.match(read('BuyerReceiptV16.gs'),/ksbWithLock_/);
});
test('file konfigurasi dasar ada tanpa kredensial GitHub',()=>{
  assert.ok(files.includes('appsscript.json'));
  assert.ok(!files.some(f=>/clasprc|\.clasp\.json|\.env/.test(f)));
});
