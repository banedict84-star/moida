import {createRoot} from 'react-dom/client';
import Dashboard from './dashboard';
import './styles.css';

const root=createRoot(document.getElementById('root')!);
const message=(text:string)=>root.render(<main className="shell"><section className="card"><h1>새 글 도우미</h1><p className="muted" style={{marginTop:16}}>{text}</p></section></main>);
async function open(){
  message('관리 공간을 열고 있습니다.');
  const fragment=new URLSearchParams(location.hash.slice(1)),key=fragment.get('key');
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  try {
    if(key){
      const response=await fetch('/access/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'전용 주소를 확인해 주세요.');
    }else{
      const response=await fetch('/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'get'})});
      if(!response.ok)throw new Error('받으신 전용 주소로 열어 주세요.');
    }
    root.render(<Dashboard/>);
  }catch(error){message(error instanceof Error?error.message:'관리 공간을 열지 못했습니다. 전용 주소로 다시 열어 주세요.');}
}
void open();
