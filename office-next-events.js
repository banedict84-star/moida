(function(root){
 'use strict';
 function identity(e){return String(e.id||e.googleEventId||[e.title||'',e.date||'',e.time||'',e.created||''].join('|'));}
 function start(e){if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time||'')||e.allDay)return null;var ms=Date.parse(e.date+'T'+e.time+':00+09:00');return Number.isFinite(ms)?ms:null;}
 function next(events,now,deleted){var hidden=new Set(deleted||[]),unique=new Map();(events||[]).forEach(function(e){if(e&&!hidden.has(identity(e))&&!e.cancelled&&!e.deleted&&e.status!=='취소')unique.set(identity(e),e);});var list=Array.from(unique.values()),timed=list.map(function(e){return{event:e,ms:start(e)};}).filter(function(x){return x.ms!==null&&x.ms>=now;}).sort(function(a,b){return a.ms-b.ms;});var group=[];if(timed.length){var first=timed[0],end=Date.parse((first.event.endDate||first.event.date)+'T'+(first.event.endTime||first.event.end_time||'')+':00+09:00');if(!Number.isFinite(end)||end<=first.ms)end=first.ms+1;group=timed.filter(function(x){return x.ms<end;}).map(function(x){return x.event;});}var today=new Date(now+9*3600000).toISOString().slice(0,10);return{events:group,untimed:list.filter(function(e){return start(e)===null&&e.date===today;}),start:timed[0]?.ms||null};}
 root.MoidaNextEvents={identity:identity,next:next};
})(typeof window==='undefined'?globalThis:window);
