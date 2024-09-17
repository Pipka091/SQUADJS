import BasePlugin from './base-plugin.js';

export default class SLKitControl extends BasePlugin {
  static get description() {
    return (
      'The <code>AutoKickUnassigned</code> plugin will automatically kick players that are not in a squad after a ' +
      'specified ammount of time.'
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      maxVehicleCount: {
        required: false,
        description: 'Максимальное количества человек в тех отряде',
        default: 4
      },
      timeUpdate: {
        required: false,
        description: 'Как часто запускать проверку в секундах',
        default: 30
      }
    };
  }

  /**
   * trackedPlayers[<steam64ID>] = <tracker>
   *
   *  <tracker> = {
   *         player: <playerObj>
   *       warnings: <int>
   *      startTime: <Epoch Date>
   *    warnTimerID: <intervalID>
   *    kickTimerID: <timeoutID>
   *  }
   */
  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.maxVehicleCount = options.maxVehicleCount;
    this.timeUpdate = options.timeUpdate;

    this.trackedPlayers = {};

    this.updateSquadLeadTime = this.timeUpdate * 1000;
    this.players = [];

    this.updateSquadLead = this.updateSquadLead.bind(this);
  }

  async mount(){
    this.updateSquadLead = setInterval(
      this.updateSquadLead,
      this.updateSquadLeadTime
    );
  }

  async updateSquadLead (trackedPlayers){

    if(!this.server.currentLayer.name.includes('Seed')) {

      this.squads = await this.server.rcon.getSquads()
      this.players = await this.server.rcon.getListPlayers();

      if (Object.keys(this.trackedPlayers).length > 0) {
        for (const check in this.trackedPlayers) {
          const checkDate = Date.now() + 1000 * 60 * 6
          if (check.time < checkDate) {
            delete this.trackedPlayers[check.eosID];
          }
        }
      }

      for (const player of this.players) {
        if (player.isLeader && !player.role.includes("SL")) {
          const isTracked = player.eosID in this.trackedPlayers;
          if (!isTracked) {
            const d1 =  Date.now() + 1000 * 60 * 5
            const playerTracker = {
              player: player,
              time: d1
            };
            this.trackedPlayers[player.eosID] = playerTracker;
            continue;
          } else {
            const checkTracker = this.trackedPlayers[player.eosID];
            if (checkTracker.time < Date.now()) {
              await this.server.rcon.execute(`AdminDisbandSquad ${player.teamID} ${player.squadID}`)
              delete this.trackedPlayers[player.eosID];
              continue;
            }
          }

          const playerTime = this.trackedPlayers[player.eosID].time
          const leftTimeSec = Math.floor((playerTime - Date.now()) / 1000)
          this.server.rcon.warn(player.eosID, `Возьмите пожалуйста кит сквадного или сквад расформируется через ${leftTimeSec} секунд`);
          continue;
        }

         if (player.isLeader && (player.role.includes("SLPilot") || player.role.includes("SLCrewman"))) {

           for (const squad of this.squads) {
             if (squad.squadID === player.squadID && squad.size > 4) {
               const isTracked = player.eosID in this.trackedPlayers;
               if (!isTracked) {
                 const d1 =  Date.now() + 1000 * 60 * 5
                 const playerTracker = {
                   player: player,
                   time: d1
                 };
                 this.trackedPlayers[player.eosID] = playerTracker;
               } else {
                 const checkTracker = this.trackedPlayers[player.eosID];
                 if (checkTracker.time < Date.now()) {
                   await this.server.rcon.execute(`AdminDisbandSquad ${player.teamID} ${player.squadID}`)
                   delete this.trackedPlayers[player.eosID];
                   break;
                 }
               }

               const playerTime = this.trackedPlayers[player.eosID].time
               const leftTimeSec = Math.floor((playerTime - Date.now()) / 1000)
               this.server.rcon.warn(player.eosID, `Технический отряд не может иметь больше 4 игроков, сквад расформируется через ${leftTimeSec} секунд`);
               break;
             }
           }
           continue;
         }
         delete this.trackedPlayers[player.eosID];
      }
    }
  }

  async unmount() {
    //  this.server.removeEventListener('NEW_GAME', this.onNewGame);
    //  this.server.removeEventListener('PLAYER_SQUAD_CHANGE', this.onPlayerSquadChange);
    //clearInterval(this.updateTrackingListInterval);
    // clearInterval(this.clearDisconnectedPlayersInterval);
  }
}
