export function birthdayContacts(members){
 if(!Array.isArray(members)||members.length>10000)throw Error('연락처는 10,000명 이하로 동기화해 주세요.');
 const contacts=[],seen=new Set();let skipped=0;
 for(const m of members){const phone=String(m.phone||'').replace(/[\s()-]/g,''),name=String(m.name||'').trim().slice(0,80),value=String(m.birthday||m.birth||m.birthDate||m.dob||m.rrn||'').replace(/[^0-9]/g,''),md=value.length===8?value.slice(4,8):value.length>=6&&value.length<=13?value.slice(2,6):value.length===4?value:'';const month=+md.slice(0,2),day=+md.slice(2),date=new Date(Date.UTC(2000,month-1,day));
 if(!/^01[016789]\d{7,8}$/.test(phone)||md.length!==4||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||m.lunar===true||m.isLunar===true||/음력|lunar/i.test(String(m.birthType||m.calendarType||''))){skipped++;continue;}
 if(seen.has(phone)){skipped++;continue;}seen.add(phone);contacts.push({phone,name,md});
 }return{contacts,skipped};
}
export function koreanClock(now=Date.now()){const local=new Date(now+9*3600000);return{date:local.toISOString().slice(0,10),time:local.toISOString().slice(11,16),md:local.toISOString().slice(5,10).replace('-','')};}
export function birthdayMessages(rule,now=Date.now()){
 const clock=koreanClock(now);if(!rule.enabled||clock.date<rule.startDate||clock.time<rule.time||now-rule.syncedAt>30*86400000)return[];
 return rule.contacts.filter(c=>c.md===clock.md).map(c=>({to:c.phone,from:rule.from,text:rule.text.replaceAll('{이름}',c.name||'고객')}));
}
