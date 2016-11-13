'use strict';

// Configure the next 4 lines
const DYNAMODBTABLE = 'pingdom-cache';
const PINGDOMUSER = 'someone@example.com';
const PINGDOMPASS = 'yourpingdompassword';
const PINGDOMAPPKEY = 'yourpingdomappkey';

const botBuilder = require('claudia-bot-builder');
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const slackDelayedReply = botBuilder.slackDelayedReply;
var pingdomApi = require('pingdom-api')({
  user: PINGDOMUSER,    // user account login 
  pass: PINGDOMPASS,    // user account password 
  appkey: PINGDOMAPPKEY // pingdom application key 
});
const dynamodb = new AWS.DynamoDB();

const api = botBuilder((message, apiRequest) => {
  console.log('Received message:', JSON.stringify(message, null, 2));
  var resp = '';
  if (message.text.substr(0, 5) == 'show ') message.text = message.text.substr(5);
  if ( message.text == 'all' ||
      message.text == 'summary' ||
      message.text == 'status' ||
      message.text == 'down' ||
      message.text == 'external' ||
      message.text == 'internal' ||
      message.text == 'customers' ||
      message.text == 'unstable' ||
      message.text.substr(0, 9) == 'diagnose ') {
    // Invoke the same Lambda function asynchronously.
    // Do not wait for the response.
    // This allows the initial request to end within three seconds,
    // as requiured by Slack.
    return new Promise((resolve, reject) => {
      console.log("Invoking: ", apiRequest.lambdaContext.functionName, " - ", message.text);
      lambda.invoke({
  	FunctionName: apiRequest.lambdaContext.functionName,
  	InvocationType: 'Event',
  	Payload: JSON.stringify({
          slackEvent: message,    // This will enable us to detect the
                                  // event later and filter it.
          apiRequest: apiRequest  // Pass on the original apiRequest as well.
        }),
  	Qualifier: apiRequest.lambdaContext.functionVersion
      }, (err, done) => {
        if (err) return reject(err);
        resolve();
      });
    })
      .then(() => {
        if (message.text.substr(0, 9) == 'diagnose ')
          resp = randomWaitText() + "let me try to diagnose that for you.";
        else if (message.text == 'unstable')
          resp = randomWaitText() + "let me take a look.\nNote: I'm only considering customer websites.";
        else
          resp = randomWaitText() + "I'll check Pingdom and get back to you.";
        return { // the initial response
          text: `${resp}`,
          response_type: 'in_channel'
        }
      })
      .catch(() => {
        return `Sorry, I'm having trouble functioning right now :(`
      });
  }
  else if (message.text.substr(0, 12) == 'sitesummary ' ||
           message.text.substr(0, 8) == 'summary ' ||
           message.text.substr(0, 7) == 'status ') {
    if (message.text.substr(0, 12) == 'sitesummary ') var name = message.text.substr(12);
    if (message.text.substr(0, 8) == 'summary ') var name = message.text.substr(8);
    if (message.text.substr(0, 7) == 'status ') var name = message.text.substr(8);
    var newmessage = message;
    newmessage.text = "sitesummary";
    console.log("name = ", name);
    // Get id from dynamodb
    // Invoke the same Lambda function asynchronously.
    // Do not wait for the response.
    // This allows the initial request to end within three seconds,
    // as requiured by Slack.
    var sitesummaries = {};
    return new Promise((resolve, reject) => {
      dynamodb.scan({ TableName : DYNAMODBTABLE }, function(err, data) {
        if (err) {
          console.log("Scan error: ", err);
          return reject(err);
        }
        else {
          //console.log(JSON.stringify(data));
          sitesummaries = data.Items;
          resolve();
        }
      });
    })
      .then(() => {
        console.log(JSON.stringify(sitesummaries));
        var id = '';
        var possibles = '';
        var matchcount = 0;
        var exactmatch = new RegExp('^'+name+'$', 'i');
        var loosematch = new RegExp('.*'+name+'.*', 'i');
        for (var site in sitesummaries) {
          site = sitesummaries[site];
          // console.log(site.id.S);
          if (site.name.S.match(exactmatch)) {
            console.log("We have an exact match: ", site.id.S);
            matchcount = 1;
            id = site.id.S;
            break;
          }
          if (site.name.S.match(loosematch)) {
            console.log("We have a match: ", site.id.S);
            matchcount++;
            possibles += site.name.S+", ";
            id = site.id.S;
          }
        }
        if (matchcount > 1) {
          resp = "Hmmm... which of the following do you mean? "+possibles;
          resp = resp.substring(0, resp.length - 2); // remove trailing ", "
        }
        else if (matchcount == 0) {
          resp = "Sorry... I dunno which website you mean :-(";
        }
        else {
          newmessage["id"] = id;
          return new Promise((resolve, reject) => {
            console.log("Invoking: ", apiRequest.lambdaContext.functionName, " - ", newmessage.text);
            lambda.invoke({
  	      FunctionName: apiRequest.lambdaContext.functionName,
  	      InvocationType: 'Event',
  	      Payload: JSON.stringify({
                slackEvent: message,    // This will enable us to detect the
                                        // event later and filter it.
                apiRequest: apiRequest  // Pass on the original apiRequest as well.
              }),
  	      Qualifier: apiRequest.lambdaContext.functionVersion
            }, (err, done) => {
              if (err) return reject(err);
              resolve();
            });
          })
        }
      })
      .then(() => {
        if (resp == '') resp = randomWaitText() + "I'll take a look.\n";
        return {
          text: `${resp}`,
          response_type: 'in_channel'
        }
      })
      .catch(() => {
        return `Sorry, I'm in a mess :(`
      });
  }
  else if (message.text == 'help') {
    return {
      text: `I can tell you about the state of the websites we monitor using Pingdom. Try one of 'all', 'summary', 'status', 'down', 'external', 'internal', 'customers', 'unstable', 'summary website_name' or 'diagnose website_name'.`,
      response_type: 'ephemeral'
    }
  }
  else {
    return {
      text: `Sorry, I have no idea what you are banging on about. Try 'help'.`,
      response_type: 'ephemeral'
    }
  }
});

// this will be executed before the normal routing.
// We detect if the event has a slackEvent flag, and
// if so, avoid normal procesing, running a delayed response instead

api.intercept((event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  if (!event.slackEvent) // if this is a normal web request, let it run
    return event;

  randomPause() // make it feel a bit more like we are actually talking to a person
  // console.log('Received slackEvent:', JSON.stringify(event, null, 2));
  var resp = '';
  var summary;
  var websites;
  var closerlookids = [];
  var closerlooknames = [];
  var message = event.slackEvent;
  if (message.text.substr(0, 5) == 'show ') message.text = message.text.substr(5);
  // console.log('Message:', JSON.stringify(message, null, 2));
  // console.log('Message:', message.text);

  if ( message.text == 'all' ||
      message.text == 'down' ||
      message.text == 'external' ||
      message.text == 'internal' ||
      message.text == 'customers' ||
      message.text == 'unstable') {
    var qs;
    if (message.text == 'external') qs = { "qs" : { "tags" : "external" } };
    else if (message.text == 'internal') qs = { "qs" : { "tags" : "internal" } };
    else if (message.text == 'customers') qs = { "qs" : { "tags" : "customer" } };
    else if (message.text == 'unstable') qs = { "qs" : { "tags" : "customer" } };
    else qs = { };
    return new Promise((resolve, reject) => {
      pingdomApi.getChecks(
        qs , function (err, checks, response){
        if (err) {
          console.log("Error: ", err, checks);
          return reject(err);
        }
        console.log("Response: ", checks, response);
        websites = checks;
        resolve();
      });
    })
      .then(() => {
        if (message.text != "summary" && message.text != "status") {
          resp = "Here's a list of the ";
          if (message.text == 'external') resp += "external ";
          if (message.text == 'internal') resp += "Eduserv ";
          if (message.text == 'customers') resp += "customer ";
          resp += "websites that we monitor with Pingdom";
          if (message.text == 'down') resp += " and that are currently down";
          resp += ": \n";
        }
        if (message.text == "unstable") {
          resp = "I suggest taking a closer look at ";
        }
        var w;
        var downcount = 0;
        var upcount = 0;
        for (w=0; w< websites.length; ++w) {
          if (websites[w].status == "up") upcount++;
          else downcount++;  
          if ((message.text == 'down') && websites[w].status == "up") continue;
          var now = new Date();
          var since = new Date(websites[w].lasterrortime * 1000);
          if (message.text != "summary" && message.text != "status" && message.text != "unstable" ) {
            resp += websites[w].name + ": " + websites[w].status;
            if (websites[w].status == "up") resp += " for " + msToString(now - since);
            resp += "\n";
          }
          if (message.text == "unstable") {
            if (since > now - (7*24*60*60*1000)) { // 1 week in ms
              closerlookids.push(websites[w].id);
              closerlooknames.push(websites[w].name);
              resp += websites[w].name + ", ";
            }
          }
        }
        if ((message.text == "unstable") && closerlookids.length == 0)
          resp = randomGoodText() + "all customer websites are looking hunky dory at the moment.\n";
        if (message.text == "unstable" && closerlookids.length > 0) {
          resp = resp.substring(0, resp.length - 2); // remove trailing ", "
          resp += " because these have all been up less than a week.\nTry 'summary website_name'.\n";
        }
        if (message.text == "down" && downcount == 0) resp = randomGoodText() + "nothing is down!\n";
        return slackDelayedReply(message, {
          text: `${resp}`,
          response_type: 'in_channel'
        })
      })
      .then(() => false); // prevent normal execution
  }
  else if (message.text == 'summary' || message.text == 'status') {
    var sitesummaries = {};
    return new Promise((resolve, reject) => {
      dynamodb.scan({ TableName : DYNAMODBTABLE }, function(err, data) {
        if (err) {
          console.log("Scan error: ", err);
          return reject(err);
        }
        else {
          console.log(JSON.stringify(data));
          sitesummaries = data.Items;
          resolve();
        }
      });
    })
      .then(() => {
        var now = new Date();
        var downcount = 0;
        var upcount = 0;
        var slafailcount = 0;
        var slagoodcount = 0;
        var unstablecount = 0;
        for (var site in sitesummaries) {
          site = sitesummaries[site];
          if (site.status.S == 'up') upcount++;
          else downcount++;
          if (site.type.S == 'customer' &&
             (parseFloat(site.availability3months.N) < 9970.0 || parseFloat(site.availability1month.N) < 9970.0))
               slafailcount++;
          else slagoodcount++;
          var since = new Date(site.lasterrortime.N * 1000);
          if (site.type.S == 'customer' && since > now - (7*24*60*60*1000)) // 1 week in ms
            unstablecount++;
        }
        if (downcount == 0) resp = randomGoodText() + "everything is up!\n";
        else if (upcount == 0) resp = randomBadText() + "everything is down!\n";
        else {
          if (upcount == 1) resp = upcount + " website is up and ";
          else resp = upcount + " websites are up and ";
          if (downcount == 1) resp += downcount + " website is down.\n";
          else resp += downcount + " websites are down.\n";
        }
        if (slafailcount == 0) resp += randomGoodText() + "all customer websites are meeting our SLA!\n";
        else if (slagoodcount == 0) resp += randomBadText() + "no customer websites are meeting our SLA!\n";
        else {
          if (downcount == 0) resp += "However, ";
          else resp += "Furthermore, ";
          if (slafailcount == 1) resp += slafailcount + " customer website is NOT meeting our SLA ";
          else resp += slafailcount + " customer websites are NOT meeting our SLA ";
          if (slagoodcount == 1) resp += "(" + slagoodcount + " is).\n";
          else resp += "(" + slagoodcount + " are).\n";
        }
        if (unstablecount > 0) resp += "WARNING: "+unstablecount+" customer websites look like they might be a bit unstable (they've been up less than a week) - try 'show unstable'.\n";
        return slackDelayedReply(message, {
          text: `${resp}`,
          response_type: 'in_channel'
        })
      })
      .then(() => false); // prevent normal execution
  }
  else if (message.text == 'sitesummary') {
    var id = message.id;
    console.log('Sitesummary id: ', id);
    var params = {
      TableName: DYNAMODBTABLE,
      Key: {
        'id': { 'S' : id }
      }
    };
    var sitesummary = {};
    return new Promise((resolve, reject) => {
      dynamodb.getItem(params, function(err, data) {
        if (err) {
          console.log("getItem error: ", err);
          return reject(err);
        }
        else {
          sitesummary = data.Item;
          resolve();
        }
      });
    })
      .then(() => {
        // console.log("getItem response: ", JSON.stringify(sitesummary));
        var now = new Date();
        var myname = sitesummary.name.S;
        resp = "Website summary for: "+sitesummary.name.S+"\n";
        if (sitesummary.type.S == 'customer') resp += "This is a customer website hosted by us.\n";
        if (sitesummary.type.S == 'internal') resp += "This is an internal website hosted by us.\n";
        if (sitesummary.type.S == 'external') resp += "This is an external website hosted by a third-party provider.\n";
        resp += "Status: "+sitesummary.status.S;
        var since = new Date(sitesummary.lasterrortime.N * 1000);
        if (sitesummary.status.S == 'up') {
          resp += " "+msToString(now - since);
        }
        var a = parseFloat(sitesummary.availability1day.N)/100.0;
        resp += "\nAvailability today: "+a+"%\n";
        a = parseFloat(sitesummary.availability1week.N)/100.0;
        resp += "Availability over past week: "+a+"%\n";
        a = parseFloat(sitesummary.availability1month.N)/100.0;
        resp += "Availability over past month: "+a+"%\n";
        a = parseFloat(sitesummary.availability3months.N)/100.0;
        resp += "Availability over past 3 months: "+a+"%\n";
        // since = new Date(sitesummary.cacheupdate.N * 1000);
        // resp += "(Cache last updated: "+msToString(now - since)+")\n";
        // console.log("Cache updated: ", since);
        if (sitesummary.type.S == 'customer' &&
           (parseFloat(sitesummary.availability3months.N) < 9970.0 || parseFloat(sitesummary.availability1month.N) < 9970.0))
             resp += "WARNING: This availability level is below our published SLA.\n";
        return slackDelayedReply(message, {
          text: `${resp}`,
          response_type: 'in_channel'
        });
      })
      .then(() => false); // prevent normal execution
  }
});

function randomBadText() {
  var i = randomInt(100);
  if (i < 20) return "Hmmm, ";
  else if (i < 40) return "Not good... ";
  else if (i <60) return "You might want to sit down for this... ";
  else if (i < 80) return "Shit, ";
  else return "Not great - ";
}

function randomGoodText() {
  var i = randomInt(100);
  if (i < 20) return "It's OK, ";
  else if (i < 40) return "All good... ";
  else if (i <60) return "Awesome... ";
  else if (i < 80) return "Great, ";
  else return "Looking good - ";
}

function randomWaitText() {
  var i = randomInt(100);
  if (i < 20) return "Hang on, ";
  else if (i < 40) return "One moment caller... ";
  else if (i <60) return "One second... ";
  else if (i < 80) return "Hold on, ";
  else return "Let me handle that - ";
}

// Random integer between 0 and high
function randomInt (high) {
  return Math.floor(Math.random() * high);
}

// Blocking pause for up to 3 seconds
function randomPause() {
  var seconds = randomInt(3);
  var waitTill = new Date(new Date().getTime() + seconds * 1000);
  while(waitTill > new Date()){}
}

function msToString(ms) {
  var seconds = Math.round(ms / 1000);
  var years = Math.floor(seconds / 31536000);
  var days = Math.round((seconds % 31536000) / 86400); 
  var hours = Math.floor(((seconds % 31536000) % 86400) / 3600);
//  var minutes = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
//  var seconds = (((seconds % 31536000) % 86400) % 3600) % 60;
  if (years > 1) {
    return "for more than "+years+" years";
  }
  else if (years > 0) {
    return "for more than 1 year";
  }
  else if (days > 1) {
    return "for "+days+" days";
  }
  else if (days > 0) {
    return "for 1 day";
  }
  else if (hours > 1) {
    return "for more than "+hours+" hours";
  }
  else if (hours > 0) {
    return "for more than 1 hour";
  }
  else {
    return "for less than 1 hour";
  }
}

module.exports = api;
