const ical = require('ical-generator');
const DynamoDB = require('aws-sdk').DynamoDB
/**
 * Builds an ics calendar out of the competitions from the database
 * All the dates need to be either in moment or Date format
 * @param {*} cal
 * @param {*} comps
 */
function buildICS(cal, data){
    let comps = data.Items
    for (let i = 0; i < comps.length; i++) {
        // Extract comp from Dynamo DB format
        const comp = comps[i];
        Object.keys(comp).map( x => comp[x] = comp[x].S )
        console.log(comp);
        // Add event for the competition
        cal.createEvent({
            start: new Date(comp["start_date"]+"T07:00:00"),
            end: new Date(comp["end_date"]+"T18:00:00"),
            summary: `${comp['name']} in ${comp['city']}`,
            organizer: {
                name: `${comp['name']} Organization Team`,
                email: "todo@todo.com"
            },
            location: comp['venue_address'],
            discription: comp["name"],
            url: comp["url"]
        });
        // Add Event for the registration open
        const event = cal.createEvent({
            start: new Date(comp["registration_open"]),
            summary: `Registration for ${comp['name']} in ${comp['city']}`,
            organizer: {
                name: `${comp['name']} Organization Team`,
                email: "todo@todo.com"
            },
            location: comp['url'] + "/register",
            discription: "Registration "+ comp["name"],
            url: comp["url"],
        });
        // Create alarm for registration open 15 minutes before
        event.createAlarm({
            type: 'display',
            trigger: 15 * 60,
        });
    }


    // get the iCal string
    return cal.toString()
}
/**
 * We need to dynamically generate the filter expression as there
 * is no way of knowing how many regions/subregions the user will input
 * A FilterExpression looks like this:
 *  #key IN (list_of_regions) AND sub_region IN (list_of_sub_regions)
 * We have to generate the list, as there needs to be a bind parameter for each entry
 * e.g #key IN (:r1,:r2) and sub_region IN (:s1,:s2)
 * The values are bound in @see buildExpressionAttributeValues
 * @param {[String]} region
 * @param {[String]} subregion
 */

function buildFilterExpression(region, subregion){
    const region_query = region.map((_,i) => `:r${i}`).join(',')
    let subregion_query = ""
    if (subregion.length > 0){
        subregion_query = ` AND sub_region IN(${subregion.map((_,i) => `:s${i}`).join(',')})`
    }
    return `#key IN(${region_query})${subregion_query}`
}
/**
 * Dynamically creates the bindings for the FilterExpression build in @see buildFilterExpression
 * @param {[String]} region
 * @param {[String]} subregion
 */
function buildExpressionAttributeValues(region, subregion){
    const ExpressionAttributeValues = {}
    region.forEach((val,i) => ExpressionAttributeValues[`:r${i}`] = {S: val})
    // The Subregion Data is currently saved with a space in front of it i.e
    // " New York", which is why a space needs to be added here TODO: Change the values in the database
    subregion.forEach((val,i) => ExpressionAttributeValues[`:s${i}`] = {S: " "+val})
    return ExpressionAttributeValues;
}

/**
 * Gets the competitions out of the database that match the
 * region and subregion
 * @param {[String]} region
 * @param {[String]} subregion
 */
async function getCompetitions(region, subregion){
    const dynamo = new DynamoDB()
    let params = {
        TableName : process.env.TABLE_NAME,
        FilterExpression: buildFilterExpression(region, subregion),
        ExpressionAttributeNames:{
            "#key": process.env.TABLE_PARTITION_KEY
        },
        ExpressionAttributeValues: buildExpressionAttributeValues(region, subregion)
    };
    return dynamo.scan(params).promise();
}

/**
 * Main entry point for the lambda function, you can see all the data it contains
 * here :https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 */
exports.handler = async function(event, context){

    // path is /{region}/{subregion}
    // or
    // /{region}+{region}+{region}...
    let region_list;
    if(event && event["path"]){
        region_list = event.path.slice(4).split(/\/|\+/g);
    }
    else{
        region_list = ["DE"]
    }
    // Split into regions and subregions(longer than 2 characters)
    let region = [];
    let subregion = [];
    region_list.forEach( r => {
        if(r.length == 2){
            region.push(r);
        }else{
            subregion.push(r);
        }
    })
    // Create new Calendar
    const cal = ical({
        domain: 'cal.ffgti.org',
        prodId: {company: 'Finn Ickler', product: 'compCal'},
        name: `Competition Calendar for ${region},${subregion}`,
        timezone: 'Europe/Berlin'
    });


    console.log(region,subregion);

    const comps = await getCompetitions(region, subregion);

    const ics = buildICS(cal, comps)

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
        },
        body: ics
    };
}
