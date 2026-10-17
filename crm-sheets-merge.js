export const FIELDS=['mid','name','phone','dong','addr','type','rec'];
export const HEADERS=['연락처ID (수정금지)','이름','전화번호','행정동','주소','유형','추천인'];
const text=v=>v==null?'':String(v);
export const project=rows=>rows.map(r=>Object.fromEntries(FIELDS.map(k=>[k,text(r[k])])));
export function validate(rows){
 if(!Array.isArray(rows)||rows.length>10000)throw Error('연락처는 10,000건 이하로 연결해 주세요.');
 const ids=new Set();for(const r of rows){if(!r||!text(r.mid)||ids.has(text(r.mid)))throw Error('연락처 ID가 없거나 중복됩니다.');ids.add(text(r.mid));for(const k of FIELDS){if(text(r[k]).length>2000)throw Error('연락처 항목이 너무 깁니다.');if(/[<>]/.test(text(r[k])))throw Error('연락처 항목에 HTML 태그를 입력할 수 없습니다.');}}return project(rows);
}
export function parseRows(values,known=[]){
 if(!values.length)return [];
 if(JSON.stringify(values[0])!==JSON.stringify(HEADERS))throw Error('시트 열 제목이 변경되었습니다. 전용 탭의 열 제목을 유지해 주세요.');
 return validate(values.slice(1).filter(row=>row.some(v=>text(v).trim())).map((row,i)=>{row=[...row];if(!row[0]){if(!row[1])throw Error((i+2)+'행에 이름을 입력해 주세요.');const phone=text(row[2]).replace(/\D/g,'');const matches=known.filter(r=>phone?text(r.phone).replace(/\D/g,'')===phone:text(r.name)===text(row[1]));if(matches.length>1)throw Error((i+2)+'행은 같은 연락처가 여러 개입니다. 연락처 ID를 지정해 주세요.');row[0]=matches[0]?.mid||'s_'+crypto.randomUUID();}return Object.fromEntries(FIELDS.map((k,j)=>[k,text(row[j])]))}));
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
