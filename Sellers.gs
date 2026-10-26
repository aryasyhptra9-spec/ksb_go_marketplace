function ksbSellerOrders_(actor,args){
  var store=ksbSellerStore_(actor);
  ksbRequire_(store,'Toko belum dibuat.');
  var result=ksbPagination_(ksbPageSort_(ksbFilter_('SELLER_ORDERS',function(o){return o.store_id===store.id;}),'created_at'),args);
  // Read-only status for this seller's own order. The server still enforces PAID before accepting.
  result.items=result.items.map(function(so){
    var order=ksbRow_('ORDERS',so.order_id);
    var method=order?String(order.payment_method||''):'';
    var status=order?String(order.payment_status||''):'UNKNOWN';
    return Object.assign({},so,{
      payment_method:method,
      payment_status:status,
      payment_verified:!!order&&(status==='PAID'||method==='COD')
    });
  });
  return result;
}
function ksbSellerOrderStatus_(actor,args){ksbV10RequireCommerce_();var so=ksbRow_('SELLER_ORDERS',args.id);ksbRequire_(so,'Sub-order tidak ditemukan');ksbOwnStore_(actor,so.store_id);var next=String(args.status);return ksbWithLock_(function(){so=ksbRow_('SELLER_ORDERS',args.id);var allowed={NEW:['ACCEPTED','REJECTED'],ACCEPTED:['PREPARING'],PREPARING:['READY']};ksbRequire_((allowed[so.status]||[]).indexOf(next)>=0,'Status seller tidak dapat diubah ke '+next);var order=ksbRow_('ORDERS',so.order_id),d=ksbRow_('DELIVERY_ORDERS',so.delivery_id);ksbRequire_(order&&!['DISPUTED','CANCELLED'].includes(order.status),'Pesanan sedang disengketakan atau dibatalkan.');
  ksbRequire_(order.payment_method==='COD'||order.payment_status==='PAID','Menunggu verifikasi transfer.');
  if(next==='REJECTED'){
    ksbRequire_(d.status==='WAITING_SELLER','Kurir sudah ditugaskan.');
    ksbPatch_('SELLER_ORDERS',so.id,{status:'REJECTED',updated_at:ksbNow_()});ksbPatch_('DELIVERY_ORDERS',d.id,{status:'CANCELLED'});ksbPatch_('ORDERS',order.id,{status:'DISPUTED',updated_at:ksbNow_()});
    // Money and stock corrections for rejected paid orders require audited admin refund workflow.
    ksbAudit_(actor.id,'REJECT_ORDER','SELLER_ORDER',so.id,{requiresRefund:true});return {status:'REJECTED',requiresAdminRefund:true};
  }
  ksbPatch_('SELLER_ORDERS',so.id,{status:next,updated_at:ksbNow_()});if(next==='READY'){ksbPatch_('DELIVERY_ORDERS',d.id,{status:'AVAILABLE',updated_at:ksbNow_()});ksbFilter_('COURIERS',function(c){return ksbBool_(c.verified)&&ksbBool_(c.online);}).slice(0,100).forEach(function(c){ksbNotifyV18_(c.user_id,'Pengiriman tersedia '+d.id,'Pengiriman baru tersedia untuk diklaim di portal Kurir.');});ksbPatch_('ORDERS',order.id,{status:'READY',updated_at:ksbNow_()});}else if(next==='ACCEPTED'||next==='PREPARING')ksbPatch_('ORDERS',order.id,{status:'PROCESSING',updated_at:ksbNow_()});
  ksbHistory_(order.id,'SELLER_ORDER:'+so.id,next,actor.id,'Seller memperbarui pesanan');return {id:so.id,status:next};});}
function ksbSellerDashboard_(actor){var store=ksbSellerStore_(actor);if(!store)return {store:null};var orders=ksbFilter_('SELLER_ORDERS',function(s){return s.store_id===store.id;}),items=ksbFilter_('PRODUCTS',function(p){return p.store_id===store.id;}),seller=ksbRow_('SELLERS',store.seller_id),balance=ksbAccountBalance_('PAYABLE_SELLER',seller.user_id);return {store:store,totalProducts:items.length,totalOrders:orders.length,ready:orders.filter(function(s){return s.status==='READY';}).length,completed:orders.filter(function(s){return s.status==='DELIVERED';}).length,payable:balance,recent:ksbPageSort_(orders,'created_at').slice(0,10)};}
