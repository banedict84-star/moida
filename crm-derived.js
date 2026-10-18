export const DERIVED_METADATA_KEY='moida_crm_derived';
export const DERIVED_METADATA_VALUE='address_rrn_v1';
export const DERIVED_FIELDS=new Set(['family','age','ageb','sex']);
export function koreaDate(now=new Date()){return new Date(now.getTime()+9*3600000).toISOString().slice(0,10);}
export function ageFromResidentNumber(value,asOf=koreaDate()){
 const raw=String(value||'').replace(/[\s-]/g,''),match=raw.match(/^(\d{2})(\d{2})(\d{2})(\d)?[\d*＊xX●•]*$/);if(!match)return null;
 const yy=Number(match[1]),month=Number(match[2]),day=Number(match[3]),today=asOf.split('-').map(Number),code=match[4];
 const centuries=code!==undefined?[{'1':1900,'2':1900,'3':2000,'4':2000,'5':1900,'6':1900,'7':2000,'8':2000,'9':1800,'0':1800}[code]]:[1900,2000];
 const ages=centuries.map(century=>{const year=century+yy,date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)return null;const age=today[0]-year-((today[1]<month||today[1]===month&&today[2]<day)?1:0);return age>=0&&age<=120?age:null;}).filter(age=>age!==null);
 return ages.length===1?ages[0]:null;
}
export function registeredSexFromResidentNumber(value){
 const raw=String(value||'').replace(/[\s-]/g,'');
 const match=raw.match(/^\d{6}([0-9])[\d*＊xX●•]{0,6}$/);
 if(!match)return '';
 const code=Number(match[1]),century=({1:1900,2:1900,3:2000,4:2000,5:1900,6:1900,7:2000,8:2000,9:1800,0:1800})[code];
 const year=century+Number(raw.slice(0,2)),month=Number(raw.slice(2,4)),day=Number(raw.slice(4,6)),date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)return '';
 return code%2?'남':'여';
}
export function addressKey(row){
 const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').trim();
 const base=clean(row.addr),detail=clean(row.addrDetail);if(/^(?:|—|-|0|없음|주소없음|미상|확인요망)$/.test(base))return '';
 return JSON.stringify([base,['—','-'].includes(detail)?'':detail]);
}
export function deriveContactFields(rows,asOf=koreaDate()){
 const counts=new Map();for(const row of rows){const key=addressKey(row);if(key)counts.set(key,(counts.get(key)||0)+1);}
 return rows.map(row=>{const age=ageFromResidentNumber(row.rrn,asOf),key=addressKey(row);return {...row,sex:registeredSexFromResidentNumber(row.rrn),family:key?String(counts.get(key)):'',age:age===null?'':String(age),ageb:age===null?'':Math.floor(age/10)*10+'대'};});
}

if(typeof window!=='undefined')window.MOIDA_CRM_DERIVED={ageFromResidentNumber,registeredSexFromResidentNumber};
