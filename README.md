# AWS Claudia PingdomBot
A Slack bot to see the status of Pingdom website monitoring, built using Claudia.js.
A Slack bot to stop and start selected AWS EC2 instances and generally keep
an eye on your AWS estate. The following commands are available:

    /pingdom help
    /pingdom all
    /pingdom up
    /pingdom down
    /pingdom summary
    /pingdom summary website_name
    /pingdom unstable

The following command are also available, though thes are based on corresponding tags attached to you Pindom checks:

    /pingdom internal
    /pingdom external
    /pingdom customers

The bot is written in Node.js and
runs in AWS Lambda via the API Gateway.
It is deployed using Claudia.js - see
https://claudiajs.com/.

## Installation

Install Claudia.js with:

    npm install claudia -g

Then read https://claudiajs.com/tutorials/hello-world-chatbot.html.

Follow the tutorial and create a project folder
but use the following commands:

    npm init

Give your bot a name - e.g. 'awsbot' - and description
and put your email address
as author. Leave everything else as is. Then install the dependencies with:

    npm install claudia-bot-builder -S
    npm install promise-delay -S
    npm install aws-sdk -S
    npm install pingdom-api -S

Put bot.js in the project folder.

Edit the 4 variables at the top of the file:

DYNAMODBTABLE = 'pingdom-cache';
PINGDOMUSER = 'someone@example.com';
PINGDOMPASS = 'yourpassword';
PINGDOMAPPKEY = 'yourappkey';

Follow https://claudiajs.com/tutorials/installing.html to give Claudia.js
enough AWS access to deploy the Lambda function and API Gateway.

Then deploy your bot to AWS with the following command:

    claudia create --region eu-west-1 --api-module bot

Go to https://api.slack.com/ to configure a new integration
for your Slack team. Then run:

    claudia update --region eu-west-1 --api-module bot --timeout 120 --allow-recursion --configure-slack-slash-command

That's it, you're done.

If you modify the bot.js code, you can redeploy with:

    claudia update

## Removal

To delete everything, try the following:

    claudia destroy
    rm claudia.json

However, sometimes this doesn't seem to work reliably. If so, manually delete
the stuff created under IAM Roles, Lambda functions and API Gateway.
