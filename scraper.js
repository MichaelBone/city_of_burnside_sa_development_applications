// Parses the development application at the South Australian City of Burnside web site and places
// them in a database.
//
// This is partly based on the scraper at https://github.com/LoveMyData/burnside.
//
// Michael Bone
// 8th July 2018

let cheerio = require("cheerio");
let request = require("request-promise-native");
let sqlite3 = require("sqlite3").verbose();
let urlparser = require("url");
let moment = require("moment");

const DevelopmentApplicationsUrl = "https://www.burnside.sa.gov.au/Planning-Business/Planning-Development/Development-Applications/Development-Applications-on-Public-Notification";
const CommentUrl = "mailto:burnside@burnside.sa.gov.au";

// Sets up an sqlite database.

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        let database = new sqlite3.Database("data.sqlite");
        database.serialize(() => {
            database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
            resolve(database);
        });
    });
}

// Inserts a row in the database if it does not already exist.

async function insertRow(database, developmentApplication) {
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.reason,
            developmentApplication.informationUrl,
            developmentApplication.commentUrl,
            developmentApplication.scrapeDate,
            null,
            null,
            developmentApplication.onNoticeToDate
        ], function(error, row) {
            if (error) {
                console.log(error);
                reject(error);
            }
            else {
                if (this.changes > 0)
                    console.log(`    Inserted: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" into the database.`);
                else
                    console.log(`    Skipped: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" because it was already present in the database.`);
                sqlStatement.finalize();  // releases any locks
                resolve(row);
            }
        });
    });
}

// Pauses for the specified number of milliseconds.

function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// Gets a random integer in the specified range: [minimum, maximum).

function getRandom(minimum, maximum) {
    return Math.floor(Math.random() * (Math.floor(maximum) - Math.ceil(minimum))) + Math.ceil(minimum);
}

// Parses the page at the specified URL.

async function main() {
    // Ensure that the database exists.

    let database = await initializeDatabase();

    // Retrieve the main page.

    console.log(`Retrieving page: ${DevelopmentApplicationsUrl}`);
    let headers = {
        "Accept": "text/html, application/xhtml+xml, application/xml; q=0.9, */*; q=0.8",
        "Accept-Encoding": "",
        "Accept-Language": "en-AU, en-US; q=0.7, en; q=0.3",
        "Cache-Control": "max-age=0",
        "DNT": "1",
        "Host": "www.burnside.sa.gov.au",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134"
    };
    let body = await request({ url: DevelopmentApplicationsUrl, proxy: process.env.MORPH_PROXY, simple: true, headers: headers });
    let $ = cheerio.load(body);
    await sleep(20000 + getRandom(0, 10) * 1000);

    let index = 0;
    let elements = $("div.list-container a").get();
    if (elements.length === 0)
        console.log(`No development applications were found on the page: ${DevelopmentApplicationsUrl}`);
    
    for (let element of elements) {
        // Each development application is listed with a link to another page which has the
        // full development application details.

        index++;
        let developmentApplicationUrl = new urlparser.URL(element.attribs.href, DevelopmentApplicationsUrl).href;
        console.log(`Retrieving application ${index} of ${elements.length}: ${developmentApplicationUrl}`);
        let body = await request({ url: developmentApplicationUrl, proxy: process.env.MORPH_PROXY, headers: headers });
        let $ = cheerio.load(body);
        await sleep(2000 + getRandom(0, 10) * 1000);

        // Extract the details of the development application from the development application
        // page and then insert those details into the database as a row in a table.  Note that
        // the selectors used below are based on those from the following scraper:
        //
        //     https://github.com/LoveMyData/burnside

        await insertRow(database, {
            applicationNumber: $("span.field-label:contains('Application number') ~ span.field-value").text().trim(),
            address: $("span.field-label:contains('Address') ~ span.field-value").text().replace("View Map", "").trim(),
            reason: $("span.field-label:contains('Nature of development') ~ span.field-value").text().trim(),
            informationUrl: developmentApplicationUrl,
            commentUrl: CommentUrl,
            scrapeDate: moment().format("YYYY-MM-DD"),
            onNoticeToDate: moment($("h2.side-box-title:contains('Closing Date') + div").text().split(',')[0].trim(), "D MMMM YYYY", true).format("YYYY-MM-DD") });
    }
}

main().then(() => console.log("Complete.")).catch(error => console.error(error));
