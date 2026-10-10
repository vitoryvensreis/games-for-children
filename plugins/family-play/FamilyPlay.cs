// GamesForChildren — FamilyPlay plugin for the private MCGalaxy server.
// Only authenticated account identities written by Node to gfc-family-policy.txt may use actions.
// Blocks in claimed houses cannot be changed by other children, including custom game clients.
using System;
using System.Collections.Generic;
using System.IO;
using MCGalaxy;
using MCGalaxy.Events;
using MCGalaxy.Events.PlayerEvents;
using MCGalaxy.Maths;
using MCGalaxy.Bots;
using MCGalaxy.Blocks.Extended;
using MCGalaxy.Events.LevelEvents;
using MCGalaxy.Tasks;

public sealed class FamilyPlay : Plugin {
 public override string name { get { return "FamilyPlay"; } }
 public override string creator { get { return "GamesForChildren"; } }
 public override int build { get { return 2; } }
 public override bool LoadAtStartup { get { return true; } }
 private static readonly string ConfigPath = "properties/gfc-family-policy.txt";
 private static readonly string QuestFile = "properties/gfc-family-adventures.tsv";
 private static readonly string PositionFile = "properties/gfc-family-positions.tsv";
 private static readonly string CreaturesStatusFile = "properties/gfc-family-creatures.status";
 private static readonly string PortalsStatusFile = "properties/gfc-family-portals.status";
  private static readonly string InventoryFile = "properties/gfc-mining-inventory.tsv";
 private sealed class MiningBag { public int Wood,Stone,Coal,Iron,Gold,Apples,Tool,Sword,Armor; }
 private static readonly Dictionary<string,MiningBag> bags=new Dictionary<string,MiningBag>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,long> lastMining=new Dictionary<string,long>(StringComparer.OrdinalIgnoreCase);
 private static readonly string ClimateFile = "properties/gfc-climate.status";
 private SchedulerTask climateTimer;
 private SchedulerTask wanderTimer;
 private static readonly Dictionary<string,Position> botHomes=new Dictionary<string,Position>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,int> botStalls=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,DateTime> botGoals=new Dictionary<string,DateTime>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,Position> lastBotPositions=new Dictionary<string,Position>(StringComparer.OrdinalIgnoreCase);
 private static readonly Random random=new Random();

 private sealed class SavedSpot { public string World;public int X,Y,Z;public byte Yaw,Pitch;public long Saved; }
 private static readonly Dictionary<string,SavedSpot> savedSpots = new Dictionary<string,SavedSpot>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,long> lastSpotWrite = new Dictionary<string,long>(StringComparer.OrdinalIgnoreCase);
 private static readonly HashSet<string> returningPlayers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
 private static readonly object Gate = new object();
 private static bool buildingEnabled=true;
 private static DateTime checkedAt = DateTime.MinValue;
 private static Dictionary<string, string> users = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
 private static Dictionary<int, string> owners = new Dictionary<int, string>();
 private static readonly FamilyCommand family = new FamilyCommand();
 private static readonly Dictionary<string, Quest> quests = new Dictionary<string, Quest>(StringComparer.OrdinalIgnoreCase);
 private static readonly HashSet<string> teamReady = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
 private static int teamWins=0;
 private static readonly int[,] treasureTargets=new int[,] { {102,106,13},{96,50,19},{143,89,16} };
 private static readonly int[,] sprintTargets=new int[,] { {96,50,19},{143,89,16},{102,106,13} };
 private static readonly string[] treasureClues=new string[]{"Procure a fonte da Praca!", "Encontre a Ponte sobre o rio!", "Visite a Torre do Explorador junto ao lago!"};
 private static readonly string[] sprintClues=new string[]{"Corra ate a Ponte!", "Agora chegue a Torre!", "Volte para a Fonte da Praca!"};
 private sealed class Quest {
  public int Stars,Treasures,Sprints,Stage;
  public string Mode="";
  public long Deadline;
 }

 private static readonly int[,] bounds = new int[,] {
  {64,82,82,99},{118,138,82,99},{69,88,122,141},{109,131,121,140}
 };
 private static readonly int[,] homeSpawns = new int[,] {
  {81,45,90},{119,45,90},{87,45,131},{119,45,122}
 };
 private static readonly Dictionary<string, DateTime> warned = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);

 public override void Load(bool auto) {
  Refresh(true);
  LoadAdventures();
  LoadSpots();
  LoadBags();
  OnBlockChangingEvent.Register(ProtectHouse, Priority.High);
  OnBlockChangingEvent.Register(MiningChange, Priority.Low);
  OnPlayerMoveEvent.Register(AdventureMove, Priority.Low);
  OnLevelLoadedEvent.Register(SetupFamilyWorld, Priority.Low);
  OnPlayerSpawningEvent.Register(RestoreSpotOnSpawn,Priority.High);
  OnJoinedLevelEvent.Register(RestorePreviousWorld,Priority.Low);
  OnPlayerConnectEvent.Register(RememberReturningPlayer,Priority.Low);
  OnPlayerDisconnectEvent.Register(TrackDisconnect,Priority.Low);
  // Main village may have loaded before this plugin subscribed to OnLevelLoaded.
  foreach(Level existing in LevelInfo.Loaded.Items)SetupFamilyWorld(existing);
  climateTimer=Server.MainScheduler.QueueRepeat(task=>UpdateClimate(),null,TimeSpan.FromSeconds(25));
  UpdateClimate();
  wanderTimer=Server.MainScheduler.QueueRepeat(task=>WanderBots(),null,TimeSpan.FromSeconds(2));
  Command.Register(family);
  File.WriteAllText("properties/gfc-familyplay.ready","ready");
 }
 public override void Unload(bool auto) {
  OnBlockChangingEvent.Unregister(ProtectHouse);
  OnBlockChangingEvent.Unregister(MiningChange);
  OnPlayerMoveEvent.Unregister(AdventureMove);
  OnLevelLoadedEvent.Unregister(SetupFamilyWorld);
  if(climateTimer!=null)Server.MainScheduler.Cancel(climateTimer);
  if(wanderTimer!=null)Server.MainScheduler.Cancel(wanderTimer);
  SaveBags();
  OnPlayerSpawningEvent.Unregister(RestoreSpotOnSpawn);
  OnJoinedLevelEvent.Unregister(RestorePreviousWorld);
  OnPlayerConnectEvent.Unregister(RememberReturningPlayer);
  OnPlayerDisconnectEvent.Unregister(TrackDisconnect);
  try{File.Delete(CreaturesStatusFile);}catch{}
  try{File.Delete(PortalsStatusFile);}catch{}
  Command.Unregister(family);
  try{File.Delete("properties/gfc-familyplay.ready");}catch{}
 }
 public override void Help(Player p) { p.Message("Protege as casinhas e permite encontrar seus amigos. /familia ajuda"); }

 private static void Refresh(bool forced=false) {
  if(!forced && (DateTime.UtcNow-checkedAt).TotalMilliseconds < 900)return;
  lock(Gate) {
   if(!forced && (DateTime.UtcNow-checkedAt).TotalMilliseconds < 900)return;
   checkedAt=DateTime.UtcNow;
   try {
    string[] lines=File.ReadAllLines(ConfigPath);
    Dictionary<string,string> nextUsers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
    Dictionary<int,string> nextOwners=new Dictionary<int,string>();
    foreach(string line in lines) {
     string[] parts=line.Split('|');
     if(parts.Length!=3)continue;
     if(parts[0]=="U" && (parts[2]=="admin"||parts[2]=="child") && parts[1].Length>=3)
      nextUsers[parts[1]]=parts[2];
     if(parts[0]=="S"&&parts[1]=="building")buildingEnabled=parts[2]!="false";
     if(parts[0]=="H") {
      int slot;
      if(int.TryParse(parts[1],out slot)&&slot>=1&&slot<=4)nextOwners[slot]=parts[2];
     }
    }
    users=nextUsers;owners=nextOwners;
   } catch(Exception err) {
    // Fail closed: if the policy file is missing, do not open up any house.
    users=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
    owners=new Dictionary<int,string>();
    Logger.Log(LogType.Warning, "FamilyPlay could not read trusted policy: "+err.Message);
   }
  }
 }
 internal static bool IsAllowed(Player p) {
  Refresh();return users.ContainsKey(p.name);
 }
 internal static bool IsParent(Player p) {
  Refresh();
  string role;return users.TryGetValue(p.name,out role)&&role=="admin";
 }
 internal static int HouseFor(string playerName) {
  Refresh();
  foreach(KeyValuePair<int,string> item in owners)if(item.Value.Equals(playerName,StringComparison.OrdinalIgnoreCase))return item.Key;
  return 0;
 }
 internal static bool KnownUser(string name) {
  Refresh();return users.ContainsKey(name);
 }
 // All X/Y/Z changes within the building footprint are server-blocked, not just taps.
 private static void ProtectHouse(Player p, ushort x, ushort y, ushort z, ushort block, bool placing, ref bool cancel) {
  if(p.level==null)return;
  if(IsParent(p))return;
  if(!buildingEnabled){
   cancel=true;p.RevertBlock(x,y,z);
   return;
  }
  if(!String.Equals(p.level.MapName,"vila_familia",StringComparison.OrdinalIgnoreCase))return;
  bool isKnown=IsAllowed(p);
  for(int i=0;i<4;i++) {
   if(x<bounds[i,0]||x>bounds[i,1]||z<bounds[i,2]||z>bounds[i,3])continue;
   string owner;
   owners.TryGetValue(i+1,out owner);
   if(isKnown && owner!=null && owner.Equals(p.name,StringComparison.OrdinalIgnoreCase))return;
   cancel=true;
   p.RevertBlock(x,y,z);
   DateTime previous;
   lock(Gate) {
    if(!warned.TryGetValue(p.name,out previous)||(DateTime.UtcNow-previous).TotalSeconds>7) {
     warned[p.name]=DateTime.UtcNow;
     p.Message("&eEsta casinha esta protegida! Voce pode construir na sua propria casa.");
    }
   }
   return;
  }
 }
 internal static bool MoveToWorld(Player p,string world) {
  if(p.level!=null && p.level.MapName.Equals(world,StringComparison.OrdinalIgnoreCase))return true;
  return PlayerActions.ChangeMap(p,world);
 }
 internal static void MoveHome(Player p) {
  int slot=HouseFor(p.name);
  if(slot<1){p.Message("&ePeca ao responsavel para escolher sua casa no painel.");return;}
  if(!MoveToWorld(p,"vila_familia"))return;
  p.BlockUntilLoad(10);
  PlayerOperations.TeleportToCoords(p,Position.FromFeetBlockCoords(homeSpawns[slot-1,0],homeSpawns[slot-1,1],homeSpawns[slot-1,2]),p.Rot);
  p.Message("&aVoce chegou a sua casinha!");
 }

 // All non-player entities are peaceful animals or non-damaging fantasy monsters.
 // MCGalaxy's BotsScheduler sets movement=false every 100ms; updating TargetPos alone
 // makes a bot stop. We set an actual WalkInstruction for each new destination.
 private static readonly string[] WildlifeNames={"Ovelha_01","Ovelha_02","Porquinho_01","Porquinho_02","Galinha_01"};
 private static readonly string[] WildlifeModels={"sheep","sheep","pig","pig","chicken"};
 private static readonly int[,] WildlifePlaces={{83,118},{113,120},{111,86},{76,117},{118,109}};
 private static bool FamilyWorld(Level lvl){
  if(lvl==null)return false;
  return lvl.MapName=="vila_familia"||lvl.MapName=="aventura"||
         lvl.MapName=="exploracao"||lvl.MapName=="mineracao";
 }
 private static bool Monster(PlayerBot bot){
  return bot.name.StartsWith("Creeper_")||bot.name.StartsWith("Esqueleto_")||
         bot.name.StartsWith("Aranha_");
 }
 private static bool IsWildlife(PlayerBot bot){
  return bot.Model=="sheep"||bot.Model=="pig"||bot.Model=="chicken"||
         bot.Model=="creeper"||bot.Model=="skeleton"||bot.Model=="spider";
 }
 private static bool IsFloor(ushort b){
  return b==Block.Grass||b==Block.Dirt||b==Block.Stone||b==Block.Cobblestone||
         b==Block.Sand||b==Block.Gravel||b==Block.Brick||b==Block.Wood||
         b==Block.DoubleSlab;
 }
 // Returns feet above solid terrain without teleporting mobs inside a mountain.
 private static int FindFeet(Level lvl,int x,int z){
  if(x<2||z<2||x>=lvl.Width-2||z>=lvl.Length-2)return -1;
  for(int y=lvl.Height-5;y>=3;y--){
   if(!IsFloor(lvl.GetBlock((ushort)x,(ushort)y,(ushort)z)))continue;
   if(lvl.GetBlock((ushort)x,(ushort)(y+1),(ushort)z)!=Block.Air||
      lvl.GetBlock((ushort)x,(ushort)(y+2),(ushort)z)!=Block.Air)continue;
   // Avoid water and exposed tree canopies.
   if(lvl.GetBlock((ushort)x,(ushort)(y+3),(ushort)z)==Block.Water)continue;
   return y+1;
  }
  return -1;
 }
 private static bool ClearPath(Level lvl,int x,int z,int fromY){
  int y=FindFeet(lvl,x,z);
  return y>2&&Math.Abs(y-fromY)<=1;
 }
 private static void SetupFamilyWorld(Level lvl){
  if(!FamilyWorld(lvl))return;
  // Remove old stationary human guides (including persisted copies on the VPS).
  bool removed=false;
  foreach(PlayerBot old in lvl.Bots.Items){
   if(old.name.StartsWith("Guia_") || !IsWildlife(old)){
    PlayerBot.Remove(old,false);removed=true;
   }
  }
  if(lvl.MapName=="vila_familia"){
   for(int i=0;i<WildlifeNames.Length;i++)
    AddCreature(lvl,WildlifeNames[i],WildlifeModels[i],WildlifePlaces[i,0],WildlifePlaces[i,1]);
  } else {
   string[] names={"Ovelha_Bosque","Porco_Montanha","Galinha_Campo","Ovelha_Lago",
                   "Porquinho_Rio","Galinha_Trilha","Ovelha_Colina","Porco_Bosque"};
   string[] models={"sheep","pig","chicken","sheep","pig","chicken","sheep","pig"};
   int[,] places={{187,207},{220,190},{183,167},{245,171},{206,232},{170,224},{257,207},{217,154}};
   for(int i=0;i<names.Length;i++)AddCreature(lvl,names[i],models[i],places[i,0],places[i,1]);
   string suffix=lvl.MapName=="mineracao"?"_M":lvl.MapName=="aventura"?"_A":"_E";
   int midX=lvl.Width/2,midZ=lvl.Length/2;
   AddCreature(lvl,"Creeper_01"+suffix,"creeper",midX-19,midZ+13);
   AddCreature(lvl,"Esqueleto_01"+suffix,"skeleton",midX+19,midZ+16);
   AddCreature(lvl,"Aranha_01"+suffix,"spider",midX-12,midZ-23);
   AddCreature(lvl,"Creeper_02"+suffix,"creeper",midX+22,midZ-18);
  }
  if(removed)BotsFile.Save(lvl);
  SetupHubPortals(lvl);
  WriteCreatureStatus();
 }
 private static void AddCreature(Level lvl,string name,string model,int x,int z){
  PlayerBot creature=null;
  foreach(PlayerBot found in lvl.Bots.Items){
   if(found.name.Equals(name,StringComparison.OrdinalIgnoreCase)){creature=found;break;}
  }
  if(creature!=null){
   if(creature.Owner!="GamesForChildren")return;
   if(creature.Model!=model)creature.SetModel(model);
  }else{
   x=Math.Min(Math.Max(3,x),lvl.Width-4);z=Math.Min(Math.Max(3,z),lvl.Length-4);
   int ground=FindFeet(lvl,x,z);
   if(ground<0)return;
   creature=new PlayerBot(name,lvl);
   creature.Owner="GamesForChildren";
   creature.SetModel(model);
   creature.SetInitialPos(Position.FromFeetBlockCoords(x,ground,z));
   PlayerBot.Add(creature,false);
   BotsFile.Save(lvl);
  }
  creature.Instructions.Clear();
  creature.cur=0;creature.hunt=false;creature.kill=false;
  creature.movementSpeed=Monster(creature)?4:3;
  botHomes[lvl.MapName+"/"+creature.name]=creature.Pos;
  SetCreatureGoal(creature,creature.Pos.X/32+2,creature.Pos.Y/32,creature.Pos.Z/32+2);
 }
 private static void SetCreatureGoal(PlayerBot bot,int x,int y,int z){
  // MUST update WalkInstruction, because scheduler overwrites movement flag.
  Position goal=Position.FromFeetBlockCoords(x,y,z);
  bot.Instructions.Clear();
  bot.Instructions.Add(new WalkInstruction().Parse(new string[]{
   "walk",goal.X.ToString(),goal.Y.ToString(),goal.Z.ToString(),"0","0"
  }));
  bot.cur=0;bot.TargetPos=goal;bot.movement=true;
  botGoals[bot.level.MapName+"/"+bot.name]=DateTime.UtcNow;
 }
 private static void WriteCreatureStatus(){
  int animals=0,monsters=0,humans=0;
  foreach(Level lvl in LevelInfo.Loaded.Items){
   if(!FamilyWorld(lvl))continue;
   foreach(PlayerBot b in lvl.Bots.Items){
    if(Monster(b))monsters++;
    else if(IsWildlife(b))animals++;
    else humans++;
   }
  }
  try{File.WriteAllText(CreaturesStatusFile,"animals="+animals+"\nmonsters="+monsters+
   "\nhumans="+humans+"\nupdated="+DateTime.UtcNow.ToString("O")+"\n");}
  catch(Exception ex){Logger.Log(LogType.Warning,"Creature status: "+ex.Message);}
 }
 private static Player ClosestFamilyPlayer(Level lvl,Position pos,int range){
  Player closest=null;long best=(long)range*range*32*32;
  foreach(Player p in PlayerInfo.Online.Items){
   if(p.level!=lvl||!IsAllowed(p))continue;
   long dx=p.Pos.X-pos.X,dz=p.Pos.Z-pos.Z,dy=p.Pos.Y-pos.Y;
   long dist=dx*dx+dz*dz+dy*dy;
   if(dist<best){best=dist;closest=p;}
  }
  return closest;
 }
 private static void WanderBots(){
  int moved=0,total=0,animals=0,monsters=0;
  foreach(Level lvl in LevelInfo.Loaded.Items){
   if(!FamilyWorld(lvl))continue;
   foreach(PlayerBot bot in lvl.Bots.Items){
    if(bot.Owner!="GamesForChildren"||!IsWildlife(bot))continue;
    total++;if(Monster(bot))monsters++;else animals++;
    string key=lvl.MapName+"/"+bot.name;
    Position home; if(!botHomes.TryGetValue(key,out home)){home=bot.Pos;botHomes[key]=home;}
    Position previous;
    bool moving=lastBotPositions.TryGetValue(key,out previous)&&
        (Math.Abs(previous.X-bot.Pos.X)>3||Math.Abs(previous.Z-bot.Pos.Z)>3);
    if(moving){moved++;botStalls[key]=0;}
    else botStalls[key]=botStalls.ContainsKey(key)?botStalls[key]+1:0;
    lastBotPositions[key]=bot.Pos;
    bool monster=Monster(bot);
    Player near=ClosestFamilyPlayer(lvl,bot.Pos,monster?12:5);
    bool reached=Math.Abs(bot.Pos.X-bot.TargetPos.X)<36&&Math.Abs(bot.Pos.Z-bot.TargetPos.Z)<36;
    bool stale=!botGoals.ContainsKey(key)||(DateTime.UtcNow-botGoals[key]).TotalSeconds>9;
    // Monsters pursue but do not attack (no survival health or damage).
    if(monster&&near!=null){
     int px=near.Pos.X/32,pz=near.Pos.Z/32;
     if(!ClearPath(lvl,px,pz,bot.Pos.Y/32)){
      // The target is separated by a wall or cliff; keep searching for an alternate route.
     }else if(botStalls[key]>=3||reached||
      Math.Abs(bot.TargetPos.X-near.Pos.X)>64||Math.Abs(bot.TargetPos.Z-near.Pos.Z)>64){
      SetCreatureGoal(bot,px,FindFeet(lvl,px,pz),pz);
     }
     continue;
    }
    if(!reached&&botStalls[key]<3&&!stale)continue;
    int baseX=home.X/32,baseZ=home.Z/32;
    int startX=bot.Pos.X/32,startY=bot.Pos.Y/32,startZ=bot.Pos.Z/32;
    bool chosen=false;
    for(int attempt=0;attempt<12;attempt++){
     int dx=random.Next(-7,8),dz=random.Next(-7,8);
     if(Math.Abs(dx)+Math.Abs(dz)<3)continue;
     // Animals seek a safe clearing near their herd; avoid cliff dives.
     int x=startX+dx,z=startZ+dz;
     if(Math.Abs(x-baseX)>14||Math.Abs(z-baseZ)>14)continue;
     int feet=FindFeet(lvl,x,z);
     if(feet<0||Math.Abs(feet-startY)>1)continue;
     // Prefer walkable straight lines; engine performs short step-up/down.
     bool clear=true;
     for(int step=1;step<=4;step++){
      int sx=startX+dx*step/4,sz=startZ+dz*step/4;
      if(!ClearPath(lvl,sx,sz,startY)){clear=false;break;}
     }
     if(!clear)continue;
     // Passive animals retreat from nearby players if approached.
     if(!monster&&near!=null){
      long oldDX=bot.Pos.X-near.Pos.X,oldDZ=bot.Pos.Z-near.Pos.Z;
      long newDX=x*32-near.Pos.X,newDZ=z*32-near.Pos.Z;
      if(newDX*newDX+newDZ*newDZ<oldDX*oldDX+oldDZ*oldDZ)continue;
     }
     SetCreatureGoal(bot,x,feet,z);chosen=true;break;
    }
    if(!chosen)botGoals[key]=DateTime.UtcNow;
   }
  }
  WriteCreatureStatus();
  try{File.WriteAllText("properties/gfc-family-bot-movement.status",
     "total="+total+"\nmoved="+moved+"\nanimals="+animals+
     "\nmonsters="+monsters+"\nupdated="+DateTime.UtcNow.ToString("O")+"\n");}
  catch(Exception ex){Logger.Log(LogType.Warning,"Creature movement status: "+ex.Message);}
 }
 // Hub portals are one-way blocks; installing links on each map makes travel round-trip.
 private static readonly string[] HubMaps={"vila_familia","aventura","exploracao","mineracao"};
 private static readonly string[] HubNames={"Vila","Aventura","Exploracao","Mineracao"};
 private static readonly int[,] HubOffsets={{-12,-12},{12,-12},{-12,12},{12,12}};
 private static readonly Dictionary<string,Position> hubLocations=new Dictionary<string,Position>();
 private static bool HasPortalSpace(Level lvl,int x,int y,int z){
  if(x<4||z<4||x+4>=lvl.Width-4||z>=lvl.Length-4||y+5>=lvl.Height)return false;
  for(int a=-1;a<=4;a++)for(int dz=-1;dz<=1;dz++)for(int h=0;h<5;h++){
   int xx=x+a,yy=y+h,zz=z+dz;
   if(lvl.GetBlock((ushort)xx,(ushort)yy,(ushort)zz)!=Block.Air)return false;
   // Only the actual frame's base needs to be solid; sides have clearance.
   if(h==0&&dz==0&&a>=0&&a<4&&
      !IsFloor(lvl.GetBlock((ushort)xx,(ushort)(y-1),(ushort)zz)))return false;
  }
  return true;
 }
 private static Position SafeLanding(Level lvl,int centerX,int centerZ){
  for(int radius=0;radius<=14;radius++)for(int dx=-radius;dx<=radius;dx++)for(int dz=-radius;dz<=radius;dz++){
   if(radius>0&&Math.Abs(dx)!=radius&&Math.Abs(dz)!=radius)continue;
   int x=centerX+dx,z=centerZ+dz,y=FindFeet(lvl,x,z);
   if(y<0)continue;
   return Position.FromFeetBlockCoords(x,y,z);
  }
  return Position.FromFeetBlockCoords(Math.Min(lvl.Width-3,centerX),Math.Min(lvl.Height-3,54),Math.Min(lvl.Length-3,centerZ));
 }
 private static void SetupHubPortals(Level lvl){
  int centerX=lvl.MapName=="vila_familia"||lvl.MapName=="aventura"?96:lvl.Width/2;
  int centerZ=lvl.MapName=="vila_familia"||lvl.MapName=="aventura"?106:lvl.Length/2;
  // Keep previously persisted portals without recreating or overriding user builds.
  int existing=Portal.GetAllCoords(lvl.MapName).Count;
  if(existing>=3){
   // A restart must reconstruct the menu destination without rewriting any portal.
   var registered=Portal.GetAllCoords(lvl.MapName);
   if(registered.Count>0){
    var first=registered[0];
    int x=first.X,z=Math.Max(3,first.Z-3);
    int safeY=FindFeet(lvl,x,z);
    if(safeY>0)hubLocations[lvl.MapName]=Position.FromFeetBlockCoords(x,safeY,z);
   }
   WritePortalsStatus();return;
  }
  int created=0;
  for(int target=0;target<HubMaps.Length;target++){
   string destination=HubMaps[target];
   if(destination==lvl.MapName)continue;
   int x=0,y=0,z=0;
   bool found=false;
   int sx=centerX+HubOffsets[target,0],sz=centerZ+HubOffsets[target,1];
   // Seek unmodified, solid terrain: never overwrite a child-built block.
   for(int radius=0;radius<=20&&!found;radius++){
    for(int ox=-radius;ox<=radius&&!found;ox++)for(int oz=-radius;oz<=radius&&!found;oz++){
     if(radius>0&&Math.Abs(ox)!=radius&&Math.Abs(oz)!=radius)continue;
     int tx=sx+ox,tz=sz+oz;
     int feet=FindFeet(lvl,tx,tz);
     if(feet<0||!HasPortalSpace(lvl,tx,feet,tz))continue;
     if(Math.Abs(tx-centerX)<4&&Math.Abs(tz-centerZ)<4)continue;
     x=tx;y=feet;z=tz;found=true;
    }
   }
   if(!found){Logger.Log(LogType.Warning,"No safe family portal site: "+lvl.MapName+" > "+destination);continue;}
   try{
    int arrX=destination=="vila_familia"||destination=="aventura"?96:192;
    int arrZ=destination=="vila_familia"?106:destination=="aventura"?96:192;
    Level dest=LevelInfo.FindExact(destination);
    Position land=dest!=null?SafeLanding(dest,arrX,arrZ):
       Position.FromFeetBlockCoords(arrX,destination=="vila_familia"?45:50,arrZ);
    // Create the DB route first. If block placing fails, next load can retry.
    for(int a=1;a<=2;a++)for(int h=1;h<=3;h++)
     Portal.Set(lvl.MapName,(ushort)(x+a),(ushort)(y+h),(ushort)z,
       (ushort)(land.X/32),(ushort)(land.Y/32),(ushort)(land.Z/32),destination);
    for(int a=0;a<4;a++)for(int h=0;h<5;h++)
     lvl.Blockchange((ushort)(x+a),(ushort)(y+h),(ushort)z,
      a==0||a==3||h==0||h==4?(ushort)49:Block.Portal_Blue);
    if(!hubLocations.ContainsKey(lvl.MapName))
     hubLocations[lvl.MapName]=Position.FromFeetBlockCoords(x+1,y,z-2);
    created++;
   }catch(Exception ex){Logger.Log(LogType.Warning,"Hub portal "+destination+": "+ex.Message);}
  }
  if(created>0)Logger.Log(LogType.SystemActivity,
      "Family portals created: "+created+" on "+lvl.MapName);
  WritePortalsStatus();
 }
 private static void WritePortalsStatus(){
  int count=0;
  foreach(Level map in LevelInfo.Loaded.Items)if(FamilyWorld(map))
   count+=Portal.GetAllCoords(map.MapName).Count;
  try{File.WriteAllText(PortalsStatusFile,"entrances="+count+
       "\nupdated="+DateTime.UtcNow.ToString("O")+"\n");}
  catch(Exception e){Logger.Log(LogType.Warning,"Family portal status: "+e.Message);}
 }
 private static bool ValidSpot(SavedSpot spot) {
  return spot!=null&&(spot.World=="vila_familia"||spot.World=="aventura"||spot.World=="exploracao"||spot.World=="mineracao")&&
         spot.X>=1&&spot.X<12288&&spot.Z>=1&&spot.Z<12288&&spot.Y>=1&&spot.Y<3584;
 }
 private static void LoadSpots(){
  lock(Gate){
   savedSpots.Clear();
   try{
    if(!File.Exists(PositionFile))return;
    foreach(string line in File.ReadAllLines(PositionFile)){
     string[] parts=line.Split('|');
     if(parts.Length!=8||!users.ContainsKey(parts[0]))continue;
     SavedSpot v=new SavedSpot();
     v.World=parts[1];
     if(!int.TryParse(parts[2],out v.X)||!int.TryParse(parts[3],out v.Y)||!int.TryParse(parts[4],out v.Z))continue;
     if(!byte.TryParse(parts[5],out v.Yaw)||!byte.TryParse(parts[6],out v.Pitch)||!long.TryParse(parts[7],out v.Saved))continue;
     if(ValidSpot(v))savedSpots[parts[0]]=v;
    }
   }catch(Exception e){Logger.Log(LogType.Warning,"FamilyPlay failed reading positions: "+e.Message);}
  }
 }
 private static void SaveSpots(){
  List<string> lines=new List<string>();
  foreach(KeyValuePair<string,SavedSpot> item in savedSpots){
   SavedSpot v=item.Value;
   if(!ValidSpot(v))continue;
   lines.Add(item.Key+"|"+v.World+"|"+v.X+"|"+v.Y+"|"+v.Z+"|"+v.Yaw+"|"+v.Pitch+"|"+v.Saved);
  }
  string temp=PositionFile+".tmp";
  try{File.WriteAllLines(temp,lines.ToArray());File.Move(temp,PositionFile,true);}
  catch(Exception e){Logger.Log(LogType.Warning,"FamilyPlay could not save positions: "+e.Message);}
 }
 private static void RememberReturningPlayer(Player p){
  if(!IsAllowed(p))return;
  lock(Gate){returningPlayers.Add(p.name);}
 }
 private static void RestoreSpotOnSpawn(Player p,ref Position pos,ref byte yaw,ref byte pitch,bool respawning){
  if(respawning||!IsAllowed(p))return;
  lock(Gate){
   SavedSpot spot;
   if(!returningPlayers.Contains(p.name)||!savedSpots.TryGetValue(p.name,out spot)||!ValidSpot(spot))return;
   // Initial join spawns in main world. Map transfer is performed after the level loads.
   if(p.level!=null && p.level.MapName.Equals(spot.World,StringComparison.OrdinalIgnoreCase)){
    pos=new Position(spot.X,spot.Y,spot.Z);yaw=spot.Yaw;pitch=spot.Pitch;
    returningPlayers.Remove(p.name);
   }
  }
 }

 private static void RestorePreviousWorld(Player p,Level from,Level joined,ref bool announce){
  if(!IsAllowed(p)||joined==null)return;
  SavedSpot target;
  lock(Gate){
   if(!returningPlayers.Contains(p.name)||!savedSpots.TryGetValue(p.name,out target)||!ValidSpot(target))return;
  }
  if(joined.MapName.Equals(target.World,StringComparison.OrdinalIgnoreCase))return;
  // Do not change map synchronously during the level join callback.
  Server.MainScheduler.QueueOnce(task=>{
   if(p.Socket.Disconnected)return;
   SavedSpot saved;
   lock(Gate){if(!returningPlayers.Contains(p.name)||!savedSpots.TryGetValue(p.name,out saved))return;}
   if(saved.World!="vila_familia"&&saved.World!="aventura"&&saved.World!="exploracao"&&saved.World!="mineracao")return;
   if(!p.level.MapName.Equals(saved.World,StringComparison.OrdinalIgnoreCase))
    PlayerActions.ChangeMap(p,saved.World);
  },null,TimeSpan.FromMilliseconds(600));
 }
 private static void TrackDisconnect(Player p,string reason){
  if(!IsAllowed(p))return;
  lock(Gate){
   SavePlayerSpot(p,p.Pos,p.Rot.RotY,p.Rot.HeadX,true);
   returningPlayers.Remove(p.name);
  }
 }
 private static void SavePlayerSpot(Player p,Position pos,byte yaw,byte pitch,bool force){
  if(p.level==null)return;
  string world=p.level.MapName;
  if(world!="vila_familia"&&world!="aventura"&&world!="exploracao"&&world!="mineracao")return;
  // The initial spawn briefly lands in the main world before the saved world
  // is restored. Never overwrite the last exit location during that transfer.
  SavedSpot restoring;
  if(returningPlayers.Contains(p.name)&&savedSpots.TryGetValue(p.name,out restoring)&&restoring.World!=world)return;
  long tick=DateTime.UtcNow.Ticks,prior;
  if(!force&&lastSpotWrite.TryGetValue(p.name,out prior)&&tick-prior<TimeSpan.TicksPerSecond*8)return;
  lastSpotWrite[p.name]=tick;
  SavedSpot v=new SavedSpot(){World=world,X=pos.X,Y=pos.Y,Z=pos.Z,Yaw=yaw,Pitch=pitch,Saved=tick};
  if(!ValidSpot(v))return;
  savedSpots[p.name]=v;SaveSpots();
 }


 // Educational survival: resources must come from blocks genuinely mined
 // in the dedicated server-side world. Client menus never credit inventory.
 private static MiningBag BagFor(string player){
  MiningBag b;if(!bags.TryGetValue(player,out b)){b=new MiningBag();bags[player]=b;}return b;
 }
 private static void LoadBags(){
  lock(Gate){
   bags.Clear();
   try{
    if(!File.Exists(InventoryFile))return;
    foreach(string line in File.ReadAllLines(InventoryFile)){
     string[] p=line.Split('|');if((p.Length!=8&&p.Length!=10)||!users.ContainsKey(p[0]))continue;
     int[] value=new int[p.Length-1];bool ok=true;
     for(int i=0;i<value.Length;i++)if(!int.TryParse(p[i+1],out value[i])||value[i]<0||value[i]>100000){ok=false;break;}
     if(!ok)continue;
     bags[p[0]]=new MiningBag(){Wood=value[0],Stone=value[1],Coal=value[2],Iron=value[3],Gold=value[4],Apples=value[5],Tool=Math.Min(3,value[6]),Sword=p.Length==10?Math.Min(3,value[7]):0,Armor=p.Length==10?Math.Min(2,value[8]):0};
    }
   }catch(Exception e){Logger.Log(LogType.Warning,"Mining inventory read: "+e.Message);}
  }
 }
 private static void SaveBags(){
  List<string> lines=new List<string>();
  foreach(KeyValuePair<string,MiningBag> item in bags){
   MiningBag b=item.Value;
   lines.Add(item.Key+"|"+b.Wood+"|"+b.Stone+"|"+b.Coal+"|"+b.Iron+"|"+b.Gold+"|"+b.Apples+"|"+b.Tool+"|"+b.Sword+"|"+b.Armor);
  }
  try{File.WriteAllLines(InventoryFile+".tmp",lines.ToArray());File.Move(InventoryFile+".tmp",InventoryFile,true);}
  catch(Exception e){Logger.Log(LogType.Warning,"Mining inventory save: "+e.Message);}
 }
 // CREATIVE MODE: every block can be placed or removed without a pickaxe or cost.
 // Keep optional statistics for gathering materials; never cancel building here.
 private static void MiningChange(Player p,ushort x,ushort y,ushort z,ushort block,bool placing,ref bool cancel){
  if(cancel||placing||p.level==null||p.level.MapName!="mineracao"||!IsAllowed(p))return;
  ushort old=p.level.GetBlock(x,y,z);
  lock(Gate){
   MiningBag bag=BagFor(p.name);
   if(old==17||old==5)bag.Wood++;
   else if(old==1||old==4)bag.Stone++;
   else if(old==16)bag.Coal++;
   else if(old==15)bag.Iron++;
   else if(old==14)bag.Gold++;
   else if(old==18 && random.Next(4)==0)bag.Apples++;
   else return;
   SaveBags();
  }
 }
 private static void ShowBag(Player p){
  lock(Gate){
   MiningBag b=BagFor(p.name);
   string[] picks={"Sem picareta","Madeira","Pedra","Ferro"};
   string[] swords={"Sem espada","Madeira","Pedra","Ferro"};
   string[] armors={"Sem armadura","Ferro","Ouro"};
   p.Message("&aMochila: &eMadeira "+b.Wood+" | Pedra "+b.Stone+" | Carvao "+b.Coal);
   p.Message("&aFerro "+b.Iron+" | Ouro "+b.Gold+" | Macas "+b.Apples);
   p.Message("&bPicareta: "+picks[b.Tool]+" | Espada: "+swords[b.Sword]+" | Armadura: "+armors[b.Armor]);
   p.Message("&7Todos os blocos sao gratuitos. Ferramentas e armaduras sao decorativas.");
  }
 }
 private static void Craft(Player p,string what){
  string[] parts=(what??"").Trim().ToLowerInvariant().Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries);
  if(parts.Length<1||parts.Length>2){p.Message("&eEscolha picareta, espada ou armadura no menu Familia.");return;}
  string kind=parts.Length==1?"picareta":parts[0];
  string material=parts[parts.Length-1];
  lock(Gate){
   MiningBag b=BagFor(p.name);
   if(kind=="picareta"){
    int tier=material=="madeira"?1:material=="pedra"?2:material=="ferro"?3:0;
    if(tier==0){p.Message("&ePicareta: madeira, pedra ou ferro.");return;}
    if(b.Tool>=tier){p.Message("&eVoce ja tem uma picareta igual ou melhor.");return;}
    b.Tool=tier;
    p.Message("&aPicareta de "+material+" equipada! Construcao livre: todos os blocos disponiveis.");
   }else if(kind=="espada"){
    int tier=material=="madeira"?1:material=="pedra"?2:material=="ferro"?3:0;
    if(tier==0){p.Message("&eEspada: madeira, pedra ou ferro.");return;}
    if(b.Sword>=tier){p.Message("&eVoce ja tem uma espada igual ou melhor.");return;}
    b.Sword=tier;
    p.Message("&aEspada de "+material+" fabricada e guardada na mochila! Item de colecao.");
   }else if(kind=="armadura"){
    int tier=material=="ferro"?1:material=="ouro"?2:0;
    if(tier==0){p.Message("&eArmadura: ferro ou ouro.");return;}
    if(b.Armor>=tier){p.Message("&eVoce ja tem uma armadura igual ou melhor.");return;}
    b.Armor=tier;
    p.Message("&aArmadura de "+material+" fabricada e guardada na mochila! Item de colecao.");
   }else{p.Message("&eEscolha picareta, espada ou armadura.");return;}
   SaveBags();
  }
 }
 // Persistent portals use MCGalaxy's real portal blocks and server-side DB.
 // Children may build only in shared exploration/mining terrain, never homes.
 private static void CreatePortal(Player p,string destination){
  string dest=destination=="vila"?"vila_familia":destination=="exploracao"?"exploracao":destination=="mineracao"?"mineracao":"";
  if(dest==""){p.Message("&eEscolha portal vila, exploracao ou mineracao.");return;}
  if(p.level==null||(p.level.MapName!="exploracao"&&p.level.MapName!="mineracao")){
   p.Message("&eCrie portais somente nos mundos Exploracao ou Mineracao.");return;
  }
  if(!buildingEnabled&&!IsParent(p)){p.Message("&eO responsavel desativou a construcao.");return;}
  if(p.level.MapName==dest){p.Message("&eVoce ja esta nesse mundo.");return;}
  int x=p.Pos.X/32+4,y=p.Pos.Y/32,z=p.Pos.Z/32+3;
  Level lvl=p.level;
  if(x<3||y<4||z<3||x+4>=lvl.Width||y+6>=lvl.Height||z+2>=lvl.Length){
   p.Message("&eAfaste-se dos limites do mapa para criar o portal.");return;
  }
  // Entire 4x5 frame must be empty, above a solid and even base.
  for(int a=0;a<4;a++)for(int h=0;h<5;h++){
   ushort xx=(ushort)(x+a),yy=(ushort)(y+h),zz=(ushort)z;
   if(lvl.GetBlock(xx,yy,zz)!=Block.Air){
    p.Message("&eE necessario um espaco livre 4x5 perto de voce.");return;
   }
   if(lvl.GetBlock(xx,(ushort)(y-1),zz)==Block.Air){
    p.Message("&eProcure um terreno plano para a base do portal.");return;
   }
  }
  if(Portal.GetAllCoords(lvl.MapName).Count>=72){
   p.Message("&eEste mundo tem muitos portais. Peca ajuda ao responsavel.");return;
  }
  int dx=dest=="vila_familia"?102:191,dy=dest=="vila_familia"?47:50,dz=dest=="vila_familia"?106:190;
  lock(Gate){
   try{
    for(int a=0;a<4;a++)for(int h=0;h<5;h++){
     ushort xx=(ushort)(x+a),yy=(ushort)(y+h),zz=(ushort)z;
     bool frame=(a==0||a==3||h==0||h==4);
     lvl.Blockchange(xx,yy,zz,frame?(ushort)49:Block.Portal_Blue);
     if(!frame)Portal.Set(lvl.MapName,xx,yy,zz,(ushort)dx,(ushort)dy,(ushort)dz,dest);
    }
    p.Message("&aPortal criado! Atravesse o brilho azul para viajar.");
   }catch(Exception ex){
    Logger.Log(LogType.Warning,"Family portal creation: "+ex.Message);
    p.Message("&eErro ao criar o portal. Avise o responsavel.");
   }
  }
 }
 private static void GoToHub(Player p){
  if(p.level==null||!FamilyWorld(p.level)){p.Message("&eEntre em um mundo da familia primeiro.");return;}
  Position destination;
  if(!hubLocations.TryGetValue(p.level.MapName,out destination)){
   p.Message("&eOs portais deste mundo ainda nao foram encontrados. Use Familia > Mundos.");return;
  }
  PlayerOperations.TeleportToCoords(p,destination,p.Rot);
  p.Message("&aOs portais estao perto daqui. Entre em um portal para viajar!");
 }
 private static void UpdateClimate(){
  // Whole-world classic map colors. No fake browser tint: MCGalaxy sends CPE
  // environment packets that change sky, fog, clouds, sun, shadows and weather.
  long sec=DateTimeOffset.UtcNow.ToUnixTimeSeconds();
  int phase=(int)((sec/300)%4);
  string[] names={"Manha","Tarde","Por do sol","Noite"};
  string[] sky={"99CCFF","74B9FF","ECA376","182751"};
  string[] cloud={"FFFFFF","F6F7FF","FCE5C1","515978"};
  string[] light={"FFFFFF","FFFFFF","F5D5A9","A0AFC9"};
  string[] shade={"9B9B9B","949CA9","856C79","515775"};
  bool raining=(sec/420)%5==2;
  foreach(Level level in LevelInfo.Loaded.Items){
   if(level.MapName!="vila_familia"&&level.MapName!="exploracao"&&level.MapName!="mineracao")continue;
   level.Config.SkyColor=sky[phase];
   level.Config.CloudColor=cloud[phase];
   level.Config.FogColor=sky[phase];
   level.Config.LightColor=light[phase];
   level.Config.ShadowColor=shade[phase];
   level.Config.Weather=raining?1:0;
   foreach(Player player in PlayerInfo.Online.Items)if(player.level==level)player.SendCurrentEnv();
  }
  try{File.WriteAllText(ClimateFile,"phase="+names[phase]+"\nweather="+(raining?"chuva":"sol")+"\nupdated="+sec+"\n");}
  catch(Exception error){Logger.Log(LogType.Warning,"Climate update failed: "+error.Message);}
 }
 // Real in-world quests: // Real in-world quests: progress advances exclusively from server-validated player positions.
 private static Quest GetQuest(string player) {
  Quest q;if(!quests.TryGetValue(player,out q)){q=new Quest();quests[player]=q;}return q;
 }
 private static void LoadAdventures() {
  lock(Gate){
   quests.Clear();teamReady.Clear();teamWins=0;
   try{
    if(!File.Exists(QuestFile))return;
    foreach(string line in File.ReadAllLines(QuestFile)){
     string[] parts=line.Split('|');
     if(parts.Length==2&&parts[0]=="T"){int.TryParse(parts[1],out teamWins);continue;}
     if(parts.Length==2&&parts[0]=="W"){if(users.ContainsKey(parts[1]))teamReady.Add(parts[1]);continue;}
     if(parts.Length!=8||parts[0]!="P"||!users.ContainsKey(parts[1]))continue;
     Quest q=GetQuest(parts[1]);
     int.TryParse(parts[2],out q.Stars);
     int.TryParse(parts[3],out q.Treasures);
     int.TryParse(parts[4],out q.Sprints);
     q.Mode=parts[5]=="tesouro"||parts[5]=="corrida"?parts[5]:"";
     int.TryParse(parts[6],out q.Stage);
     long.TryParse(parts[7],out q.Deadline);
     q.Stage=Math.Max(0,Math.Min(3,q.Stage));
     q.Stars=Math.Max(0,Math.Min(100000,q.Stars));
     q.Treasures=Math.Max(0,Math.Min(10000,q.Treasures));
     q.Sprints=Math.Max(0,Math.Min(10000,q.Sprints));
    }
   }catch(Exception ex){Logger.Log(LogType.Warning,"FamilyPlay could not restore adventures: "+ex.Message);}
  }
 }
 private static void SaveAdventures(){
  // The existing world .lvl is never touched by the adventure save.
  List<string> lines=new List<string>();
  lines.Add("T|"+teamWins);
  foreach(string name in teamReady)lines.Add("W|"+name);
  foreach(KeyValuePair<string,Quest> item in quests){
   Quest q=item.Value;
   lines.Add("P|"+item.Key+"|"+q.Stars+"|"+q.Treasures+"|"+q.Sprints+"|"+q.Mode+"|"+q.Stage+"|"+q.Deadline);
  }
  string temp=QuestFile+".tmp";
  try{File.WriteAllLines(temp,lines.ToArray());File.Move(temp,QuestFile,true);}
  catch(Exception ex){Logger.Log(LogType.Warning,"FamilyPlay cannot save adventures: "+ex.Message);}
 }
 private static void StartAdventure(Player p,string mode){
  Refresh();
  if(!IsAllowed(p))return;
  lock(Gate){
   Quest q=GetQuest(p.name);
   q.Mode=mode;q.Stage=0;
   q.Deadline=mode=="corrida"?DateTime.UtcNow.AddMinutes(3).Ticks:0;
   SaveAdventures();
  }
  if(!MoveToWorld(p,"vila_familia"))return;
  p.Message(mode=="tesouro"?"&aCaca ao tesouro iniciada! Encontre tres lugares da vila.":"&aDesafio relampago: visite tres lugares em 3 minutos!");
  p.Message("&e"+(mode=="tesouro"?treasureClues[0]:sprintClues[0]));
 }
 private static void ShowAdventures(Player p){
  lock(Gate){
   Quest q=GetQuest(p.name);
   p.Message("&6Aventuras: &a"+q.Stars+" estrelas &f| "+q.Treasures+" tesouros | "+q.Sprints+" circuitos");
   p.Message("&bMissao em dupla: "+(teamWins>0?"concluida "+teamWins+" vez(es)":"aguardando dois exploradores"));
   if(q.Mode!="")p.Message("&eMissao ativa: "+q.Mode+" passo "+(q.Stage+1)+"/3");
  }
 }
 private static void AdventureMove(Player p,Position next,byte yaw,byte pitch,ref bool cancel){
  if(cancel||p.level==null)return;
  if(!IsAllowed(p))return;
  lock(Gate){SavePlayerSpot(p,next,yaw,pitch,false);}
  if(!String.Equals(p.level.MapName,"vila_familia",StringComparison.OrdinalIgnoreCase))return;
  var coords=next.FeetBlockCoords;
  lock(Gate){
   Quest q=GetQuest(p.name);
   if(q.Mode=="")return;
   if(q.Mode=="corrida"&&DateTime.UtcNow.Ticks>q.Deadline){
    q.Mode="";q.Stage=0;SaveAdventures();
    p.Message("&cO tempo terminou. Tente o circuito novamente!");
    return;
   }
   int[,] targets=q.Mode=="tesouro"?treasureTargets:sprintTargets;
   int stage=Math.Max(0,Math.Min(2,q.Stage));
   int dx=coords.X-targets[stage,0],dz=coords.Z-targets[stage,1];
   if((long)dx*dx+(long)dz*dz>(long)targets[stage,2]*targets[stage,2])return;
   q.Stage++;
   if(q.Stage<3){
    SaveAdventures();
    p.Message("&bAventura: voce encontrou a pista "+q.Stage+" de 3!");
    p.Message("&e"+(q.Mode=="tesouro"?treasureClues[q.Stage]:sprintClues[q.Stage]));
    return;
   }
   string mode=q.Mode;q.Mode="";q.Stage=0;q.Deadline=0;
   if(mode=="tesouro"){
    q.Treasures++;q.Stars+=3;
    p.Message("&aTesouro encontrado! +3 estrelas. Parabens!");
    string role;
    if(users.TryGetValue(p.name,out role)&&role=="child"){
     teamReady.Add(p.name);
     if(teamReady.Count>=2){
      teamWins++;
      foreach(string kid in teamReady){Quest friend=GetQuest(kid);friend.Stars+=5;}
      teamReady.Clear();
      p.Message("&6META COOPERATIVA: duas criancas acharam o tesouro! +5 estrelas para cada uma!");
     }else p.Message("&eAgora falta outro explorador completar o tesouro para ganharem +5 estrelas!");
    }
   }else{
    q.Sprints++;q.Stars+=5;
    p.Message("&6Circuito completo! +5 estrelas e medalha de explorador!");
   }
   SaveAdventures();
  }
 }

 private sealed class FamilyCommand : Command2 {
  public override string name { get { return "Familia"; } }
  public override string type { get { return CommandTypes.Other; } }
  public override LevelPermission defaultRank { get { return LevelPermission.Guest; } }
  public override void Use(Player p,string message,CommandData data) {
   if(!IsAllowed(p)){p.Message("&WEntre com sua conta familiar no GamesForChildren.");return;}
   string[] split=(message??"").Trim().Split(new[]{' '},2,StringSplitOptions.RemoveEmptyEntries);
   string cmd=split.Length>0?split[0].ToLowerInvariant():"ajuda";
   string arg=split.Length>1?split[1].Trim():"";
   if(cmd=="ajuda"||cmd=="help"){Help(p);return;}
   if(cmd=="casa"){MoveHome(p);return;}
   if(cmd=="vila"){if(MoveToWorld(p,"vila_familia"))p.Message("&aBem-vindo a Vila da Familia!");return;}
   if(cmd=="aventura"){if(MoveToWorld(p,"aventura"))p.Message("&aVoce entrou no Mundo Aventura!");return;}
   if(cmd=="exploracao"){if(MoveToWorld(p,"exploracao"))p.Message("&aExplore a floresta, montanhas e novas construcoes!");return;}
   if(cmd=="amigo") {
    if(arg.Length<3||arg.Length>22||!KnownUser(arg)){p.Message("&eEscolha um amigo conectado no menu Familia.");return;}
    Player target=PlayerInfo.FindExact(arg);
    if(target==null||target==p){p.Message("&eSeu amigo ainda nao esta no mundo.");return;}
    PlayerOperations.TeleportToEntity(p,target);
    p.Message("&aPronto! Voce encontrou "+target.name);
    return;
   }
   if(cmd=="marco"){
    int index=arg=="praca"?0:arg=="ponte"?1:arg=="torre"?2:-1;
    if(index<0){p.Message("&eEscolha Praca, Ponte ou Torre no menu Familia.");return;}
    if(!MoveToWorld(p,"vila_familia"))return;
    p.BlockUntilLoad(10);
    int[,] places=new int[,]{{90,45,101},{102,43,58},{140,46,89}};
    // Scan the actual terrain to avoid spawning inside a building or mountain.
    int x=places[index,0],z=places[index,2],ground=places[index,1];
    for(int y=p.level.Height-3;y>1;y--){
     if(p.level.GetBlock((ushort)x,(ushort)y,(ushort)z)!=0){ground=y+2;break;}
    }
    PlayerOperations.TeleportToCoords(p,Position.FromFeetBlockCoords(x,ground,z),p.Rot);
    p.Message("&aPonto de interesse encontrado! Procure pistas pelo lugar.");
    return;
   }
   if(cmd=="mochila"){ShowBag(p);return;}
   if(cmd=="criar"){Craft(p,arg);return;}
   if(cmd=="portal"){CreatePortal(p,arg);return;}
   if(cmd=="hub"){GoToHub(p);return;}
   if(cmd=="minerar"){if(MoveToWorld(p,"mineracao"))p.Message("&aMundo Criativo: todos os blocos liberados no inventario (B)!");return;}
   if(cmd=="tesouro"||cmd=="corrida"){StartAdventure(p,cmd);return;}
   if(cmd=="premios"){ShowAdventures(p);return;}
   if(cmd=="pele") {
    if(arg!="azul"&&arg!="verde"&&arg!="rosa"&&arg!="roxo"&&arg!="laranja"&&arg!="amarelo"&&arg!="preto"&&arg!="ciano"){p.Message("&eEscolha uma skin do menu Familia.");return;}
    string url="https://gamesforchildren.escotilhaprodutora.com/api/minecraft/skins/"+arg+".png";
    PlayerOperations.SetSkin(p,p.name,url);
    return;
   }
   p.Message("&eOpcao desconhecida. Use /familia ajuda.");
  }
  public override void Help(Player p) {
   p.Message("&aMenu Familia do GamesForChildren:");
   p.Message("&T/familia casa  &H- Ir ate sua casinha");
   p.Message("&T/familia amigo NOME &H- Encontrar um amigo");
   p.Message("&T/familia vila  &H- Ir para a vila");
   p.Message("&T/familia aventura &H- Explorar o mundo antigo");
   p.Message("&T/familia exploracao &H- Mundo maior de exploracao");
   p.Message("&T/familia pele COR &H- Escolher a cor do personagem");
   p.Message("&T/familia tesouro &H- Caca ao tesouro");
   p.Message("&T/familia corrida &H- Circuito de exploracao");
   p.Message("&T/familia premios &H- Estrelas e medalhas");
   p.Message("&T/familia minerar &H- Minerar no novo mundo");
   p.Message("&T/familia mochila &H- Ver madeira, minerais e comida");
   p.Message("&T/familia criar picareta madeira &H- Fabricar ferramentas");
   p.Message("&T/familia criar espada ferro &H- Fabricar espada colecionavel");
   p.Message("&T/familia criar armadura ouro &H- Fabricar armadura colecionavel");
   p.Message("&T/familia portal vila &H- Construir portal no mundo");
   p.Message("&T/familia marco praca &H- Visitar os marcos da Vila");
   p.Message("&T/familia hub &H- Visitar os portais da Vila");
  }
 }
}
