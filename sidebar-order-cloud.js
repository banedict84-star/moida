import {doc, getDoc, setDoc} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {setupSidebarOrder} from './sidebar-order.js?v=1';

const M = window.MOIDA;
if (M) setupSidebarOrder({
  root:document.getElementById('sideBar'),
  // Navigation is a personal preference, even when multiple users share an office.
  user:() => M.auth?.currentUser?.uid || null,
  subscribe:callback => M.onData(callback),
  load:async uid => {
    const snapshot = await getDoc(doc(M.db, 'moida_users', uid));
    return snapshot.exists() ? snapshot.data().sidebarOrder : [];
  },
  save:async (uid, keys) => {
    if (M.auth?.currentUser?.uid !== uid) throw Error('Account changed');
    await setDoc(doc(M.db, 'moida_users', uid), {sidebarOrder:keys}, {merge:true});
  }
});
