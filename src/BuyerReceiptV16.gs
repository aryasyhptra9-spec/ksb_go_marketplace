/** KSB GO V16 — receipt acknowledgement before claim eligibility.
 * The receipt is an immutable ORDER_STATUS_HISTORY event, so existing Sheets need no schema migration.
 * Courier DELIVERED means courier-reported delivery; buyer RECEIVED means confirmed acceptance.
 */
function ksbV16BuyerReceiptMap_(){
 var map={};
 ksbRows_('ORDER_STATUS_HISTORY').forEach(function(h){
  if(h.status==='RECEIVED'&&String(h.entity).indexOf('BUYER_RECEIPT:')===0){map[String(h.entity).slice('BUYER_RECEIPT:'.length)]=true;}
 });
 return map;
}
function ksbV16ConfirmBuyerReceipt_(actor,args){
 ksbV10RequireCommerce_();ksbRole_(actor,'BUYER');
 return ksbWithLock_(function(){
  var id=ksbString_(args.deliveryId,100),d=ksbRow_('DELIVERY_ORDERS',id);
  ksbRequire_(d&&d.type==='MARKETPLACE','Pengiriman produk tidak ditemukan.');
  var o=ksbRow_('ORDERS',d.order_id);
  ksbRequire_(o&&o.buyer_id===actor.id,'Pesanan bukan milik pembeli ini.');
  ksbRequire_(o.payment_method==='TRANSFER'&&o.payment_status==='PAID','Pembayaran belum terverifikasi.');
  ksbRequire_(d.status==='DELIVERED'&&!!d.proof_delivery_file,'Bukti pengantaran kurir belum tersedia.');
  ksbRequire_(['DELIVERED','PARTIALLY_DELIVERED'].indexOf(o.status)>=0,'Pesanan tidak dalam status pengantaran selesai.');
  ksbRequire_(!ksbFilter_('REFUND_CASES_V15',function(r){return r.order_id===o.id&&r.status!=='REJECTED';}).length,'Pesanan dalam penanganan refund. Hubungi Admin.');
  ksbRequire_(!ksbV16BuyerReceiptMap_()[d.id],'Penerimaan ini sudah dikonfirmasi.');
  ksbHistory_(o.id,'BUYER_RECEIPT:'+d.id,'RECEIVED',actor.id,'Pembeli mengonfirmasi barang benar-benar telah diterima.');
  ksbAudit_(actor.id,'BUYER_RECEIVED_V16','DELIVERY',d.id,{orderId:o.id});
  return {deliveryId:d.id,orderId:o.id,received:true};
 });
}
