import {useCallback,useEffect,useState} from 'react';

/**
 * US preview: EIP-1193 READ ONLY wallet discovery.
 * A browser connection is NOT an authenticated, verified, durable account binding.
 * Never request signatures, transactions, private keys, approvals or switches here.
 */
type Eip1193 = {request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;on?:(event:string,cb:(value:any)=>void)=>void;removeListener?:(event:string,cb:(value:any)=>void)=>void};
declare global {interface Window {ethereum?:Eip1193&{providers?:Eip1193[]}}}
const POLYGON_CHAIN='0x89';
const NATIVE_POLYGON_USDC='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const BALANCE_OF_SELECTOR='70a08231';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
type Connection={address:string;chainId:string;provider:Eip1193};
type Balance={raw:string;checkedAt:string}|null;
function tokenBalanceData(address:string){return '0x'+BALANCE_OF_SELECTOR+address.slice(2).toLowerCase().padStart(64,'0');}
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
export default function NexPersonalUSCrypto(){
 const [connection,setConnection]=useState<Connection|null>(null);
 const [balance,setBalance]=useState<Balance>(null);
 const [status,setStatus]=useState('Not connected');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [nonce,setNonce]=useState(0);
 const clear=useCallback(()=>{setConnection(null);setBalance(null);setStatus('Not connected');},[]);
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
  setBusy(true);setError('');setBalance(null);
  try{
   const provider=resolveInjectedProvider();
   if(!provider)throw Error('No compatible browser wallet detected. Install an official MetaMask, Rabby, Coinbase Wallet or Trust Wallet extension. QR/Reown is not active in this preview.');
   // Direct user gesture only; do not silently access account information.
   const accounts=await provider.request({method:'eth_requestAccounts'});
   const address=Array.isArray(accounts)?accounts[0]:null;
   if(typeof address!=='string'||!ADDRESS.test(address))throw Error('The wallet did not return a valid EVM address.');
   const chainId=await provider.request({method:'eth_chainId'});
   if(typeof chainId!=='string'||chainId.toLowerCase()!==POLYGON_CHAIN){
    setStatus('Wrong network');throw Error('Connect Polygon mainnet (chain 137) in your wallet and retry. This preview never switches your network automatically.');
   }
   const chainAgain=await provider.request({method:'eth_chainId'});
   const accountsAgain=await provider.request({method:'eth_accounts'});
   if(chainAgain!==chainId||!Array.isArray(accountsAgain)||!accountsAgain.some(a=>typeof a==='string'&&a.toLowerCase()===address.toLowerCase()))
     throw Error('Wallet account or chain changed during connection. Please retry.');
   setConnection({provider,address,chainId});
   setStatus('Browser-only connection · not linked to your Nex account');
   setNonce(n=>n+1);
  }catch(e){clear();setError(e instanceof Error?e.message:'Wallet connection unavailable.');}
  finally{setBusy(false);}
 }
 const loadBalance=useCallback(async()=>{
  if(!connection)return;
  setBusy(true);setError('');setBalance(null);
  try{
   const chainBefore=await connection.provider.request({method:'eth_chainId'});
   const active=await connection.provider.request({method:'eth_accounts'});
   if(chainBefore!==POLYGON_CHAIN||!Array.isArray(active)||!active.some(a=>typeof a==='string'&&a.toLowerCase()===connection.address.toLowerCase()))throw Error('Active account or network changed. Reconnect first.');
   const result=await connection.provider.request({method:'eth_call',params:[{to:NATIVE_POLYGON_USDC,data:tokenBalanceData(connection.address)},'latest']});
   const chainAfter=await connection.provider.request({method:'eth_chainId'});
   if(chainAfter!==chainBefore)throw Error('Network changed during balance read.');
   if(typeof result!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(result))throw Error('USDC read failed. No balance can be confirmed.');
   setBalance({raw:BigInt(result).toString(),checkedAt:new Date().toISOString()});
  }catch(e){setBalance(null);setError(e instanceof Error?e.message:'Balance unavailable.');}
  finally{setBusy(false);}
 },[connection]);
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
    </>:<button className="npu-action" type="button" disabled={busy} onClick={()=>void connect()}>{busy?'Connecting…':'Connect browser wallet'}</button>}
   </div>
  </div>
  {error&&<p className="npu-error" role="alert">{error}</p>}
  <div className="npu-note"><strong>Security boundary:</strong> The wallet extension remains the authority. No token approvals, transfers, swaps, staking, gas sponsorship, financial signing, automated blockchain action or internal crediting are available. 0% Nexa inbound fee is the proposal for future supported transfers, not an active service; network gas is separate.</div>
 </section>;
}
