const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const cheerio = require("cheerio");
const fs = require("fs");

puppeteer.use(StealthPlugin());

async function isCloudflareChallenge(source) {
    return source.includes("Just a moment...");
}

async function listGamePageGetUrls(source) {
    const $ = cheerio.load(source);
    const urls = new Set();
    $("div.image-hover-wrapper a").each((index, element) => {
        const url = $(element).attr("href");
        urls.add(url);
    });
    return urls;
}

async function getMaxNbPages(source) {
    const $ = cheerio.load(source);
    let nbPages;
    $("a.page-numbers").each((index, element) => {
        if (!$(element).hasClass("next")) {
            nbPages = $(element).text().replace(",", "");
        }
    });
    return nbPages ? parseInt(nbPages) : 0;
}

async function getAllPagesUrls(page, nbPages, urls, lastUrl) {
    const pageUrl = page.url().split("?")[0];
    if (lastUrl.value !== pageUrl) {
        lastUrl.value = pageUrl;
        console.log("The page has changed to: ", page.url());
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("OK1");
        try {
            const source = await page.content();
            console.log("OK2");
            if (await isCloudflareChallenge(source)) {
                console.log("Cloudflare challenge detected");
                lastUrl.value = "";
            } else {
                console.log("OK3");
                let currentPage;
                try {
                    const currentPageStr = page.url().split("/").pop();
                    currentPage = parseInt(currentPageStr) || 1;
                } catch {
                    currentPage = 1;
                }
                console.log("OK4");
                if (nbPages.value === 0) {
                    nbPages.value = await getMaxNbPages(source);
                    console.log("Number of pages: ", nbPages.value);
                }
                console.log("OK5");
                const newUrls = await listGamePageGetUrls(source);
                newUrls.forEach((url) => urls.add(url));
                console.log("OK6");
                return currentPage;
            }
        } catch (error) {
            console.error("Error in getAllPagesUrls: ", error);
        }
    }
}

async function run() {
    const pathToExtension = path.join(process.cwd(), "ext/uBlock0/");
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            "--start-maximized",
            `--disable-extensions-except=${pathToExtension}`,
            `--load-extension=${pathToExtension}`,
        ],
        targetFilter: (target) => target.type() !== "other" || !!target.url(),
    });

    const page = (await browser.pages())[0];
    page.setDefaultNavigationTimeout(0);

    const urls = new Set();
    const nbPages = { value: 0 };
    const lastUrl = { value: ""};

    page.on("framenavigated", async () => {
        let currentPage = await getAllPagesUrls(page, nbPages, urls, lastUrl);
        console.log("Retrieved URLs: ", urls);
        console.log("Number of games: ", urls.size);

        if (currentPage === nbPages.value) {
            console.log("All pages have been processed");
            const urlsArray = Array.from(urls);
            const urlsString = urlsArray.join("\n");
            fs.writeFileSync("allUrl.txt", urlsString);
            console.log("URLs have been written to allUrl.txt");
        } else if (currentPage < nbPages.value) {
            await page.goto(
                `https://nsw2u.com/tag/1fichier/page/${currentPage + 1}`,
                { waitUntil: "domcontentloaded" }
            );
        }
    });

    await page.goto("https://nsw2u.com/tag/1fichier", {
        waitUntil: "domcontentloaded",
    });
}

run();
