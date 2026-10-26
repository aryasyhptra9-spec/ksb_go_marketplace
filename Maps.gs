/** Routes API: only show actual route metrics from API; a tariff-zone fallback has no fabricated distance. */
function ksbCoord_(x,min,max){var n=Number(x);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function ksbDeliveryQuote_(args){
  args=args||{};var from=ksbString_(args.fromDistrict,60),to=ksbString_(args.toDistrict,60),service=ksbString_(args.service||'REGULAR',30),weight=Number(args.weight||1);
  ksbRequire_(from&&to&&ksbRow_('DISTRICTS',from)&&ksbRow_('DISTRICTS',to),'Kecamatan pengirim dan penerima wajib diisi.');
  ksbRequire_(['REGULAR','EXPRESS','INTERDISTRICT','UMKM'].indexOf(service)>=0,'Layanan tidak dikenal.');
  ksbRequire_(Number.isFinite(weight)&&weight>0&&weight<=ksbSettingNumber_('max_package_kg',25),'Berat paket melampaui batas.');
  var fLat=ksbCoord_(args.fromLat,-90,90),fLng=ksbCoord_(args.fromLng,-180,180),tLat=ksbCoord_(args.toLat,-90,90),tLng=ksbCoord_(args.toLng,-180,180),meters=null,seconds=null,source='',notes='';
  var key=ksbProperty_('ROUTES_API_KEY');
  if(key&&fLat!==null&&fLng!==null&&tLat!==null&&tLng!==null){try{
    var body={origin:{location:{latLng:{latitude:fLat,longitude:fLng}}},destination:{location:{latLng:{latitude:tLat,longitude:tLng}}},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'};
    var response=UrlFetchApp.fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'post',contentType:'application/json',headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration'},payload:JSON.stringify(body),muteHttpExceptions:true});
    if(response.getResponseCode()===200){var route=ksbJson_(response.getContentText(),{}).routes||[];if(route.length&&Number.isFinite(Number(route[0].distanceMeters))){meters=Number(route[0].distanceMeters);seconds=parseInt(route[0].duration,10)||null;source='ROUTES_API';}}
  }catch(e){console.error('Routes API unavailable: '+e.message);}}
  var settings=ksbSettings_(),base=Number(settings.delivery_base||8000),perKm=Number(settings.delivery_per_km||2500),minimum=Number(settings.delivery_min||8000);
  var fee=null,requiresConsent=false;
  if(source==='ROUTES_API')fee=base+Math.ceil(meters/1000)*perKm;
  else{
    var zone=ksbFilter_('DELIVERY_ZONES',function(z){return z.from_district===from&&z.to_district===to&&ksbBool_(z.active);})[0];
    if(zone){fee=Number(zone.fixed_tariff);source='ADMIN_ZONE_TARIFF';requiresConsent=true;notes='API rute tidak tersedia. Tarif tetap zona yang ditetapkan admin; jarak tidak dihitung.';}
    else return {available:false,source:'NONE',distance_m:null,duration_s:null,fee:null,message:'Tarif belum tersedia. Admin harus mengisi tarif zona atau mengaktifkan Routes API. Jangan lanjut checkout.'};
  }
  if(service==='EXPRESS')fee+=Number(settings.delivery_express_extra||0);
  if(from!==to)fee+=Number(settings.delivery_interdistrict_extra||0);
  fee+=Math.max(0,Math.ceil(weight-1))*Number(settings.delivery_per_extra_kg||0);
  fee=Math.max(minimum,Math.ceil(fee));ksbRequire_(Number.isSafeInteger(fee),'Tarif tidak valid');
  return {available:true,source:source,distance_m:meters,duration_s:seconds,fee:fee,requiresConsent:requiresConsent,message:notes,service:service};
}
