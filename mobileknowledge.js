const config = require("config");
let conf = config.get("mobileknowledge");
const puppeteer = require('puppeteer');
const contentDisposition = require('content-disposition');
const fs = require("fs");
const dateformat = require("dateformat");
const sqlite3 = require("sqlite3");
const csvFolderName = "mobileknowledge";
const parse = require("csv-parse");
const iconv = require('iconv-lite');



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
    const downloadedFileName = csvFolderName + "/" + dateformat(new Date(), 'yyyy-mm-dd') + ".csv";
    fs.rename(downloadFileName, downloadedFileName, (err) => {});

    // ダウンロードしたファイルの内容をDBへインサート
    const parser = parse();

    const rs = fs.createReadStream(downloadedFileName);
    rs.pipe(iconv.decodeStream('SJIS'))
      .pipe(iconv.encodeStream('UTF-8'))
      .pipe(parser);

    // DBに入れていく
    parser.on('readable', () => {
      let data;
      while (data = parser.read()) {
        [tmp, name, a, ,b, rate, cleared, achivement, answer_rate, last_login] = data;
          if (a === "for Freshers21") {
              const db = new sqlite3.Database("mobileknowledge.sqlite3")
              try {
                  db.serialize(() => {
                      db.run(`create table if not exists mobileknowledge (
                        check_time datetime,
                        name text,
                        rate number,
                        cleared number,
                        achivement number,
                        answer_rate number,
                        last_login datetime)`);
                      db.run(`insert or replace into mobileknowledge (check_time, name, rate, cleared, achivement, answer_rate, last_login) 
                    values (CURRENT_TIMESTAMP, $name, $rate, $cleared, $achivement, $answer_rate, $last_login)`, 
                          name, rate, cleared, achivement, answer_rate, last_login);
                  });
              } catch(err) {
                  console.log(err);
              }
          }
      }
    });


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
