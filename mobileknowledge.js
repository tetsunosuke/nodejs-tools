/**
 *  最新データダウンロード
 *  node mobileknowledge
 *  日付指定で過去履歴をDcBに
 *  node mobileknowledge mobileknowledge/2020-01-01.csv
 */
const config = require("config");
const puppeteer = require('puppeteer');
const contentDisposition = require('content-disposition');
const fs = require("fs");
const dateformat = require("dateformat");
const csvFolderName = "mobileknowledge";
const csv = require("csv-parse");
const iconv = require('iconv-lite');
const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("mobileknowledge/database.sqlite3")
const insertDb = ( (db, date, data) => {
    const [tmp, name, a, b, rate, cleared, achievement, answer_rate, last_login] = data;
    db.serialize(() => { db.run(`create table if not exists mobileknowledge (
                    check_date datetime,
                    name text,
                    rate number,
                    cleared number,
                    achievement number,
                    answer_rate number,
                    last_login datetime
                ,unique(check_date, name))
            `
        );
        db.run(`insert or replace into mobileknowledge (check_date, name, rate, cleared, achievement, answer_rate, last_login)
                values ($date,$name, $rate, $cleared, $achievement, $answer_rate, $last_login)`,
                date, name, rate, cleared, achievement, answer_rate, last_login
        );
   });
});

const parseAndInsertDb = ( async (downloadedFileName, date) => {
    // ダウンロードしたファイルの内容をDBへインサート
    const parser = csv();

    const rs = fs.createReadStream(downloadedFileName);
    rs.pipe(iconv.decodeStream('SJIS'))
      .pipe(iconv.encodeStream('UTF-8'))
      .pipe(parser);

    // DBに入れていく
    parser.on('readable', () => {
      let data;
        while (data = parser.read()) {
            [tmp, name, a,b, rate, cleared, achievement, answer_rate, last_login] = data;
            if (a === "for Freshers21") {
                try {
                    insertDb(db, date, data);
                } catch(err) {
                    console.log(err);
                }
            }
        }
    });
});

let conf = config.get("mobileknowledge");
const readByBrowser = (async () => {
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
        await page.waitForTimeout(500);
    }
    // 今日の日付でリネーム
    const date = dateformat(new Date(), 'yyyy-mm-dd');
    const downloadedFileName = csvFolderName + "/" + date + ".csv";
    fs.rename(downloadFileName, downloadedFileName, (err) => {
        if (err) { 
            console.error(err)
        }
    });


    await parseAndInsertDb(downloadedFileName, date);



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
    console.info(`${conf.feedUrl}`);
    browser.close();
});

(async() => {
    if (process.argv.length > 2) {
        const filename = process.argv.pop();
        const date = filename.split("/")[1].split(".")[0];
        await parseAndInsertDb(filename, date);
        // 非同期処理は待たずに強制終了
    } else {
        await readByBrowser();
    }

    // TODO: 下記のクエリで得られたデータから各メンバーの進捗グラフを作成
    // 描画データ作成
    const query = "select name, check_date, rate, last_login from mobileknowledge order by name, check_date asc";
})();


