import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {extractDongEvents} from '../weekly-xlsx.js';
import {duplicateEvent,eventKey} from '../weekly-mail-automation.js';
import {readWeeklyMail} from '../weekly-mail-reader.js';
import {createWeeklyAutomation} from '../weekly-mail-automation.js';
import {DatabaseSync} from 'node:sqlite';
function file(dong='성포동',date='46316',time='0.375'){
const header=['날짜','시','부서명','행사명','장소','주요내용'];const cells=(values)=>values.map((v,i)=>`<c r="${String.fromCharCode(65+i)}1" t="inlineStr"><is><t>${v}</t></is></c>`).join('');
return zipSync({'xl/worksheets/sheet1.xml':strToU8(`<worksheet><sheetData><row>${cells(header)}</row><row><c r="A2"><v>${date}</v></c><c r="B2"><v>${time}</v></c>${cells(['','','성포동','회의','센터','내용']).replace('성포동',dong).replace(/r="([C-F])1"/g,'r="$12"').replace(/<c r="[AB]1".*?<\/c>/g,'')}</row></sheetData></worksheet>`)});
}
test('담당 동 정확히 필터링하고 수치 날짜/시각만 허용',()=>{assert.equal(extractDongEvents(file()).events.length,1);assert.equal(extractDongEvents(file('사이동')).events.length,0);assert.equal(extractDongEvents(file('이동 시장실')).events.length,0);assert.throws(()=>extractDongEvents(file('성포동','불명')),/날짜/);});
test('같은 행사를 재시도해도 결정적 ID, 기존 수동 등록 제목도 인식',async()=>{const e={dong:'성포동',start:'2026-10-21T09:00:00+09:00',title:'회의'};assert.equal(await eventKey(e),await eventKey({...e}));assert(duplicateEvent(e,[{summary:'[성포동] 회의',start:{dateTime:e.start}}]));assert(!duplicateEvent(e,[{summary:'[성포동] 회의',start:{dateTime:'2026-10-22T09:00:00+09:00'}}]));});
test('IMAP 사용자 폴더도 검색하고 BODY.PEEK 바이트 literal을 읽으며 읽음 표시를 바꾸지 않는다',async()=>{
 const enc=new TextEncoder(),commands=[];let controller,closed=false;
 const socket={opened:Promise.resolve(),closed:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;c.enqueue(enc.encode('* OK ready\r\n'));}}),writable:new WritableStream({write(bytes){const s=new TextDecoder().decode(bytes);commands.push(s);const tag=s.split(' ')[0];let reply='';if(s.includes(' LIST '))reply='* LIST () "/" "INBOX"\r\n* LIST () "/" "weekly"\r\n';if(s.includes(' SEARCH '))reply='* SEARCH 1\r\n';if(s.includes(' FETCH '))reply='* 1 FETCH (BODY[] {3}\r\nabc)\r\n';controller.enqueue(enc.encode(reply+tag+' OK done\r\n'));}}),close:async()=>{closed=true;}};
 const result=await readWeeklyMail({connect:()=>socket,mailbox:'a@naver.com',password:'secret',since:'18-Oct-2026',senders:['a@korea.kr']});assert.equal(result.length,2);assert.equal(new TextDecoder().decode(result[0]),'abc');assert(commands.some(c=>c.includes('EXAMINE "weekly"')));assert(commands.every(c=>!c.includes('STORE')&&!c.includes('SELECT')));assert(closed);
});
test('서버 설정은 계정별이고 반복 실행은 같은 행사를 다시 생성하지 않는다',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE naver_mail_connections(uid TEXT,mailbox TEXT,cipher TEXT,iv TEXT)');db.prepare('INSERT INTO naver_mail_connections VALUES(?,?,?,?)').run('owner','ansan3work031@naver.com','cipher','iv');
 const env={AGENT_DB:{prepare(sql){const bind=(...args)=>({run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)})});return {...bind(),bind};}}};let created=0;
 const mime='From: sangnokadm@korea.kr\r\nDate: '+new Date(Date.now()+60000).toUTCString()+'\r\nSubject: 주간행사\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\nContent-Disposition: attachment; filename="weekly.xlsx"\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Buffer.from(file('성포동','60000')).toString('base64')+'\r\n--x--\r\n';
 const a=createWeeklyAutomation({decrypt:async()=>JSON.stringify({uid:'owner',mailbox:'ansan3work031@naver.com',password:'secret'}),connect:async()=>()=>{},readMail:async()=>[new TextEncoder().encode(mime)],google:async()=>({email:'banedict84@gmail.com',api:async(url,init={})=>{if(init.method==='POST'){created++;return {id:JSON.parse(init.body).id};}return init.allowNotFound?null:{items:[]};}})});
 const req=new Request('https://worker.test/weekly-mail-automation',{method:'POST'});await a.route({env,uid:'owner',request:req,body:{action:'enable'}});await a.route({env,uid:'owner',request:req,body:{action:'run'}});await a.route({env,uid:'owner',request:req,body:{action:'run'}});assert.equal(created,1);assert.equal((await a.route({env,uid:'other',request:new Request(req.url)})).job,null);db.close();
});
