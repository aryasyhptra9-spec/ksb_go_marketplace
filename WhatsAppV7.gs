/** WhatsApp communication is optional and never verifies payments or delivery by itself. */
function ksbWhatsAppUrlV7_(phone,message){
 var n=ksbWhatsAppNumber_(phone);if(!n)return '';
 return 'https://wa.me/'+n+'?text='+encodeURIComponent(ksbString_(message,600));
}
/** Caller is an assigned courier; never publish buyer contact to the job board. */
function ksbCourierBuyerWaUrl_(actor,deliveryId){
 var c=ksbOwnCourier_(actor),d=ksbRow_('DELIVERY_ORDERS',deliveryId);
 ksbRequire_(d&&d.courier_id===c.id,'Kontak pembeli hanya untuk kurir yang mendapat order.');
 var order=ksbRow_('ORDERS',d.order_id);
 if(!order||!ksbBool_(order.whatsapp_consent)||['CANCELLED','RETURNED','DELIVERED'].indexOf(d.status)>=0)return '';
 return ksbWhatsAppUrlV7_(d.recipient_phone,'Halo, saya kurir KSB RUTE untuk pesanan '+order.id+'. Jika berkenan, mohon kirim lokasi pengantaran melalui fitur Share Location WhatsApp. Terima kasih.');
}
function ksbCourierBuyerWhatsAppV7_(actor,args){return {url:ksbCourierBuyerWaUrl_(actor,ksbString_(args.deliveryId,90))};}
function ksbPartnerAdminWaV7_(actor,args){
 var role=String(args.role||'');ksbRequire_(['SELLER','COURIER'].indexOf(role)>=0,'Pilih peran mitra.');
 if(role==='SELLER')ksbRequire_(ksbSellerStore_(actor),'Toko belum dibuat.');else ksbOwnCourier_(actor);
 var phone=ksbProperty_('ADMIN_WHATSAPP');ksbRequire_(phone,'Nomor WhatsApp Admin belum dikonfigurasi.');
 var id=ksbString_(args.claimId||'',100),claim=id?ksbRow_('MANUAL_CLAIMS_V7',id):null;
 if(id)ksbRequire_(claim&&claim.party_id===actor.id&&claim.party_type===role,'Tagihan bukan milik Anda.');
 var items=id?ksbFilter_('MANUAL_CLAIM_ITEMS_V7',function(i){return i.claim_id===id;}):[];
 var orderIds=items.map(function(i){return i.order_id;});
 var overview=orderIds.slice(0,8).join(', ')+(orderIds.length>8?' dan '+(orderIds.length-8)+' order lainnya':'');
 var msg=id?'Halo Admin KSB GO. Saya mengajukan tagihan '+id+' ('+role+') sebesar Rp'+Number(claim.total).toLocaleString('id-ID')+'.\nOrder pilihan ('+items.length+'): '+overview+'.\nMohon diproses setelah pengecekan. Saya lampirkan file PDF rekap tagihan secara manual.':'Halo Admin KSB GO, saya ingin menanyakan pencairan penghasilan sebagai '+(role==='SELLER'?'seller':'kurir')+'.';
 return {url:ksbWhatsAppUrlV7_(phone,msg)};
}

/** Generate WhatsApp draft for Admin AFTER paid bank-reconciled claim. No automatic attachment or payout. */
function ksbAdminPartnerPaidWaV16_(actor,args){
 ksbRole_(actor,'ADMIN');
 var id=ksbString_(args.claimId,100),claim=ksbRow_('MANUAL_CLAIMS_V7',id);
 ksbRequire_(claim&&claim.status==='PAID'&&!!claim.bank_reference,'Tagihan harus telah ditransfer dan direkonsiliasi dahulu.');
 var user=ksbRow_('USERS',claim.party_id);
 ksbRequire_(user&&user.phone,'Mitra belum menyimpan nomor WhatsApp di profil.');
 var msg='Halo, pencairan KSB GO untuk tagihan '+claim.id+' sebesar Rp'+Number(claim.total).toLocaleString('id-ID')+' sudah ditransfer. Referensi bank: '+claim.bank_reference+'. Mohon cek rekening tujuan yang terverifikasi. Bukti transfer saya kirim sebagai lampiran WhatsApp terpisah.';
 var url=ksbWhatsAppUrlV7_(user.phone,msg);
 ksbRequire_(url,'Nomor WhatsApp mitra tidak valid.');
 return {url:url,claimId:id};
}
