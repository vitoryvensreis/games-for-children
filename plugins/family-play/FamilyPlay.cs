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
 private static readonly string GuideStatusFile = "properties/gfc-family-guides.status";
 private static readonly string SurvivalFile = "properties/gfc-survival.tsv";
 private static readonly string InventoryFile = "properties/gfc-mining-inventory.tsv";
 private sealed class MiningBag { public int Wood,Stone,Coal,Iron,Gold,Apples,Tool; }
 private static readonly Dictionary<string,MiningBag> bags=new Dictionary<string,MiningBag>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,long> lastMining=new Dictionary<string,long>(StringComparer.OrdinalIgnoreCase);
 private static readonly string ClimateFile = "properties/gfc-climate.status";
 private SchedulerTask climateTimer;
 private SchedulerTask wanderTimer;
 private static readonly Dictionary<string,Position> botHomes=new Dictionary<string,Position>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,bool> botPhases=new Dictionary<string,bool>(StringComparer.OrdinalIgnoreCase);
 private static readonly Dictionary<string,Position> lastBotPositions=new Dictionary<string,Position>(StringComparer.OrdinalIgnoreCase);
 private sealed class Vitals { public int Health=10,Hunger=10; public long Last=DateTime.UtcNow.Ticks; }
 private static readonly Dictionary<string,Vitals> vitals=new Dictionary<string,Vitals>(StringComparer.OrdinalIgnoreCase);
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
 private static readonly string[] treasureClues=new string[]{"Procure o Guia da Praca perto da fonte!", "Encontre o Guardiao da Ponte sobre o rio!", "Visite a Torre do Explorador junto ao lago!"};
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
  LoadVitals();
  LoadBags();
  OnBlockChangingEvent.Register(ProtectHouse, Priority.High);
  OnBlockChangingEvent.Register(MiningChange, Priority.Low);
  OnPlayerMoveEvent.Register(AdventureMove, Priority.Low);
  OnLevelLoadedEvent.Register(InstallGuides, Priority.Low);
  OnPlayerSpawningEvent.Register(RestoreSpotOnSpawn,Priority.High);
  OnJoinedLevelEvent.Register(RestorePreviousWorld,Priority.Low);
  OnPlayerConnectEvent.Register(RememberReturningPlayer,Priority.Low);
  OnPlayerDisconnectEvent.Register(TrackDisconnect,Priority.Low);
  // Main village may have loaded before this plugin subscribed to OnLevelLoaded.
  foreach(Level existing in LevelInfo.Loaded.Items)InstallGuides(existing);
  climateTimer=Server.MainScheduler.QueueRepeat(task=>UpdateClimate(),null,TimeSpan.FromSeconds(25));
  UpdateClimate();
  wanderTimer=Server.MainScheduler.QueueRepeat(task=>WanderBots(),null,TimeSpan.FromSeconds(8));
  Command.Register(family);
  File.WriteAllText("properties/gfc-familyplay.ready","ready");
 }
 public override void Unload(bool auto) {
  OnBlockChangingEvent.Unregister(ProtectHouse);
  OnBlockChangingEvent.Unregister(MiningChange);
  OnPlayerMoveEvent.Unregister(AdventureMove);
  OnLevelLoadedEvent.Unregister(InstallGuides);
  if(climateTimer!=null)Server.MainScheduler.Cancel(climateTimer);
  if(wanderTimer!=null)Server.MainScheduler.Cancel(wanderTimer);
  SaveVitals();
  SaveBags();
  OnPlayerSpawningEvent.Unregister(RestoreSpotOnSpawn);
  OnJoinedLevelEvent.Unregister(RestorePreviousWorld);
  OnPlayerConnectEvent.Unregister(RememberReturningPlayer);
  OnPlayerDisconnectEvent.Unregister(TrackDisconnect);
  try{File.Delete(GuideStatusFile);}catch{}
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

 // Three visible guide NPCs added to the existing village without changing its blocks.
 // They are safe to restore after restarts; the bot list is deduplicated by name.
 private static void InstallGuides(Level lvl){
  if(lvl==null)return;
  if(String.Equals(lvl.MapName,"exploracao",StringComparison.OrdinalIgnoreCase)){InstallWildlife(lvl);return;}
  if(!String.Equals(lvl.MapName,"vila_familia",StringComparison.OrdinalIgnoreCase))return;
  string[] names=new string[]{"Guia_Praca","Guia_Ponte","Guia_Torre"};
  int[,] spots=new int[,]{{92,100},{99,57},{142,88}};
  int created=0,found=0;
  for(int n=0;n<names.Length;n++){
   bool exists=false;
   foreach(PlayerBot existing in lvl.Bots.Items){
    if(existing.name.Equals(names[n],StringComparison.OrdinalIgnoreCase)){exists=true;found++;break;}
   }
   if(exists)continue;
   int x=spots[n,0],z=spots[n,1],ground=43;
   for(int y=lvl.Height-4;y>1;y--){
    if(lvl.GetBlock((ushort)x,(ushort)y,(ushort)z)!=0){ground=y+2;break;}
   }
   PlayerBot guide=new PlayerBot(names[n],lvl);
   guide.Owner="GamesForChildren";
   guide.SetInitialPos(Position.FromFeetBlockCoords(x,ground,z));
   guide.TargetPos=Position.FromFeetBlockCoords(x+2,ground,z+1);
   guide.movement=true;guide.movementSpeed=4;
   guide.SetYawPitch(0,0);
   guide.Instructions.Add(new MCGalaxy.Bots.WalkInstruction().Parse(new string[]{"walk",(x+2)*32+"",ground*32+"",(z+1)*32+"","0","0"}));
   guide.Instructions.Add(new MCGalaxy.Bots.WalkInstruction().Parse(new string[]{"walk",(x-1)*32+"",ground*32+"",(z-1)*32+"","0","0"}));
   PlayerBot.Add(guide);
   created++;found++;
  }

  // Peaceful ambient animals. These are actual ClassiCube model entities,
  // not hostile modern Minecraft mobs, and they do not destroy blocks.
  string[] critters=new string[]{"Ovelha_01","Ovelha_02","Porquinho_01","Porquinho_02","Galinha_01"};
  string[] models=new string[]{"sheep","sheep","pig","pig","chicken"};
  int[,] areas=new int[,]{{83,118},{113,120},{111,86},{76,117},{118,109}};
  int animalCount=0;
  for(int a=0;a<critters.Length;a++){
   bool exists=false;
   foreach(PlayerBot bot in lvl.Bots.Items)if(bot.name==critters[a]){exists=true;break;}
   if(exists){animalCount++;continue;}
   int x=areas[a,0],z=areas[a,1],ground=44;
   for(int y=lvl.Height-5;y>1;y--)if(lvl.GetBlock((ushort)x,(ushort)y,(ushort)z)!=0){ground=y+2;break;}
   PlayerBot animal=new PlayerBot(critters[a],lvl);
   animal.Owner="GamesForChildren";animal.SetModel(models[a]);
   animal.SetInitialPos(Position.FromFeetBlockCoords(x,ground,z));
   animal.TargetPos=Position.FromFeetBlockCoords(x+2,ground,z+1);
   animal.movement=true;animal.movementSpeed=3;
   animal.Instructions.Add(new MCGalaxy.Bots.WalkInstruction().Parse(new string[]{"walk",(x+3)*32+"",ground*32+"",(z+2)*32+"","0","0"}));
   animal.Instructions.Add(new MCGalaxy.Bots.WalkInstruction().Parse(new string[]{"walk",(x-2)*32+"",ground*32+"",(z-2)*32+"","0","0"}));
   PlayerBot.Add(animal);
   animalCount++;
  }
  // Written only after verification against real loaded bot entities, not on DLL compilation.
  try{File.WriteAllText(GuideStatusFile,"map="+lvl.MapName+"\ncount="+found+"\ncreated="+created+"\nanimals="+animalCount+"\nupdated="+DateTime.UtcNow.ToString("O")+"\n");}
  catch(Exception e){Logger.Log(LogType.Warning,"FamilyPlay guide status: "+e.Message);}
 }

 // Real MCGalaxy bot movement requires 'movement=true' and a TargetPos;
 // WalkInstruction entries alone do not start autonomous motion.
 private static void WanderBots(){
  int moved=0,total=0;
  foreach(Level level in LevelInfo.Loaded.Items){
   if(level.MapName!="vila_familia"&&level.MapName!="exploracao"&&level.MapName!="mineracao"&&level.MapName!="mineracao")continue;
   foreach(PlayerBot bot in level.Bots.Items){
    if(bot.Owner!="GamesForChildren")continue;
    total++;
    string key=level.MapName+"/"+bot.name;
    Position home;
    if(!botHomes.TryGetValue(key,out home)){home=bot.Pos;botHomes[key]=home;}
    Position previous;
    if(lastBotPositions.TryGetValue(key,out previous)&&(previous.X!=bot.Pos.X||previous.Z!=bot.Pos.Z))moved++;
    lastBotPositions[key]=bot.Pos;
    bool reverse;
    botPhases.TryGetValue(key,out reverse);
    botPhases[key]=!reverse;
    int dx=reverse?-2:3,dz=reverse?-2:2;
    bot.TargetPos=new Position(home.X+dx*32,home.Y,home.Z+dz*32);
    bot.movement=true;
    bot.movementSpeed=bot.name.StartsWith("Guia_")?4:3;
   }
  }
  try{File.WriteAllText("properties/gfc-family-bot-movement.status","total="+total+"\nmoved="+moved+"\nupdated="+DateTime.UtcNow.ToString("O")+"\n");}
  catch(Exception e){Logger.Log(LogType.Warning,"NPC movement status: "+e.Message);}
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
     string[] p=line.Split('|');if(p.Length!=8||!users.ContainsKey(p[0]))continue;
     int[] value=new int[7];bool ok=true;
     for(int i=0;i<7;i++)if(!int.TryParse(p[i+1],out value[i])||value[i]<0||value[i]>100000){ok=false;break;}
     if(!ok)continue;
     bags[p[0]]=new MiningBag(){Wood=value[0],Stone=value[1],Coal=value[2],Iron=value[3],Gold=value[4],Apples=value[5],Tool=Math.Min(3,value[6])};
    }
   }catch(Exception e){Logger.Log(LogType.Warning,"Mining inventory read: "+e.Message);}
  }
 }
 private static void SaveBags(){
  List<string> lines=new List<string>();
  foreach(KeyValuePair<string,MiningBag> item in bags){
   MiningBag b=item.Value;
   lines.Add(item.Key+"|"+b.Wood+"|"+b.Stone+"|"+b.Coal+"|"+b.Iron+"|"+b.Gold+"|"+b.Apples+"|"+b.Tool);
  }
  try{File.WriteAllLines(InventoryFile+".tmp",lines.ToArray());File.Move(InventoryFile+".tmp",InventoryFile,true);}
  catch(Exception e){Logger.Log(LogType.Warning,"Mining inventory save: "+e.Message);}
 }
 private static void MiningChange(Player p,ushort x,ushort y,ushort z,ushort block,bool placing,ref bool cancel){
  if(cancel||p.level==null||p.level.MapName!="mineracao"||!IsAllowed(p)||IsParent(p))return;
  ushort old=p.level.GetBlock(x,y,z);
  MiningBag b=BagFor(p.name);
  int type=placing?block:old;
  if(placing){
   // Only resource blocks need inventory; decorative Classic blocks remain
   // available for children's creativity as a hybrid sandbox.
   bool enough=true;
   lock(Gate){
    if(type==1||type==4){enough=b.Stone>0;if(enough)b.Stone--;}
    else if(type==5||type==17){enough=b.Wood>0;if(enough)b.Wood--;}
    else if(type==14){enough=b.Gold>0;if(enough)b.Gold--;}
    else if(type==15){enough=b.Iron>0;if(enough)b.Iron--;}
    else if(type==16){enough=b.Coal>0;if(enough)b.Coal--;}
    if(enough)SaveBags();
   }
   if(!enough){cancel=true;p.RevertBlock(x,y,z);p.Message("&eMine mais recursos antes de construir com esse bloco.");}
   return;
  }
  if(old==0||old==7||old==8||old==9||old==10||old==11)return;
  int required=(old==14?3:old==15?2:(old==16||old==1||old==4?1:0));
  lock(Gate){
   if(required>b.Tool){
    cancel=true;p.RevertBlock(x,y,z);
    p.Message("&eEssa rocha precisa de uma picareta melhor! Abra Familia > Fabricar.");
    return;
   }
   // Rate limit unrealistic instant break macros, but preserve responsiveness.
   long now=DateTime.UtcNow.Ticks,last;
   if(lastMining.TryGetValue(p.name,out last)&&now-last<TimeSpan.TicksPerMillisecond*90){
    cancel=true;p.RevertBlock(x,y,z);return;
   }
   lastMining[p.name]=now;
   if(old==17||old==5)b.Wood++;
   else if(old==1||old==4)b.Stone++;
   else if(old==16)b.Coal++;
   else if(old==15)b.Iron++;
   else if(old==14)b.Gold++;
   else if(old==18 && random.Next(4)==0)b.Apples++;
   else if((old==2||old==3)&&random.Next(25)==0)b.Apples++;
   else return;
   SaveBags();
  }
 }
 private static void ShowBag(Player p){
  lock(Gate){
   MiningBag b=BagFor(p.name);
   string pick=new[]{"Sem picareta","Picareta de madeira","Picareta de pedra","Picareta de ferro"}[b.Tool];
   p.Message("&aMochila: &eMadeira "+b.Wood+" | Pedra "+b.Stone+" | Carvao "+b.Coal);
   p.Message("&aFerro "+b.Iron+" | Ouro "+b.Gold+" | Macas "+b.Apples);
   p.Message("&bFerramenta: "+pick);
  }
 }
 private static void Craft(Player p,string what){
  lock(Gate){
   MiningBag b=BagFor(p.name),old=b;
   if(what=="madeira"){
    if(b.Tool>=1){p.Message("&eVoce ja tem uma picareta de madeira ou melhor.");return;}
    if(b.Wood<3){p.Message("&ePrecisa de 3 madeiras para criar a picareta.");return;}
    b.Wood-=3;b.Tool=1;
   }else if(what=="pedra"){
    if(b.Tool>=2){p.Message("&eVoce ja tem uma picareta de pedra ou melhor.");return;}
    if(b.Wood<2||b.Stone<3){p.Message("&ePrecisa de 2 madeiras e 3 pedras.");return;}
    b.Wood-=2;b.Stone-=3;b.Tool=2;
   }else if(what=="ferro"){
    if(b.Tool>=3){p.Message("&eVoce ja tem uma picareta de ferro.");return;}
    if(b.Wood<2||b.Iron<3){p.Message("&ePrecisa de 2 madeiras e 3 ferros.");return;}
    b.Wood-=2;b.Iron-=3;b.Tool=3;
   }else{p.Message("&eEscolha madeira, pedra ou ferro.");return;}
   SaveBags();p.Message("&aPicareta fabricada! Agora voce minera materiais mais fortes.");
  }
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
   if(level.MapName!="vila_familia"&&level.MapName!="exploracao")continue;
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
 private static Vitals GetVitals(string player){
  Vitals value;if(!vitals.TryGetValue(player,out value)){value=new Vitals();vitals[player]=value;}return value;
 }
 private static void LoadVitals(){
  lock(Gate){
   vitals.Clear();
   try{
    if(!File.Exists(SurvivalFile))return;
    foreach(string line in File.ReadAllLines(SurvivalFile)){
     string[] p=line.Split('|');
     if(p.Length!=4||!users.ContainsKey(p[0]))continue;
     int hp,food;long last;
     if(!int.TryParse(p[1],out hp)||!int.TryParse(p[2],out food)||!long.TryParse(p[3],out last))continue;
     vitals[p[0]]=new Vitals(){Health=Math.Max(1,Math.Min(10,hp)),Hunger=Math.Max(0,Math.Min(10,food)),Last=DateTime.UtcNow.Ticks};
    }
   }catch(Exception error){Logger.Log(LogType.Warning,"Could not load vitals: "+error.Message);}
  }
 }
 private static void SaveVitals(){
  lock(Gate){
   List<string> lines=new List<string>();
   foreach(KeyValuePair<string,Vitals> pair in vitals){
    Vitals v=pair.Value;lines.Add(pair.Key+"|"+v.Health+"|"+v.Hunger+"|"+v.Last);
   }
   try{File.WriteAllLines(SurvivalFile+".tmp",lines.ToArray());File.Move(SurvivalFile+".tmp",SurvivalFile,true);}
   catch(Exception error){Logger.Log(LogType.Warning,"Could not save vitals: "+error.Message);}
  }
 }
 private static void UpdateVitals(Player p){
  // Child-friendly simplified survival, not native Java/Bedrock combat.
  // Deplete hunger gradually only while actively moving, never below 1 heart.
  long now=DateTime.UtcNow.Ticks;Vitals v=GetVitals(p.name);
  if(now-v.Last<TimeSpan.TicksPerMinute*3)return;
  v.Last=now;
  if(v.Hunger>0)v.Hunger--;
  else if(v.Health>1)v.Health--;
  SaveVitals();
  if(v.Hunger<=3)p.Message("&eHora do lanche! Abra Familia para comer e recuperar energia.");
 }


 private static void InstallWildlife(Level lvl){
  // Wild animals are decorative, with simple walking paths. Never hostile.
  string[] names={"Ovelha_Bosque","Porco_Montanha","Galinha_Campo","Ovelha_Lago"};
  string[] models={"sheep","pig","chicken","sheep"};
  int[,] places=new int[,]{{187,207},{220,190},{183,167},{245,171}};
  int found=0;
  for(int n=0;n<names.Length;n++){
   bool exists=false;foreach(PlayerBot bot in lvl.Bots.Items)if(bot.name==names[n]){exists=true;break;}
   if(exists){found++;continue;}
   int x=places[n,0],z=places[n,1],ground=47;
   for(int y=lvl.Height-5;y>1;y--){
    if(lvl.GetBlock((ushort)x,(ushort)y,(ushort)z)!=0){ground=y+2;break;}
   }
   PlayerBot animal=new PlayerBot(names[n],lvl);
   animal.Owner="GamesForChildren";animal.SetModel(models[n]);
   animal.SetInitialPos(Position.FromFeetBlockCoords(x,ground,z));
   animal.TargetPos=Position.FromFeetBlockCoords(x+2,ground,z+1);
   animal.movement=true;animal.movementSpeed=3;
   animal.Instructions.Add(new MCGalaxy.Bots.WalkInstruction().Parse(new string[]{"walk",(x+2)*32+"",ground*32+"",(z+1)*32+"","0","0"}));
   animal.Instructions.Add(new MCGalaxy.Bots.WalkInstruction().Parse(new string[]{"walk",(x-2)*32+"",ground*32+"",(z-1)*32+"","0","0"}));
   PlayerBot.Add(animal);found++;
  }
  try{File.WriteAllText("properties/gfc-exploration-animals.status","count="+found+"\n");}catch{}
 }
 // Real in-world quests: progress advances exclusively from server-validated player positions.
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
  lock(Gate){SavePlayerSpot(p,next,yaw,pitch,false);UpdateVitals(p);}
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
    p.Message("&bGuia da Vila: voce encontrou a pista "+q.Stage+" de 3!");
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
   if(cmd=="guia"){
    int index=arg=="praca"?0:arg=="ponte"?1:arg=="torre"?2:-1;
    if(index<0){p.Message("&eEscolha Guia da Praca, Ponte ou Torre no menu Familia.");return;}
    if(!MoveToWorld(p,"vila_familia"))return;
    p.BlockUntilLoad(10);
    int[,] places=new int[,]{{90,45,101},{102,43,58},{140,46,89}};
    // Scan the actual terrain to avoid spawning inside a building or mountain.
    int x=places[index,0],z=places[index,2],ground=places[index,1];
    for(int y=p.level.Height-3;y>1;y--){
     if(p.level.GetBlock((ushort)x,(ushort)y,(ushort)z)!=0){ground=y+2;break;}
    }
    PlayerOperations.TeleportToCoords(p,Position.FromFeetBlockCoords(x,ground,z),p.Rot);
    p.Message("&aGuia encontrado! Ele mostra um dos locais do desafio.");
    return;
   }
   if(cmd=="comer"){
    lock(Gate){
     MiningBag bag=BagFor(p.name);
     if(bag.Apples<1){p.Message("&eVoce precisa encontrar macas minerando folhas no Mundo Mineracao!");return;}
     bag.Apples--;SaveBags();
     Vitals v=GetVitals(p.name);v.Hunger=Math.Min(10,v.Hunger+4);v.Health=Math.Min(10,v.Health+1);SaveVitals();
    }
    p.Message("&aMaca consumida! Energia recuperada.");
    return;
   }
   if(cmd=="mochila"){ShowBag(p);return;}
   if(cmd=="criar"){Craft(p,arg);return;}
   if(cmd=="minerar"){if(MoveToWorld(p,"mineracao"))p.Message("&aBem-vindo ao Mundo Mineracao! Corte uma arvore e fabrique ferramentas.");return;}
   if(cmd=="tesouro"||cmd=="corrida"){StartAdventure(p,cmd);return;}
   if(cmd=="premios"){ShowAdventures(p);return;}
   if(cmd=="pele") {
    if(arg!="azul"&&arg!="verde"&&arg!="rosa"&&arg!="roxo"){p.Message("&eEscolha uma cor do menu Familia.");return;}
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
   p.Message("&T/familia comer &H- Consumir uma maca coletada");
   p.Message("&T/familia minerar &H- Minerar no novo mundo");
   p.Message("&T/familia mochila &H- Ver madeira, minerais e comida");
   p.Message("&T/familia criar madeira &H- Fabricar picareta");
   p.Message("&T/familia guia praca &H- Visitar NPCs da Vila");
  }
 }
}
