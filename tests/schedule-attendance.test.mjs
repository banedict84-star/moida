import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../schedule.html',import.meta.url),'utf8');
const implementation=html.match(/window\._saveScheduleAttendance = async function\(uid, data\)\{[\s\S]*?\n\};/)[0];
function setup(user,current,fail=false){
 const calls=[];
 const scope={window:{},_auth:{currentUser:user},_db:{},sessionStorage:{getItem:()=>JSON.stringify(current)},doc:(_db,...p)=>p,setDoc:async(...args)=>{if(fail)throw Error('denied');calls.push(args);}};
 vm.runInNewContext(implementation,scope);return {save:scope.window._saveScheduleAttendance,calls};
}
test('attendance uses office owner and merge, keeping imported event data unchanged',async()=>{
 const {save,calls}=setup({uid:'staff'},{uid:'staff',effectiveUid:'office'});await save('office',{flow_42:'attending'});
 assert.deepEqual(Array.from(calls[0][0]),['moida_users','office']);assert.equal(calls[0][1].scheduleAttendance,'{"flow_42":"attending"}');assert.equal(calls[0][2].merge,true);
});
test('attendance rejects signed-out users and changed account/owner',async()=>{
 await assert.rejects(setup(null,{uid:'owner'}).save('owner',{}));
 await assert.rejects(setup({uid:'other'},{uid:'owner'}).save('owner',{}));
 await assert.rejects(setup({uid:'owner'},{uid:'owner'}).save('other',{}));
});
test('attendance reports storage errors instead of pretending the selection was saved',async()=>{
 await assert.rejects(setup({uid:'owner'},{uid:'owner'},true).save('owner',{}),/denied/);
});
