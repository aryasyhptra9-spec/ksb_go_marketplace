/** Run installProject_() as spreadsheet/Drive owner once. Do not run setup during user requests. */
var KSB_SCHEMA = {
  USERS:'id,email,display_name,phone,active,created_at,updated_at',
  ROLES:'id,user_id,role,status,created_at',
  USER_SESSIONS:'id,user_id,token_hash,expires_at,revoked,created_at',
  AUTH_CHALLENGES:'id,email,role,code_hash,expires_at,attempts,used,created_at',
  SELLERS:'id,user_id,verified,billing_cycle,created_at',
  SELLER_STORES:'id,seller_id,name,description,district_id,address,lat,lng,opening_time,closing_time,status,created_at,whatsapp',
  COURIERS:'id,user_id,verified,online,vehicle,phone,billing_cycle,created_at',
  ADDRESSES:'id,user_id,label,recipient,phone,district_id,address,lat,lng,notes,created_at',
  DISTRICTS:'id,name,active,created_at',
  DELIVERY_ZONES:'id,from_district,to_district,fixed_tariff,active,created_at',
  CATEGORIES:'id,name,slug,active,created_at',
  PRODUCTS:'id,store_id,category_id,name,description,price,stock,active,created_at,updated_at',
  PRODUCT_VARIANTS:'id,product_id,name,price_delta,stock,active,created_at',
  PRODUCT_IMAGES:'id,product_id,file_id,sort_order,created_at,removed_at',
  INVENTORY_MOVEMENTS:'id,product_id,variant_id,order_id,quantity_delta,reason,created_at',
  CARTS:'id,user_id,created_at,updated_at',
  CART_ITEMS:'id,cart_id,product_id,variant_id,quantity,created_at',
  ORDERS:'id,buyer_id,address_id,payment_method,payment_status,status,subtotal,discount,shipping_total,buyer_fee,grand_total,voucher_id,created_at,updated_at,whatsapp_consent',
  ORDER_ITEMS:'id,order_id,seller_order_id,product_id,variant_id,quantity,unit_price,line_total,created_at',
  SELLER_ORDERS:'id,order_id,store_id,status,subtotal,discount,shipping_fee,seller_fee_amount,courier_fee_amount,buyer_fee_share,cod_due,delivery_id,created_at,updated_at',
  DELIVERY_ORDERS:'id,order_id,seller_order_id,type,sender_id,recipient_id,pickup_address,dropoff_address,sender_phone,recipient_phone,pickup_lat,pickup_lng,dropoff_lat,dropoff_lng,from_district,to_district,route_distance_m,route_duration_s,shipping_fee,courier_fee_amount,payment_method,cod_due,courier_id,status,proof_pickup_file,proof_delivery_file,created_at,updated_at',
  COURIER_CLAIMS:'id,delivery_id,courier_id,status,claimed_at,picked_up_at',
  ORDER_STATUS_HISTORY:'id,order_id,entity,status,actor_id,notes,created_at',
  PAYMENTS:'id,order_id,method,reference,amount,status,verified_by,verified_at,created_at',
  PAYMENT_PROOFS:'id,payment_id,file_id,uploaded_by,created_at',
  COD_COLLECTIONS:'id,delivery_id,order_id,courier_id,amount,remaining_amount,status,collected_at,updated_at',
  LEDGER_ENTRIES:'id,journal_id,account,party_id,debit,credit,order_id,source_type,source_id,description,created_at',
  PLATFORM_FEES:'id,order_id,party_id,fee_type,amount,fee_mode,created_at',
  SETTLEMENTS:'id,party_id,party_type,amount,bank_reference,status,created_by,created_at',
  SETTLEMENT_ITEMS:'id,settlement_id,order_id,amount,created_at',
  PARTNER_PAYOUT_ACCOUNTS:'id,party_id,party_type,bank_name,account_number,account_holder,status,verified_by,verified_at,created_at,updated_at',
  MANUAL_CLAIMS_V7:'id,party_id,party_type,bank_account_id,bank_name,bank_number_masked,bank_number_hash,bank_holder,total,status,notes,bank_reference,admin_id,created_at,reviewed_at,paid_at',
  MANUAL_CLAIM_ITEMS_V7:'id,claim_id,source_id,order_id,amount,created_at',
  INVOICES:'id,party_id,party_type,period_start,period_end,cycle,invoice_type,total,paid,balance,status,due_date,issued_at,created_at',
  INVOICE_ITEMS:'id,invoice_id,source_type,source_id,description,amount,created_at',
  INVOICE_PAYMENTS:'id,invoice_id,amount,bank_reference,verified_by,created_at',
  VOUCHERS:'id,code,discount_type,value,min_spend,max_discount,usage_limit,used_count,active,starts_at,ends_at,created_at',
  NOTIFICATIONS:'id,user_id,title,message,is_read,created_at',
  REVIEWS:'id,order_item_id,buyer_id,rating,comment,created_at,product_id',
  SHOP_FAVORITES:'id,user_id,product_id,created_at',
  FILE_ATTACHMENTS:'id,entity_type,entity_id,owner_id,file_id,mime,name,visibility,created_at',
  APP_SETTINGS:'id,key,value,description,updated_at',
  AUDIT_LOGS:'id,actor_id,action,entity_type,entity_id,detail_json,created_at',
  IDEMPOTENCY_KEYS:'id,actor_id,action,request_key,status,response_json,created_at',
  GATEWAY_SESSIONS:'id,order_id,payment_id,provider,reference_id,provider_session_id,amount,status,checkout_url,provider_payment_id,created_at,updated_at',
  GATEWAY_EVENTS:'id,event_id,event_type,raw_json,status,attempts,error,created_at,processed_at',
  PAYOUT_REQUESTS:'id,party_id,party_type,account_id,account_fingerprint,amount,provider,provider_payout_id,reference_id,status,error,created_at,updated_at',
  GATEWAY_SETTLEMENT_RECEIPTS:'id,bank_reference,gross,fee,net,created_by,created_at',
  BANK_MUTATIONS_V11:'id,reference,direction,channel,amount,bank_date,description,status,matched_entity_type,matched_entity_id,created_by,created_at,matched_at',
  REFUND_CASES_V15:'id,order_id,buyer_id,payment_id,amount,reason,status,reviewed_by,review_note,bank_reference,requested_at,reviewed_at,paid_at',
  REFUND_STOCK_REVIEW_V15:'id,refund_id,order_id,product_id,order_item_id,quantity,status,created_at,reviewed_by,reviewed_at,note'
};
function installProject_(){
  var props=PropertiesService.getScriptProperties(),bookId=props.getProperty('SPREADSHEET_ID'),book=bookId?SpreadsheetApp.openById(bookId):SpreadsheetApp.create('KSB GO + KSB RUTE | Database');
  if(!bookId)props.setProperty('SPREADSHEET_ID',book.getId());
  // Rekening resmi yang disetujui operator; jangan timpa pengaturan yang sudah ada.
  var bankDefaults={BANK_NAME:'BCA',BANK_NUMBER:'0561934877',BANK_HOLDER:'Arya Syah Putra'};
  Object.keys(bankDefaults).forEach(function(k){if(!props.getProperty(k))props.setProperty(k,bankDefaults[k]);});
  if(!props.getProperty('DRIVE_FOLDER_ID'))props.setProperty('DRIVE_FOLDER_ID',DriveApp.createFolder('KSB GO - Private Storage').getId());
  Object.keys(KSB_SCHEMA).forEach(function(name){var heads=KSB_SCHEMA[name].split(','),sh=book.getSheetByName(name)||book.insertSheet(name);if(sh.getLastRow()===0){sh.getRange(1,1,1,heads.length).setValues([heads]);sh.setFrozenRows(1);sh.getRange(1,1,1,heads.length).setFontWeight('bold').setBackground('#d6f0df');}else{var old=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];ksbRequire_(heads.join(',')===old.join(','),'Skema sheet '+name+' berbeda; migrasi manual diperlukan.');}});
  var extra=book.getSheetByName('Sheet1');if(extra&&extra.getLastRow()===0&&book.getSheets().length>1)book.deleteSheet(extra);
  var defaults={delivery_base:'8000',delivery_per_km:'2500',delivery_min:'8000',delivery_per_extra_kg:'1500',delivery_express_extra:'7000',delivery_interdistrict_extra:'5000',buyer_fee:'2000',delivery_basket_percent:'1',delivery_basket_cap:'3000',seller_fee_percent:'5',courier_fee_percent:'10',max_package_kg:'25',marketplace_prepaid_only:'1'};
  Object.keys(defaults).forEach(function(key){if(!ksbFilter_('APP_SETTINGS',function(r){return r.key===key;}).length)ksbAppend_('APP_SETTINGS',{id:ksbId_('SET'),key:key,value:defaults[key],description:'Konfigurasi awal; ubah di menu admin sebelum operasi',updated_at:ksbNow_()});});
  ['Taliwang','Seteluk','Poto Tano','Brang Rea','Brang Ene','Jereweh','Maluk','Sekongkang'].forEach(function(name){var id='DIST_'+name.toUpperCase().replace(/\s/g,'_');if(!ksbRow_('DISTRICTS',id))ksbAppend_('DISTRICTS',{id:id,name:name,active:'TRUE',created_at:ksbNow_()});});
  ['Makanan dan Minuman','Sembako','Pertanian','Elektronik','Fashion','Kebutuhan Rumah','Produk UMKM','Lainnya'].forEach(function(name){var slug=name.toLowerCase().replace(/\s+/g,'-');if(!ksbFilter_('CATEGORIES',function(r){return r.slug===slug;}).length)ksbAppend_('CATEGORIES',{id:ksbId_('CAT'),name:name,slug:slug,active:'TRUE',created_at:ksbNow_()});});
  var sec=PropertiesService.getScriptProperties();
  if(!sec.getProperty('AUTH_OTP_PEPPER'))sec.setProperty('AUTH_OTP_PEPPER',Utilities.getUuid()+Utilities.getUuid());
  if(!sec.getProperty('AUTH_ALLOW_PUBLIC_SIGNUP'))sec.setProperty('AUTH_ALLOW_PUBLIC_SIGNUP','0');
  Logger.log(JSON.stringify({spreadsheetId:book.getId(),folderId:props.getProperty('DRIVE_FOLDER_ID'),url:book.getUrl()}));
  return {spreadsheetUrl:book.getUrl(),folderId:props.getProperty('DRIVE_FOLDER_ID'),tables:Object.keys(KSB_SCHEMA).length};
}

/** Once-only upgrade for EXISTING installations, preserving existing data. Run as owner.
    New installs: installProject_() already creates V2 tables and columns. */
function migrateSellerPaymentsV2_(){
  var book=ksbBook_(),sh=book.getSheetByName('SELLER_STORES');
  ksbRequire_(sh,'Tabel toko belum tersedia; gunakan installProject_() untuk instalasi baru.');
  var old=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  if(old.indexOf('whatsapp')<0){sh.getRange(1,sh.getLastColumn()+1,1,1).setValues([['whatsapp']]);}
  var table='PARTNER_PAYOUT_ACCOUNTS',headers=KSB_SCHEMA[table].split(',');
  var target=book.getSheetByName(table);
  if(!target){target=book.insertSheet(table);target.getRange(1,1,1,headers.length).setValues([headers]);target.setFrozenRows(1);}
  else{var current=target.getRange(1,1,1,target.getLastColumn()).getDisplayValues()[0];ksbRequire_(current.join(',')===headers.join(','),'Skema rekening mitra tidak cocok.');}
  if(!ksbFilter_('APP_SETTINGS',function(r){return r.key==='marketplace_prepaid_only';}).length)ksbAppend_('APP_SETTINGS',{id:ksbId_('SET'),key:'marketplace_prepaid_only',value:'1',description:'1 = hanya pembayaran di muka untuk barang marketplace',updated_at:ksbNow_()});
  return {ok:true,version:'SELLER_PAYMENTS_V2',tables:Object.keys(KSB_SCHEMA).length};
}

/** Upgrade role login tanpa menghapus data lama. Jalankan hanya sebagai pemilik. */
function migrateRoleAuthV5_(){
  var book=ksbBook_(),name='AUTH_CHALLENGES',header=KSB_SCHEMA[name].split(',');
  var sh=book.getSheetByName(name)||book.insertSheet(name);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,header.length).setValues([header]);sh.setFrozenRows(1);}
  else{var old=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];ksbRequire_(old.join(',')===header.join(','),'Kolom AUTH_CHALLENGES tidak sesuai');}
  var prop=PropertiesService.getScriptProperties();
  if(!prop.getProperty('AUTH_OTP_PEPPER'))prop.setProperty('AUTH_OTP_PEPPER',Utilities.getUuid()+Utilities.getUuid());
  if(!prop.getProperty('AUTH_ALLOW_PUBLIC_SIGNUP'))prop.setProperty('AUTH_ALLOW_PUBLIC_SIGNUP','0');
  return {ok:true,table:name,authMode:'EMAIL_OTP_STAGING',publicSignup:prop.getProperty('AUTH_ALLOW_PUBLIC_SIGNUP')};
}

/** One-time V7 migration, owner invocation via temporary offline OPS runner. */
function migrateLocalMarketplaceV7_(){
  var book=ksbBook_();
  ['MANUAL_CLAIMS_V7','MANUAL_CLAIM_ITEMS_V7'].forEach(function(name){
    var heads=KSB_SCHEMA[name].split(','),sh=book.getSheetByName(name)||book.insertSheet(name);
    if(!sh.getLastRow()){sh.getRange(1,1,1,heads.length).setValues([heads]);sh.setFrozenRows(1);}else{
      var existing=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
      ksbRequire_(existing.join(',')===heads.join(','),'Kolom '+name+' tidak sesuai.');
    }
  });
  [{table:'PRODUCT_IMAGES',column:'removed_at'},{table:'ORDERS',column:'whatsapp_consent'}].forEach(function(t){
    var sh=book.getSheetByName(t.table);ksbRequire_(sh,'Tabel '+t.table+' tidak ditemukan.');
    var h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    if(h.indexOf(t.column)<0)sh.getRange(1,sh.getLastColumn()+1).setValue(t.column);
  });
  [{key:'delivery_basket_percent',value:'1'},{key:'delivery_basket_cap',value:'3000'}].forEach(function(a){if(!ksbFilter_('APP_SETTINGS',function(r){return r.key===a.key;}).length)ksbAppend_('APP_SETTINGS',{id:ksbId_('SET'),key:a.key,value:a.value,description:'Tambahan ongkir berdasarkan nilai keranjang: admin dapat mengubah',updated_at:ksbNow_()});});
  return {ok:true,tables:['MANUAL_CLAIMS_V7','MANUAL_CLAIM_ITEMS_V7'],existingRowsPreserved:true};
}
