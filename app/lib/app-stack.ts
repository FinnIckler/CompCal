import * as cdk from '@aws-cdk/core';
import dynamodb =  require('@aws-cdk/aws-dynamodb');
import lambda = require('@aws-cdk/aws-lambda')
import path = require('path')
import {Rule, Schedule} from "@aws-cdk/aws-events"
import { LambdaFunction } from "@aws-cdk/aws-events-targets"
import { Duration } from '@aws-cdk/core';
import apiGateway = require('@aws-cdk/aws-apigateway')
import sns = require('@aws-cdk/aws-sns')

export class AppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The Architecture needs:
    // - 1 DynamoDB Table to Store the Events
    // - x Lambda Functions to handle the incoming calDAV HTTP Calls
    // - 1 Lambda Function to update the Data from the WCA API
    // - 1 SNS Topic which logs how many competitions are inserted into the database 
    // - 1 Cloudwatch Rule that invokes the Lambda function every 6 hours
    // - x Cloudwatch Alarms to notify when a Lambda function fails
    // - 1 API Gateway the routes needed for being compliant with calDAV

    const PARTITION_KEY = "region"
    const SORT_KEY = "id"

    const table = new dynamodb.Table(this, "Events", {
      partitionKey: {
        name : PARTITION_KEY, type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: SORT_KEY, type: dynamodb.AttributeType.STRING
      },
      tableName: "Competitions"
    });

    const IngestionTopic = new sns.Topic(this,'IngestionTopic',{
      displayName: "Ingestion of Calendar Events"
    })

    const crawler = new lambda.Function(this, "Crawler", {
      runtime: lambda.Runtime.PYTHON_3_6,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname,"functions/crawler")),
      environment: {
        TABLE_NAME: table.tableName,
        TOPIC_ARN: IngestionTopic.topicArn
      },
      timeout: Duration.minutes(5),
    })

    const calendarAPI = new lambda.Function(this, "calDAV", {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname,"functions/calDAV")),
      environment: {
        TABLE_NAME: table.tableName,
        TABLE_PARTITION_KEY: PARTITION_KEY,
        TABLE_SORT_KEY: SORT_KEY
      },
      timeout: Duration.minutes(1),
    })

    // API Gateway Routes
    // /calendar/{Region} Region is a iso 2 letter identifier like 'de'
    // /calendar/{Region}/{Sub Region} Sub Region is a string like 'Alaska'
    const api = new apiGateway.LambdaRestApi(this, 'calDAV-api',{
      handler: calendarAPI,
      proxy: true
    })

    table.grantReadWriteData(crawler);
    table.grantReadData(calendarAPI);
    IngestionTopic.grantPublish(crawler);
    const lambdaTarget = new LambdaFunction(crawler)

    new Rule(this, "CrawlWCA", {
      schedule: Schedule.cron({minute: '11', hour: "*/6"}),
      targets: [lambdaTarget]
    })


  }
}
