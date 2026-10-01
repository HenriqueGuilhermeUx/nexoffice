#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import os from 'node:os';

const API=String(process.env.NEXOFFICE_BACKUP_API_URL||'').replace(/\/$/,'');
const TOKEN=String(process.env.NEXOFFICE_BACKUP_AGENT_TOKEN||'').trim();
const PROFILE=String(process.env.NEXOFFICE_BACKUP_PROFILE_ID||'').trim();
const RESTIC=String(process.env.RESTIC_BIN||'restic').trim();
let PATHS=[];
try{PATHS=JSON.parse(process.env.BACKUP_PATHS_JSON||'[]')}catch{PATHS=[]}
if(!Array.isArray(PATHS))PATHS=[];
PATHS=PATHS.map(String).map(x=>x.trim()).filter(Boolean);

function required(name,value){if(!value){console.error(`Missing ${name}`);process.exit(2)}}
required('NEXOFFICE_BACKUP_API_URL',API);required('NEXOFFICE_BACKUP_AGENT_TOKEN',TOKEN);required('NEXOFFICE_BACKUP_PROFILE_ID',PROFILE);if(!PATHS.length){console.error('BACKUP_PATHS_JSON must contain at least one local path.');process.exit(2)}

async function post(path,body){const response=await fetch(`${API}${path}`,{method:'POST',headers:{'content-type':'application/json','x-backup-agent-token':TOKEN},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`nexoffice_http_${response.status}`);return response.json().catch(()=>({}))}
function run(bin,args,{capture=true}={}){return new Promise((resolve,reject)=>{const child=spawn(bin,args,{env:process.env,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout?.on('data',d=>{if(capture&&out.length<5_000_000)out+=String(d)});child.stderr?.on('data',d=>{if(capture&&err.length<200_000)err+=String(d)});child.on('error',reject);child.on('close',code=>resolve({code:Number(code??1),out,err}))})}
function resticSummary(output){let summary=null;for(const line of String(output||'').split(/\r?\n/)){if(!line.trim().startsWith('{'))continue;try{const value=JSON.parse(line);if(value?.message_type==='summary')summary=value}catch{}}return summary||{}}
function errorCode(stage,result){if(result?.code===127)return'restic_not_found';return stage==='check'?'restic_check_failed':'restic_backup_failed'}

const runRef=randomUUID(),startedAt=new Date().toISOString();
let version='unknown';
try{const v=await run(RESTIC,['version']);if(v.code===0)version=String(v.out).trim().split(/\s+/).slice(0,3).join(' ').slice(0,80)}catch{version='unavailable'}
try{await post('/v1/security/backups/agent/heartbeat',{hostname:os.hostname(),platform:`${os.platform()} ${os.release()}`,resticVersion:version,capabilities:{backup:true,check:true,customerOwnedStorage:true,remoteExecution:false}})}catch(error){console.error(`NexOffice heartbeat failed: ${error.message}`);process.exit(3)}
await post('/v1/security/backups/agent/runs',{profileId:PROFILE,runRef,status:'started',startedAt});

let backup;
try{backup=await run(RESTIC,['backup','--json',...PATHS])}catch(error){await post('/v1/security/backups/agent/runs',{profileId:PROFILE,runRef,status:'failed',errorCode:'restic_launch_failed',verificationStatus:'failed',startedAt,finishedAt:new Date().toISOString()}).catch(()=>{});console.error('Restic could not be started.');process.exit(4)}
if(backup.code!==0){await post('/v1/security/backups/agent/runs',{profileId:PROFILE,runRef,status:'failed',errorCode:errorCode('backup',backup),verificationStatus:'failed',startedAt,finishedAt:new Date().toISOString()}).catch(()=>{});console.error('Backup failed locally. See Restic output on this machine.');process.exit(5)}
const summary=resticSummary(backup.out);
const snapshotId=String(summary.snapshot_id||'').slice(0,200)||null;
let verificationStatus='ok';
try{const check=await run(RESTIC,['check'],{capture:false});if(check.code!==0)verificationStatus='failed'}catch{verificationStatus='failed'}
const finishedAt=new Date().toISOString();
await post('/v1/security/backups/agent/runs',{profileId:PROFILE,runRef,status:'success',snapshotId,filesNew:Number(summary.files_new||0),filesChanged:Number(summary.files_changed||0),filesUnmodified:Number(summary.files_unmodified||0),bytesAdded:Number(summary.data_added||0),verificationStatus,startedAt,finishedAt});
console.log(JSON.stringify({ok:true,runRef,snapshotId,verificationStatus,finishedAt}));
