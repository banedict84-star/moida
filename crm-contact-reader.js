(function(root){'use strict';
 root.MOIDA_CRM_CONTACTS=function(members,args){
  if(!Array.isArray(members))throw Error('CRM 명부를 먼저 불러와 주세요.');
  args=args||{};var offset=args.offset===undefined?0:args.offset,limit=args.limit===undefined?100:args.limit;
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('조회 범위를 확인해 주세요.');
  var normalize=function(v){return String(v||'').toLowerCase().replace(/[\s-]/g,'');},query=normalize(args.query);
  var rows=members.filter(function(m){return !query||[m.name,m.phone,m.addr,m.dong].some(function(v){return normalize(v).includes(query);});});
  return {source:'모이다 CRM',total:rows.length,offset:offset,limit:limit,next_offset:offset+limit<rows.length?offset+limit:null,contacts:rows.slice(offset,offset+limit).map(function(m){return {id:String(m.mid||''),name:String(m.name||''),phone:String(m.phone||''),address:String(m.addr||''),dong:String(m.dong||''),referrer:String(m.rec||''),second_referrer:String(m.rec2||''),third_referrer:String(m.rec3||'')};})};
 };
})(typeof window==='undefined'?globalThis:window);
