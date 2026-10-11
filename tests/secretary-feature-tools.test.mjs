import test from 'node:test';
import assert from 'node:assert/strict';
import {executeFeatureTool,FEATURE_TOOLS} from '../secretary-feature-tools.js';
const execute=(name,args,feature)=>executeFeatureTool({name,args,operationKey:'secretary_execution_123456789',services:{feature}});
test('통화 검색과 전사 이어 읽기는 실제 데이터만 반환한다',async()=>{
 const list=await execute('list_call_records',{query:'민원',status:'failed'},async()=>({ok:true,records:[{id:'a',title:'민원',filename:'a',status:'failed'},{id:'b',title:'회의',filename:'b',status:'completed'}]}));assert.equal(list.records.length,1);
 const read=await execute('read_call_record',{record_id:'a'},async(kind,path)=>{assert.equal(kind,'calls');assert.equal(path,'/call-records?id=a');return {record:{id:'a',transcript:'가'.repeat(18001),summary:'합의',status:'completed'}};});assert.equal(read.record.next_offset,18000);
 await assert.rejects(execute('read_call_record',{record_id:'a&uid=other'},()=>{}),/ID/);
});
test('문자는 초안만 준비하고 모델이 발송 확인을 넘겨도 발송하지 않는다',async()=>{
 const result=await execute('prepare_sms',{from:'01011111111',recipients:['01022222222'],text:'안녕하세요',confirmed:true},async(kind,path,method,body)=>{assert.equal(path,'/messaging/solapi/preview');assert.equal(body.confirmed,undefined);return {previewId:'draft'};});assert.equal(result.requires_confirmation,true);assert.ok(!FEATURE_TOOLS.some(t=>t.name==='send_sms'));
});
test('FLOW 등록은 연결 프로젝트와 실행 ID를 사용하고 임의 프로젝트를 받지 않는다',async()=>{
 const calls=[];await execute('register_flow_event',{title:'방문',date:'2026-10-13',time:'09:00',end_date:'2026-10-13',end_time:'10:00',projectId:'other'},async(kind,path,method,body)=>{calls.push({path,body});return {projectId:'123'};});assert.equal(calls[1].body.projectId,'123');assert.equal(calls[1].body.requestId,'secretary_execution_123456789');
});
test('위치 이력 조회는 장치 ID와 날짜를 쿼리 인코딩한다',async()=>{
 await execute('location_history',{device_id:'a&uid=other',start:'2026-10-12T00:00:00+09:00'},async(kind,path)=>{assert.equal(kind,'location');const u=new URL(path,'https://test');assert.equal(u.searchParams.get('device'),'a&uid=other');assert.equal(u.searchParams.get('uid'),null);return {ok:true};});
});
