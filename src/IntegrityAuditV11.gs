/** Read-only operator diagnostics. Not a replacement for an independent financial audit. */
function ksbAdminIntegrityAuditV11_(actor){
 ksbRole_(actor,'ADMIN');
 var problems=[];
 function issue(type,id,detail){if(problems.length<200)problems.push({type:type,id:String(id),detail:detail});}
 var entries=ksbRows_('LEDGER_ENTRIES'),journals={};
 entries.forEach(function(e){var g=journals[e.journal_id]||(journals[e.journal_id]={debit:0,credit:0,rows:0});g.debit+=Number(e.debit);g.credit+=Number(e.credit);g.rows++;});
 Object.keys(journals).forEach(function(id){var j=journals[id];if(j.debit!==j.credit||!j.rows)issue('UNBALANCED_JOURNAL',id,'Debit '+j.debit+' vs kredit '+j.credit);});
 var seenPayments={};ksbRows_('PAYMENTS').forEach(function(p){
   var paymentJournal=entries.filter(function(e){return e.source_type==='PAYMENT_VERIFIED'&&e.source_id===p.id;});
   if((p.status==='VERIFIED')!==(paymentJournal.length>0))issue('PAYMENT_LEDGER_STATE_MISMATCH',p.id,'Status pembayaran tidak sesuai catatan jurnal');
   if(p.status==='VERIFIED'){
     if(seenPayments[p.reference])issue('DUPLICATE_PAYMENT_REFERENCE',p.id,'Referensi juga dipakai '+seenPayments[p.reference]);
     seenPayments[p.reference]=p.id;
     var bs=ksbRows_('BANK_MUTATIONS_V11').filter(function(b){return b.reference===p.reference&&b.direction==='CREDIT'&&b.status==='MATCHED'&&b.matched_entity_id===p.id&&Number(b.amount)===Number(p.amount);});
     if(p.method==='TRANSFER'&&bs.length!==1)issue('PAYMENT_BANK_MATCH_MISSING',p.id,'Mutasi masuk tidak cocok');
   }
 });
 ksbRows_('MANUAL_CLAIMS_V7').filter(function(c){return c.status==='PAID';}).forEach(function(c){
   var claimJournal=entries.filter(function(e){return e.source_type==='SETTLEMENT'&&e.source_id===c.id;});
   if(!claimJournal.length)issue('CLAIM_SETTLEMENT_LEDGER_MISSING',c.id,'Jurnal pembayaran mitra tidak ditemukan');
   var bs=ksbRows_('BANK_MUTATIONS_V11').filter(function(b){return b.reference===c.bank_reference&&b.direction==='DEBIT'&&b.status==='MATCHED'&&b.matched_entity_id===c.id&&Number(b.amount)===Number(c.total);});
   if(bs.length!==1)issue('CLAIM_BANK_MATCH_MISSING',c.id,'Mutasi keluar tidak cocok');
 });
 var refs={};ksbRows_('BANK_MUTATIONS_V11').forEach(function(b){var key=b.direction+'|'+b.reference;if(refs[key])issue('DUPLICATE_BANK_REFERENCE',b.id,'Sudah tercatat '+refs[key]);refs[key]=b.id;});
 return {status:problems.length?'ACTION_REQUIRED':'NO_ISSUES_DETECTED',issueCount:problems.length,
   issues:problems,journalCount:Object.keys(journals).length,checkedAt:ksbNow_(),
   disclaimer:'Audit otomatis hanya mendeteksi sebagian inkonsistensi. Lakukan rekonsiliasi independen ke bank/QRIS dan pemeriksaan data operasional.'};
}
