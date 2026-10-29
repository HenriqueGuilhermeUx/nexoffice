/**
 * EIP-6963 injected wallet discovery — browser-only.
 * Provider labels/RDNS are SELF-ASSERTED by the extension, never identity proof.
 * Ignore images/icons to avoid scriptable SVG content; do not persist addresses.
 */
export type ReadOnlyEIP1193={
 request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;
 on?:(event:string,cb:(value:any)=>void)=>void;
 removeListener?:(event:string,cb:(value:any)=>void)=>void;
};
export type DiscoveredUSWallet={id:string;name:string;rdns:string;provider:ReadOnlyEIP1193;source:'eip6963'|'legacy'};
const UUIDV4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const RDNS=/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
export function acceptedEIP6963Wallet(value:unknown):DiscoveredUSWallet|null{
 if(!value||typeof value!=='object')return null;
 const d=value as {info?:{uuid?:unknown;name?:unknown;rdns?:unknown};provider?:ReadOnlyEIP1193};
 if(!d.info||!d.provider||typeof d.provider.request!=='function')return null;
 const {uuid,name,rdns}=d.info;
 if(typeof uuid!=='string'||!UUIDV4.test(uuid)||typeof name!=='string'||!name.trim()||
    name.length>64||typeof rdns!=='string'||rdns.length>160||!RDNS.test(rdns))return null;
 if(/[\x00-\x1F\x7F]/.test(name))return null;
 return {id:'eip6963:'+uuid.toLowerCase(),name:name.trim(),rdns,provider:d.provider,source:'eip6963'};
}
export function addAnnouncedUSWallet(previous:DiscoveredUSWallet[],candidate:DiscoveredUSWallet):DiscoveredUSWallet[]{
 const match=previous.find(p=>p.id===candidate.id);
 // UUID collision or provider impersonation: never silently replace an existing provider.
 if(match)return previous;
 return [...previous,candidate].slice(0,25);
}
export function legacyUSWallets(ethereum?:ReadOnlyEIP1193&{providers?:ReadOnlyEIP1193[]}):DiscoveredUSWallet[]{
 if(!ethereum)return [];
 const listed=Array.isArray(ethereum.providers)&&ethereum.providers.length
  ?ethereum.providers:[ethereum];
 return listed.filter(p=>p&&typeof p.request==='function').slice(0,8)
  .map((provider,i)=>({id:'legacy:'+i,name:'Browser wallet '+(i+1),
   rdns:'unverified.legacy',provider,source:'legacy' as const}));
}
