import {useCallback,useEffect,useRef,useState} from 'react';
import {buildReadOnlyCryptoReview} from './nex-personal-us-agentic-contract';
import {acceptedEIP6963Wallet,addAnnouncedUSWallet,legacyUSWallets,type DiscoveredUSWallet,type ReadOnlyEIP1193} from './nex-personal-us-wallet-discovery';
import {US_CRYPTO_CHAIN_ID,US_CRYPTO_USDC_POLYGON,assertValidWalletAddress,balanceOfCallData,decodeNativePolygonUsdcBalance,walletReadRequest} from './nex-personal-us-crypto-policy';

/**
 * US preview: EIP-1193 READ ONLY wallet discovery.
 * A browser connection is NOT an authenticated, verified, durable account binding.
 * Never request signatures, transactions, private keys, approvals or switches here.
 */
declare global {interface Window {ethereum?:ReadOnlyEIP1193&{providers?:ReadOnlyEIP1193[]}}}
export type SharedCryptoObservation={address:string;chainId:137;rawBalance:string;observedAt:string;sharedAt:string};
type Connection={address:string;chainId:string;provider:ReadOnlyEIP1193};
type Balance={raw:string;checkedAt:string}|null;
function displayUsdc(value:string){
 const n=BigInt(value),whole=n/1000000n,fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');
 return whole.toLocaleString('en-US')+(fraction?'.'+fraction:'')+' USDC';
}
export default function NexPersonalUSCrypto({onShareReview,onRevokeReview,hasActiveMayaGrant=false}:{
 onShareReview?:(observation:SharedCryptoObservation)=>void;
 onRevokeReview?:()=>void;
 /** Reflects actual browser-memory TTL, never server-authorized consent. */
 hasActiveMayaGrant?:boolean
}){
 const [connection,setConnection]=useState<Connection|null>(null);
 const [detected,setDetected]=useState<DiscoveredUSWallet[]>([]);
 const [selectedProviderId,setSelectedProviderId]=useState('');
 const [balance,setBalance]=useState<Balance>(null);
 const [status,setStatus]=useState('Not connected');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [nonce,setNonce]=useState(0);
 const operationRef=useRef(0);
 const mayaReview=connection&&balance?buildReadOnlyCryptoReview({rawBalance:balance.raw,address:connection.address,observedAt:balance.checkedAt}):null;
 useEffect(()=>{
  const announce=(event:Event)=>{
   const candidate=acceptedEIP6963Wallet((event as CustomEvent).detail);
   if(candidate)setDetected(current=>addAnnouncedUSWallet(current,candidate));
  };
  window.addEventListener('eip6963:announceProvider',announce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  setDetected(current=>current.length?current:legacyUSWallets(window.ethereum));
  return ()=>window.removeEventListener('eip6963:announceProvider',announce);
 },[]);
 const clear=useCallback(()=>{
  operationRef.current++;
  setConnection(null);setBalance(null);setStatus('Not connected');
  onRevokeReview?.();
 },[onRevokeReview]);
 useEffect(()=>{
  if(!connection)return;
  const provider=connection.provider;
  const onAccounts=(list:unknown)=>{
   if(!Array.isArray(list)||!list.some(a=>typeof a==='string'&&a.toLowerCase()===connection.address.toLowerCase())){
    clear();setError('Wallet account changed. Reconnect to inspect a different address.');
   }
  };
  const onChain=(_value:unknown)=>{
   clear();setError('Network changed. Reconnect to verify Polygon before reading tokens.');
  };
  provider.on?.('accountsChanged',onAccounts);
  provider.on?.('chainChanged',onChain);
  return ()=>{provider.removeListener?.('accountsChanged',onAccounts);provider.removeListener?.('chainChanged',onChain);};
 },[connection,clear]);
 async function connect(){
  const operation=++operationRef.current;
  setBusy(true);setError('');setBalance(null);onRevokeReview?.();
  try{
   const selected=detected.find(w=>w.id===selectedProviderId);
   const provider=selected?.provider;
   if(!provider)throw Error('Select one of the detected wallet extensions before connecting. Reown QR sessions are not enabled in this preview.');
   // Direct user gesture only; do not silently access account information.
   const accounts=await walletReadRequest(provider,'eth_requestAccounts');
   const address=Array.isArray(accounts)?accounts[0]:null;
   assertValidWalletAddress(address);
   const chainId=await walletReadRequest(provider,'eth_chainId');
   if(typeof chainId!=='string'||chainId.toLowerCase()!==US_CRYPTO_CHAIN_ID){
    setStatus('Wrong network');throw Error('Connect Polygon mainnet (chain 137) in your wallet and retry. This preview never switches your network automatically.');
   }
   const chainAgain=await walletReadRequest(provider,'eth_chainId');
   const accountsAgain=await walletReadRequest(provider,'eth_accounts');
   if(chainAgain!==chainId||!Array.isArray(accountsAgain)||!accountsAgain.some(a=>typeof a==='string'&&a.toLowerCase()===address.toLowerCase()))
     throw Error('Wallet account or chain changed during connection. Please retry.');
   if(operation!==operationRef.current)return;
   setConnection({provider,address,chainId});
   setStatus('Browser-only connection · not linked to your Nex account');
   setNonce(n=>n+1);
  }catch(e){if(operation===operationRef.current){clear();setError(e instanceof Error?e.message:'Wallet connection unavailable.');setBusy(false);}}
  finally{if(operation===operationRef.current)setBusy(false);}
 }
 const loadBalance=useCallback(async()=>{
  if(!connection)return;
  const operation=++operationRef.current;
  setBusy(true);setError('');setBalance(null);onRevokeReview?.();
  try{
   const chainBefore=await walletReadRequest(connection.provider,'eth_chainId');
   const active=await walletReadRequest(connection.provider,'eth_accounts');
   if(chainBefore!==US_CRYPTO_CHAIN_ID||!Array.isArray(active)||!active.some(a=>typeof a==='string'&&a.toLowerCase()===connection.address.toLowerCase()))throw Error('Active account or network changed. Reconnect first.');
   const result=await walletReadRequest(connection.provider,'eth_call',[{to:US_CRYPTO_USDC_POLYGON,data:balanceOfCallData(connection.address)},'latest']);
   const chainAfter=await walletReadRequest(connection.provider,'eth_chainId');
   const activeAfter=await walletReadRequest(connection.provider,'eth_accounts');
   if(chainAfter!==chainBefore||!Array.isArray(activeAfter)||!activeAfter.some(a=>typeof a==='string'&&a.toLowerCase()===connection.address.toLowerCase()))throw Error('Account or network changed during balance read.');
   if(operation!==operationRef.current)return;
   setBalance({raw:decodeNativePolygonUsdcBalance(result).toString(),checkedAt:new Date().toISOString()});
  }catch(e){if(operation===operationRef.current){setBalance(null);setError(e instanceof Error?e.message:'Balance unavailable.');}}
  finally{if(operation===operationRef.current)setBusy(false);}
 },[connection,onRevokeReview]);
 async function shareWithMaya(){
  if(!connection||!balance||!onShareReview)return;
  const operation=++operationRef.current;
  setBusy(true);setError('');
  try{
   const [chain,accounts]=await Promise.all([
    walletReadRequest(connection.provider,'eth_chainId'),
    walletReadRequest(connection.provider,'eth_accounts')
   ]);
   if(chain!==US_CRYPTO_CHAIN_ID||!Array.isArray(accounts)||!accounts.some(a=>typeof a==='string'&&a.toLowerCase()===connection.address.toLowerCase()))
    throw Error('Wallet changed since this snapshot. Please reconnect and refresh.');
   if(operation!==operationRef.current)return;
   onShareReview({address:connection.address,chainId:137,rawBalance:balance.raw,observedAt:balance.checkedAt,sharedAt:new Date().toISOString()});
   }catch(e){if(operation===operationRef.current){
   const message=e instanceof Error?e.message:'Unable to share snapshot.';
   setError(message==='MAYA_LOCAL_PREVIEW_SNAPSHOT_STALE'
    ?'This wallet snapshot is more than five minutes old. Refresh the on-chain balance before sharing with Maya.'
    :message);
  }}
  finally{if(operation===operationRef.current)setBusy(false);}
 }
 useEffect(()=>{if(connection&&nonce>0)void loadBalance();},[connection,nonce,loadBalance]);
 return <section className="npu-panel" aria-labelledby="npu-crypto-title">
  <div className="npu-between"><div><span className="npu-kicker">SELF-CUSTODY · CRYPTO</span><h2 id="npu-crypto-title">Your crypto, under your control.</h2></div><span className="npu-tag">Read-only preview</span></div>
  <p>Connect an external EVM wallet to inspect native USDC on Polygon. This does not import private keys, create a Nexa account binding, move funds or grant agents access.</p>
  <div className="npu-crypto-grid">
   <div className="npu-subpanel">
    <h3>Privy embedded wallet</h3>
    <p>Create a separate user-owned wallet for Nex Personal USA when US identity linking, Privy project authorization, recovery and policy checks are approved.</p>
    <span className="npu-status">Pending US Privy onboarding</span>
    <button className="npu-action" type="button" disabled aria-disabled="true">Create Privy wallet · not available yet</button>
    <small>No wallet will be created in your existing Nexa Brasil/Global account.</small>
   </div>
   <div className="npu-subpanel">
    <h3>Connect existing wallet</h3>
    <p>Choose an installed EIP-6963 or legacy EIP-1193 wallet. Wallet labels are provided by browser extensions and are not verified identities. QR/Reown remains disabled.</p>
    {!connection&&<label style={{width:'100%',fontSize:13,fontWeight:650}} htmlFor="npu-wallet-provider">Wallet extension
      <select id="npu-wallet-provider" value={selectedProviderId} onChange={e=>setSelectedProviderId(e.target.value)} style={{display:'block',width:'100%',padding:12,marginTop:8,borderRadius:9,border:'1px solid #c2d5df',background:'#fff'}}>
       <option value="">Select a wallet</option>
       {detected.map(w=><option key={w.id} value={w.id}>{w.name} ({w.source==='eip6963'?'discovered':'legacy'})</option>)}
      </select>
      {detected.length===0&&<small>No compatible extension detected. Install an official wallet extension and reload.</small>}
     </label>}
    {connection?<><div className="npu-code" title={connection.address}>{connection.address}</div><span className="npu-status">{status}</span>
     <div className="npu-wallet-amount">{balance?displayUsdc(balance.raw):'Balance unavailable'}</div>
     <small>{balance?'Read at '+new Date(balance.checkedAt).toLocaleString('en-US'):'Native Polygon USDC · chain 137'}</small>
     <div className="npu-buttons"><button type="button" disabled={busy} onClick={()=>void loadBalance()}>Refresh on-chain read</button><button type="button" onClick={()=>{clear();setError('');}}>Disconnect in app</button></div>
     {balance&&onShareReview&&<button type="button" className="npu-action" disabled={busy||hasActiveMayaGrant} onClick={()=>void shareWithMaya()}>{hasActiveMayaGrant?'Snapshot shared locally':'Share this snapshot with Maya'}</button>}
    </>:<button className="npu-action" type="button" disabled={busy||!detected.some(w=>w.id===selectedProviderId)} onClick={()=>void connect()}>{busy?'Connecting…':'Connect browser wallet'}</button>}
   </div>
  </div>
  {mayaReview&&<div className="npu-note" aria-label="Maya crypto preview"><strong>Maya · local crypto analysis</strong><p>{mayaReview.insights[0]}</p><p>{mayaReview.insights[1]}</p><small>Source: browser wallet Polygon RPC · No LLM or Nexa Agentics backend called · Execution denied.</small></div>}
  {error&&<p className="npu-error" role="alert">{error}</p>}
  <div className="npu-note"><strong>Security boundary:</strong> The wallet extension remains the authority. No token approvals, transfers, swaps, staking, gas sponsorship, financial signing, automated blockchain action or internal crediting are available. 0% Nexa inbound fee is the proposal for future supported transfers, not an active service; network gas is separate.</div>
 </section>;
}
