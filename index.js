const {RTMClient, WebClient} = require('@slack/client');
const program = require('commander');
const version = require('./package.json').version;

program
  .version(version)
  .option(
    '-c, --config <config.json>',
    'Set the path of the config file.',
    './config.json'
  )
  .option('-p, --port <port>',
    'Specify the port to be listened.',
    parseInt,
    8000
  )
  .option('-v, --verbose',
    'Show verbose logging.'
  )
  .parse(process.argv);

const config = require(program.config);
let team1 = config.team1;
let team2 = config.team2;

let users = {};

/**
 * Get channel ID from channel name.
 * @param {Object} team
 */
function getChannelId(team) {
  team.web.channels.list()
    .then((res) => {
      for (channel of res.channels) {
        if (channel.name == team.channel) {
          team.channelId = channel.id;
          return;
        }
      }

      console.error(`Channel not found: ${team.channel}`);
      process.exit(1);
    });
}

/**
 * Send messages from srcTeam to desTeam.
 * @param {Object} srcTeam Source team.
 * @param {Object} desTeam Destination team.
 */
function connectTeam(srcTeam, desTeam) {
  srcTeam.rtm.on('message', (event) => {
    if (event.channel == srcTeam.channelId) {
      if (program.verbose) {
        console.log(`#### ${srcTeam.channel}`);
        console.log(event);
      }

      switch (event.subtype) {
        case undefined: // normal message
          if (event.user in users) {
            desTeam.web.chat.postMessage({
              channel: desTeam.channelId,
              text: event.text,
              as_user: false,
              icon_url: users[event.user].profile.image_48,
              link_names: true,
              username: users[event.user].name,
            });
          } else {
            srcTeam.web.users.info({user: event.user})
              .then((res) => {
                users[event.user] = res.user;
                desTeam.web.chat.postMessage({
                  channel: desTeam.channelId,
                  text: event.text,
                  as_user: false,
                  icon_url: users[event.user].profile.image_48,
                  link_names: true,
                  username: users[event.user].name,
                });
              });
          }
          break;
        case 'bot_message':
          // Do nothing to prevent infinit loop.
          break;
        default:
      }
    }
  });
}

team1.rtm = new RTMClient(team1.botToken);
team1.web = new WebClient(team1.botToken);
team1.rtm.start();
getChannelId(team1);
connectTeam(team1, team2);

team2.rtm = new RTMClient(team2.botToken);
team2.web = new WebClient(team2.botToken);
team2.rtm.start();
getChannelId(team2);
connectTeam(team2, team1);
