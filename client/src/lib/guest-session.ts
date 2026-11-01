const key='smart-catalogue-cart-session';
const valid=(value:string|null):value is string=>Boolean(value&&/^guest_[A-Za-z0-9]{16,128}$/.test(value));
export function guestSession(){
  const legacy=sessionStorage.getItem(key);
  // During rollout an already-open tab may still hold a different legacy
  // session. It owns that tab's existing cart/orders, so migrate it first
  // instead of replacing it with a value written by another legacy tab.
  if(valid(legacy)) { localStorage.setItem(key,legacy); return legacy; }
  const shared=localStorage.getItem(key);
  if(valid(shared)){ sessionStorage.setItem(key,shared); return shared; }
  const value=`guest_${typeof crypto.randomUUID==='function'?crypto.randomUUID().replaceAll('-',''):Math.random().toString(36).slice(2).padEnd(24,'x')}`;
  localStorage.setItem(key,value); sessionStorage.setItem(key,value); return value;
}
