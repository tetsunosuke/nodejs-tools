const config = require("config");
let conf = config.get("mobileknowledge");
const puppeteer = require('puppeteer');
const contentDisposition = require('content-disposition');
const fs = require("fs");
const dateformat = require("dateformat");

(async () => {
    let selector;
    let xpath;
    let elm;
    let elms;
    let title;
    const browser = await puppeteer.launch({
        headless: conf.headless,
    });

    const [page] = await browser.pages();
    //ブラウザのダウンロード先をすべて統一する
    await page._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: __dirname
    });

    // すべての応答を監視して、ダウンロードファイルを処理する
    var downloadFileName = "";
    page.on('response', response => {
        const contentType = response.headers()['content-type'];
        // ファイルのダウンロード監視
        if (contentType === "application/csv") {
            const header = response.headers()["content-disposition"];
            const disposition = contentDisposition.parse(header);
            downloadFileName = disposition.parameters.filename;
        }
    });


    // ログイン画面を開く
    await Promise.all([
        page.waitForNavigation(),
        page.goto(conf.url),
    ]);


    // ID, パスワード入力、ログイン
    await Promise.all([
        page.waitForSelector("[name='login']"),
        page.type("[name='login']", conf.id),
    ]);
    await page.type("[name='password']", conf.password);

    await Promise.all([
        page.waitForNavigation(),
        page.click("[type='submit']")
    ]);

    await Promise.all([
        // ファイルのダウンロードの実施
        page.evaluate((downloadUrl) => {
            const body = document.querySelector('body');
            body.innerHTML = `<a id="puppeteer" href="${downloadUrl}">csv</a>`
        }, conf.downloadUrl), 
        page.waitForSelector('#puppeteer'),
    ]);
    await page.click('#puppeteer')

    // この時点ではまだファイルがダウンロード中の可能性があるので、リネーム処理をトライする
    while(true) {
        try {
            fs.statSync(downloadFileName);
            break;
        } catch(err) {
            // console.log(err.code);
        }
        await page.waitFor(500);
    }
    // 今日の日付でリネーム
    fs.rename(downloadFileName, "mobileknowledge/" + dateformat(new Date(), 'yyyy-mm-dd') + ".csv", (err) => {});

    // フィード
    await Promise.all([
        page.waitForNavigation(),
        page.goto("https://mobileknowledge.jp/admin/emulator?service_category_id=1000001799&group_id=1000006616")
    ]);

    // 実態はiframeに存在する
    const [parent, frame] = await page.frames()
    selector = "#comment>section>.header>.inner-r>p";
    await frame.waitForSelector(selector);
    elms = await frame.$$(selector);
    text = "最終更新:";
    text += await frame.evaluate(elm => elm.textContent, elms[0]);
    text += "(" + await frame.evaluate(elm => elm.textContent, elms[1]) + ")";
    console.info(text);

    browser.close();

})();
