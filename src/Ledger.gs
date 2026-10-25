/** Double-entry append-only accounting, integer Rupiah. Never edit an existing ledger entry. */
function ksbAccountBalance_(account,partyId){return ksbFilter_('LEDGER_ENTRIES',function(x){return x.account===account&&(partyId===undefined||x.party_id===partyId);}).reduce(function(s,x){return s+Number(x.credit)-Number(x.debit);},0);}
function ksbCashBalance_(){return -ksbAccountBalance_('CASH_PLATFORM');}
function ksbJournal_(type,sourceId,orderId,description,entries){
  var existing=ksbFilter_('LEDGER_ENTRIES',function(e){return e.source_type===type&&e.source_id===sourceId;});ksbRequire_(existing.length===0,'Jurnal sudah pernah diproses, periksa audit sebelum mengulangi.');
  var debit=0,credit=0;entries.forEach(function(e){e.debit=ksbAmount_(e.debit||0,'Debit');e.credit=ksbAmount_(e.credit||0,'Kredit');ksbRequire_(e.debit===0||e.credit===0,'Jurnal tidak boleh debit dan kredit pada satu baris');debit+=e.debit;credit+=e.credit;});ksbRequire_(debit===credit&&debit>0,'Jurnal tidak seimbang: '+debit+' vs '+credit);var journalId=ksbId_('JRN'),now=ksbNow_();entries.filter(function(e){return e.debit||e.credit;}).forEach(function(e){ksbAppend_('LEDGER_ENTRIES',{id:ksbId_('LE'),journal_id:journalId,account:e.account,party_id:e.party_id||'',debit:e.debit,credit:e.credit,order_id:orderId,source_type:type,source_id:sourceId,description:description,created_at:now});});return journalId;
}
function ksbFinalizeDelivery_(delivery,actor){
  var d=ksbRow_('DELIVERY_ORDERS',delivery.id),order=ksbRow_('ORDERS',d.order_id),so=d.seller_order_id?ksbRow_('SELLER_ORDERS',d.seller_order_id):null;
  var subtotal=so?Number(so.subtotal):0,discount=so?Number(so.discount):0,shipping=Number(d.shipping_fee),buyerFee=so?Number(so.buyer_fee_share):Number(order.buyer_fee);
  var sellerFee=so&&so.seller_fee_amount!==''?Number(so.seller_fee_amount):Math.floor(subtotal*ksbSettingNumber_('seller_fee_percent',5)/100),courierFee=d.courier_fee_amount!==''?Number(d.courier_fee_amount):Math.floor(shipping*ksbSettingNumber_('courier_fee_percent',10)/100);
  var total=subtotal-discount+shipping+buyerFee,courier=ksbRow_('COURIERS',d.courier_id),store=so?ksbRow_('SELLER_STORES',so.store_id):null,seller=store?ksbRow_('SELLERS',store.seller_id):null;
  ksbRequire_(courier&&total>0,'Data keuangan pengiriman tidak valid.');
  var debitAccount=['TRANSFER','GATEWAY'].indexOf(order.payment_method)>=0?'CUSTOMER_ESCROW':'COD_RECEIVABLE_COURIER';
  var entries=[{account:debitAccount,party_id:order.payment_method==='COD'?courier.user_id:'',debit:total},{account:'PLATFORM_PROMO_EXPENSE',debit:discount},{account:'PAYABLE_SELLER',party_id:seller?seller.user_id:'',credit:subtotal-sellerFee},{account:'PAYABLE_COURIER',party_id:courier.user_id,credit:shipping-courierFee},{account:'REVENUE_SELLER_FEE',credit:sellerFee},{account:'REVENUE_COURIER_FEE',credit:courierFee},{account:'REVENUE_BUYER_FEE',credit:buyerFee}];
  ksbJournal_('DELIVERY_FINAL',d.id,order.id,'Penyelesaian pengiriman',entries);
  if(sellerFee)ksbAppend_('PLATFORM_FEES',{id:ksbId_('FEE'),order_id:order.id,party_id:seller.user_id,fee_type:'SELLER_FEE',amount:sellerFee,fee_mode:'DEDUCTED',created_at:ksbNow_()});
  if(courierFee)ksbAppend_('PLATFORM_FEES',{id:ksbId_('FEE'),order_id:order.id,party_id:courier.user_id,fee_type:'COURIER_FEE',amount:courierFee,fee_mode:'DEDUCTED',created_at:ksbNow_()});
  if(order.payment_method==='COD')ksbAppend_('COD_COLLECTIONS',{id:ksbId_('COD'),delivery_id:d.id,order_id:order.id,courier_id:courier.id,amount:total,remaining_amount:total,status:'COLLECTED_BY_COURIER',collected_at:ksbNow_(),updated_at:ksbNow_()});
  if(so)ksbPatch_('SELLER_ORDERS',so.id,{status:'DELIVERED',updated_at:ksbNow_()});
  var all=ksbFilter_('DELIVERY_ORDERS',function(x){return x.order_id===order.id;}),done=all.every(function(x){return x.status==='DELIVERED';});
  ksbPatch_('ORDERS',order.id,{status:done?'DELIVERED':'PARTIALLY_DELIVERED',updated_at:ksbNow_()});
  if(done&&order.payment_method==='COD'){ksbPatch_('ORDERS',order.id,{payment_status:'COD_COLLECTED_BY_COURIER'});ksbFilter_('PAYMENTS',function(p){return p.order_id===order.id&&p.method==='COD';}).forEach(function(p){ksbPatch_('PAYMENTS',p.id,{status:'COD_COLLECTED_BY_COURIER'});});}
  ksbHistory_(order.id,'ORDER',done?'DELIVERED':'PARTIALLY_DELIVERED',actor.id,'Status agregat');
}
function ksbReverseJournal_(actor,sourceType,sourceId,reason){ksbRole_(actor,'ADMIN');return ksbWithLock_(function(){var original=ksbFilter_('LEDGER_ENTRIES',function(e){return e.source_type===sourceType&&e.source_id===sourceId;});ksbRequire_(original.length>0,'Jurnal asli tidak ditemukan');var reversalId=sourceType+':'+sourceId,entries=original.map(function(e){return {account:e.account,party_id:e.party_id,debit:Number(e.credit),credit:Number(e.debit)};});ksbJournal_('REVERSAL',reversalId,original[0].order_id,'Koreksi: '+ksbString_(reason,300),entries);ksbAudit_(actor.id,'REVERSE_JOURNAL','LEDGER',reversalId,{reason:reason});return {ok:true};});}
