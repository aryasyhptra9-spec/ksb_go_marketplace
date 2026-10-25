/** KSB GO V15: accountable, manual refund workflow and fail-closed transaction diagnostics.
 * Refund records reflect manual bank transfers AFTER verified bank statements.
 * Google Sheets offers NO atomic transaction across tables: interruption flags require human review.
 */
function ksbV15RefundEligible_(order, deliveries, payments, deliveredJournalCount){
  if(!order || order.payment_method!=='TRANSFER' || order.payment_status!=='PAID')return false;
  if(!['CONFIRMED','PROCESSING','READY','DISPUTED'].includes(String(order.status)))return false;
  if(deliveredJournalCount>0)return false;
  if(!payments.some(function(p){return p.method==='TRANSFER'&&p.status==='VERIFIED'&&Number(p.amount)===Number(order.grand_total);}))return false;
  return deliveries.length>0&&deliveries.every(function(d){return !d.courier_id&&['WAITING_SELLER','AVAILABLE','DISPUTED','CANCELLED'].includes(d.status);});
}
function ksbV15RefundRequest_(actor,args){
  ksbV10RequireCommerce_();ksbRole_(actor,'BUYER');
  return ksbWithLock_(function(){
    var o=ksbRow_('ORDERS',String(args.orderId||''));ksbRequire_(o&&o.buyer_id===actor.id,'Pesanan tidak ditemukan.');
    var ds=ksbFilter_('DELIVERY_ORDERS',function(d){return d.order_id===o.id;});
    var ps=ksbFilter_('PAYMENTS',function(p){return p.order_id===o.id;});
    var finals=ksbFilter_('LEDGER_ENTRIES',function(e){return e.order_id===o.id&&e.source_type==='DELIVERY_FINAL';});
    ksbRequire_(ksbV15RefundEligible_(o,ds,ps,finals.length),'Pengembalian otomatis tidak tersedia untuk status ini. Hubungi Admin untuk sengketa pengiriman.');
    ksbRequire_(!ksbFilter_('REFUND_CASES_V15',function(r){return r.order_id===o.id;}).length,'Pengajuan pengembalian sudah ada untuk pesanan ini.');
    var p=ps.filter(function(x){return x.status==='VERIFIED'&&x.method==='TRANSFER';})[0];
    var reason=ksbString_(args.reason||'',500);ksbRequire_(reason.length>=10,'Jelaskan alasan pengembalian minimal 10 karakter.');
    var id=ksbId_('RFD'),now=ksbNow_();
    ksbAppend_('REFUND_CASES_V15',{id:id,order_id:o.id,buyer_id:actor.id,payment_id:p.id,amount:ksbAmount_(o.grand_total,'Total refund'),reason:reason,status:'REQUESTED',reviewed_by:'',review_note:'',bank_reference:'',requested_at:now,reviewed_at:'',paid_at:''});
    ksbPatch_('ORDERS',o.id,{status:'DISPUTED',updated_at:now});
    ds.filter(function(d){return ['WAITING_SELLER','AVAILABLE'].includes(d.status);}).forEach(function(d){ksbPatch_('DELIVERY_ORDERS',d.id,{status:'DISPUTED',updated_at:now});});
    ksbFilter_('SELLER_ORDERS',function(s){return s.order_id===o.id&&s.status!=='REJECTED';}).forEach(function(s){ksbPatch_('SELLER_ORDERS',s.id,{status:'DISPUTED',updated_at:now});});
    ksbHistory_(o.id,'ORDER','DISPUTED',actor.id,'Pengajuan refund sedang ditinjau');
    ksbAudit_(actor.id,'REQUEST_REFUND_V15','ORDER',o.id,{caseId:id,amount:Number(o.grand_total)});
    return {id:id,status:'REQUESTED',amount:Number(o.grand_total)};
  });
}
function ksbV15RefundMine_(actor){ksbRole_(actor,'BUYER');return ksbPageSort_(ksbFilter_('REFUND_CASES_V15',function(x){return x.buyer_id===actor.id;}),'requested_at');}
function ksbV15RefundCases_(actor,args){ksbRole_(actor,'ADMIN');return ksbPagination_(ksbPageSort_(ksbRows_('REFUND_CASES_V15'),'requested_at'),args||{});}
function ksbV15RefundReview_(actor,args){
  ksbV10RequireCommerce_();ksbRole_(actor,'ADMIN');
  return ksbWithLock_(function(){
    var c=ksbRow_('REFUND_CASES_V15',String(args.id||''));ksbRequire_(c&&c.status==='REQUESTED','Refund tidak sedang menunggu peninjauan.');
    var approve=args.approve===true,note=ksbString_(args.note||'',500);
    ksbRequire_(note.length>=8,'Catatan hasil pemeriksaan wajib minimal 8 karakter.');
    var status=approve?'APPROVED':'REJECTED';
    ksbPatch_('REFUND_CASES_V15',c.id,{status:status,reviewed_by:actor.id,review_note:note,reviewed_at:ksbNow_()});
    ksbAudit_(actor.id,'REFUND_REVIEW_V15','REFUND',c.id,{status:status,note:note});
    // A rejected case stays DISPUTED for manual follow-up; don't silently resume delivery.
    return {id:c.id,status:status};
  });
}
function ksbV15RefundConfirm_(actor,args){
  ksbV10RequireCommerce_();ksbRole_(actor,'ADMIN');
  return ksbWithLock_(function(){
    var c=ksbRow_('REFUND_CASES_V15',String(args.id||''));
    ksbRequire_(c&&['APPROVED','BANK_RECONCILING','STOCK_REVIEW'].includes(c.status),'Refund harus disetujui lebih dahulu.');
    var ref=ksbString_(args.bankReference,100);ksbRequire_(ref,'Referensi pengembalian bank harus diisi.');ksbV10ValidateBankReference_(ref);
    ksbRequire_(args.confirmIndependentStatement===true,'Cocokkan mutasi debit bank/QRIS yang sebenarnya terlebih dahulu.');
    ksbRequire_(!c.bank_reference||c.bank_reference===ref,'Referensi berubah: periksa kasus secara manual.');
    var mutation=ksbBankEvidence_(ref,'DEBIT',Number(c.amount));
    ksbRequire_(mutation&&(mutation.status==='UNMATCHED'||mutation.matched_entity_id===c.id),'Mutasi debit tidak cocok atau sudah dipakai oleh transaksi lain.');
    var ledgers=ksbFilter_('LEDGER_ENTRIES',function(e){return e.source_type==='REFUND_V15'&&e.source_id===c.id;});
    if(!ledgers.length){
      // Persist intent before ledger write. An interruption remains in a visible review state.
      ksbPatch_('REFUND_CASES_V15',c.id,{status:'BANK_RECONCILING',bank_reference:ref});
      ksbRequire_(ksbAccountBalance_('CUSTOMER_ESCROW')>=Number(c.amount),'Saldo dana pelanggan tercatat tidak mencukupi. Periksa ledger.');
      ksbJournal_('REFUND_V15',c.id,c.order_id,'Refund dibayar berdasarkan mutasi debit',[
        {account:'CUSTOMER_ESCROW',debit:Number(c.amount)},
        {account:'CASH_PLATFORM',credit:Number(c.amount)}]);
    } else {
      var debit=ledgers.reduce(function(n,e){return n+Number(e.debit);},0),credit=ledgers.reduce(function(n,e){return n+Number(e.credit);},0);
      ksbRequire_(debit===Number(c.amount)&&credit===debit,'Jurnal refund parsial: penyelesaian otomatis ditolak.');
    }
    if(mutation.status==='UNMATCHED')ksbPatch_('BANK_MUTATIONS_V11',mutation.id,{status:'MATCHED',matched_entity_type:'REFUND_V15',matched_entity_id:c.id,matched_at:ksbNow_()});
    var items=ksbFilter_('ORDER_ITEMS',function(i){return i.order_id===c.order_id;});
    items.forEach(function(i){
      if(!ksbFilter_('REFUND_STOCK_REVIEW_V15',function(x){return x.refund_id===c.id&&x.order_item_id===i.id;}).length){
        ksbAppend_('REFUND_STOCK_REVIEW_V15',{id:ksbId_('RSR'),refund_id:c.id,order_id:c.order_id,product_id:i.product_id,order_item_id:i.id,quantity:i.quantity,status:'PENDING',created_at:ksbNow_(),reviewed_by:'',reviewed_at:'',note:''});
      }
    });
    var o=ksbRow_('ORDERS',c.order_id);ksbPatch_('ORDERS',o.id,{payment_status:'REFUNDED',status:'DISPUTED',updated_at:ksbNow_()});
    ksbPatch_('REFUND_CASES_V15',c.id,{status:'STOCK_REVIEW',bank_reference:ref,paid_at:ksbNow_()});
    ksbHistory_(o.id,'ORDER','REFUND_BANK_CONFIRMED',actor.id,'Pengembalian dana tercocokkan; stok perlu pemeriksaan.');
    ksbAudit_(actor.id,'REFUND_BANK_MATCHED_V15','REFUND',c.id,{reference:ref,amount:Number(c.amount)});
    return {id:c.id,status:'STOCK_REVIEW',stockItems:items.length};
  });
}
/** Explicit manual restock; no automatic retry on partial mutation because it can double-credit stock. */
function ksbV15Restock_(actor,args){
  ksbRole_(actor,'ADMIN');ksbV10RequireCommerce_();
  return ksbWithLock_(function(){
    var row=ksbRow_('REFUND_STOCK_REVIEW_V15',String(args.id||''));ksbRequire_(row&&row.status==='PENDING','Stok sudah diproses atau membutuhkan pemeriksaan manual.');
    var c=ksbRow_('REFUND_CASES_V15',row.refund_id);ksbRequire_(c&&c.status==='STOCK_REVIEW','Refund belum tercocokkan ke bank.');
    ksbRequire_(args.confirmPhysicalStock===true,'Periksa barang sudah kembali atau stok memang boleh dikembalikan.');
    // INTENT status is durable: if Sheets fails between writes, stop and reconcile manually.
    ksbPatch_('REFUND_STOCK_REVIEW_V15',row.id,{status:'APPLYING',reviewed_by:actor.id,reviewed_at:ksbNow_(),note:ksbString_(args.note||'',300)});
    var product=ksbRow_('PRODUCTS',row.product_id);ksbRequire_(product,'Produk tidak ditemukan; telusuri manual.');
    var quantity=ksbAmount_(row.quantity,'Jumlah stok'),next=ksbAmount_(Number(product.stock)+quantity,'Stok baru');
    ksbPatch_('PRODUCTS',product.id,{stock:next,updated_at:ksbNow_()});
    ksbAppend_('INVENTORY_MOVEMENTS',{id:ksbId_('IM'),product_id:product.id,variant_id:'',order_id:row.order_id,quantity_delta:quantity,reason:'REFUND_RESTOCK_V15:'+row.id,created_at:ksbNow_()});
    ksbPatch_('REFUND_STOCK_REVIEW_V15',row.id,{status:'DONE'});
    var all=ksbFilter_('REFUND_STOCK_REVIEW_V15',function(x){return x.refund_id===c.id;});
    if(all.every(function(x){return x.status==='DONE';})){
      ksbPatch_('REFUND_CASES_V15',c.id,{status:'CLOSED'});
      ksbPatch_('ORDERS',c.order_id,{status:'CANCELLED',updated_at:ksbNow_()});
      ksbFilter_('DELIVERY_ORDERS',function(d){return d.order_id===c.order_id;}).forEach(function(d){ksbPatch_('DELIVERY_ORDERS',d.id,{status:'CANCELLED'});});
      ksbHistory_(c.order_id,'ORDER','REFUNDED',actor.id,'Refund dan review stok selesai');
    }
    ksbAudit_(actor.id,'RESTOCK_V15','REFUND',c.id,{item:row.id,qty:quantity});
    return {id:row.id,status:'DONE'};
  });
}
function ksbV15StockReviews_(actor,args){ksbRole_(actor,'ADMIN');return ksbPagination_(ksbPageSort_(ksbRows_('REFUND_STOCK_REVIEW_V15'),'created_at'),args||{});}
function ksbV15IntegrityReport_(actor){
  ksbRole_(actor,'ADMIN');var base=ksbAdminIntegrityAuditV11_(actor),issues=base.issues.slice();
  function problem(type,id,detail){if(issues.length<300)issues.push({type:type,id:String(id),detail:detail});}
  var orders=ksbRows_('ORDERS'),payments=ksbRows_('PAYMENTS'),items=ksbRows_('ORDER_ITEMS'),sos=ksbRows_('SELLER_ORDERS'),ds=ksbRows_('DELIVERY_ORDERS');
  orders.forEach(function(o){
    var complete=items.some(function(x){return x.order_id===o.id;})&&sos.some(function(x){return x.order_id===o.id;})&&ds.some(function(x){return x.order_id===o.id;})&&payments.some(function(x){return x.order_id===o.id;});
    if(!complete)problem('PARTIAL_CHECKOUT',o.id,'Sub-order, payment, item atau delivery tidak lengkap. Dilarang auto-retry sebelum audit stok.');
  });
  ksbRows_('IDEMPOTENCY_KEYS').filter(function(k){return k.status==='ERROR'||k.status==='PROCESSING';}).forEach(function(k){problem('INCOMPLETE_OPERATION',k.id,k.action+' · '+k.status+' (cek data sebelum mencoba ulang)');});
  ksbRows_('REFUND_CASES_V15').forEach(function(c){if(['BANK_RECONCILING','STOCK_REVIEW'].includes(c.status))problem('REFUND_NEEDS_REVIEW',c.id,c.status);});
  ksbRows_('REFUND_STOCK_REVIEW_V15').filter(function(x){return x.status==='APPLYING';}).forEach(function(x){problem('POSSIBLE_PARTIAL_RESTOCK',x.id,'Bandingkan stok dan inventory movements secara manual. Jangan ulangi otomatis.');});
  return {status:issues.length?'ACTION_REQUIRED':'NO_ISSUES_DETECTED',issueCount:issues.length,issues:issues,checkedAt:ksbNow_(),checkedOrders:orders.length,disclaimer:'Tidak menjamin tidak ada kesalahan. Selalu cocokkan laporan bank, mutasi QRIS, stok fisik, pengiriman dan saldo hak mitra.'};
}
function ksbV15Preflight_(actor){
  ksbRole_(actor,'ADMIN');var checks=[];
  function add(name,ok,detail){checks.push({name:name,passed:!!ok,detail:detail});}
  add('Database dikonfigurasi',!!ksbProperty_('SPREADSHEET_ID'),'Google Sheets ID');
  add('Folder Drive privat',!!ksbProperty_('DRIVE_FOLDER_ID'),'Kunci akses folder oleh pemilik');
  add('Email admin',!!ksbProperty_('ADMIN_EMAIL'),'Role Admin ditetapkan di server');
  add('Registrasi publik + anti-bot',ksbPublicSignupEnabled_(),'Turnstile site+secret+hostname harus diuji langsung');
  add('Mode perdagangan aktif',ksbV10Enabled_(),'CATALOG tidak menerima checkout');
  add('Mutasi bank tercatat',ksbRows_('BANK_MUTATIONS_V11').length>0,'Verifikasi mutasi dari sumber bank, bukan hanya bukti foto');
  add('Tidak ada temuan integritas',ksbV15IntegrityReport_(actor).issueCount===0,'Harus dilakukan setiap hari');
  add('Persetujuan rekening pengelola',ksbProperty_('V10_BANK_BUSINESS_VERIFIED','0')==='1','Bukti persetujuan bank harus disimpan di luar sistem');
  add('Kajian alur dana pihak ketiga',ksbProperty_('V10_FUNDS_FLOW_LEGAL_REVIEW','0')==='1','Diperlukan kesesuaian model bisnis/pembayaran');
  add('Audit keamanan eksternal',ksbProperty_('V10_PUBLIC_SECURITY_AUDIT','0')==='1','Pengujian langsung oleh tenaga profesional');
  add('Uji transaksi nyata & refund',ksbProperty_('V10_REAL_TRANSACTION_E2E_TESTS','0')==='1'&&ksbProperty_('V10_REFUND_PROCESS_APPROVED','0')==='1','Memerlukan bukti bank/QRIS dan pengiriman nyata');
  return {checks:checks,passed:checks.every(function(c){return c.passed;}),warning:'Pengaturan TRUE sendiri bukan bukti pemenuhan hukum, audit, ataupun keandalan produksi.'};
}
