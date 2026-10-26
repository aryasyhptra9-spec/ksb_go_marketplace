/** Gateway adapter (TEST ONLY). This build intentionally cannot initiate production transfers. */
function ksbGatewayMode_(){return ksbProperty_('GATEWAY_MODE','DISABLED');}
function ksbGatewayEnabled_(){ksbRequire_(ksbGatewayMode_()==='TEST','Payment gateway dinonaktifkan. Hanya Xendit TEST didukung paket ini.');}
function ksbXenditRequest_(method,path,body,headers){
  ksbGatewayEnabled_();
  var key=ksbProperty_('XENDIT_TEST_API_KEY');
  ksbRequire_(/^xnd_development_/.test(key),'Hanya Xendit development/test_ API key yang diterima.');
  ksbRequire_(/^\/(sessions|v3\/payouts)(\/[-A-Za-z0-9_]+)?$/.test(path),'Endpoint gateway tidak diizinkan.');
  var opt={method:method,headers:Object.assign({'Authorization':'Basic '+Utilities.base64Encode(key+':'),'Accept':'application/json'},headers||{}),muteHttpExceptions:true};
  if(body!==null&&body!==undefined){opt.contentType='application/json';opt.payload=JSON.stringify(body);}
  var response=UrlFetchApp.fetch('https://api.xendit.co'+path,opt),code=response.getResponseCode(),txt=response.getContentText();
  var result=ksbJson_(txt,{});
  if(code<200||code>=300)throw new Error('Xendit HTTP '+code+': '+String(result.error_code||result.error||'periksa dashboard provider').slice(0,150));
  return result;
}
function ksbGatewaySessionFor_(orderId){var row=ksbFilter_('GATEWAY_SESSIONS',function(s){return s.order_id===orderId;})[0];return row?{id:row.id,status:row.status,checkout_url:row.checkout_url,created_at:row.created_at,amount:Number(row.amount)}:null;}
/** Reserving session ID before external call prevents duplicate charges if client retries. */
function ksbGatewayStart_(actor,args){
  ksbGatewayEnabled_();var orderId=ksbString_(args.orderId,100),reservation=ksbWithLock_(function(){
    var order=ksbRow_('ORDERS',orderId);
    ksbRequire_(order&&order.buyer_id===actor.id&&order.payment_method==='GATEWAY','Pesanan gateway tidak tersedia.');
    ksbRequire_(order.status!=='CANCELLED','Pesanan dibatalkan.');
    var current=ksbFilter_('GATEWAY_SESSIONS',function(s){return s.order_id===orderId;})[0];
    if(current)return {existing:true,row:current};
    ksbRequire_(order.status==='PENDING_PAYMENT'&&order.payment_status==='WAITING_GATEWAY','Status pembayaran tidak valid.');
    var payment=ksbFilter_('PAYMENTS',function(x){return x.order_id===orderId&&x.method==='GATEWAY';})[0];
    ksbRequire_(payment&&payment.status==='PENDING'&&Number(payment.amount)===Number(order.grand_total),'Rekonsiliasi pembayaran tidak cocok.');
    var id=ksbId_('GS'),now=ksbNow_();
    var record={id:id,order_id:orderId,payment_id:payment.id,provider:'XENDIT_TEST',reference_id:id,amount:order.grand_total,status:'CREATING',checkout_url:'',provider_session_id:'',provider_payment_id:'',created_at:now,updated_at:now};
    ksbAppend_('GATEWAY_SESSIONS',record);return {existing:false,row:record};
  });
  if(reservation.existing){var r=reservation.row;return {status:r.status,checkoutUrl:r.checkout_url||'',id:r.id};}
  var r=reservation.row;
  try{
    var buyer=ksbRow_('USERS',actor.id),payload={reference_id:r.reference_id,session_type:'PAY',mode:'PAYMENT_LINK',amount:Number(r.amount),currency:'IDR',country:'ID',locale:'id',description:'KSB GO '+orderId};
    if(buyer&&buyer.email)payload.customer={reference_id:actor.id,type:'INDIVIDUAL',email:buyer.email};
    var obj=ksbXenditRequest_('post','/sessions',payload,null);
    ksbRequire_(/^ps-[-A-Za-z0-9]+$/.test(String(obj.payment_session_id||'')),'ID sesi gateway tidak valid');
    ksbRequire_(/^https:\/\/(checkout-staging\.xendit\.co|dev\.xen\.to)\//.test(String(obj.payment_link_url||'')),'URL checkout test_ bukan domain staging resmi.');
    ksbWithLock_(function(){ksbPatch_('GATEWAY_SESSIONS',r.id,{provider_session_id:obj.payment_session_id,checkout_url:obj.payment_link_url,status:'ACTIVE',updated_at:ksbNow_()});});
    return {status:'ACTIVE',checkoutUrl:obj.payment_link_url,id:r.id};
  }catch(e){
    // Network timeouts are ambiguous. Do NOT retry POST automatically.
    ksbWithLock_(function(){ksbPatch_('GATEWAY_SESSIONS',r.id,{status:'REVIEW_REQUIRED',updated_at:ksbNow_()});});
    throw new Error('Pembuatan sesi perlu pemeriksaan admin sebelum dicoba ulang. '+String(e.message).slice(0,100));
  }
}
/** Provider API GET is authoritative; never accept browser redirects or webhook body as proof of payment. */
function ksbGatewayReconcileSession_(sessionId){
  ksbGatewayEnabled_();var sess=ksbFilter_('GATEWAY_SESSIONS',function(s){return s.provider_session_id===sessionId;})[0];
  ksbRequire_(sess,'Sesi pembayaran tidak ditemukan.');var live=ksbXenditRequest_('get','/sessions/'+encodeURIComponent(sessionId),null,null);
  return ksbWithLock_(function(){
    var s=ksbRow_('GATEWAY_SESSIONS',sess.id),p=ksbRow_('PAYMENTS',s.payment_id),order=ksbRow_('ORDERS',s.order_id);
    ksbRequire_(order&&p,'Order dan payment hilang');
    ksbRequire_(live.payment_session_id===s.provider_session_id&&live.reference_id===s.reference_id,'Sesi gateway tidak cocok');
    ksbRequire_(live.currency==='IDR'&&Number(live.amount)===Number(s.amount)&&Number(p.amount)===Number(s.amount),'Nilai atau mata uang tidak cocok');
    if(live.status==='COMPLETED'){
      ksbRequire_(live.payment_id||live.payment_request_id,'Sesi selesai tetapi ID pembayaran kosong; investigasi diperlukan.');
      ksbRequire_(order.status!=='CANCELLED','Pembayaran diterima setelah pembatalan: lakukan investigasi/refund.');
      if(p.status!=='VERIFIED'){
        ksbRequire_(p.status==='PENDING','Status pembayaran perlu investigasi.');
        ksbJournal_('GATEWAY_PAYMENT',p.id,order.id,'Dana gateway dikonfirmasi test_ provider',[{account:'GATEWAY_CLEARING',debit:Number(p.amount)},{account:'CUSTOMER_ESCROW',credit:Number(p.amount)}]);
        ksbPatch_('PAYMENTS',p.id,{status:'VERIFIED',reference:String(live.payment_id||live.payment_request_id),verified_by:'GATEWAY_XENDIT_TEST',verified_at:ksbNow_()});
        ksbPatch_('ORDERS',order.id,{payment_status:'PAID',status:'CONFIRMED',updated_at:ksbNow_()});
        ksbFilter_('DELIVERY_ORDERS',function(d){return d.order_id===order.id&&d.type==='PARCEL'&&d.status==='WAITING_SELLER';}).forEach(function(d){ksbPatch_('DELIVERY_ORDERS',d.id,{status:'AVAILABLE',updated_at:ksbNow_()});});
        ksbHistory_(order.id,'ORDER','CONFIRMED','GATEWAY_XENDIT_TEST','Status COMPLETED dari GET session terverifikasi');
        ksbAudit_('GATEWAY_XENDIT_TEST','PAYMENT_VERIFIED','PAYMENT',p.id,{gatewaySessionId:s.provider_session_id});
      }
      ksbPatch_('GATEWAY_SESSIONS',s.id,{status:'COMPLETED',provider_payment_id:String(live.payment_id||live.payment_request_id),updated_at:ksbNow_()});
    }else if(['EXPIRED','CANCELED'].indexOf(live.status)>=0){ksbPatch_('GATEWAY_SESSIONS',s.id,{status:live.status,updated_at:ksbNow_()});}
    return {status:live.status,paid:ksbRow_('PAYMENTS',p.id).status==='VERIFIED'};
  });
}
function ksbGatewayBuyerCheck_(actor,args){var o=ksbRow_('ORDERS',args.orderId);ksbRequire_(o&&o.buyer_id===actor.id,'Order tidak ditemukan');var s=ksbFilter_('GATEWAY_SESSIONS',function(x){return x.order_id===o.id;})[0];ksbRequire_(s&&s.provider_session_id,'Sesi masih menunggu pemeriksaan admin');return ksbGatewayReconcileSession_(s.provider_session_id);}
function ksbAdminGatewayStatus_(actor){ksbRole_(actor,'ADMIN');return {mode:ksbGatewayMode_(),sessions:ksbPagination_(ksbPageSort_(ksbRows_('GATEWAY_SESSIONS'),'created_at'),{size:30}),payouts:ksbPagination_(ksbPageSort_(ksbRows_('PAYOUT_REQUESTS'),'created_at'),{size:30})};}

/** Reconcile bank/provider settlement separately from customer payment success.
  MUST compare official provider settlement report and bank statement externally.
  Example: gross 117000, processing fee 4000 -> bank cash 113000.
*/
function ksbAdminGatewaySettlementConfirm_(actor,args){
 ksbRole_(actor,'ADMIN');ksbGatewayEnabled_();ksbRequire_(args.confirmBankFunds===true&&args.confirmProviderReport===true,'Periksa laporan settlement provider DAN mutasi bank secara independen.');
 var ref=ksbString_(args.reference,120),gross=ksbAmount_(args.gross,'Gross settlement'),fee=ksbAmount_(args.fee||0,'Biaya gateway');
 ksbRequire_(ref&&gross>0&&fee<=gross,'Settlement provider tidak valid');
 return ksbWithLock_(function(){
   ksbRequire_(!ksbFilter_('GATEWAY_SETTLEMENT_RECEIPTS',function(x){return x.bank_reference===ref;}).length,'Referensi settlement sudah digunakan.');
   var outstanding=-ksbAccountBalance_('GATEWAY_CLEARING');ksbRequire_(outstanding>=gross,'Settlement melebihi saldo gateway clearing');
   var id=ksbId_('GSR'),net=gross-fee;
   var entries=[{account:'CASH_PLATFORM',debit:net},{account:'GATEWAY_PROCESSING_EXPENSE',debit:fee},{account:'GATEWAY_CLEARING',credit:gross}];
   ksbJournal_('GATEWAY_FUNDS_SETTLED',id,'','Dana gateway diterima dan biaya dipisahkan',entries);
   ksbAppend_('GATEWAY_SETTLEMENT_RECEIPTS',{id:id,bank_reference:ref,gross:gross,fee:fee,net:net,created_by:actor.id,created_at:ksbNow_()});
   ksbAudit_(actor.id,'GATEWAY_FUNDS_SETTLED','GATEWAY_SETTLEMENT_RECEIPT',id,{gross:gross,fee:fee});
   return {id:id,gross:gross,net:net,status:'RECONCILED'};
 });
}
