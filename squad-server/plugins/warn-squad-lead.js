import BasePlugin from './base-plugin.js';

export default class WarnSquadLead extends BasePlugin {
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
      warningMessage: {
        required: false,
        description: 'Message SquadJS will send to players warning them they will be kicked',
        default: 'Join a squad, you are unassigned and will be kicked'
      },
      kickMessage: {
        required: false,
        description: 'Message to send to players when they are kicked',
        default: 'Unassigned - automatically removed'
      },
      frequencyOfWarnings: {
        required: false,
        description:
          'How often in <b>Seconds</b> should we warn the player about being unassigned?',
        default: 30
      },
      unassignedTimer: {
        required: false,
        description: 'How long in <b>Seconds</b> to wait before a unassigned player is kicked',
        default: 360
      },
      playerThreshold: {
        required: false,
        description:
          'Player count required for AutoKick to start kicking players, set to -1 to disable',
        default: 93
      },
      roundStartDelay: {
        required: false,
        description:
          'Time delay in <b>Seconds</b> from start of the round before AutoKick starts kicking again',
        default: 900
      },
      ignoreAdmins: {
        required: false,
        description:
          '<ul>' +
          '<li><code>true</code>: Admins will <b>NOT</b> be kicked</li>' +
          '<li><code>false</code>: Admins <b>WILL</b> be kicked</li>' +
          '</ul>',
        default: false
      },
      ignoreWhitelist: {
        required: false,
        description:
          '<ul>' +
          '<li><code>true</code>: Reserve slot players will <b>NOT</b> be kicked</li>' +
          '<li><code>false</code>: Reserve slot players <b>WILL</b> be kicked</li>' +
          '</ul>',
        default: false
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

    this.adminPermission = 'canseeadminchat';
    this.whitelistPermission = 'reserve';

    this.kickTimeout = options.unassignedTimer * 1000;
    this.warningInterval = options.frequencyOfWarnings * 1000;
    this.gracePeriod = options.roundStartDelay * 1000;

    this.trackingListUpdateFrequency = 1 * 60 * 1000; // 1min
    this.cleanUpFrequency = 20 * 60 * 1000; // 20min

    this.betweenRounds = false;

    this.trackedPlayers = {};

    this.updateSquadLeadTime = 3 * 1000;
    this.players = [];

    this.updateSquadLead = this.updateSquadLead.bind(this);
  }

  async mount(){
    this.updateSquadLead = setInterval(
      this.updateSquadLead,
      this.updateSquadLeadTime
    );
  }

  async updateSquadLead (){
   // console.log("111111111111");
    this.squads = await this.server.rcon.getSquads()
    this.players = await this.server.rcon.getListPlayers();

    for (const player of this.players) {
      console.log(player.name);
      if(player.isLeader && !player.role.includes("SL")){
        console.log(player.role);
        const isTracked = player.eosID in this.trackedPlayers;
        if (!isTracked) {
          var d1 = new Date();
          d1.setMinutes ( d1.getMinutes() );
          const playerTracker = {
            player: player,
            time: d1
          };
          this.trackedPlayers[player.eosID] = playerTracker;
        }
        else{
          var checkTracker = this.trackedPlayers[player.eosID];
          if(checkTracker.time < Date.now()){
          //  await this.server.rcon.execute(`AdminDisbandSquad ${player.teamID} ${player.squadID}`)
           // delete this.trackedPlayers[player.eosID];
            //continue
          }
        }
        this.server.rcon.warn(player.eosID, "Возьмите пожалуйста кит сквадного или сквад расформируется через 180 секунд");
      }

      /* if(player.isLeader && (player.role.includes("SLPilot") || player.role.includes("SLCrewman"))){

        for(const squad of this.squads){
          if(squad.squadID === player.squadID && squad.size > 0){
            this.server.rcon.warn(player.eosID, "Технический отряд не может иметь больше 4 игроков, сквад расформируется через 180 секунд");
            const playerTracker = {
              player: player,
              startTime: Date.now()
            };
            const isTracked = player.eosID in this.trackedPlayers;
            if (!isTracked) this.trackedPlayers[player.eosID] = this.trackPlayer({ playerTracker });
            break;
          }
        }
      } */
    }
  }

  async unmount() {
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
    this.server.removeEventListener('PLAYER_SQUAD_CHANGE', this.onPlayerSquadChange);
    clearInterval(this.updateTrackingListInterval);
    clearInterval(this.clearDisconnectedPlayersInterval);
  }

  async onNewGame() {
    this.betweenRounds = true;
    await this.updateTrackingList();
    setTimeout(() => {
      this.betweenRounds = false;
    }, this.gracePeriod);
  }

  async onPlayerSquadChange(player) {
    console.log("xDDDDDDDDDDDDDDDDDDDDDDDDDDDDD")
    if (player.eosID in this.trackedPlayers && player.squadID !== null)
      this.untrackPlayer(player.eosID);
  }

  async updateTrackingList(forceUpdate = false) {
    const run = !(this.betweenRounds || this.server.players.length < this.options.playerThreshold);

    this.verbose(
      3,
      `Update Tracking List? ${run} (Between rounds: ${
        this.betweenRounds
      }, Below player threshold: ${this.server.players.length < this.options.playerThreshold})`
    );
    if (!run) {
      for (const eosID of Object.keys(this.trackedPlayers)) this.untrackPlayer(eosID);
      return;
    }

    if (forceUpdate) await this.server.updatePlayerList();

    const admins = this.server.getAdminsWithPermission(this.adminPermission, 'eosID');
    const whitelist = this.server.getAdminsWithPermission(this.whitelistPermission, 'eosID');

    // loop through players on server and start tracking players not in a squad
    for (const player of this.server.players) {
      const isTracked = player.eosID in this.trackedPlayers;
      const isUnassigned = player.squadID === null;
      const isAdmin = admins.includes(player.eosID);
      const isWhitelist = whitelist.includes(player.eosID);

      // tracked player joined a squad remove them (redundant afer adding PLAYER_SQUAD_CHANGE, keeping for now)
      if (!isUnassigned && isTracked) this.untrackPlayer(player.eosID);

      if (!isUnassigned) continue;

      if (isAdmin) this.verbose(2, `Admin is Unassigned: ${player.name}`);
      if (isAdmin && this.options.ignoreAdmins) continue;

      if (isWhitelist) this.verbose(2, `Whitelist player is Unassigned: ${player.name}`);
      if (isWhitelist && this.options.ignoreWhitelist) continue;

      // start tracking player
      if (!isTracked) this.trackedPlayers[player.eosID] = this.trackPlayer({ player });
    }
  }

  async clearDisconnectedPlayers() {
    for (const eosID of Object.keys(this.trackedPlayers)) // TRACK
      if (!(eosID in this.server.players.map((p) => p.eosID))) this.untrackPlayer(eosID);
  }

  msFormat(ms) {
    // take in generic # of ms and return formatted MM:SS
    let min = Math.floor((ms / 1000 / 60) << 0);
    let sec = Math.floor((ms / 1000) % 60);
    min = ('' + min).padStart(2, '0');
    sec = ('' + sec).padStart(2, '0');
    return `${min}:${sec}`;
  }

  trackPlayer(info) {
    this.verbose(2, `Tracking: ${info.player.name}`);

    const tracker = {
      player: info.player,
      warnings: 0,
      startTime: Date.now()
    };

    // continuously warn player at rate set in options
    tracker.warnTimerID = setInterval(async () => {
      const msLeft = this.kickTimeout - this.warningInterval * (tracker.warnings + 1);

      // clear on last warning
      if (msLeft < this.warningInterval + 1) clearInterval(tracker.warnTimerID);

      const timeLeft = this.msFormat(msLeft);
      this.server.rcon.warn(tracker.player.eosID, `${this.options.warningMessage} - ${timeLeft}`);
      this.verbose(2, `Warning: ${tracker.player.name} (${timeLeft})`);
      tracker.warnings++;
    }, this.warningInterval);

    // set timeout to kick player
    tracker.kickTimerID = setTimeout(async () => {
      // ensures player is still Unassigned
      await this.updateTrackingList(true);

      // return if player in tracker was removed from list
      if (!(tracker.player.eosID in this.trackedPlayers)) return;

      this.server.rcon.kick(info.player.eosID, this.options.kickMessage);
      this.server.emit('PLAYER_AUTO_KICKED', {
        player: tracker.player,
        warnings: tracker.warnings,
        startTime: tracker.startTime
      });
      this.verbose(1, `Kicked: ${tracker.player.name}`);
      this.untrackPlayer(tracker.player.eosID);
    }, this.kickTimeout);

    return tracker;
  }

  untrackPlayer(eosID) {
    const tracker = this.trackedPlayers[eosID];
    clearInterval(tracker.warnTimerID);
    clearTimeout(tracker.kickTimerID);
    delete this.trackedPlayers[eosID];
    this.verbose(2, `unTrack: ${tracker.player.name}`);
  }
}
