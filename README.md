# CompCal
CompCal is a Serverless Calendar Server that allows users to subscribe to events in the Calendar.
It is not a full implementation of CalDAV, as there is no way of adding your own events or user managment.

## Architecture
CompCal is based on AWS Lambda and delivers the events as ics

![Architecture](./Architecture.png)
## Deployment
This app is build using the AWS CDK, the Lambda functions, the DynamoDB Table and the API Gateway are deployed automatically using the CDK cli.

Step by step instructions:  
1. Set Up your AWS Credentials
2. Run npm install
3. Run cdk deploy

## Setting up the Calendar
You can find instructions how to set CompCal up with your Calendar Client at setup.cal.ffgti.org

## Subscribe to a Region:
- Subscribe to a single Country: https://cal.ffgti.org/v0/{region code} e.g https://cal.ffgti.org/v0/GB 
- Subscribe to multiple Countries: https://cal.ffgti.org/v0/{region code}+{region code} e.g https://cal.ffgti.org/v0/GB+DE 
- Subscribe to a sub region: https://cal.ffgti.org/v0/{region code}/{subregion} e.g https://cal.ffgti.org/v0/US/California 

## State of the Project
You can already subscribe to the calendars by the means mentioned above. There are still a lot of features to come and some bugs to work out, especially around time zones for competitions. 
