import {project,validate,sameIdentity} from './crm-sheets-merge.js';
import {digest} from './crm-chunks.js';
const ID='연락처ID (모이다·수정금지)';
const aliases={mid:[ID,'연락처ID (수정금지)'],name:['성명','이름'],phone:['휴대전화','전화번호','휴대폰','연락처'],rrn:['주민번호','주민등록번호'],addr:['주소'],addrDetail:['상세주소'],dong:['행정동'],org:['소속'],type:['당원구분','당원여부','유형'],rec:['추천인'],rec2:['서브추천인','추천인2'],rec3:['서드추천인','추천인3'],katalk:['카톡관리여부','카톡관리'],krGrade:['카톡답장여부','카톡답장'],age:['나이'],ageb:['연령대'],sex:['성별'],family:['가족수'],sms:['문자관리여부','문자관리']};
export const sourceIdHeader=ID;
export function columnName(number){let result='';for(let n=number;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result;}
const cell=v=>v==null?'':String(v),empty=v=>['','—','-','미확인'].includes(cell(v).trim());
export function sourceSchema(headers){const map={};for(const [key,names] of Object.entries(aliases)){const i=headers.findIndex(h=>names.includes(cell(h).trim()));if(i>=0)map[key]=i;}if(map.name===undefined||map.phone===undefined)throw Error('원본에 성명(이름)·휴대전화(전화번호) 열이 필요합니다.');return map;}
export async function sourceContacts(state,known,initial=false){
 const map=sourceSchema(state.headers),byId=new Map(known.map(r=>[r.mid,r])),byPhone=new Map(),claimed=new Set(),locations=new Map();
 for(const r of known){const key=cell(r.phone).replace(/\D/g,'');const group=byPhone.get(key)||[];group.push(r);byPhone.set(key,group);}
 const rows=[],links={...(state.links||{})};
 for(let i=0;i<state.values.length;i++){
  const cells=state.values[i],raw=Object.fromEntries(Object.entries(map).map(([k,c])=>[k,cell(cells[c])]));
  if(!raw.name.trim()&&!raw.phone.trim())continue;raw.name=raw.name.trim()||'이름모름';
  const deterministic='src_'+await digest(state.sheetId+':'+state.tabId+':'+(i+state.headerRow+1)+':'+JSON.stringify([raw.name,raw.phone,raw.rrn||'']));
  let mid=raw.mid||links[deterministic];
  if(mid){if(claimed.has(mid))throw Error('원본 연락처 ID가 중복되었습니다. 원본 '+(i+state.headerRow+1)+'행을 확인해 주세요.');}
  else if(byId.has(deterministic)&&sameIdentity(raw,byId.get(deterministic))&&!claimed.has(deterministic))mid=deterministic;
  else {const matches=(byPhone.get(cell(raw.phone).replace(/\D/g,''))||[]).filter(r=>!claimed.has(r.mid)&&sameIdentity(raw,r));const original=matches.filter(r=>!String(r.mid).startsWith('src_'));if(matches.length>1&&original.length===1)matches.splice(0,matches.length,original[0]);if(matches.length>1)throw Error('원본 '+(i+state.headerRow+1)+'행은 동일 정보의 연락처가 여럿입니다. 연락처 ID를 지정해 주세요.');mid=matches[0]?.mid||deterministic;}
  links[deterministic]=mid;claimed.add(mid);const prior=byId.get(mid)||{},row={...prior,mid};
  for(const [key,index] of Object.entries(map)){if(key==='mid')continue;let value=cell(cells[index]);if(key==='name')value=value.trim()||'이름모름';if(key==='krGrade'&&!/^\d*$/.test(value))continue;if(initial&&empty(value)&&!empty(prior[key]))continue;row[key]=value;}
  if(map.addr!==undefined&&map.addrDetail===undefined&&prior.addrDetail){const combined=[prior.addr,prior.addrDetail].filter(v=>v&&!['—','-'].includes(v)).join(' ');if(cell(raw.addr).replace(/\s/g,'')===combined.replace(/\s/g,'')){row.addr=prior.addr;row.addrDetail=prior.addrDetail;}else if(cell(row.addr)!==cell(prior.addr))row.addrDetail='';}
  rows.push(row);locations.set(mid,i+state.headerRow+1);
 }
 return {rows:validate(rows),locations,map,links};
}
export function sourceSignature(state){const map=sourceSchema(state.headers),columns=Object.values(map);return JSON.stringify([state.headers,state.values.map((row,i)=>columns.map(c=>{const f=state.formulas?.[i]?.[c];return typeof f==='string'&&f.startsWith('=')?f:cell(row[c]);}))]);}
export function sourceWritePlan(state,parsed,contacts){
 const edits=[],map=parsed.map,headers=state.headers;
 let nextRow=Math.max(state.headerRow,...parsed.locations.values())+1;
 const expected={...state,values:state.values.map(r=>[...r])};
 for(const r of project(contacts)){
  const row=parsed.locations.get(r.mid)||nextRow++,offset=row-state.headerRow-1;while(expected.values.length<=offset)expected.values.push([]);
  for(const [key,col] of Object.entries(map)){
   const formula=state.formulas?.[offset]?.[col];if(typeof formula==='string'&&formula.startsWith('='))continue;
   let value=r[key];if(key==='addr'&&map.addrDetail===undefined)value=[r.addr,r.addrDetail].filter(v=>v&&!['—','-'].includes(v)).join(' ');
   if(['age','family','krGrade'].includes(key)&&/^\d+$/.test(cell(value)))value=Number(value);
   const old=state.values[offset]?.[col]??'';if(key==='krGrade'&&!/^\d*$/.test(cell(old)))continue;if(['age','ageb','sex'].includes(key)&&empty(value)&&!empty(old))continue;if(cell(old)===cell(value))continue;
   edits.push({row,col,value:value??'',old,priority:key==='mid'&&parsed.locations.has(r.mid)?0:1});expected.values[offset][col]=value??'';
  }
 }
 // Group consecutive cells in the same column; preserve every unrelated cell and formula.
 edits.sort((a,b)=>a.priority-b.priority||a.col-b.col||a.row-b.row);const data=[];
 for(const edit of edits){let group=data.at(-1);if(!group||group.col!==edit.col||group.priority!==edit.priority||group.end+1!==edit.row){group={priority:edit.priority,col:edit.col,start:edit.row,end:edit.row,values:[],old:[]};data.push(group);}group.end=edit.row;group.values.push([edit.value]);group.old.push([edit.old]);}
 const writes=[];let batch=[],size=0;for(const group of data){if(batch.length>=20||size+JSON.stringify(group).length>700000){writes.push(batch);batch=[];size=0;}batch.push(group);size+=JSON.stringify(group).length;}if(batch.length)writes.push(batch);
 return {writes,expected:sourceSignature(expected),rowCount:Math.max(nextRow-1,state.rowCount),headers};
}
export async function readSource(api,access,config){
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+config.sheet_id,meta=await api(access,base+'?fields=sheets.properties'),sheet=meta.sheets?.find(s=>s.properties.sheetId===config.tab_id)?.properties;
 if(!sheet)throw Error('연결한 원본 탭을 찾지 못했습니다.');const range="'"+sheet.title.replaceAll("'","''")+"'!",column=columnName(sheet.gridProperties.columnCount),headerRow=config.header_row;
 const head=await api(access,base+'/values/'+encodeURIComponent(range+'A'+headerRow+':'+column+headerRow)+'?valueRenderOption=UNFORMATTED_VALUE'),headers=head.values?.[0]||[];const map=sourceSchema(headers);if(map.mid===undefined)throw Error('원본 연락처 ID 열을 찾지 못했습니다. 다시 연결해 주세요.');
 const values=[],formulas=[];const limit=Math.min(50002,sheet.gridProperties.rowCount);
 for(let start=headerRow+1;start<=limit;start+=1000){const end=Math.min(start+999,limit),url=base+'/values/'+encodeURIComponent(range+'A'+start+':'+column+end);const [v,f]=await Promise.all([api(access,url+'?valueRenderOption=UNFORMATTED_VALUE'),api(access,url+'?valueRenderOption=FORMULA')]);for(let i=0;i<end-start+1;i++){values.push(v.values?.[i]||[]);formulas.push(f.values?.[i]||[]);}}
 while(values.length&&!values.at(-1).some(v=>cell(v)!=='')&&!formulas.at(-1)?.some(v=>typeof v==='string'&&v.startsWith('='))){values.pop();formulas.pop();}
 return {sheetId:config.sheet_id,tabId:sheet.sheetId,title:sheet.title,headerRow,headers,values,formulas,rowCount:sheet.gridProperties.rowCount,base,range};
}
