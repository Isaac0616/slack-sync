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
 * Get username by user ID.
 * @param {Object} team
 * @param {Object} userId
 * @return {Promise} username
 */
function getUsername(team, userId) {
  return new Promise((resolve, reject) => {
    if (userId in users) {
      resolve(users[userId].name);
    } else {
      team.web.users.info({user: userId})
        .then((res) => {
          users[userId] = res.user;
          resolve(users[userId].name);
        });
    }
  });
}

/**
 * Preprocess text. Currently fix slack mentions.
 * @param {Object} team
 * @param {Object} text
 * @return {Promise} text
 */
function preprocessText(team, text) {
  const mentionRegex = /<@([A-Z0-9]+)>/;

  return new Promise((resolve, reject) => {
    if (match = text.match(mentionRegex)) {
      getUsername(team, match[1])
        .then((username) => {
          text = text.replace(new RegExp(match[0], 'g'), `@${username}`);
          preprocessText(team, text)
            .then((text) => {
              resolve(text);
            });
        });
    } else {
      resolve(text);
    }
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
          preprocessText(srcTeam, event.text)
            .then((text) => {
              getUsername(srcTeam, event.user)
                .then((username) => {
                  desTeam.web.chat.postMessage({
                    channel: desTeam.channelId,
                    text: text,
                    as_user: false,
                    icon_url: users[event.user].profile.image_48,
                    link_names: true,
                    username: users[event.user].name,
                  });
                });
            });
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
