import {createGoogleOverlay} from './moida-google-overlay.js?v=dashboard1';
import {koreaDay} from './google-schedule-dates.js';
const M=window.MOIDA;
if(M){
 const mount=document.createElement('div');mount.hidden=true;document.body.append(mount);
 let owner='';
 const client=createGoogleOverlay({mount,user:()=>M.auth?.currentUser,onStatus:({state})=>{window.MOIDA_DASHBOARD_SCHEDULE_STATUS=state;},apply:events=>{M.googleCalendarEvents=events;window.__dashRefresh?.();}});
 function load(){const uid=M.auth?.currentUser?.uid;if(!uid)return;if(uid!==owner){owner=uid;M.googleCalendarEvents=[];window.MOIDA_DASHBOARD_SCHEDULE_STATUS='loading';}return client.load(koreaDay());}
 M.onData(load);window.addEventListener('hashchange',()=>{if(location.hash==='#dashboard')load();});
 const timer=setInterval(()=>{if(!document.hidden&&location.hash==='#dashboard')load();},300000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
