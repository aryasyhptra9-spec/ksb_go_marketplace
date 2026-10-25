/** KSB GO V4: public discovery, stores, favorites, and verified-purchase reviews.
 * Every private route obtains the authenticated actor from api() in Code.gs.
 */
function ksbMarketCatalog_(args){
  args=args||{};
  var q=String(args.q||'').trim().toLowerCase().slice(0,100);
  var district=String(args.district||''),category=String(args.category||''),storeId=String(args.storeId||'');
  var min=Number(args.minPrice||0),max=Number(args.maxPrice||0);
  ksbRequire_(Number.isFinite(min)&&min>=0&&Number.isFinite(max)&&max>=0,'Filter harga salah.');
  ksbRequire_(!max||max>=min,'Harga maksimum harus lebih besar dari minimum.');
  var shops={},categories=ksbRows_('CATEGORIES').filter(function(c){return ksbBool_(c.active);});
  ksbRows_('SELLER_STORES').forEach(function(s){if(s.status==='ACTIVE')shops[s.id]=s;});
  var img={};ksbRows_('PRODUCT_IMAGES').sort(function(a,b){return Number(a.sort_order||0)-Number(b.sort_order||0);}).forEach(function(i){if(!i.removed_at&&!img[i.product_id])img[i.product_id]=i.file_id;});
  var stars={},counts={};ksbRows_('REVIEWS').forEach(function(r){var n=Number(r.rating);if(n>=1&&n<=5){var key=String(r.product_id||'');if(key){stars[key]=(stars[key]||0)+n;counts[key]=(counts[key]||0)+1;}}});
  var items=ksbRows_('PRODUCTS').filter(function(p){var s=shops[p.store_id],price=Number(p.price);return ksbBool_(p.active)&&s&&Number(p.stock)>0&&(!q||(p.name+' '+s.name+' '+p.description).toLowerCase().indexOf(q)>=0)&&(!district||s.district_id===district)&&(!category||p.category_id===category)&&(!storeId||s.id===storeId)&&price>=min&&(!max||price<=max);}).map(function(p){var s=shops[p.store_id];return {id:p.id,name:p.name,description:String(p.description||'').slice(0,150),price:Number(p.price),stock:Number(p.stock),category_id:p.category_id,store_id:s.id,store_name:s.name,district_id:s.district_id,image:img[p.id]?ksbImageUrl_(img[p.id]):'',rating:counts[p.id]?Math.round(stars[p.id]/counts[p.id]*10)/10:null,review_count:counts[p.id]||0,created_at:p.created_at||''};});
  var sort=String(args.sort||'newest');
  if(sort==='price_asc')items.sort(function(a,b){return a.price-b.price||a.id.localeCompare(b.id);});
  else if(sort==='price_desc')items.sort(function(a,b){return b.price-a.price||a.id.localeCompare(b.id);});
  else if(sort==='rating')items.sort(function(a,b){return (b.rating||0)-(a.rating||0)||b.review_count-a.review_count;});
  else items.sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at))||b.id.localeCompare(a.id);});
  return {products:ksbPagination_(items,args),categories:categories.map(function(c){return {id:c.id,name:c.name};}),storeCount:Object.keys(shops).length};
}
function ksbMarketStore_(args){
  var id=ksbString_(args.id||'',100),s=ksbRow_('SELLER_STORES',id);
  ksbRequire_(s&&s.status==='ACTIVE','Toko tidak ditemukan atau sedang tidak aktif.');
  var district=ksbRow_('DISTRICTS',s.district_id);
  var data=ksbMarketCatalog_({storeId:id,q:args.q||'',sort:args.sort||'newest',page:args.page||1,size:args.size||24});
  return {store:{id:s.id,name:s.name,description:s.description||'',address:s.address,district:district?district.name:'',district_id:s.district_id,whatsapp:s.whatsapp||'',opening_time:s.opening_time||'',closing_time:s.closing_time||''},products:data.products};
}
function ksbMarketProductReviews_(args){
  var id=ksbString_(args.productId||'',100),p=ksbRow_('PRODUCTS',id);
  ksbRequire_(p&&ksbBool_(p.active),'Produk tidak ditemukan.');
  var users={};ksbRows_('USERS').forEach(function(u){users[u.id]=u;});
  var rows=ksbRows_('REVIEWS').filter(function(r){return r.product_id===id;}).map(function(r){return {id:r.id,rating:Number(r.rating),comment:r.comment,created_at:r.created_at,buyer_name:users[r.buyer_id]?String(users[r.buyer_id].display_name||'Pembeli').split(' ')[0]:'Pembeli'};}).sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at));});
  return {total:rows.length,average:rows.length?Math.round(rows.reduce(function(s,r){return s+r.rating;},0)/rows.length*10)/10:null,reviews:ksbPagination_(rows,args)};
}
function ksbMarketFavoriteList_(actor,args){
  var ids={};ksbRows_('SHOP_FAVORITES').filter(function(f){return f.user_id===actor.id;}).forEach(function(f){ids[f.product_id]=true;});
  var products=ksbRows_('PRODUCTS').filter(function(p){return ids[p.id]&&ksbBool_(p.active);});
  var shops={};ksbRows_('SELLER_STORES').forEach(function(s){if(s.status==='ACTIVE')shops[s.id]=s;});
  var img={};ksbRows_('PRODUCT_IMAGES').forEach(function(i){if(!i.removed_at&&!img[i.product_id])img[i.product_id]=i.file_id;});
  var rows=products.filter(function(p){return shops[p.store_id];}).map(function(p){var s=shops[p.store_id];return {id:p.id,name:p.name,price:Number(p.price),stock:Number(p.stock),store_id:s.id,store_name:s.name,district_id:s.district_id,image:img[p.id]?ksbImageUrl_(img[p.id]):'',rating:null,review_count:0};});
  return {ids:Object.keys(ids),items:rows};
}
function ksbMarketFavoriteToggle_(actor,args){
  var productId=ksbString_(args.productId||'',100),p=ksbRow_('PRODUCTS',productId);
  ksbRequire_(p&&ksbBool_(p.active),'Produk tidak tersedia.');
  return ksbWithLock_(function(){var old=ksbFilter_('SHOP_FAVORITES',function(f){return f.user_id===actor.id&&f.product_id===productId;})[0];
    if(old){ksbRemoveByIdV4_('SHOP_FAVORITES',old.id);return {favorite:false};}
    ksbAppend_('SHOP_FAVORITES',{id:ksbId_('FAV'),user_id:actor.id,product_id:productId,created_at:ksbNow_()});return {favorite:true};
  });
}
/** Favorites may be removed; financial ledger and order records are never deleted. */
function ksbRemoveByIdV4_(name,id){var sh=ksbSheet_(name),heads=ksbHeaders_(name),idx=heads.indexOf('id'),last=sh.getLastRow();if(last<2)return;var rows=sh.getRange(2,idx+1,last-1,1).getDisplayValues();for(var i=0;i<rows.length;i++){if(rows[i][0]===id){sh.deleteRow(i+2);return;}}}
function ksbMarketReviewSubmit_(actor,args){
  var orderItemId=ksbString_(args.orderItemId||'',100),rating=Number(args.rating),comment=ksbString_(args.comment||'',750);
  ksbRequire_(Number.isInteger(rating)&&rating>=1&&rating<=5,'Rating harus 1 sampai 5.');
  return ksbWithLock_(function(){var item=ksbRow_('ORDER_ITEMS',orderItemId),order=item?ksbRow_('ORDERS',item.order_id):null;
    ksbRequire_(item&&order&&order.buyer_id===actor.id,'Hanya pembeli produk dapat memberikan ulasan.');
    ksbRequire_(order.status==='DELIVERED'&&order.payment_status==='PAID','Ulasan hanya setelah pesanan lunas dan diterima.');
    ksbRequire_(!ksbFilter_('REVIEWS',function(r){return r.order_item_id===orderItemId;}).length,'Produk ini sudah diulas.');
    var data={id:ksbId_('REV'),order_item_id:orderItemId,product_id:item.product_id,buyer_id:actor.id,rating:rating,comment:comment,created_at:ksbNow_()};
    ksbAppend_('REVIEWS',data);ksbAudit_(actor.id,'REVIEW_PRODUCT','PRODUCT',item.product_id,{rating:rating});return {id:data.id};
  });
}
function migrateMarketplaceV4_(){
  var book=ksbBook_();
  var extra={SHOP_FAVORITES:'id,user_id,product_id,created_at'};
  Object.keys(extra).forEach(function(name){var heads=extra[name].split(','),sh=book.getSheetByName(name)||book.insertSheet(name);if(sh.getLastRow()===0){sh.getRange(1,1,1,heads.length).setValues([heads]);sh.setFrozenRows(1);}else{var old=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];ksbRequire_(old.join(',')===heads.join(','),'Skema '+name+' berbeda.');}});
  var reviews=book.getSheetByName('REVIEWS');ksbRequire_(reviews,'REVIEWS tidak ditemukan, jalankan instalasi dasar dahulu.');
  var rh=reviews.getRange(1,1,1,reviews.getLastColumn()).getDisplayValues()[0];
  if(rh.indexOf('product_id')<0){reviews.getRange(1,reviews.getLastColumn()+1,1,1).setValue('product_id');}
  var col=reviews.getRange(1,1,1,reviews.getLastColumn()).getDisplayValues()[0].indexOf('product_id')+1;
  var refs={};ksbRows_('ORDER_ITEMS').forEach(function(item){refs[item.id]=item.product_id;});
  if(reviews.getLastRow()>1){
    var ids=reviews.getRange(2,1,reviews.getLastRow()-1,1).getDisplayValues().map(function(r){return r[0];});
    var reviewRows=ksbRows_('REVIEWS'),byId={};reviewRows.forEach(function(r){byId[r.id]=r;});
    var existing=reviews.getRange(2,col,reviews.getLastRow()-1,1).getDisplayValues();
    var values=ids.map(function(id,i){var rev=byId[id];return [existing[i][0]||refs[rev?rev.order_item_id:'']||''];});
    reviews.getRange(2,col,values.length,1).setNumberFormat('@').setValues(values);
  }
  return {version:'V4_MARKETPLACE',tables:Object.keys(KSB_SCHEMA).length};
}
