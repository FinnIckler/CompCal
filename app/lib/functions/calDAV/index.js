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

async function getCompetitions(region){
    const dynamo = new DynamoDB()
    const ExpressionAttributeValues = {}
    region.forEach((val,i) => ExpressionAttributeValues[`:v${i}`] = {S: val})
    const FilterExpression = `#ky IN(${region.map((_,i) => `:v${i}`).join(',')})`
    
    let params = {
        TableName : process.env.TABLE_NAME,
        FilterExpression: FilterExpression,
        ExpressionAttributeNames:{
            "#ky": process.env.TABLE_PARTITION_KEY
        },
        ExpressionAttributeValues: ExpressionAttributeValues
    };
    return dynamo.scan(params).promise();
}


exports.handler = async function(event, context){

    // path is /{region}/{subregion}
    // or
    // /{region}+{region}+{region}...
    let region;
    if(event && event["path"]){
        region = event.path.slice(4).split(/\/|\+/g);
    }
    else{
        region = ["DE"]
    }

    // Create new Calendar
    const cal = ical({
        domain: 'cal.ffgti.org',
        prodId: {company: 'Finn Ickler', product: 'compCal'},
        name: `Competition Calendar for ${region}`,
        timezone: 'Europe/Berlin'
    });

    // Load the competitions for the region from Dynamo
    console.log(region)
    const comps = await getCompetitions(region);

    const ics = buildICS(cal, comps)
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
        },
        body: ics
    };
}