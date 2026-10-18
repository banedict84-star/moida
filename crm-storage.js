(function(root){
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
 async function prepare(rows){const result=[];for(const row of rows)result.push({...row,photo:await compactPhoto(row.photo)});if(bytes(result)>20000000)throw Error('명부 데이터가 너무 큽니다. 20MB 이하로 나누어 주세요.');return result;}
 const FORMAT='moida-crm-gzip-v1';
 async function encode(rows){
  if(!Array.isArray(rows))throw Error('명부 저장 형식을 확인해 주세요.');
  const text=JSON.stringify(rows);if(new TextEncoder().encode(text).length>20000000)throw Error('명부 데이터가 너무 큽니다.');
  if(typeof CompressionStream==='undefined')throw Error('명부 압축 저장을 지원하는 최신 브라우저로 업데이트해 주세요.');
  const compressed=new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const chunks=[];for(let i=0;i<compressed.length;i+=8192)chunks.push(String.fromCharCode(...compressed.subarray(i,i+8192)));
  const value=JSON.stringify({format:FORMAT,count:rows.length,data:btoa(chunks.join(''))});
  if(new TextEncoder().encode(value).length>800000)throw Error('압축 후에도 명부 저장 용량을 넘었습니다. 사진 크기나 첨부 자료를 확인해 주세요.');return value;
 }
 async function decode(raw){
  const value=typeof raw==='string'?JSON.parse(raw):raw;if(Array.isArray(value))return value;
  if(!value||value.format!==FORMAT||typeof value.data!=='string'||!Number.isInteger(value.count))throw Error('명부 저장 형식을 확인하지 못했습니다.');
  if(typeof DecompressionStream==='undefined')throw Error('명부 복원을 지원하는 최신 브라우저로 업데이트해 주세요.');
  const binary=atob(value.data),input=Uint8Array.from(binary,c=>c.charCodeAt(0)),reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const decoder=new TextDecoder(),parts=[];let size=0;try{while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;if(size>20000000)throw Error('복원할 명부의 용량이 너무 큽니다.');parts.push(decoder.decode(chunk,{stream:true}));}parts.push(decoder.decode());}finally{await reader.cancel();}
  const rows=JSON.parse(parts.join(''));if(!Array.isArray(rows)||rows.length!==value.count)throw Error('명부 복원 결과가 저장된 인원과 일치하지 않습니다.');return rows;
 }
 function errorMessage(error){const text=String(error?.message||error||'');if(/longer than|maximum.*size|too large|용량|사진/.test(text))return '저장 용량 초과 · '+(/용량|사진/.test(text)?text:'사진 또는 명부 데이터가 서버의 항목당 저장 한도를 넘었습니다.');if(/permission-denied|insufficient permissions/.test(text))return '저장 권한을 확인하지 못했습니다. 다시 로그인해 주세요.';return '서버 저장이 지연되고 있습니다. 인터넷 연결 후 자동으로 다시 저장합니다.';}
 root.MOIDA_CRM_STORAGE={prepare,compactPhoto,errorMessage,encode,decode};
})(typeof window==='undefined'?globalThis:window);
