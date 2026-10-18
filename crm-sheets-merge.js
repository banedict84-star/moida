export const FIELDS=['mid','name','phone','dong','addr','type','rec','rec2','rec3','katalk','org','age','ageb','family','sms','addrDetail','krGrade'];
export const HEADERS=['연락처ID (수정금지)','이름','전화번호','행정동','주소','유형','추천인','추천인2','추천인3','카톡관리여부','소속','나이','연령대','가족수','문자관리여부','상세주소','카톡답장'];
export const LAST_COLUMN='Q';
const canonicalHeader=h=>({'문자관리':'문자관리여부','문자답장':'문자답장여부'}[String(h).trim()]||String(h).trim());
const LEGACY_HEADERS=HEADERS.slice(0,7);
const text=v=>v==null?'':String(v);
export const project=rows=>rows.map(r=>Object.fromEntries(FIELDS.map(k=>[k,text(r[k])||(['org','ageb'].includes(k)?'—':'')])));
export function validate(rows){
 if(!Array.isArray(rows)||rows.length>10000)throw Error('연락처는 10,000건 이하로 연결해 주세요.');
 for(const row of rows){for(const key of ['age','family','smGrade','krGrade']){const value=text(row?.[key]);if(value!==''&&(!/^\d+$/.test(value)||Number(value)>(key==='age'?120:key==='family'?999:5)))throw Error(HEADERS[FIELDS.indexOf(key)]+' 값의 범위를 확인해 주세요.');}}
 const ids=new Set();for(const r of rows){if(!r||!text(r.mid)||ids.has(text(r.mid)))throw Error('연락처 ID가 없거나 중복됩니다.');ids.add(text(r.mid));for(const k of FIELDS){if(text(r[k]).length>2000)throw Error('연락처 항목이 너무 깁니다.');if(/[<>]/.test(text(r[k])))throw Error('연락처 항목에 HTML 태그를 입력할 수 없습니다.');}}return project(rows);
}
export function sheetHeaders(values){
 const headers=values.length?values[0]:HEADERS;
 const normalized=headers.map(canonicalHeader).filter(h=>!['문자답장여부','주민번호','주민등록번호'].includes(h));
 if(headers.filter(h=>['주민번호','주민등록번호'].includes(canonicalHeader(h))).length>1)throw Error('주민번호 열이 중복되었습니다.');
 const valid=expected=>normalized.length===expected.length&&new Set(normalized).size===normalized.length&&expected.every(h=>normalized.includes(h));
 if(valid(HEADERS))return {headers,legacy:false};
 if(valid(LEGACY_HEADERS))return {headers,legacy:true};
 throw Error('시트 열 제목이 누락되거나 중복되었습니다. 열 순서는 변경해도 되지만 열 제목은 유지해 주세요.');
}
export function sheetValues(contacts,values){const schema=sheetHeaders(values);const headers=schema.legacy?[...HEADERS,...schema.headers.filter(h=>['주민번호','주민등록번호'].includes(canonicalHeader(h)))]:schema.headers.filter(h=>canonicalHeader(h)!=='문자답장여부');const idColumn=schema.headers.findIndex(h=>canonicalHeader(h)===HEADERS[0]),prior=new Map((values?.slice(1)||[]).map(row=>[text(row[idColumn]),row]));return [headers,...contacts.map(r=>headers.map(h=>['주민번호','주민등록번호'].includes(canonicalHeader(h))?text(prior.get(text(r.mid))?.[schema.headers.indexOf(h)]):r[FIELDS[HEADERS.indexOf(canonicalHeader(h))]]))];}
export function parseRows(values,known=[]){
 if(!values.length)return [];
 const {headers,legacy}=sheetHeaders(values);
 return validate(values.slice(1).filter(row=>row.some(v=>text(v).trim())).map((cells,i)=>{
  const row=Object.fromEntries(headers.map((h,j)=>[FIELDS[HEADERS.indexOf(canonicalHeader(h))],text(cells[j])]).filter(pair=>pair[0]));
  if(!row.mid){if(!row.name)throw Error((i+2)+'행에 이름을 입력해 주세요.');const phone=row.phone.replace(/\D/g,'');const matches=known.filter(r=>phone?text(r.phone).replace(/\D/g,'')===phone:text(r.name)===row.name);if(matches.length>1)throw Error((i+2)+'행은 같은 연락처가 여러 개입니다. 연락처 ID를 지정해 주세요.');row.mid=matches[0]?.mid||'s_'+crypto.randomUUID();}
  const prior=legacy?known.find(r=>r.mid===row.mid):null;
  return Object.fromEntries(FIELDS.map((k,j)=>[k,text(legacy&&j>=7?prior?.[k]:row[k])]));
 }));
}
export function mergeContacts(crm,sheet,baseline=[]){
 const c=new Map(validate(crm).map(r=>[r.mid,r])),s=new Map(validate(sheet).map(r=>[r.mid,r])),b=new Map(validate(baseline).map(r=>[r.mid,r]));const result=[],conflicts=[];
 for(const id of new Set([...c.keys(),...s.keys(),...b.keys()])){
  const left=c.get(id),right=s.get(id),old=b.get(id);
  if(!left&&!right)continue;
  if(old&&(!left||!right)){conflicts.push({id,field:'삭제',crm:left?'유지':'없음',sheet:right?'유지':'없음'});continue;}
  if(!left||!right){result.push(left||right);continue;}
  const row={mid:id};for(const k of FIELDS.slice(1)){const a=left[k],v=right[k],o=old?.[k];if(a===v)row[k]=a;else if(old&&a===o)row[k]=v;else if(old&&v===o)row[k]=a;else conflicts.push({id,field:HEADERS[FIELDS.indexOf(k)],crm:a,sheet:v});}result.push(row);
 }return {rows:result,conflicts};
}
