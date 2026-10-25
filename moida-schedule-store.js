import {updateSchedule} from './moida-schedule-model.js?v=3';
export function nativeScheduleStore({model,auth,owner,readonly,transaction,reference}){
 return async function(event,options={}){
  const uid=auth.currentUser?.uid;
  if(!uid)throw Error('로그인 후 다시 시도해 주세요.');
  const session=model.sessUser();
  if((session.uid&&session.uid!==uid)||(session.effectiveUid||session.uid||uid)!==owner)throw Error('의원실 계정이 변경되었습니다. 새로고침해 주세요.');
  if(readonly())throw Error('읽기 전용 계정에서는 일정을 변경할 수 없습니다.');
  const copy=JSON.parse(JSON.stringify(event));
  const result=await transaction(async tx=>{
   if(auth.currentUser?.uid!==uid)throw Error('로그인 계정이 변경되었습니다.');
   const snap=await tx.get(reference);
   const next=updateSchedule(snap.exists()?snap.data():{},copy,{...options,uid,name:model.sessUser().displayName||'의원실'});
   tx.set(reference,{events:JSON.stringify(next.events),deletedEventIds:JSON.stringify(next.deletedEventIds)},{merge:true});
   return next;
  });
  if(auth.currentUser?.uid!==uid)throw Error('로그인 계정이 변경되었습니다.');
  model.events=result.events.concat((model.events||[]).filter(e=>e.source==='flow'));
  model.deletedEventIds=result.deletedEventIds;
  try{localStorage.setItem('moida_events_'+owner,JSON.stringify(result.events));localStorage.setItem('moida_deleted_events_'+owner,JSON.stringify(result.deletedEventIds));}catch{}
  model.emit();
  return result;
 };
}
