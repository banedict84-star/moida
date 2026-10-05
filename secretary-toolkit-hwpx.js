// HWPX is a ZIP package. Read only section XML; never run embedded content.
export async function readHwpx(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
 if(eocd<0)throw Error('HWPX 압축 구조를 읽지 못했습니다. PDF로 변환해 주세요.');
 const total=view.getUint16(eocd+10,true);let pos=view.getUint32(eocd+16,true),text=[],size=0;
 if(total>5000)throw Error('HWPX 내부 파일이 너무 많습니다.');
 for(let n=0;n<total;n++){if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('HWPX 파일 구조가 올바르지 않습니다.');
  const method=view.getUint16(pos+10,true),packed=view.getUint32(pos+20,true),unpacked=view.getUint32(pos+24,true),nameLength=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true),name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+nameLength));pos+=46+nameLength+extra+comment;
  if(!/^Contents\/section\d+\.xml$/i.test(name))continue;
  if(unpacked>8*1024*1024||size+unpacked>8*1024*1024)throw Error('HWPX 본문이 너무 큽니다.');
  if(offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)throw Error('HWPX 본문 위치를 읽지 못했습니다.');
  const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);if(start+packed>bytes.length)throw Error('HWPX 본문이 손상되었습니다.');let content=bytes.subarray(start,start+packed);
  if(method===8){const reader=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let count=0;try{while(true){const{done,value}=await reader.read();if(done)break;count+=value.length;if(count>8*1024*1024)throw Error('HWPX 본문이 너무 큽니다.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}content=new Uint8Array(count);let p=0;for(const c of chunks){content.set(c,p);p+=c.length;}}
  else if(method!==0)throw Error('이 HWPX 압축 형식은 읽을 수 없습니다.');
  size+=content.length;if(size>8*1024*1024)throw Error('HWPX 본문이 너무 큽니다.');const xml=new TextDecoder().decode(content);const paragraphs=[];for(const m of xml.matchAll(/<(?:\w+:)?p\b[^>]*>([\s\S]*?)<\/(?:\w+:)?p>/g)){const runs=[...m[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(r=>r[1].replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));if(runs.length)paragraphs.push(runs.join(''));}text.push({name,content:paragraphs.join('\n')});
 }
 text.sort((a,b)=>Number(a.name.match(/\d+/)[0])-Number(b.name.match(/\d+/)[0]));const result=text.map(s=>s.content).join('\n\n');if(!result.trim())throw Error('HWPX에서 텍스트를 확인하지 못했습니다. 스캔 문서는 PDF로 올려 주세요.');return result;
}
