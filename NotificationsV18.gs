/** Notifikasi in-app. WhatsApp otomatis membutuhkan API resmi, consent dan kredensial terpisah. */
function ksbNotifyV18_(userId,title,message){
 if(!userId)return;
 ksbAppend_('NOTIFICATIONS',{id:ksbId_('NTF'),user_id:userId,title:ksbString_(title,120),message:ksbString_(message,500),is_read:'FALSE',created_at:ksbNow_()});
}
