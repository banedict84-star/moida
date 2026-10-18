(function(root){
 const MAX_ROWS=50000,MAX_BYTES=200000000;
 let transport=null;const uploaded=new Map();
 function configure(fn){transport=fn;}
 async function prune(uid){if(transport)return transport('/crm-store/prune',{},uid);}
 function cache(key,rows){try{localStorage.setItem(key,JSON.stringify(rows));return true;}catch(e){try{localStorage.removeItem(key);}catch(_){}return false;}}
 let cacheDb;
 function database(){if(!cacheDb)cacheDb=new Promise((resolve,reject)=>{const request=indexedDB.open('moida-crm-cache',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return cacheDb;}
 async function persist(key,rows){if(cache(key,rows)){try{const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch(e){}return true;}const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(rows,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});return true;}
 async function restore(key){try{const local=localStorage.getItem(key);if(local)return JSON.parse(local);}catch(e){}try{const db=await database();return await new Promise((resolve,reject)=>{const request=db.transaction('records').objectStore('records').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}catch(e){return null;}}
 const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
 async function compactPhoto(value){
  if(typeof value!=='string'||!value.startsWith('data:image/')||value.length<=60000)return value;
  const image=new Image();image.src=value;await image.decode();
  const scale=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.65,.45]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=60000)return result;}
  throw Error('사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.');
 }
 async function prepare(rows){if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('연락처는 50,000명까지 저장할 수 있습니다.');const result=[];for(const row of rows)result.push({...row,photo:await compactPhoto(row.photo)});if(bytes(result)>MAX_BYTES)throw Error('명부 데이터가 너무 큽니다. 사진과 첨부 자료 크기를 확인해 주세요.');return result;}
 const FORMAT='moida-crm-gzip-v1';
 async function encode(rows,options={}){
  if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw Error('명부 저장 형식을 확인해 주세요.');
  let value=null;if(rows.length<=5000||options.localOnly){const text=JSON.stringify(rows);if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('명부 데이터가 너무 큽니다.');
  if(typeof CompressionStream==='undefined')throw Error('명부 압축 저장을 지원하는 최신 브라우저로 업데이트해 주세요.');
  const compressed=new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const chunks=[];for(let i=0;i<compressed.length;i+=8192)chunks.push(String.fromCharCode(...compressed.subarray(i,i+8192)));
  value=JSON.stringify({format:FORMAT,count:rows.length,data:btoa(chunks.join(''))});}
  if(options.localOnly)return value;
  if(rows.length<=5000&&new TextEncoder().encode(value).length<=800000)return value;
  if(!transport)throw Error('대용량 CRM 저장 연결을 확인해 주세요.');
  const parts=[];let rawBytes=0;async function store(batch){const payload=await encode(batch,{localOnly:true});if(payload.length>500000){if(batch.length<2)throw Error('연락처 한 건의 첨부 자료가 너무 큽니다.');const mid=Math.floor(batch.length/2);await store(batch.slice(0,mid));await store(batch.slice(mid));return;}const bytes=new TextEncoder().encode(payload),id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');const cacheId=(options.uid||'')+':'+id;if(Date.now()-(uploaded.get(cacheId)||0)>43200000){let saved;try{saved=await transport('/crm-store/put',{payload},options.uid);}catch(error){if(!String(error?.message).includes('CRM 저장 공간'))throw error;await prune(options.uid);saved=await transport('/crm-store/put',{payload},options.uid);}if(saved.id!==id)throw Error('저장 묶음 검증에 실패했습니다.');uploaded.set(cacheId,Date.now());}parts.push(id);}
  for(let i=0;i<rows.length;i+=2500){const batch=rows.slice(i,i+2500);rawBytes+=bytes(batch);if(rawBytes>MAX_BYTES)throw Error('명부 데이터가 너무 큽니다.');await store(batch);}
  return JSON.stringify({format:'moida-crm-remote-v1',count:rows.length,parts});
 }
 async function decode(raw,options={}){
  const value=typeof raw==='string'?JSON.parse(raw):raw;if(Array.isArray(value))return value;
  if(value?.format==='moida-crm-remote-v1'){
   if(!transport||!Array.isArray(value.parts)||value.parts.length>1000||!Number.isInteger(value.count)||value.count<0||value.count>MAX_ROWS)throw Error('대용량 CRM 저장 연결을 확인해 주세요.');
   const batches=[];let count=0,size=0;for(let i=0;i<value.parts.length;i+=4){const group=await Promise.all(value.parts.slice(i,i+4).map(async id=>{if(!/^[a-f0-9]{64}$/.test(id))throw Error('저장 묶음 주소가 올바르지 않습니다.');const {payload}=await transport('/crm-store/get',{id},options.uid);size+=payload.length;if(size>MAX_BYTES)throw Error('명부 크기를 초과했습니다.');const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)))).map(v=>v.toString(16).padStart(2,'0')).join('');if(actual!==id)throw Error('명부 저장 묶음이 손상되었습니다.');if(JSON.parse(payload)?.format!==FORMAT)throw Error('명부 저장 묶음 형식이 올바르지 않습니다.');return decode(payload,options);}));for(const rows of group){count+=rows.length;if(count>MAX_ROWS)throw Error('명부 인원을 초과했습니다.');batches.push(rows);}}
   if(count!==value.count)throw Error('명부 복원 인원이 일치하지 않습니다.');return batches.flat();
  }
  if(!value||value.format!==FORMAT||typeof value.data!=='string'||!Number.isInteger(value.count))throw Error('명부 저장 형식을 확인하지 못했습니다.');
  if(typeof DecompressionStream==='undefined')throw Error('명부 복원을 지원하는 최신 브라우저로 업데이트해 주세요.');
  const binary=atob(value.data),input=Uint8Array.from(binary,c=>c.charCodeAt(0)),reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const decoder=new TextDecoder(),parts=[];let size=0;try{while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;if(size>MAX_BYTES)throw Error('복원할 명부의 용량이 너무 큽니다.');parts.push(decoder.decode(chunk,{stream:true}));}parts.push(decoder.decode());}finally{await reader.cancel();}
  const rows=JSON.parse(parts.join(''));if(!Array.isArray(rows)||rows.length!==value.count)throw Error('명부 복원 결과가 저장된 인원과 일치하지 않습니다.');return rows;
 }
 function errorMessage(error){const text=String(error?.message||error||'');if(/longer than|maximum.*size|too large|용량|사진/.test(text))return '저장 용량 초과 · '+(/용량|사진/.test(text)?text:'사진 또는 명부 데이터가 서버의 항목당 저장 한도를 넘었습니다.');if(/permission-denied|insufficient permissions/.test(text))return '저장 권한을 확인하지 못했습니다. 다시 로그인해 주세요.';return '서버 저장이 지연되고 있습니다. 인터넷 연결 후 자동으로 다시 저장합니다.';}
 root.MOIDA_CRM_STORAGE={prepare,compactPhoto,errorMessage,encode,decode,configure,cache,persist,restore,prune,MAX_ROWS};
})(typeof window==='undefined'?globalThis:window);
