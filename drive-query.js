const FOLDER='application/vnd.google-apps.folder';
const quote=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
export function driveListParams({query='',folderId,foldersOnly=false,pageToken}={}){
 const clauses=['trashed = false'];
 if(folderId){if(!/^[a-zA-Z0-9_-]{1,160}$/.test(folderId))throw new Error('폴더 ID가 올바르지 않습니다.');clauses.push("'"+folderId+"' in parents");}
 if(foldersOnly)clauses.push("mimeType = '"+FOLDER+"'");
 if(query.trim())clauses.push("(name contains '"+quote(query.trim())+"' or fullText contains '"+quote(query.trim())+"')");
 const p=new URLSearchParams({q:clauses.join(' and '),fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,webViewLink,size,parents,shortcutDetails)',pageSize:'100',orderBy:'folder,name',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
 if(pageToken)p.set('pageToken',String(pageToken));
 return p;
}
export function driveListResult(data){return {...data,files:(data.files||[]).map(file=>({...file,kind:file.mimeType===FOLDER?'folder':file.mimeType==='application/vnd.google-apps.shortcut'?'shortcut':'file'})),complete:!data.nextPageToken&&!data.incompleteSearch,scope:'현재 연결 계정이 접근 가능한 항목. 폴더 조회는 바로 아래 항목이며 하위 폴더는 별도 조회. complete=false이면 전체 개수로 단정하지 말 것.'};}
