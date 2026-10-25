/** Execute testPureRules_() from Apps Script editor. Requires no user data. */
function testPureRules_(){var results=[];function test_(name,run){try{run();results.push({test_:name,passed:true});}catch(e){results.push({test_:name,passed:false,error:e.message});}}
  test_('Valid integer Rupiah',function(){if(ksbAmount_('12500')!==12500)throw Error('Wrong value');});
  test_('No negative money',function(){var ok=false;try{ksbAmount_(-1);}catch(e){ok=true;}if(!ok)throw Error('Accepted negative');});
  test_('No invalid email',function(){var ok=false;try{ksbEmail_('foo');}catch(e){ok=true;}if(!ok)throw Error('Accepted malformed email');});
  test_('Courier pending pickup statuses',function(){if(KSB_CFG.CLAIM_PENDING.join('|')!=='CLAIMED|HEADING_TO_PICKUP')throw Error('Rule changed');});
  test_('Stable unique keys',function(){if(ksbId_('ORD')===ksbId_('ORD'))throw Error('Repeated key');});
  Logger.log(JSON.stringify(results));return results;
}
/** Non-destructive shape tests against an installed empty/staging database. */
function testSchema_(){var missing=[],book=ksbBook_();Object.keys(KSB_SCHEMA).forEach(function(name){var s=book.getSheetByName(name);if(!s||s.getLastColumn()!==KSB_SCHEMA[name].split(',').length)missing.push(name);});return {tables:Object.keys(KSB_SCHEMA).length,missing:missing,passed:missing.length===0};}
/** Manual concurrency test_ instructions live in docs/TEST_PLAN.md. */
