import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../schedule-place.js',import.meta.url),'utf8'),context);const read=context.window.moidaSchedulePlace.read;
test('place fields and explicit memo labels are read without guessing locations',()=>{
 assert.equal(read({_location:'  ',place:'경기도의회'}),'경기도의회');
 assert.equal(read({location:{name:'본회의장'}}),'본회의장');
 assert.equal(read({schedule:{place:'안산문화예술의전당'}}),'안산문화예술의전당');
 assert.equal(read({_body:'행사 안내\n장소: 경기도의회\n준비물 확인'}),'경기도의회');
 assert.equal(read({_body:'장소 경기도의회'}),'경기도의회');
 assert.equal(read({body:'<p>장소：안산문화예술의전당</p><p>행사 내용</p>'}),'안산문화예술의전당');
 assert.equal(read({_body:'경기도의회에서 뵐까요? 장소를 확인해야 합니다.'}),'');
 assert.equal(read({_location:'의회',_body:'장소: 다른 장소'}),'의회');
});
