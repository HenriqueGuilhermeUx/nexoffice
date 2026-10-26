// Dedicated Nexa Life OS PF launch target. NOT wired into any Render service.
// Intentionally health-only; /ready stays 503 until user identity, consent,
// migrations, dedicated production DB and regression QA have been completed.
import 'dotenv/config';
import {createLifeOsProductionStandby} from './lifeos-production-standby.js';

const rawPort=process.env.PORT||'4000';
const port=Number(rawPort);
if(!Number.isInteger(port)||port<1024||port>65535)
  throw new Error('Invalid Nexa Life OS standby port');

const app=createLifeOsProductionStandby(process.env);
await app.listen({host:'0.0.0.0',port});
console.info('Nexa Life OS production standby is running, not ready for users');
