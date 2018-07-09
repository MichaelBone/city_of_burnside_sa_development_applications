// Parses the development application at the South Australian City of  web site and places them
// in a database.  This is partly based on the scraper at https://github.com/LoveMyData/burnside.
//
// Michael Bone
// 8th July 2018

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

let cheerio = require("cheerio");
let request = require("request");
let sqlite3 = require("sqlite3").verbose();
let urlparser = require("url");
let moment = require("moment");
// let phantom = require("phantom");
let selenium = require("selenium-webdriver");
let chrome = require("selenium-webdriver/chrome");
let puppeteer = require("puppeteer");
let https = require("https");
let sslRootCas = require('ssl-root-cas/latest').inject();

https.globalAgent.options.ca = sslRootCas;

const DevelopmentApplicationsUrl = "https://www.burnside.sa.gov.au/Planning-Business/Planning-Development/Development-Applications/Development-Applications-on-Public-Notification";
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
        null,
        null,
        developmentApplication.onNoticeToDate
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
    request.get({url: url, agentOptions: { secureProtocol: "TLSv1_2_method" } }, (error, response, body) => {
        if (error)
            console.log(`Error requesting page ${url}: ${error}`);
        else
            callback(body);
    });
}

// Parses the page at the specified URL.

function run(database) {
    let url = DevelopmentApplicationsUrl;
    let parsedUrl = new urlparser.URL(url);
    let baseUrl = parsedUrl.origin + parsedUrl.pathname;
    
    console.log("Testing using selenium.");
    
    let options = new chrome.Options();
    options.addArguments("headless");
    let driver = new selenium.Builder().forBrowser('chrome').setChromeOptions(options).build();
    driver.get(url).then(function (result) {
        console.log("Have page.");
        console.log(result);
    });

    puppeteer.launch({ headless: true, args: [ '--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--ignore-urlfetcher-cert-requests' ], ignoreHTTPSErrors: true }).then(function(browser) {
        // console.log("Here A0");
        // require('https').globalAgent.options.ca = sslRootCas;
        console.log("Here A1");
        browser.newPage().then(function(page) {
            console.log("Here A2");
            page.goto('https://www.chromestatus.com', { waitUntil: 'networkidle2' }).then(function(page) {
                console.Log("Here A3");
                page.pdf({path: 'page.pdf', format: 'A4'});
            });
        });
    });

    
// phantom.create().then(function(ph){
//     _ph = ph;
//     console.log("Here 1");    
//     return _ph.createPage();
// }).then(function(page){
//     _page = page;
//     console.log("Here 2: " + url);
//     page.customHeaders = {
//         "Connection": "keep-alive"
//     };
//     page.on('onResourceError', function(resourceError) {
//         page.reason = resourceError.errorString;
//         page.reason_url = resourceError.url;
//         console.log("ErrorTest1: " + resourceError.errorString);
//         console.log("ErrorTest2: " + resourceError.url);
//     });
//     return _page.open(url,
//         function (status) {
//         if (status !== 'success') {
//             console.log("Error opening url \"" + page.reason_url + "\": " + page.reason);
//             phantom.exit(1);
//         } else {
//             console.log("Successful page open.");
//             phantom.exit(0);
//         }
//     });
// }).then(function(status){
//    console.log("Here 3");
//      console.log(status);
//     return _page.property('content')
// }).then(function(content){
//     console.log("Here 4");
//     console.log(content);
//     _page.close();
//     _ph.exit();
// }).catch(function(e){
//     console.log("Here 5");
//     console.log(e); 
// });
// console.log("Done.");
return;
    
    
    requestPage(url, body => {
        // Use cheerio to find all development applications listed in the page.
 
        let $ = cheerio.load(body);
        $("div.list-container a").each((index, element) => {
            // Each development application is listed with a link to another page which has the
            // full development application details.

            let developmentApplicationUrl = new urlparser.URL(element.attribs.href, baseUrl).href;
            requestPage(developmentApplicationUrl, body => {
                // Extract the details of the development application from the development
                // application page and then insert those details into the database as a row
                // in a table.  Note that the selectors used below are based on those from the
                // https://github.com/LoveMyData/burnside scraper.

                let $ = cheerio.load(body);

                insertRow(database, {
                    applicationNumber: $("span.field-label:contains('Application number') ~ span.field-value").text().trim(),
                    address: $("span.field-label:contains('Address') ~ span.field-value").text().replace("View Map", "").trim(),
                    reason: $("span.field-label:contains('Nature of development') ~ span.field-value").text().trim(),
                    informationUrl: developmentApplicationUrl,
                    commentUrl: CommentUrl,
                    scrapeDate: moment().format("YYYY-MM-DD"),
                    onNoticeToDate: moment($("h2.side-box-title:contains('Closing Date') + div").text().split(',')[0].trim(), "D MMMM YYYY", true).format("YYYY-MM-DD") });
            });
        });
    });
}

function function2() {
    console.log("Running function2");
    https.globalAgent.options.ca = sslRootCas;
    const options = {
        hostname: "www.burnside.sa.gov.au",
        port: 443,
        path: "/Planning-Business/Planning-Development/Development-Applications/Development-Applications-on-Public-Notification",
        method: "GET",
        secureProtocol: "TLSv1_method",
        rejectUnauthorized: false,
        requestCert: true,
        agent: false
    };
    https.request(options, res => {
        console.log('statusCode:', res.statusCode);
        console.log('headers:', res.headers);
        res.on('data', (d) => {
            process.stdout.write(d);
        });
        initializeDatabase(run);
    }).on('error', e => { console.log(e); });
}

setTimeout(function2, 15000);


