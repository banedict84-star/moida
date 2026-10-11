(function(root){
 'use strict';
 var data=null;
 function safeUrl(value){try{var u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['theminjoo.kr','minjookg.kr','ggc.go.kr','council.gg.go.kr'].some(function(h){return u.hostname===h||u.hostname.endsWith('.'+h);})?u.href:null;}catch(e){return null;}}
 function node(tag,text,cls){var el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
 function link(url,label){var a=node('a',label,'src-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
 root.showNoticePreview=async function(container,notice,label){
   var token={};container._noticePreview=token;
   container.replaceChildren(node('p','공지 본문을 불러오는 중…','notice-preview-status'));
   try{
     if(!data)data=fetch('notice_previews.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw Error('미리보기 조회 실패');return r.json();}).catch(function(e){data=null;throw e;});
     var all=await data;if(container._noticePreview!==token)return;
     var preview=all.items&&all.items[notice.link];
     container.replaceChildren();
     if(!preview){container.append(node('p','이 공지의 본문 미리보기를 준비 중입니다. 원문에서 먼저 확인하실 수 있습니다.','notice-preview-status'));}
     else{
       if(preview.content)container.append(node('div',preview.content,'notice-preview-text'));
       (preview.tables||[]).forEach(function(rows){var wrap=node('div',undefined,'notice-preview-table'),table=node('table');rows.forEach(function(cells,index){var row=node('tr');cells.forEach(function(text){row.append(node(index===0?'th':'td',text));});table.append(row);});wrap.append(table);container.append(wrap);});
       (preview.images||[]).forEach(function(item){var url=safeUrl(item.url);if(!url)return;var a=link(url,''),img=node('img');a.className='notice-preview-image';img.src=url;img.alt=item.alt||'공지 이미지';img.loading='lazy';img.referrerPolicy='no-referrer';a.append(img);img.addEventListener('error',function(){a.replaceChildren(node('span','공지 이미지 원본 열기'));});container.append(a);});
       if((preview.attachments||[]).length){var files=node('div',undefined,'atts');files.append(node('strong','첨부파일'));preview.attachments.forEach(function(f){var url=safeUrl(f.url);if(url)files.append(link(url,f.name));});container.append(files);}
       if(preview.checked_at){var date=new Date(preview.checked_at);if(!isNaN(date))container.append(node('p','원문 확인: '+date.toLocaleString('ko-KR'),'notice-preview-status'));}
     }
   }catch(e){if(container._noticePreview!==token)return;container.replaceChildren(node('p','본문을 불러오지 못했습니다. 원문에서 확인해 주세요.','notice-preview-status'));}
   if(container._noticePreview===token){var url=safeUrl(notice.link);if(url){var footer=node('div',undefined,'atts');footer.append(link(url,label));container.append(footer);}}
 };
})(window);
