import test from 'node:test';
import assert from 'node:assert/strict';
import {driveListParams,driveListResult} from '../drive-query.js';
test('full-text searches omit unsupported sorting and include folders',()=>{
 const params=driveListParams({query:'통화녹음',pageToken:'next'});
 assert.equal(params.has('orderBy'),false);
 assert.match(params.get('q'),/fullText contains/);
 assert.ok(!params.get('q').includes('mimeType !='));
 assert.equal(params.get('pageToken'),'next');
});
test('folder listing retains supported ordering and parent filtering',()=>{
 const params=driveListParams({folderId:'folder_A'});
 assert.equal(params.get('orderBy'),'folder,name');
 assert.match(params.get('q'),/'folder_A' in parents/);
 assert.throws(()=>driveListParams({folderId:"x' or true"}));
});
test('partial pages must not be treated as complete counts',()=>{
 assert.equal(driveListResult({nextPageToken:'next'}).complete,false);
 assert.equal(driveListResult({incompleteSearch:true}).complete,false);
 assert.equal(driveListResult({files:[]}).complete,true);
});
