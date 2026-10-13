#!/usr/bin/env node
'use strict';
// Experimental ONLY. Browser gateway is opt-in; this process is NOT started automatically.
// Usage: OPUSCRAFT_WORLD_DIR=/safe/test/path OPUSCRAFT_SEED=worldname
//        OPUSCRAFT_JOIN_CODE=ABCD1234 OPUSCRAFT_PORT=4185 node ops/opuscraft-headless/run-dedicated.cjs
(async()=>{
 const path=require('node:path');
 const {pathToFileURL}=require('node:url');
 const {WebSocketServer}=require('ws');
 const {createDedicatedRuntime}=require('./dedicated-runtime.cjs');
 const bundle=path.join(__dirname,'generated','engine.mjs');
 const engine=await import(pathToFileURL(bundle).href);
 const worldDir=process.env.OPUSCRAFT_WORLD_DIR;
 const seed=process.env.OPUSCRAFT_SEED;
 const joinCode=process.env.OPUSCRAFT_JOIN_CODE;
 const port=Number(process.env.OPUSCRAFT_PORT||4185);
 const token=process.env.OPUSCRAFT_DEDICATED_TOKEN;
 const gameMode=process.env.OPUSCRAFT_DEDICATED_MODE||'survival';
 if(!worldDir||!path.isAbsolute(worldDir)||!seed||!joinCode||
  !Number.isInteger(port)||port<1024||port>65535||!token||token.length<32)
  throw Error('Absolute worldDir, seed, join code, port and 32+ character token required');
 const wss=new WebSocketServer({host:'127.0.0.1',port,maxPayload:2*1024*1024});
 const runtime=createDedicatedRuntime({
  engine,wss,worldDir,seed,joinCode,gameMode,
  authenticate:req=>new URL(req.url,'http://localhost').searchParams.get('token')===token
 });
 runtime.start();
 console.log('EXPERIMENTAL_NODE_OPUSCRAFT_READY '+JSON.stringify({port,worldDir}));
 function shutdown(){
  try{runtime.stop()}finally{wss.close()}
 }
 process.once('SIGINT',shutdown);
 process.once('SIGTERM',shutdown);
})().catch(err=>{console.error(err);process.exitCode=1});
