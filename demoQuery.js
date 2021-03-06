const http = require('http');
const url = require('url');
const request = require('request');


http.createServer(function (req, res) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	var q = url.parse(req.url, true).query;

	var buildStatus = q.state;
	var commitSHA = q.sha;
	var namespace = q.namespace;
	var buildName = q.buildName;
	var deployURL = q.deployURL;
	var buildURL = q.buildURL;


	if (typeof commitSHA === 'undefined' || typeof buildStatus === 'undefined') {
		var errorText;
		if (typeof commitSHA === 'undefined') {
			console.log("The commit sha is undefined!");
		}
		if (typeof buildStatus === 'undefined') {
			console.log("The build state is undefined");
		}
		console.log("Ignoring request...");
		return;
	}

	console.log("Received a request with status: " + buildStatus);

	request({
		url: `https://slack.com/api/channels.history?token=${process.env.SLACK_TOKEN}&channel=CJG5P1K7C&pretty=1`,
		method: 'POST',
	}, async (err, resp, body) => {
		if (err == null) {
			var messages = JSON.parse(body).messages;

			for(var i = 0; i < messages.length; i++) {
				if (messages[i].text.includes(commitSHA)) {
					// Correct message found!
					request({
						url: getThreadURL(messages[i]),
						method: 'POST'
					}, (err, resp, body) => {
						//console.log("Heres the reply message logs:\nErr: " + err + "\nresp: " + resp + "\nbody: " + body);	
					});
					await sleep(500);
					request({
						url: getUpdateURL(buildStatus, messages[i], commitSHA),
						method: 'POST'
					}, (err, resp, body) => {
						//console.log("Heres the edit message logs:\nErr: " + err + "\nresp: " + resp + "\nbody: " + body);	
					});
					//console.log("Correct message found!" + messages[i].text + "\n\n");
					return;
				}
			}
			// There has been no message from this commit
			//console.log("inget tidigare meddelande hittat, skickar ett nytt\n\n");
				request({
					url: getInitialMessage(commitSHA, namespace, buildName, deployURL, buildURL),
					method: 'POST'
				}, (err, resp, body) => {
					//console.log("Heres the initial message logs:\nErr: " + err + "\nresp: " + resp + "\nbody: " + body);	
				});
		}
	});
	res.end("Standard response, funkar bra hittills");
}).listen(8080);

function getThreadURL(message) {
	if (typeof message.blocks === 'undefined') {
		console.log("Selected message doesn't have a block");
		return "";
	}
	var replyMessage = message.blocks[0].text.text;
	return `https://slack.com/api/chat.postMessage?channel=CJG5P1K7C&token=${process.env.SLACK_TOKEN}&text=` + replyMessage + "&thread_ts=" + message.ts + "&username=DevopsBot&pretty=1"
}

function getUpdateURL(buildStatus, message, commitSHA) {
	var slackMessage;
	switch(buildStatus) {
		case "testing":
			slackMessage = "Currently running your tests! :runner:";
			break;
		case "failure": // test fails
			slackMessage = "Some tests failed! :negative_squared_cross_mark:";
			break;
		case "pending": // test succeeds
			slackMessage = "Tests succeeded! :heavy_check_mark:\nDeployment is pending...";
			break;
		case "success":
			slackMessage = "The application is now deployed :joy::ok_hand::joy::ok_hand::airplane_departure:";
			break;
		default:
			console.log("Error: Couln't find the build status: " + buildStatus + "\n\n");
			slackMessage = "Error, undefined state!";
			break;
	}

	message.blocks[2].fields[1].text = "*Latest update:*\n" + getCurrentDate();

	message.blocks[0].text.text = slackMessage;
	console.log("Sending block with header: " + message.blocks[0].text.text + "\n");
	return `https://slack.com/api/chat.update?token=${process.env.SLACK_TOKEN}&channel=CJG5P1K7C&text=` + commitSHA + "&blocks=" + JSON.stringify(message.blocks) + "&ts=" + message.ts + "&pretty=1";
}

function getInitialMessage(commitSHA, namespace, buildName, deployURL, buildURL) {
	var message = "There has been a commit! Tests are currently running on your latest version :runner:";
	lastUpdate = getCurrentDate();

	return `https://slack.com/api/chat.postMessage?token=${process.env.SLACK_TOKEN}&channel=CJG5P1K7C&text=` + commitSHA + "&blocks=" + getBlock(message, buildName, lastUpdate, deployURL, namespace, buildURL, commitSHA) + "&username=DevopsBot&pretty=1";
}

function getCurrentDate() {
	var time = new Date();
	return ((time.getDate() < 10)?"0":"") 
		+ time.getDate() + "/" + (((time.getMonth()+1) < 10)?"0":"") 
		+ (time.getMonth()+1) + "/" + time.getFullYear() 
		+ " " 
		+ ((time.getHours() < 10)?"0":"") + (time.getHours() + 2) + ":" 
		+ ((time.getMinutes() < 10)?"0":"") + time.getMinutes() + ":" 
		+ ((time.getSeconds() < 10)?"0":"") + time.getSeconds();
}

function getBlock(headMessage, buildName, lastUpdate, deploymentLink, namespace, buildSource, sha) {

	return "[{\"type\": \"section\",\"text\": {	\"type\": \"mrkdwn\",	\"text\": \"" + headMessage + "\" }},{\"type\": \"divider\"	},{\"type\": \"section\",	\"fields\": [	 {\"type\": \"mrkdwn\",\"text\": \"*Latest update:*\n" + lastUpdate + "\"},{\"type\": \"mrkdwn\",\"text\": \"*Deployment link:*\n<" + deploymentLink + "|" + buildName + ">\"},{\"type\": \"mrkdwn\",\"text\": \"*Namespace:*\n" + namespace + "\"},{\"type\": \"mrkdwn\",\"text\": \"*Build src:*\n<" + buildSource + "|" + buildSource.split("/")[3] + "/" + buildSource.split("/")[4] + ">\"}]}]";
}

async function sleep(msec) {
	return new Promise(resolve => setTimeout(resolve, msec));
}
