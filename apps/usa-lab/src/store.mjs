/** US-only fixture identity and tenant store. Never exposed in production. */
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, lstatSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, dirname, basename, sep } from 'node:path';

const digest = token => createHash('sha256').update(token).digest('hex');
const emailKey = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
const validText = (s,min,max) => typeof s === 'string' && s.trim().length >= min && s.trim().length <= max;
const hashPassword = (password,salt) => scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
const fakeSalt = '7acb564dd35ec6138127673133a004ce';
const fakeHash = hashPassword('invalid-user-fixture',fakeSalt).toString('hex');

export class USLabStore {
  constructor(dbFile) {
    if (typeof dbFile !== 'string' || !isAbsolute(dbFile) || !dbFile.endsWith('.sqlite')) throw Error('Explicit absolute US .sqlite file required');
    // Even direct store access must fail closed, not only the HTTP starter.
    // Resolve the parent directory to reject symlinks into Brazilian/project databases.
    const realTemp = realpathSync(tmpdir());
    const realParent = realpathSync(dirname(dbFile));
    if (!realParent.startsWith(realTemp + sep) ||
        !basename(realParent).startsWith('nexoffices-us-lab-') ||
        basename(dbFile) !== 'us-lab.sqlite') {
      throw Error('US lab requires its own disposable temporary database directory');
    }
    if (existsSync(dbFile) && lstatSync(dbFile).isSymbolicLink()) throw Error('Refusing symlink database');
    this.db = new DatabaseSync(dbFile);
    chmodSync(dbFile,0o600);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        region_code TEXT NOT NULL CHECK(region_code='US'),
        created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
        email TEXT NOT NULL, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
        region_code TEXT NOT NULL DEFAULT 'US' CHECK(region_code='US'),
        created_at TEXT NOT NULL, UNIQUE(org_id,email));
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        org_id TEXT NOT NULL REFERENCES organizations(id), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id),
        title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),
        region_code TEXT NOT NULL DEFAULT 'US' CHECK(region_code='US'),
        created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_uslab_tasks_org ON tasks(org_id,created_at);
      CREATE INDEX IF NOT EXISTS idx_uslab_sessions_exp ON sessions(expires_at);
    `);
  }
  close(){this.db.close();}
  // Fixtures are provisioned only through tests/developer code, NEVER over HTTP.
  provisionOrganization(name,region='US'){
    if(region!=='US')throw Error('Only US organizations may be provisioned');
    if(!validText(name,2,80))throw Error('Invalid organization name');
    const id=randomUUID();
    this.db.prepare('INSERT INTO organizations(id,name,region_code,created_at) VALUES(?,?,?,?)').run(id,name.trim(),'US',new Date().toISOString());
    return {id,region:'US'};
  }
  provisionUser({orgId,email,password,region='US'}){
    if(region!=='US')throw Error('Only US users may be provisioned');
    if(!validText(password,12,128)||!/^\S+@\S+\.\S+$/.test(emailKey(email)))throw Error('Invalid test credentials');
    if(!this.db.prepare("SELECT id FROM organizations WHERE id=? AND region_code='US'").get(orgId))throw Error('US organization not found');
    const salt=randomBytes(16).toString('hex'),passwordHash=hashPassword(password,salt).toString('hex'),id=randomUUID();
    this.db.prepare("INSERT INTO users(id,org_id,email,password_salt,password_hash,region_code,created_at) VALUES(?,?,?,?,?,'US',?)").run(id,orgId,emailKey(email),salt,passwordHash,new Date().toISOString());
    return {id,orgId,region:'US'};
  }
  authenticate(orgId,email,password){
    const user=typeof orgId==='string'&&typeof password==='string'&&password.length<=128?
      this.db.prepare("SELECT id,org_id,email,password_salt,password_hash FROM users WHERE org_id=? AND email=? AND region_code='US'").get(orgId,emailKey(email)):undefined;
    const actual=hashPassword(typeof password==='string'?password:'',user?.password_salt??fakeSalt);
    const expected=Buffer.from(user?.password_hash??fakeHash,'hex');
    if(!user||expected.length!==actual.length||!timingSafeEqual(actual,expected))return null;
    const token=randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions(token_hash,user_id,org_id,expires_at) VALUES(?,?,?,?)').run(digest(token),user.id,user.org_id,Date.now()+30*60_000);
    return {token,orgId:user.org_id,userId:user.id};
  }
  resolveSession(token){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const row=this.db.prepare(`SELECT s.user_id AS userId,s.org_id AS orgId,s.expires_at AS expiresAt,u.email AS email
      FROM sessions s JOIN users u ON u.id=s.user_id AND u.org_id=s.org_id
      JOIN organizations o ON o.id=s.org_id WHERE s.token_hash=? AND u.region_code='US' AND o.region_code='US'`).get(digest(token));
    return row&&row.expiresAt>Date.now()?{userId:row.userId,orgId:row.orgId,email:row.email,region:'US'}:null;
  }
  revokeSession(token){if(typeof token==='string')this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
  listTasks(actor){return this.db.prepare("SELECT id,title,status,created_at AS createdAt FROM tasks WHERE org_id=? AND region_code='US' ORDER BY created_at,id").all(actor.orgId);}
  createTask(actor,title){
    if(!validText(title,1,120))throw Error('Invalid task title');
    const id=randomUUID(),createdAt=new Date().toISOString();
    this.db.prepare("INSERT INTO tasks(id,org_id,title,region_code,created_by,created_at) VALUES(?,?,?,'US',?,?)").run(id,actor.orgId,title.trim(),actor.userId,createdAt);
    return {id,title:title.trim(),status:'open',createdAt};
  }
  completeTask(actor,id){
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))return false;
    return this.db.prepare("UPDATE tasks SET status='completed' WHERE id=? AND org_id=? AND region_code='US'").run(id,actor.orgId).changes===1;
  }
}
