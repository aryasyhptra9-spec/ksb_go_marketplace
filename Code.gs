/** Core API for KSB GO; purchase and payout actions are fail-closed until go-live gates pass. */
function ksbPublicLaunchAllows_(action){
  var allowed=[
    'config','catalog','market.store','market.reviews','product.detail',
    'auth.login','auth.otp.start','auth.otp.verify','auth.me','auth.logout','auth.roles','auth.profile','auth.apply',
    'seller.store','seller.store.save','seller.product.save','seller.product.list','seller.product.photos','seller.product.photo.remove','seller.dashboard',
    'admin.dashboard','admin.users','admin.pending','admin.approve','admin.settings',
    'files.upload','files.read',
    'courier.profile'
  ];
  return allowed.indexOf(String(action))!==-1;
}
/** Explicit API allowlist: no direct client invocation of internal functions. */
/** One deployment, four separate portal entry URLs. Query parameter is NOT authorization. */
function doGet(e){
  var raw=String((e&&e.parameter&&e.parameter.portal)||'buyer').toLowerCase();
  var allowed=['buyer','seller','courier','admin'];
  if(allowed.indexOf(raw)<0)raw='buyer';
  var template=HtmlService.createTemplateFromFile('Index');
  template.portal=raw;
  template.portalJson=JSON.stringify(raw);
  template.webAppUrlJson=JSON.stringify(ScriptApp.getService().getUrl()||'');
  template.catalogOnly=ksbV10Mode_()==='CATALOG';
  return template.evaluate().setTitle('KSB GO — '+({buyer:'Marketplace',seller:'Dashboard Seller',courier:'Dashboard Kurir',admin:'Dashboard Admin'}[raw])).addMetaTag('viewport','width=device-width,initial-scale=1,viewport-fit=cover').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
function include_(file){var allowed=['Styles','Components','App','AuthUIV5','Buyer','Seller','Courier','AdminView','MapsView','MarketplaceUIV4','ManualClaimsUIV7','PortalV8','PublicLaunchUI','CommerceV10UI','ReconciliationUIV11','OperationsUIV15','Scripts'];ksbRequire_(allowed.indexOf(file)>=0,'Template tidak diizinkan.');return HtmlService.createHtmlOutputFromFile(file).getContent();}
function api(action,args,sessionToken){
  try{
    args=args||{};ksbRequire_(typeof action==='string'&&action.length<100,'Nama fungsi tidak valid');
    // Fail closed: no switch can silently enable live monetary transactions in this release.
    ksbRequire_(ksbV10RouteAllowed_(action),'Fitur ini belum aktif pada konfigurasi KSB GO saat ini.');
    var publicRoutes={
      'config':function(){return ksbPublicConfig_();},'auth.login':function(){return ksbGoogleLogin_(args);},'auth.otp.start':function(){return ksbOtpStart_(args);},'auth.otp.verify':function(){return ksbOtpVerify_(args);},
      'catalog':function(){return ksbMarketCatalog_(args);},'market.store':function(){return ksbMarketStore_(args);},'market.reviews':function(){return ksbMarketProductReviews_(args);},'product.detail':function(){return ksbProductDetail_(args);} 
    };
    if(Object.prototype.hasOwnProperty.call(publicRoutes,action))return {ok:true,data:publicRoutes[action]()};
    var actor=ksbActor_(sessionToken);
    var routes={
      'auth.me':ksbMe_,'auth.roles':ksbRoleStatuses_,'auth.logout':ksbLogout_,'auth.apply':ksbApplyRole_,'auth.profile':ksbUpdateProfile_,
      'market.favorites':ksbMarketFavoriteList_,'market.favorite.toggle':ksbMarketFavoriteToggle_,'market.review.submit':ksbMarketReviewSubmit_,
      'cart.get':ksbCartGet_,'cart.add':ksbCartAdd_,'cart.update':ksbCartUpdate_,'cart.remove':ksbCartRemove_,
      'address.list':ksbAddressList_,'address.save':ksbAddressSave_,'order.checkout':ksbCheckout_,'order.my':ksbMyOrders_,'order.detail':ksbOrderDetail_,
      'order.received':ksbV16ConfirmBuyerReceipt_,'order.cancel':ksbCancelOrder_,'payment.gateway.start':ksbGatewayStart_,'payment.gateway.check':ksbGatewayBuyerCheck_,'payment.proof':ksbPaymentProof_,'payment.list':ksbMyPayments_,
      'seller.store':ksbStoreGet_,'seller.store.save':ksbStoreSave_,'seller.product.save':ksbProductSave_,'seller.product.list':ksbSellerProducts_,'seller.product.photos':ksbProductPhotosV7_,'seller.product.photo.remove':ksbProductPhotoRemoveV7_,
      'partner.payout.get':ksbPartnerPayoutGet_,'partner.payout.save':ksbPartnerPayoutSave_,
      'seller.orders':ksbSellerOrders_,'seller.order.status':ksbSellerOrderStatus_,'seller.dashboard':ksbSellerDashboard_,
      'courier.profile':ksbCourierProfile_,'courier.online':ksbCourierOnline_,'courier.available':ksbAvailableDeliveries_,
      'courier.my':ksbMyDeliveries_,'courier.claim':ksbClaimDelivery_,'courier.status':ksbUpdateDeliveryStatus_,'courier.chat.buyer':ksbCourierBuyerWhatsAppV7_,
      'courier.dashboard':ksbCourierDashboard_,'delivery.quote':function(actor,request){return ksbDeliveryQuote_(request);},'delivery.create':ksbCreateParcel_,'delivery.my':ksbMyParcels_,'delivery.track':ksbTrack_,
      'finance.mine':ksbPartnerFinance_,'partner.claim.eligible':ksbClaimEligibleV7_,'partner.claim.create':ksbClaimCreateV7_,'partner.claim.mine':ksbClaimMineV7_,'partner.chat.admin':ksbPartnerAdminWaV7_,'partner.claim.pdf':ksbClaimPdfV7_,'files.upload':ksbFileUpload_,'files.read':ksbFileRead_,'files.pdf':ksbPdfRead_,
      'admin.users':ksbAdminUsers_,'admin.dashboard':ksbAdminDashboard_,'admin.pending':ksbAdminPending_,'admin.approve':ksbAdminApprove_,
      'admin.payments.proofs':ksbAdminPaymentProofs_,'admin.payments':ksbAdminPayments_,'admin.payment.verify':ksbAdminVerifyPayment_,'admin.settings':ksbAdminSettings_,
      'admin.billing.save':ksbAdminBillingCycle_,'admin.settings.save':ksbAdminSaveSetting_,'admin.zones.save':ksbAdminSaveZone_,'admin.settlement':ksbAdminSettlement_,
      'admin.gateway.settlement.confirm':ksbAdminGatewaySettlementConfirm_,'admin.gateway.status':ksbAdminGatewayStatus_,'admin.gateway.payout.queue':ksbAdminQueuePayout_,'admin.gateway.payout.list':ksbAdminGatewayPayouts_,
      'admin.payout.list':ksbAdminPayoutList_,'admin.payout.verify':ksbAdminPayoutVerify_,'admin.claims':ksbAdminClaimsV7_,'admin.claim.review':ksbAdminClaimReviewV7_,'admin.claim.paid':ksbAdminClaimPaidV7_,'admin.claim.partner.chat':ksbAdminPartnerPaidWaV16_,
      'admin.invoices':ksbAdminInvoices_,'admin.invoice.issue':ksbIssueInvoice_,'admin.invoice.pay':ksbPayInvoice_,
      'admin.integrity.audit':ksbAdminIntegrityAuditV11_,'admin.reconciliation.summary':ksbAdminReconciliationSummary_,'admin.bank.mutations':ksbAdminBankMutations_,'admin.bank.record':ksbAdminBankMutationCreate_,
      'admin.reports':ksbReports_,'admin.orders':ksbAdminOrders_,'admin.disputes':ksbAdminDisputes_,
      'refund.request':ksbV15RefundRequest_,'refund.mine':ksbV15RefundMine_,
      'admin.refund.cases':ksbV15RefundCases_,'admin.refund.review':ksbV15RefundReview_,
      'admin.refund.confirm':ksbV15RefundConfirm_,
      'admin.integrity.v15':ksbV15IntegrityReport_,'admin.preflight.v15':ksbV15Preflight_,
      'admin.refund.stock':ksbV15StockReviews_,'admin.refund.restock':ksbV15Restock_
    };
    ksbRequire_(Object.prototype.hasOwnProperty.call(routes,action),'Fungsi tidak didukung: '+action);
    return {ok:true,data:routes[action](actor,args)};
  }catch(e){console.error('KSB API '+action+': '+e.stack);return {ok:false,error:String(e.message||'Kesalahan server')};}
}
