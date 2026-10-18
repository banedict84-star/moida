// Read-only IMAP: never mark mail read, move it, or expose credentials.
export async function readWeeklyMail({connect,mailbox,password,since,senders}) {
 const socket=connect({hostname:'imap.naver.com',port:993},{secureTransport:'on'});
 socket.closed.catch(()=>{});
 let timer;const reader=socket.readable.getReader(),writer=socket.writable.getWriter();
 let buffer=new Uint8Array(),tag=0,total=0;
 const decoder=new TextDecoder(),encoder=new TextEncoder();
 async function more(){const v=await reader.read();if(v.done)throw Error('네이버 연결이 종료됐습니다.');total+=v.value.length;if(total>20*1024*1024)throw Error('메일 조회 크기 제한을 초과했습니다.');const b=new Uint8Array(buffer.length+v.value.length);b.set(buffer);b.set(v.value,buffer.length);buffer=b;}
 async function line(){for(;;){for(let i=0;i<buffer.length-1;i++)if(buffer[i]===13&&buffer[i+1]===10){const s=decoder.decode(buffer.slice(0,i));buffer=buffer.slice(i+2);return s;}if(buffer.length>65536)throw Error('IMAP 응답 형식 오류');await more();}}
 async function bytes(n){if(n>5*1024*1024)throw Error('첨부 메일이 5MB를 초과합니다.');while(buffer.length<n)await more();const b=buffer.slice(0,n);buffer=buffer.slice(n);return b;}
 async function command(text){const id='W'+(++tag);await writer.write(encoder.encode(id+' '+text+'\r\n'));const lines=[],literals=[];for(;;){const s=await line();if(s.startsWith(id+' ')){if(!s.startsWith(id+' OK'))throw Error('네이버 메일 읽기 요청이 거절됐습니다.');return {lines,literals};}if(s.startsWith('* BYE'))throw Error('네이버 연결 종료');lines.push(s);const m=s.match(/\{(\d+)\}$/);if(m)literals.push(await bytes(Number(m[1])));}}
 const quote=s=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
 async function work(){await socket.opened;if(!/^\* OK/.test(await line()))throw Error('네이버 접속 실패');await command('LOGIN '+quote(mailbox.split('@')[0])+' '+quote(password));
 const folders=await command('LIST "" "*"');const names=folders.lines.filter(s=>/^\* LIST /i.test(s)&&!s.includes('\\Noselect')).map(s=>s.match(/ "((?:[^"\\]|\\.)*)"$/)?.[1]?.replace(/\\([\\"])/g,'$1')).filter(Boolean);
 if(!names.includes('INBOX'))names.unshift('INBOX');if(names.length>40)throw Error('메일함이 40개를 초과하여 확인이 필요합니다.');
 const messages=[];for(const folder of names){if(/trash|spam|sent|draft|deleted|junk/i.test(folder))continue;await command('EXAMINE '+quote(folder));const ids=new Set();for(const sender of senders){const r=await command('UID SEARCH SINCE '+since+' FROM '+quote(sender));for(const s of r.lines)if(s.startsWith('* SEARCH '))for(const id of s.slice(9).trim().split(/\s+/))if(/^\d+$/.test(id))ids.add(id);}
 if(ids.size>30)throw Error('대상 메일이 많아 확인이 필요합니다.');for(const id of ids){const r=await command('UID FETCH '+id+' (BODY.PEEK[])');if(r.literals.length!==1)throw Error('메일 본문을 확인하지 못했습니다.');messages.push(r.literals[0]);}}
 return messages;}
 try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('네이버 메일 조회 시간 초과')),90000);})]);}finally{clearTimeout(timer);await socket.close().catch(()=>{});}
}
