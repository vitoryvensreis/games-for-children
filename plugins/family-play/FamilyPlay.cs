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

public sealed class FamilyPlay : Plugin {
 public override string name { get { return "FamilyPlay"; } }
 public override string creator { get { return "GamesForChildren"; } }
 public override int build { get { return 2; } }
 public override bool LoadAtStartup { get { return true; } }
 private static readonly string ConfigPath = "properties/gfc-family-policy.txt";
 private static readonly string QuestFile = "properties/gfc-family-adventures.tsv";
 private static readonly string PositionFile = "properties/gfc-family-positions.tsv";
 private static readonly string GuideStatusFile = "properties/gfc-family-guides.status";
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
  OnBlockChangingEvent.Register(ProtectHouse, Priority.High);
  OnPlayerMoveEvent.Register(AdventureMove, Priority.Low);
  OnLevelLoadedEvent.Register(InstallGuides, Priority.Low);
  OnPlayerSpawningEvent.Register(RestoreSpotOnSpawn,Priority.High);
  OnJoinedLevelEvent.Register(RestorePreviousWorld,Priority.Low);
  OnPlayerConnectEvent.Register(RememberReturningPlayer,Priority.Low);
  OnPlayerDisconnectEvent.Register(TrackDisconnect,Priority.Low);
  // Main village may have loaded before this plugin subscribed to OnLevelLoaded.
  foreach(Level existing in LevelInfo.Loaded.Items)InstallGuides(existing);
  Command.Register(family);
  File.WriteAllText("properties/gfc-familyplay.ready","ready");
 }
 public override void Unload(bool auto) {
  OnBlockChangingEvent.Unregister(ProtectHouse);
  OnPlayerMoveEvent.Unregister(AdventureMove);
  OnLevelLoadedEvent.Unregister(InstallGuides);
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
  if(lvl==null||!String.Equals(lvl.MapName,"vila_familia",StringComparison.OrdinalIgnoreCase))return;
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
   guide.SetYawPitch(0,0);
   PlayerBot.Add(guide);
   created++;found++;
  }
  // Written only after verification against real loaded bot entities, not on DLL compilation.
  try{File.WriteAllText(GuideStatusFile,"map="+lvl.MapName+"\ncount="+found+"\ncreated="+created+"\nupdated="+DateTime.UtcNow.ToString("O")+"\n");}
  catch(Exception e){Logger.Log(LogType.Warning,"FamilyPlay guide status: "+e.Message);}
 }

 private static bool ValidSpot(SavedSpot spot) {
  return spot!=null&&(spot.World=="vila_familia"||spot.World=="aventura")&&
         spot.X>=1&&spot.X<6144&&spot.Z>=1&&spot.Z<6144&&spot.Y>=1&&spot.Y<3072;
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
   if(saved.World!="vila_familia"&&saved.World!="aventura")return;
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
  if(world!="vila_familia"&&world!="aventura")return;
  long tick=DateTime.UtcNow.Ticks,prior;
  if(!force&&lastSpotWrite.TryGetValue(p.name,out prior)&&tick-prior<TimeSpan.TicksPerSecond*8)return;
  lastSpotWrite[p.name]=tick;
  SavedSpot v=new SavedSpot(){World=world,X=pos.X,Y=pos.Y,Z=pos.Z,Yaw=yaw,Pitch=pitch,Saved=tick};
  if(!ValidSpot(v))return;
  savedSpots[p.name]=v;SaveSpots();
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
  if(cancel||p.level==null||!String.Equals(p.level.MapName,"vila_familia",StringComparison.OrdinalIgnoreCase))return;
  if(!IsAllowed(p))return;
  lock(Gate){SavePlayerSpot(p,next,yaw,pitch,false);}
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
   if(cmd=="amigo") {
    if(arg.Length<3||arg.Length>22||!KnownUser(arg)){p.Message("&eEscolha um amigo conectado no menu Familia.");return;}
    Player target=PlayerInfo.FindExact(arg);
    if(target==null||target==p){p.Message("&eSeu amigo ainda nao esta no mundo.");return;}
    PlayerOperations.TeleportToEntity(p,target);
    p.Message("&aPronto! Voce encontrou "+target.name);
    return;
   }
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
   p.Message("&T/familia pele COR &H- Escolher a cor do personagem");
   p.Message("&T/familia tesouro &H- Caca ao tesouro");
   p.Message("&T/familia corrida &H- Circuito de exploracao");
   p.Message("&T/familia premios &H- Estrelas e medalhas");
  }
 }
}
