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
                    console.log(`    Inserted new application \"${developmentApplication.applicationNumber}\" into the database.`);
                sqlStatement.finalize();  // releases any locks
                resolve(row);
            }
        });
    });
}

// Parses the page at the specified URL.

async function main() {
    // Ensure that the database exists.

    let database = await initializeDatabase();

    // Retrieve the main page.

    console.log(`Retrieving: ${DevelopmentApplicationsUrl}`);
    let body = await request({ url: DevelopmentApplicationsUrl, proxy: process.env.MORPH_PROXY });
    let $ = cheerio.load(body);

    console.log(process.env.MORPH_PROXY);
    
    for (let element of $("div.list-container a").get()) {
        // Each development application is listed with a link to another page which has the
        // full development application details.

        let developmentApplicationUrl = new urlparser.URL(element.attribs.href, DevelopmentApplicationsUrl).href;
        let body = await request({ url: developmentApplicationUrl, proxy: process.env.MORPH_PROXY });
        let $ = cheerio.load(body);

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
