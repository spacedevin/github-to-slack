/**
 * Forwards github events to slack chanels
 *
 * note that this wont work for really busy repositories
 *
 * https://github.com/arzynik/github-to-slack
 *
 */

console.log('Starting github-to-slack...');

var
	express = require('express'),
	app = express(),
	request = require('request'),
	bodyParser = require('body-parser')
	port = process.env.PORT || process.env.VCAP_APP_PORT || 5000,
	webhook = process.env.SLACK_WEBHOOK_URL || 'YOUR_URL',	// your webhok url 
	room = process.env.SLACK_CHANEL || null,				// default to webhook chanel
	icon_url = process.env.SLACK_ICON_URL || 'https://assets-cdn.github.com/images/modules/logos_page/GitHub-Mark.png',			// url of the icon for your user
	icon_emoji = process.env.SLACK_ICON_EMOJI || null,		// url of the icon for your user
	username = process.env.SLACK_USERNAME || 'GitHub',		// username of the bot
	use_github_users = process.env.SLACK_USE_GITHUB_USERS || null, // use the username and image of the github user performing the action
	queue = [], running = false, users = [], queueTimer = null;

app.use(bodyParser.json());

app.get('/', function(req, res) {
	res.send('Bad kitty. Bad kitty. Bad kitty. Bad kitty. Bad kitty. Bad kitty. Bad kitty. Bad kitty.');
});

// when we get a comment request
app.post('/', function(req, res) {
	var data = req.body;
	
	console.log(data);

	if (data.action == 'created' && data.issue && data.comment) {
		addToQueue({
			type: 'comment',
			data: data
		});
	} else if (data.action == 'closed' && data.issue) {
		addToQueue({
			type: 'issue',
			data: data
		});
	}
});

// add item to que
var addToQueue = function(item) {

	checkUser(item.data.sender);

	var i = item.data.issue.id;
	var u = item.data.sender.id;

	if (!queue[u]) {
		queue[u] = [];
	}
	if (!queue[u][i]) {
		queue[u][i] = [];
	}

	queue[u][i].push(item);
	triggerQueue();
};

// make sure we have the users data
var checkUser = function(u) {
	if (users[u.id]) {
		return;
	}

	request.get({url: u.url, json: true}, function(error, response, user) {
		if (!error && response.statusCode == 200) {
			users[u.id] = user.name;
		}
	});
};

// lazily return the user
var getDisplayUser = function(u) {
	return users[u.id] || u.login;
};

// instead of an interval, just trigger the que being processed when it needs it
var triggerQueue = function() {
	clearTimeout(queueTimer);
	queueTimer = setTimeout(processQueue, 3000);
};

// process queue so we can group comments and issue closings
var processQueue = function() {
	if (!queue.length || running) {
		return;
	}

	running = true;

	// only has 15 seconds to finish. otherwise it will try again
	setTimeout(function() {
		running = false;
	}, 15000);

	// each user
	for (var u in queue) {
		// each issue
		for (var i in queue[u]) {
			// first make sure we have a close action. if its just a comment we dont care.

			if (!queue[u][i]) {
				continue;
			}

			var closeAction = false;
			for (var x in queue[u][i]) {
				if (queue[u][i][x].type == 'issue' && queue[u][i][x].data.action == 'closed') {
					closeAction = queue[u][i][x];
				}
			}

			if (closeAction) {
				var message = '<' + closeAction.data.sender.url + '|' + getDisplayUser(queue[u][i][x].data.sender) + '>' 
					+ ' closed issue <' + closeAction.data.issue.html_url + '|#' + closeAction.data.issue.number + '>: <' + closeAction.data.issue.html_url + '|' + closeAction.data.issue.title + '>';

				for (var x in queue[u][i]) {
					// each comment
					if (queue[u][i][x].type == 'comment') {
						message += "\n" + queue[u][i][x].data.comment.body;
					}
				}

				var data = {
					attachments: [{
						fallback: message,
            			author_name: closeAction.data.sender.login,
            			author_link: closeAction.data.sender.url,
            			author_icon: closeAction.data.sender.avatar_url,
						pretext: 'Issue <' + closeAction.data.issue.html_url + '|#' + closeAction.data.issue.number + '> was closed',
						title: closeAction.data.issue.title,
						title_link: closeAction.data.issue.html_url
					}]
				};

				if (room) {
					data.channel = room;
				}
				
				if (1==2 && use_github_users) {
					data.icon_url = closeAction.data.sender.avatar_url;
					data.username = closeAction.data.sender.login + ' via GitHub';

				} else {

					if (icon_emoji) {
						data.icon_emoji = icon_emoji;
					} else if (icon_url) {
						data.icon_url = icon_url;
					}

					if (username) {
						data.username = username;
					}
				}

				
				console.log(data);

				request.post({
					url: webhook,
					body: data,
					json: true
				}, function(err,res,body) {
					console.log(arguments);
				});
			}	
			queue[u][i] = null;	
		}
	}

	queue = [];
	running = false;
};

app.listen(port, function() {
	console.log('github-to-slack is running on port ' + port);
});