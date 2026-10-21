"use strict";
// Persist refreshable sessions for 30 days, separately from worksheet drawings.
window.BioPersistentAuth={createStorage(storageKey){
  const lifetime=30*24*60*60*1000,deadlineKey=`${storageKey}:remember-until`;
  let databasePromise;
  const localRead=key=>{try{return localStorage.getItem(key)}catch{return null}};
  const localRemove=key=>{try{localStorage.removeItem(key)}catch{}};
  function database(){
    if(!databasePromise)databasePromise=new Promise(resolve=>{
      try{
        const request=indexedDB.open("biology-classroom-auth",1);
        request.onupgradeneeded=()=>request.result.createObjectStore("sessions");
        request.onsuccess=()=>resolve(request.result);
        request.onerror=request.onblocked=()=>resolve(null);
      }catch{resolve(null)}
    });
    return databasePromise;
  }
  async function backup(mode,key,record){
    const db=await database();if(!db)return null;
    return new Promise(resolve=>{
      try{
        const tx=db.transaction("sessions",mode==="get"?"readonly":"readwrite"),store=tx.objectStore("sessions");
        const request=mode==="get"?store.get(key):mode==="put"?store.put(record,key):store.delete(key);
        tx.oncomplete=()=>resolve(mode==="get"?request.result??null:true);
        tx.onerror=tx.onabort=()=>resolve(null);
      }catch{resolve(null)}
    });
  }
  async function removeItem(key){
    localRemove(key);if(key===storageKey)localRemove(deadlineKey);
    await backup("delete",key);
  }
  async function write(key,value,expiresAt){
    let savedLocally=false;
    try{
      localStorage.setItem(key,value);
      if(key===storageKey)localStorage.setItem(deadlineKey,String(expiresAt));
      savedLocally=true;
    }catch{
      // A failed write must not leave a stale refresh token ahead of the backup.
      localRemove(key);if(key===storageKey)localRemove(deadlineKey);
    }
    const savedBackup=await backup("put",key,{value,expiresAt});
    if(!savedLocally&&!savedBackup)throw Error("로그인 정보를 저장하지 못했습니다. 브라우저의 사이트 데이터 저장을 허용해 주세요.");
  }
  async function getItem(key){
    const local=localRead(key),record=await backup("get",key),value=local??record?.value??null;
    if(value===null)return null;
    if(key!==storageKey)return value;
    const storedDeadline=Number(localRead(deadlineKey));
    const expiresAt=storedDeadline>0?storedDeadline:record?.expiresAt||Date.now()+lifetime;
    if(Date.now()>=expiresAt){await removeItem(key);return null}
    // Adopt existing logins without asking everyone to sign in again.
    if(!record||record.value!==value||!storedDeadline)await write(key,value,expiresAt);
    return value;
  }
  return {
    getItem,removeItem,
    async setItem(key,value){
      const record=key===storageKey?await backup("get",key):null;
      const expiresAt=key===storageKey?(Number(localRead(deadlineKey))||record?.expiresAt||Date.now()+lifetime):null;
      await write(key,value,expiresAt);
    },
    async rememberSession(){
      // A successful interactive login starts a new window, even after expiry.
      const record=await backup("get",storageKey);
      const value=localRead(storageKey)??record?.value??null;
      if(value!==null)await write(storageKey,value,Date.now()+lifetime);
    }
  };
}};
