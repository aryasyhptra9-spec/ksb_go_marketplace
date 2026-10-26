function ksbAdminPayments_(actor,args){ksbRole_(actor,'ADMIN');return ksbPagination_(ksbPageSort_(ksbRows_('PAYMENTS'),'created_at'),args);}
function ksbAdminVerifyPayment_(actor,args){ksbV10RequireCommerce_();ksbRole_(actor,'ADMIN');return ksbWithLock_(function(){var p=ksbRow_('PAYMENTS',args.paymentId);ksbRequire_(p&&p.method==='TRANSFER'&&['PENDING','PROOF_SUBMITTED'].indexOf(p.status)>=0,'Pembayaran tidak menunggu verifikasi');var order=ksbRow_('ORDERS',p.order_id);ksbRequire_(order&&order.status!=='CANCELLED','Order tidak dapat diverifikasi');ksbRequire_(args.confirmFunds===true,'Verifikasi rekening bank secara independen sebelum menyetujui.');
  // V16.2: compact Admin approval. This is an ADMIN ATTESTATION, NOT a bank API match.
  // Require a real buyer-uploaded attachment and an explicit independent account check.
  if(args.photoReviewOnly===true){
    ksbRequire_(p.status==='PROOF_SUBMITTED','Pembeli harus mengunggah bukti transfer terlebih dahulu.');
    ksbRequire_(args.confirmIndependentStatement===true,
      'Foto saja tidak cukup. Pastikan uang benar-benar masuk di rekening resmi sebelum menyetujui.');
    ksbRequire_(order.payment_status!=='PAID'&&order.status==='PENDING_PAYMENT',
      'Pesanan sudah dibayar atau status pesanan tidak sesuai.');
    var proofRows=ksbFilter_('PAYMENT_PROOFS',function(x){return x.payment_id===p.id;});
    ksbRequire_(proofRows.length>0,'Bukti transfer belum diunggah.');
    var hasAttachment=proofRows.some(function(x){return !!ksbFilter_('FILE_ATTACHMENTS',function(a){return a.file_id===x.file_id;})[0];});
    ksbRequire_(hasAttachment,'Lampiran bukti transfer tidak tersedia.');
    // A generated INTERNAL review id is not a bank statement reference.
    var internalRef='ADMINREVIEW-'+p.id;
    ksbRequire_(!ksbFilter_('PAYMENTS',function(x){return x.id!==p.id&&x.status==='VERIFIED'&&x.reference===internalRef;}).length,
      'ID persetujuan internal sudah digunakan.');
    ksbJournal_('PAYMENT_VERIFIED',p.id,order.id,
      'Penerimaan dana dikonfirmasi manual oleh Admin; mutasi bank BELUM direkonsiliasi',
      [{account:'CASH_PLATFORM',debit:Number(p.amount)},
       {account:'CUSTOMER_ESCROW',credit:Number(p.amount)}]);
    var at=ksbNow_();
    ksbPatch_('PAYMENTS',p.id,{status:'VERIFIED',reference:internalRef,verified_by:actor.id,verified_at:at});
    ksbPatch_('ORDERS',order.id,{payment_status:'PAID',status:'CONFIRMED',updated_at:at});
    ksbFilter_('DELIVERY_ORDERS',function(d){return d.order_id===order.id&&d.type==='PARCEL'&&d.status==='WAITING_SELLER';})
      .forEach(function(d){ksbPatch_('DELIVERY_ORDERS',d.id,{status:'AVAILABLE',updated_at:at});});
    ksbHistory_(order.id,'ORDER','CONFIRMED',actor.id,'Admin memeriksa bukti dan menyatakan dana telah masuk (rekonsiliasi bank belum tercatat).');
    ksbAudit_(actor.id,'PAYMENT_ADMIN_MANUAL_ATTESTATION','PAYMENT',p.id,
      {orderId:order.id,amount:Number(p.amount),internalReviewReference:internalRef,
       bankMutationNotRecorded:true,requiresLaterReconciliation:true});
    return {status:'VERIFIED',verificationMethod:'ADMIN_MANUAL',bankReconciliationPending:true};
  }
  var ref=ksbString_(args.bankReference,100);ksbRequire_(ref,'Referensi mutasi bank wajib');ksbV10ValidateBankReference_(ref);var dupe=ksbFilter_('PAYMENTS',function(x){return x.id!==p.id&&x.reference===ref&&x.status==='VERIFIED';});ksbRequire_(!dupe.length,'Referensi bank sudah digunakan.');// V16.1: one-step entry for bank-confirmed incoming transfers.
  // This records a bank statement supplied and independently checked by ADMIN; it does NOT query the bank.
  if(args.recordBankMutation===true){
    ksbRequire_(p.status==='PROOF_SUBMITTED','Tunggu pembeli mengunggah bukti pembayaran terlebih dahulu.');
    ksbRequire_(args.confirmIndependentStatement===true,
      'Admin wajib mencocokkan dana masuk di mutasi rekening resmi, bukan hanya bukti pembeli.');
    var bankDate=ksbString_(args.bankDate,30);
    ksbRequire_(/^\d{4}-\d{2}-\d{2}$/.test(bankDate),'Tanggal mutasi bank wajib YYYY-MM-DD.');
    var bankDirection='CREDIT';
    var previous=ksbFilter_('BANK_MUTATIONS_V11',function(x){
      return x.reference===ref && x.direction===bankDirection;
    });
    ksbRequire_(previous.length<=1,'Referensi mutasi duplikat. Hentikan dan periksa Rekonsiliasi Bank.');
    if(previous.length){
      ksbRequire_(previous[0].status==='UNMATCHED' && !previous[0].matched_entity_id &&
        Number(previous[0].amount)===Number(p.amount) && previous[0].channel==='BANK',
        'Referensi bank sudah digunakan atau nominal/sumber tidak sesuai.');
    }else{
      var mutationId=ksbId_('BM');
      ksbAppend_('BANK_MUTATIONS_V11',{id:mutationId,reference:ref,direction:'CREDIT',
        channel:'BANK',amount:Number(p.amount),bank_date:bankDate,
        description:'Pembayaran '+p.id+' / Order '+order.id+' (dicocokkan Admin dari mutasi bank resmi)',
        status:'UNMATCHED',matched_entity_type:'',matched_entity_id:'',
        created_by:actor.id,created_at:ksbNow_(),matched_at:''});
      ksbAudit_(actor.id,'BANK_MUTATION_RECORDED','BANK_MUTATION',mutationId,
        {reference:ref,direction:'CREDIT',amount:Number(p.amount),channel:'BANK',source:'ONE_STEP_PAYMENT'});
    }
  }
  var mutation=ksbBankAssertUnmatched_(ref,'CREDIT',Number(p.amount));ksbJournal_('PAYMENT_VERIFIED',p.id,order.id,'Transfer diterima platform',[{account:'CASH_PLATFORM',debit:Number(p.amount)},{account:'CUSTOMER_ESCROW',credit:Number(p.amount)}]);
  ksbPatch_('PAYMENTS',p.id,{status:'VERIFIED',reference:ref,verified_by:actor.id,verified_at:ksbNow_()});ksbPatch_('BANK_MUTATIONS_V11',mutation.id,{status:'MATCHED',matched_entity_type:'PAYMENT',matched_entity_id:p.id,matched_at:ksbNow_()});ksbPatch_('ORDERS',order.id,{payment_status:'PAID',status:'CONFIRMED',updated_at:ksbNow_()});
  ksbFilter_('DELIVERY_ORDERS',function(d){return d.order_id===order.id&&d.type==='PARCEL'&&d.status==='WAITING_SELLER';}).forEach(function(d){ksbPatch_('DELIVERY_ORDERS',d.id,{status:'AVAILABLE',updated_at:ksbNow_()});});
  ksbHistory_(order.id,'ORDER','CONFIRMED',actor.id,'Transfer terverifikasi');ksbAudit_(actor.id,'VERIFY_TRANSFER','PAYMENT',p.id,{bankReference:ref});return {status:'VERIFIED'};});}

function ksbAdminPaymentProofs_(actor,args){ksbRole_(actor,'ADMIN');var p=ksbRow_('PAYMENTS',args.paymentId);ksbRequire_(p,'Transaksi tidak ada');return ksbFilter_('PAYMENT_PROOFS',function(r){return r.payment_id===p.id;}).map(function(proof){var a=ksbFilter_('FILE_ATTACHMENTS',function(r){return r.file_id===proof.file_id;})[0];return a?{attachmentId:a.id,name:a.name,mime:a.mime,created_at:a.created_at}:null;}).filter(Boolean);}
