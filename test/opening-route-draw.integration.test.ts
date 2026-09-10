import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createConnection} from 'mysql2/promise';
import {drawOpeningRoute,openingRouteDrawSchema,type OpeningRouteCandidate} from '../src/game/opening-route-draw';

test('隔离MySQL：全服不放回抽取并发、事务回滚、重连与换轮', {skip:process.env.FF_OPENING_DB_TEST!=='1'},async()=>{
  const {parse}=createRequire(import.meta.url)('yaml'),config=parse(readFileSync('alemon.config.yaml','utf8')),db=config.FantasyFinal?.database??config.mysql;
  const options={host:db.host,port:Number(db.port??3306),user:db.user,password:db.password,connectTimeout:8000};
  const name=`ff_route_draw_${randomUUID().replaceAll('-','')}`,admin=await createConnection(options);let created=false;
  const pool:OpeningRouteCandidate[]=[...['F01','F02','F03'].map(code=>({code,regionCode:'dark_forest',tier:1})),...['A01','A02','A03'].map(code=>({code,regionCode:'fallenstar_swamp',tier:3}))];
  const workers:Awaited<ReturnType<typeof createConnection>>[]=[];
  try{
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);created=true;await admin.query(`USE \`${name}\``);await admin.query(openingRouteDrawSchema);
    for(let i=0;i<5;i++)workers.push(await createConnection({...options,database:name}));
    const tx=async(c:typeof admin,random=()=>.99)=>{await c.beginTransaction();try{const code=await drawOpeningRoute(c,pool,random);await c.commit();return code;}catch(error){await c.rollback();throw error;}};
    // 第一次抽取也要支持同时创建单例行。
    const results=await Promise.all(workers.map(c=>tx(c)));
    assert.equal(new Set(results).size,5);assert.ok(!results.includes('A01'));
    const snapshot=async()=>{const[r]=await admin.query('SELECT cycle_no,used_routes_json FROM opening_route_draw_state');return JSON.stringify(r);};
    const full=await snapshot();
    assert.equal(await tx(workers[0],()=>0),'A01');assert.equal(await snapshot(),full);
    // 在下一轮取走路线后模拟角色注册失败；轮次与路线均回滚。
    await workers[0].beginTransaction();const rolled=await drawOpeningRoute(workers[0],pool,()=>.99);await workers[0].rollback();assert.equal(await snapshot(),full);
    await workers[0].end();workers[0]=await createConnection({...options,database:name});
    assert.equal(await tx(workers[0]),rolled);
    const [rows]=await admin.query<any[]>('SELECT cycle_no,used_routes_json FROM opening_route_draw_state');assert.equal(Number(rows[0].cycle_no),2);
    const used=typeof rows[0].used_routes_json==='string'?JSON.parse(rows[0].used_routes_json):rows[0].used_routes_json;assert.deepEqual(used,[rolled]);
  }finally{
    await Promise.all(workers.map(c=>c.end()));
    if(created){assert.match(name,/^ff_route_draw_[a-f0-9]{32}$/);await admin.query(`DROP DATABASE \`${name}\``);}await admin.end();
  }
});
