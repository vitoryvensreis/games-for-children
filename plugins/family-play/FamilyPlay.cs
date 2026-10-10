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

public sealed class FamilyPlay : Plugin {
 public override string name { get { return "FamilyPlay"; } }
 public override string creator { get { return "GamesForChildren"; } }
 public override int build { get { return 1; } }
 public override bool LoadAtStartup { get { return true; } }
 private static readonly string ConfigPath = "properties/gfc-family-policy.txt";
 private static readonly object Gate = new object();
 private static DateTime checkedAt = DateTime.MinValue;
 private static Dictionary<string, string> users = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
 private static Dictionary<int, string> owners = new Dictionary<int, string>();
 private static readonly FamilyCommand family = new FamilyCommand();
 private static readonly int[,] bounds = new int[,] {
  {64,82,82,99},{118,138,82,99},{69,88,122,141},{109,131,121,140}
 };
 private static readonly int[,] homeSpawns = new int[,] {
  {81,45,90},{119,45,90},{87,45,131},{119,45,122}
 };
 private static readonly Dictionary<string, DateTime> warned = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);

 public override void Load(bool auto) {
  Refresh(true);
  OnBlockChangingEvent.Register(ProtectHouse, Priority.High);
  Command.Register(family);
 }
 public override void Unload(bool auto) {
  OnBlockChangingEvent.Unregister(ProtectHouse);
  Command.Unregister(family);
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
  if(p.level==null||!String.Equals(p.level.MapName,"vila_familia",StringComparison.OrdinalIgnoreCase))return;
  if(IsParent(p))return;
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
  }
 }
}
