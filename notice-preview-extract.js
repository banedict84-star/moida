/* Runs in the official page DOM; returns text and URLs, never executable HTML. */
(sourceUrl) => {
  const allowed = value => {
    try { const u=new URL(value,sourceUrl||location.href);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['theminjoo.kr','minjookg.kr','ggc.go.kr','council.gg.go.kr'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:null; } catch { return null; }
  };
  const roots=[...document.querySelectorAll('.board-view__contents, .board_contents, .board_view > .view_cont')];
  if(!roots.length)return null;
  const texts=[],images=[],tables=[];
  for(const root of roots){
    const clone=root.cloneNode(true);clone.querySelectorAll('table').forEach(table=>{const rows=[...table.rows].map(row=>[...row.cells].map(cell=>cell.textContent.replace(/\s+/g,' ').trim()));if(rows.length)tables.push(rows.slice(0,200));table.remove();});clone.querySelectorAll('script,style,iframe,form,button,nav').forEach(e=>e.remove());
    const text=(clone.innerText||clone.textContent||'').replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
    if(text)texts.push(text);
    root.querySelectorAll('img').forEach(img=>{const url=allowed(img.getAttribute('src'));if(url&&!images.some(i=>i.url===url))images.push({url,alt:img.alt||'공지 이미지'});});
  }
  const attachments=[];
  document.querySelectorAll('a[href]').forEach(a=>{const url=allowed(a.getAttribute('href')),name=a.textContent.trim();if(url&&name&&/download|\.(pdf|hwp|hwpx|docx?|xlsx?|zip)(\?|$)/i.test(url)&&!attachments.some(f=>f.url===url))attachments.push({url,name:name.slice(0,250)});});
  if(!texts.length&&!images.length&&!tables.length)return null;
  return {content:texts.join('\n\n').slice(0,40000),images:images.slice(0,20),tables:tables.slice(0,10),attachments:attachments.slice(0,30),checked_at:new Date().toISOString()};
}
