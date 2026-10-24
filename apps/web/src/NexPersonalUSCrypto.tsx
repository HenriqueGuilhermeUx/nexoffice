import {useCallback,useEffect,useRef,useState} from 'react';
import {buildReadOnlyCryptoReview} from './nex-personal-us-agentic-contract';
import {US_CRYPTO_CHAIN_ID,US_CRYPTO_USDC_POLYGON,assertValidWalletAddress,balanceOfCallData,decodeNativePolygonUsdcBalance,walletReadRequest} from './nex-personal-us-crypto-policy';

/**
 * US preview: EIP-1193 READ ONLY wallet discovery.
 * A browser connection is NOT an authenticated, verified, durable account binding.
 * Never request signatures, transactions, private keys, approvals or switches here.
 */
type Eip1193 = {request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;on?:(event:string,cb:(value:any)=>void)=>void;removeListener?:(event:string,cb:(value:any)=>void)=>void};
declare global {interface Window {ethereum?:Eip1193&{providers?:Eip1193[]}}}
export type SharedCryptoObservation={address:string;chainId:137;rawBalance:string;observedAt:string;sharedAt:string};
type Connection={address:string;chainId:string;provider:Eip1193};
type Balance={raw:string;checkedAt:string}|null;
function displayUsdc(value:string){
 const n=BigInt(value),whole=n/1000000n,fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');
 return whole.toLocaleString('en-US')+(fraction?'.'+fraction:'')+' USDC';
}
function resolveInjectedProvider():Eip1193|undefined{
 const candidate=window.ethereum;
 if(!candidate)return;
 const providers=candidate.providers?.filter(p=>typeof p?.request==='function');
 return providers?.[0] || (typeof candidate.request==='function'?candidate:undefined);
}
export default function NexPersonalUSCrypto({onShareReview,onRevokeReview}:{onShareReview?:(observation:SharedCryptoObservation)=>void;onRevokeReview?:()=>void}){
 const [connection,setConnection]=useState<Connection|null>(null);
 const [balance,setBalance]=useState<Balance>(null);
 const [status,setStatus]=useState('Not connected');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [nonce,setNonce]=useState(0);
 const operationRef=useRef(0);
 const [shared,setShared]=useState(false);
 const mayaReview=connection&&balance?buildReadOnlyCryptoReview({rawBalance:balance.raw,address:connection.address,observedAt:balance.checkedAt}):null;
 const clear=useCallback(()=>{
  operationRef.current++;
  setConnection(null);setBalance(null);setStatus('Not connected');setShared(false);
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
  setBusy(true);setError('');setBalance(null);setShared(false);onRevokeReview?.();
  try{
   const provider=resolveInjectedProvider();
   if(!provider)throw Error('No compatible browser wallet detected. Install an official MetaMask, Rabby, Coinbase Wallet or Trust Wallet extension. QR/Reown is not active in this preview.');
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
  setBusy(true);setError('');setBalance(null);setShared(false);onRevokeReview?.();
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
   setShared(true);
  }catch(e){if(operation===operationRef.current)setError(e instanceof Error?e.message:'Unable to share snapshot.');}
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
    <p>MetaMask, Rabby, Coinbase Wallet or Trust Wallet through an installed EIP-1193 provider. Reown/WalletConnect QR requires separate approval.</p>
    {connection?<><div className="npu-code" title={connection.address}>{connection.address}</div><span className="npu-status">{status}</span>
     <div className="npu-wallet-amount">{balance?displayUsdc(balance.raw):'Balance unavailable'}</div>
     <small>{balance?'Read at '+new Date(balance.checkedAt).toLocaleString('en-US'):'Native Polygon USDC · chain 137'}</small>
     <div className="npu-buttons"><button type="button" disabled={busy} onClick={()=>void loadBalance()}>Refresh on-chain read</button><button type="button" onClick={()=>{clear();setError('');}}>Disconnect in app</button></div>
     {balance&&onShareReview&&<button type="button" className="npu-action" disabled={busy||shared} onClick={()=>void shareWithMaya()}>{shared?'Snapshot shared locally':'Share this snapshot with Maya'}</button>}
    </>:<button className="npu-action" type="button" disabled={busy} onClick={()=>void connect()}>{busy?'Connecting…':'Connect browser wallet'}</button>}
   </div>
  </div>
  {mayaReview&&<div className="npu-note" aria-label="Maya crypto preview"><strong>Maya · local crypto analysis</strong><p>{mayaReview.insights[0]}</p><p>{mayaReview.insights[1]}</p><small>Source: browser wallet Polygon RPC · No LLM or Nexa Agentics backend called · Execution denied.</small></div>}
  {error&&<p className="npu-error" role="alert">{error}</p>}
  <div className="npu-note"><strong>Security boundary:</strong> The wallet extension remains the authority. No token approvals, transfers, swaps, staking, gas sponsorship, financial signing, automated blockchain action or internal crediting are available. 0% Nexa inbound fee is the proposal for future supported transfers, not an active service; network gas is separate.</div>
 </section>;
}
