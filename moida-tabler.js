// Tabler core supplies component styles; application behavior remains in the schedule modules.
export function applyTabler(root=document){
 for(const b of root.querySelectorAll('button')){
  if(b.matches('.day,.feed-open,.event'))continue;
  b.classList.add('btn','btn-sm');
  if(b.classList.contains('primary'))b.classList.add('btn-primary');
  else if(b.classList.contains('danger'))b.classList.add('btn-outline-danger');
  else b.classList.add('btn-outline-secondary');
 }
 for(const input of root.querySelectorAll('input,textarea')){
  if(input.matches('[type=checkbox],[type=radio]'))input.classList.add('form-check-input');
  else input.classList.add('form-control','form-control-sm');
 }
 for(const select of root.querySelectorAll('select'))select.classList.add('form-select','form-select-sm');
 for(const avatar of root.querySelectorAll('.author-avatar'))avatar.classList.add('avatar','avatar-sm');
 for(const tag of root.querySelectorAll('.feed-tag,.feed-source>span'))tag.classList.add('badge','bg-blue-lt');
 for(const row of root.querySelectorAll('.feed-card'))row.classList.add('list-group-item');
 root.querySelector('#count')?.classList.add('badge','bg-blue-lt');
 root.querySelector('.content')?.classList.add('card');
 root.querySelector('.views')?.classList.add('btn-group');
}
