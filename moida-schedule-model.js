export const categories=[['office','의정활동','#3975d9'],['local','지역활동','#259b87'],['meeting','회의·간담회','#8d68bd'],['personal','개인 일정','#cc8a38']];
export function validateEvent(e){
 if(!e||!String(e.title||'').trim())throw Error('제목을 입력해 주세요.');
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&!isNaN(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 if(!valid(e.date)||!valid(e.endDate))throw Error('시작일과 종료일을 확인해 주세요.');
 if(!e.allDay&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.endTime||'')))throw Error('시작·종료 시간을 입력해 주세요.');
 if(e.endDate<e.date||(!e.allDay&&e.endDate===e.date&&e.endTime<=e.time))throw Error('종료는 시작 이후로 지정해 주세요.');
 if(!categories.some(c=>c[0]===e.category))throw Error('카테고리를 선택해 주세요.');
 return e;
}
export function updateSchedule(data,event,{remove=false,create=false,uid='',name=''}={}){
 if(!event?.id||typeof event.id!=='string')throw Error('일정 식별자를 확인하지 못했습니다. 새로고침해 주세요.');
 const parse=v=>typeof v==='string'?JSON.parse(v):v||[];
 const events=parse(data.events),deleted=parse(data.deletedEventIds);
 if(!Array.isArray(events)||!Array.isArray(deleted))throw Error('기존 일정 데이터를 확인해 주세요.');
 const old=events.find(e=>e.id===event.id);
 if(old?.source==='flow'||event.source==='flow')throw Error('연결된 원본 일정은 별도 보기에서 확인해 주세요.');
 if(!create&&!old)throw Error('이 일정은 이미 삭제되었습니다. 새로고침해 주세요.');
 if(create&&old)throw Error('이미 등록된 일정입니다. 새로고침해 주세요.');
 if(!remove)validateEvent(event);
 const next=events.filter(e=>e.id!==event.id);
 if(!remove)next.push({...old,...event,source:'moida',author:old?.author||name,authorUid:old?.authorUid||uid,created:old?.created||new Date().toISOString(),updatedAt:Date.now()});
 return {events:next,deletedEventIds:remove?[...new Set([...deleted,event.id])]:deleted.filter(id=>id!==event.id)};
}
