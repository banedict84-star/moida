/* Initialize connections independently of the legacy chat runtime. */
(()=>{
 const M=window.MOIDA;if(!M||!window.setupAppConnections)return;
 window.setupAppConnections({
  owner:()=>M.auth?.currentUser?.uid||null,
  subscribe:fn=>M.onData(fn),
  request:async(path,options={})=>{
   const user=M.auth?.currentUser;if(!user)throw Error('로그인 후 도구를 연결할 수 있습니다.');
   const token=await user.getIdToken();
   const response=await fetch('https://moida-gpt.banedict84.workers.dev'+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token}});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||result.message||'연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.');
   return result;
  }
 });
})();
