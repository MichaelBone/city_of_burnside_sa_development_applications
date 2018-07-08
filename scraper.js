// Parses the lodged development application PDF files found at the South Australian City
// of Burside web site and places them in a database.
//
// Michael Bone
// 8th July 2018

let cheerio = require("cheerio");
let request = require("request");
let sqlite3 = require("sqlite3").verbose();
let moment = require("moment");

const LodgedApplicationsUrl = "https://www.burnside.sa.gov.au/Planning-Business/Planning-Development/Development-Applications/Development-Applications-on-Public-Notification";
const CommentUrl = "mailto:burnside@burnside.sa.gov.au";

// Sets up an sqlite database.

function initializeDatabase(callback) {
    let database = new sqlite3.Database("data.sqlite");
    database.serialize(() => {
        database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
        callback(database);
    });
}

// Inserts a row in the database if it does not already exist.

function insertRow(database, developmentApplication) {
    let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    sqlStatement.run([
        developmentApplication.applicationNumber,
        developmentApplication.address,
        developmentApplication.reason,
        developmentApplication.informationUrl,
        developmentApplication.commentUrl,
        developmentApplication.scrapeDate,
        developmentApplication.lodgementDate,
        null,
        null
    ], function(error, row) {
        if (error)
            console.log(error);
        else {
            if (this.changes > 0)
                console.log(`    Inserted new application \"${developmentApplication.applicationNumber}\" into the database.`);
            sqlStatement.finalize();  // releases any locks
        }
    });
}

// Reads a page using a request.
    
function requestPage(url, callback) {
    console.log(`Requesting page: ${url}`);
    request(url, (error, response, body) => {
        if (error)
            console.log(`Error requesting page ${url}: ${error}`);
        else
            callback(body);
    });
}

// Parses the page at the specified URL.

function parse(database, url) {
    let parsedUrl = new urlparser.URL(url);
    let baseUrl = parsedUrl.origin + parsedUrl.pathname;

    requestPage(url, body => {
        // Use cheerio to find all URLs that refer to development applications.
 
        let developmentApplicationUrls = [];
        let $ = cheerio.load(body);
        $("div.list-container a").each((index, element) => {
            let developmentApplicationUrl = new urlparser.URL(element.attribs.href, baseUrl);
            if (!developmentApplicationUrls.some(url => url === developmentApplicationUrl.href))  // avoid duplicates
                developmentApplicationUrls.push(developmentApplicationUrl.href);
        });
        console.log(`Found ${developmentApplicationUrls.length} development applications at ${url}.`);

        // Read and parse each development application URL, extracting the development application text.

        for (let developmentApplicationUrl of developmentApplicationUrls) {
            console.log(`Parsing: ${developmentApplicationUrl}`);

            let developmentApplications = [];
            let haveApplicationNumber = false;
            let haveAddress = false;
            let applicationNumber = null;
            let address = null;
            let reason = null;
            let informationUrl = developmentApplicationUrl;
            let commentUrl = CommentUrl;
            let scrapeDate = moment().format("YYYY-MM-DD");
            let lodgementDate = null;

            developmentApplications.push({
                applicationNumber: applicationNumber,
                address: address,
                reason: reason,
                informationUrl: informationUrl,
                commentUrl: commentUrl,
                scrapeDate: scrapeDate,
                lodgementDate: ((lodgementDate === null) ? null : lodgementDate.format("YYYY-MM-DD")) });

            // Insert all the development applications that were found into the database as
            // rows in a table.  If the same development application number already exists on
            // a row then that existing row will not be replaced.

            console.log(`Found ${developmentApplications.length} development application(s).`)
            for (let developmentApplication of developmentApplications)
                insertRow(database, developmentApplication);
        }
    });
}

initializeDatabase(run);
