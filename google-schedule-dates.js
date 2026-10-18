export function koreaDay(value=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
export function shiftDay(key,amount){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+amount,12)).toISOString().slice(0,10);}
export function monthGrid(key){
 const first=key.slice(0,7)+'-01',[y,m]=first.split('-').map(Number),count=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=new Date(first+'T12:00:00Z').getUTCDay();
 const start=shiftDay(first,-offset);return Array.from({length:Math.ceil((count+offset)/7)*7},(_,i)=>shiftDay(start,i));
}
export function eventOnDay(event,key){
 if(!event.start||event.status==='cancelled')return false;
 if(event.allDay){const start=event.start.slice(0,10),end=event.end?.slice(0,10)||shiftDay(start,1);return key>=start&&key<end;}
 const start=Date.parse(event.start),end=Date.parse(event.end),dayStart=Date.parse(key+'T00:00:00+09:00');
 return Number.isFinite(start)&&start<dayStart+86400000&&(Number.isFinite(end)&&end>start?end>dayStart:start>=dayStart);
}
export function sortedEvents(events){return [...events].sort((a,b)=>Number(b.allDay)-Number(a.allDay)||String(a.start).localeCompare(String(b.start))||String(a.title).localeCompare(String(b.title),'ko'));}
