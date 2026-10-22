import fs from 'node:fs';
import path from 'node:path';
export function stateRoot(){
 if(!process.env.YMZX_STATE_DIR)throw Error('Set YMZX_STATE_DIR to the existing task directory');
 const dir=fs.realpathSync(process.env.YMZX_STATE_DIR);
 if(!fs.statSync(dir).isDirectory())throw Error('YMZX_STATE_DIR must be a directory');
 return dir;
}
