/** Seller / courier bank profiles are payout destinations, NOT buyer payment accounts.
 *  No funds are transferred by these functions. Use a licensed PJP/provider for payout.
 */
function ksbWhatsAppNumber_(input){
  var s=ksbString_(input||'',25).replace(/[\s()+.-]/g,'');
  if(!s)return '';
  if(s.slice(0,1)==='0')s='62'+s.slice(1);
  else if(s.slice(0,2)==='8')s='62'+s;
  ksbRequire_(/^62[0-9]{8,13}$/.test(s),'Nomor WhatsApp harus nomor Indonesia aktif, mis. 081234567890.');
  return s;
}
function ksbPayoutParty_(actor,type){
  ksbRequire_(type==='SELLER'||type==='COURIER','Jenis mitra tidak valid.');
  if(type==='SELLER'){var store=ksbSellerStore_(actor);ksbRequire_(store,'Buat toko terlebih dahulu.');}
  else ksbOwnCourier_(actor);
  return {partyId:actor.id,partyType:type};
}
function ksbPayoutForParty_(partyId,type){return ksbFilter_('PARTNER_PAYOUT_ACCOUNTS',function(r){return r.party_id===partyId&&r.party_type===type;})[0]||null;}
function ksbPartnerPayoutGet_(actor,args){var t=ksbPayoutParty_(actor,String(args.role||''));var a=ksbPayoutForParty_(t.partyId,t.partyType);return a?{id:a.id,bank_name:a.bank_name,account_number:a.account_number,account_holder:a.account_holder,status:a.status,updated_at:a.updated_at}:{status:'NOT_CONFIGURED',bank_name:'',account_number:'',account_holder:''};}
function ksbPartnerPayoutSave_(actor,args){var t=ksbPayoutParty_(actor,String(args.role||''));
  var bank=ksbString_(args.bank_name,80),number=ksbString_(args.account_number,25).replace(/\s/g,''),holder=ksbString_(args.account_holder,120);
  ksbRequire_(bank.length>=2&&/^[0-9]{6,24}$/.test(number)&&holder.length>=3,'Nama bank, nomor rekening, atau nama pemilik tidak valid.');
  return ksbWithLock_(function(){var old=ksbPayoutForParty_(t.partyId,t.partyType),now=ksbNow_();
    if(old&&old.bank_name===bank&&old.account_number===number&&old.account_holder===holder)return {id:old.id,status:old.status};
    var patch={bank_name:bank,account_number:number,account_holder:holder,status:'PENDING',verified_by:'',verified_at:'',updated_at:now};
    if(old)ksbPatch_('PARTNER_PAYOUT_ACCOUNTS',old.id,patch);
    else{patch.id=ksbId_('PA');patch.party_id=t.partyId;patch.party_type=t.partyType;patch.created_at=now;ksbAppend_('PARTNER_PAYOUT_ACCOUNTS',patch);}
    ksbAudit_(actor.id,'SUBMIT_PAYOUT_ACCOUNT','PARTNER_PAYOUT_ACCOUNT',old?old.id:patch.id,{partyType:t.partyType,bank:bank,status:'PENDING'});
    return {id:old?old.id:patch.id,status:'PENDING'};
  });
}
function ksbAdminPayoutList_(actor,args){ksbRole_(actor,'ADMIN');return ksbPagination_(ksbPageSort_(ksbRows_('PARTNER_PAYOUT_ACCOUNTS'),'updated_at'),args);}
function ksbAdminPayoutVerify_(actor,args){ksbRole_(actor,'ADMIN');return ksbWithLock_(function(){
  var a=ksbRow_('PARTNER_PAYOUT_ACCOUNTS',args.id);ksbRequire_(a&&a.status==='PENDING','Rekening tidak menunggu verifikasi.');
  ksbRequire_(args.confirmBankOwner===true,'Periksa nama pemilik rekening melalui proses verifikasi resmi, bukan hanya pengakuan seller.');
  var next=args.approve===true?'VERIFIED':'REJECTED';ksbPatch_('PARTNER_PAYOUT_ACCOUNTS',a.id,{status:next,verified_by:actor.id,verified_at:ksbNow_()});
  ksbAudit_(actor.id,'REVIEW_PAYOUT_ACCOUNT','PARTNER_PAYOUT_ACCOUNT',a.id,{status:next,partyType:a.party_type});return {id:a.id,status:next};
});}
