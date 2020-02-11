# This function is used for both the initial load and the periodical load:
#
# For an initial load all competitions after today are loaded and added to the DynamoDB.
#
# For the periodical load the WCA Competition API is checked every six hours
# to see if there are new competitions that have been announced and added to the DynamoDB.
# We can use the announced_after parameter to only get the new competitions

import json
import os
from datetime import datetime, timedelta
from io import StringIO
from decimal import *

import boto3
from lxml import html
import requests

ddb = boto3.resource("dynamodb")
table = ddb.Table(os.environ["TABLE_NAME"])
sns = boto3.client("sns")
sns_arn = os.environ["TOPIC_ARN"]


def sub_region_if_exists(city):
    if "," in city:
        return city.split(",")[1]
    else:
        return city


# Sadly the API does not provide registration period, crawling it instead
# TODO also get organizer email from here
def get_registration(competition):
    r = requests.get(competition["url"])
    if r.ok:
        f = StringIO(r.text)
        tree = html.parse(f)
        registration_open = tree.xpath(
            "/html/body/div[3]/div/div[2]/div/div[1]/div/div[3]/dl/dd[1]/p/span[1]/@data-utc-time"
        )[0]
        registration_close = tree.xpath(
            "/html/body/div[3]/div/div[2]/div/div[1]/div/div[3]/dl/dd[1]/p/span[2]/@data-utc-time"
        )[0]
        return registration_open, registration_close
    else:
        return competition


# Uses the https://www.worldcubeassociation.org/api/v0/competitions endpoint to fetch
# a list of competitions that where announced after the last run of the lambda function
# There can be only 25 comps on one page, so another page is loaded if 24 competitions are
# returned.


def handler(event, context):
    endpoint = ""
    date = datetime.now()
    # Because of the current way the announced_after paremeter works it only
    # compares the day (this might be fixed in the WCA API)
    filter_announced_after = False
    if "detail-type" in event.keys() and event["detail-type"] == "Scheduled Event":
        filter_announced_after = True
        date = date - timedelta(hours=6)
        endpoint = (
            "https://www.worldcubeassociation.org/api/v0/competitions?q=&announced_after="
            + date.isoformat()
        )
    else:  # initial load
        endpoint = (
            "https://www.worldcubeassociation.org/api/v0/competitions?q=&start="
            + date.isoformat()
        )

    next_page_exists = True
    competitions = []
    i = 1
    while next_page_exists:
        page = requests.get(endpoint + "&page={}".format(i))
        json = page.json(parse_float=Decimal)
        next_page_exists = len(json) == 25
        competitions.extend(json)
        i += 1
    for comp in competitions:
        if filter_announced_after and comp["announced_at"] < date.isoformat():
            continue
        open, close = get_registration(comp)
        comp["registration_open"] = open
        comp["registration_close"] = close
        # filter the comp only for keys we need
        needed_keys = [
            "url",
            "id",
            "name",
            "city",
            "start_date",
            "announced_at",
            "end_date",
            "registration_open",
            "registration_close",
            "venue_address",
        ]
        filtered = {key: comp[key] for key in needed_keys}
        filtered["organizer"] = ",".join(
            map(lambda x: x["email"] if "email" in x.keys() else "no-email", comp["organizers"])
        )
        filtered["region"] = comp["country_iso2"]
        filtered["sub_region"] = sub_region_if_exists(comp["city"])
        table.put_item(Item=filtered)

    sns.publish(
        TopicArn=sns_arn, Message="Inserted {} Events".format(len(competitions))
    )
