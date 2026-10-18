import {unzipSync,strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';
const arr=v=>v==null?[]:Array.isArray(v)?v:[v];
const text=v=>typeof v==='object'&&v!==null?String(v['#text']??''):String(v??'');
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
export function extractDongEvents(input,dongs=['일동','이동','성포동']){
 let size=0;const files=unzipSync(new Uint8Array(input),{filter:f=>{size+=f.originalSize;if(size>12*1024*1024||f.originalSize>4*1024*1024)throw Error('엑셀 압축 해제 크기 제한');return /^xl\/(sharedStrings.xml|workbook.xml|worksheets\/sheet\d+.xml)$/.test(f.name);}});
 const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,processEntities:false});
 const xml=name=>{const s=files[name]?strFromU8(files[name]):'';if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('허용하지 않는 XML');return s?parser.parse(s):{};};
 if(xml('xl/workbook.xml').workbook?.workbookPr?.['@_date1904']==='1')throw Error('1904 날짜 형식은 확인이 필요합니다.');
 const strings=arr(xml('xl/sharedStrings.xml').sst?.si).map(si=>si.t!==undefined?text(si.t):arr(si.r).map(r=>text(r.t)).join(''));
 const events=[];let recognized=false;
 for(const name of Object.keys(files).filter(n=>n.startsWith('xl/worksheets/'))){const rows=arr(xml(name).worksheet?.sheetData?.row).map(r=>{const row=[];for(const c of arr(r.c)){const letters=String(c['@_r']||'').match(/^[A-Z]+/)?.[0];if(!letters)continue;let index=0;for(const a of letters)index=index*26+a.charCodeAt(0)-64;if(index>100)continue;row[index-1]=c['@_t']==='s'?strings[Number(c.v)]:c['@_t']==='inlineStr'?text(c.is?.t):c.v;}return row;});
 const hi=rows.findIndex(r=>r.some(v=>clean(v)==='부서명')&&r.some(v=>clean(v)==='행사명'));if(hi<0)continue;recognized=true;
 const headers=rows[hi].map(clean),col=n=>headers.indexOf(n);const dc=col('날짜'),tc=col('시'),dongc=col('부서명'),titlec=col('행사명'),lc=col('장소'),bc=col('주요내용');if([dc,tc,dongc,titlec,lc].some(i=>i<0))throw Error('동별 일정 열 구성이 달라 확인이 필요합니다.');
 for(const r of rows.slice(hi+1)){const dong=clean(r[dongc]);if(!dongs.includes(dong))continue;const serial=Number(r[dc]),time=Number(r[tc]);if(!Number.isFinite(serial)||serial<40000||serial>80000||!Number.isFinite(time)||time<0||time>=1)throw Error('대상 일정의 날짜·시간 확인이 필요합니다.');const date=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10);const minutes=Math.round(time*1440);if(minutes>=1440)throw Error('시각 확인 필요');const start=date+'T'+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')+':00+09:00';const title=clean(r[titlec]),location=clean(r[lc]);if(!title||!location)throw Error('제목 또는 장소가 비어 있습니다.');events.push({dong,date,start,title,location,description:clean(r[bc])});}
 }
 return {recognized,events};
}
