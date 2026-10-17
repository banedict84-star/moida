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
 async function prepare(rows){const result=[];for(const row of rows)result.push({...row,photo:await compactPhoto(row.photo)});if(bytes(result)>900000)throw Error('CRM 저장 용량 제한을 넘었습니다. 사진 크기나 명부 저장 방식을 확인해 주세요.');return result;}
 function errorMessage(error){const text=String(error?.message||error||'');if(/longer than|maximum.*size|too large|용량|사진/.test(text))return '저장 용량 초과 · '+(/용량|사진/.test(text)?text:'사진 또는 명부 데이터가 서버의 항목당 저장 한도를 넘었습니다.');if(/permission-denied|insufficient permissions/.test(text))return '저장 권한을 확인하지 못했습니다. 다시 로그인해 주세요.';return '서버 저장이 지연되고 있습니다. 인터넷 연결 후 자동으로 다시 저장합니다.';}
 root.MOIDA_CRM_STORAGE={prepare,compactPhoto,errorMessage};
})(typeof window==='undefined'?globalThis:window);
