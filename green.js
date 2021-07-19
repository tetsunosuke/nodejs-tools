const config = require("config");
const conf = config.get("green");
const puppeteer = require('puppeteer');
(async () => {
    let selector;
    let xpath;
    let elm;
    let elms;
    let title;
    const browser = await puppeteer.launch({
        headless: conf.headless,
        //devtools: true,
    });
    const [page] = await browser.pages();

    // ログイン画面を開く
    await Promise.all([
        page.waitForNavigation(),
        page.goto(conf.url),
    ]);

    // ID, パスワード入力、ログイン
    await Promise.all([
        page.waitForSelector("#client_cd"),
        page.type("#client_cd", conf.userid),
    ]);
    // 上記が成立したら下記は続けてOK
    await page.type("#client_password", conf.password);

    await Promise.all([
        page.waitForNavigation(),
        page.click("input#btn_login"),
    ]);


    // TODO: アンケートが出た場合は閉じる必要がある
    // elector: div#wrapper div.dialog_close.js-create_cookie
    // パスワード変更
    if (await page.url() === "https://www.green-japan.com/client/settings/edit_password") {
        console.info("パスワード変更が求められました");
        await page.goto(conf.url);
    }


    // 求職者検索ボタンをクリック
    await Promise.all([
        page.waitForNavigation(),
        page.click("#js-header-wrapper a:nth-child(2) > i")
    ]);

    // 検索条件リストをスクレイピング
    selector = "div.client-navigation";
    await page.waitForSelector(selector);

    // 検索条件を引っ張って、その中から該当するものを選ぶ
    selector = `${selector} > a > div:nth-of-type(1) > span`;
    await page.waitForSelector(selector);
    elms = await page.$$(selector);

    // TODO: 1とかmdl-tag--round の要素を見つけ、それだけを取得したい
    // //*[@id="tooltip-search-80830"]/div[2]/span[1] 

    let text;
    let indexes = [];
    for (let i=0; i < elms.length; i++) {
        text = await page.evaluate(elm => elm.textContent, elms[i]);
        // 検索条件から設定に該当するものだけを選択
        if (text.indexOf(conf.search) === 0) {
            indexes.push(i+1);
        }
    }

    // 気になる送信に関する対象URLを取得
    let urls = [];
    let matches;
    let id;
    for (let i of indexes) {
        selector = `div.client-navigation > a:nth-of-type(${i})`;
        elm = await page.$(selector);
        text = await page.evaluate(elm => elm.href, elm);
        /*
        // href から #tooltip-search-${id} を mdl-tag--round を探してそれだけを抽出する
        // https://www.green-japan.com/client/search/80818
        matches = text.match(/\d+$/);
        id = matches[0];
        elm = await page.$(`#tooltip-search-${id} .mdl-tag--round`);
        if (elm) {
            // text = await page.evaluate(elm => elm.textContent, elm);
            urls.push(text);
        }
        */
        urls.push(text);
    }

    // 気になるを送信する
    for (let url of urls) {
        await Promise.all([
            page.waitForNavigation(),
            page.goto(url)
        ]);
        selector = "#js-main-contents h1";
        await page.waitForSelector(selector);
        elm = await page.$(selector);
        title = await page.evaluate(elm => elm.textContent, elm);
        let [name, entry] = title.split("link");

        // こんな感じで数字がテキストとして取れる
        // 1 - 100 / 149
        // 0 / 0
        // 1 - 1 / 1
        elm = await page.$("#js-react-search-result");
        // ここで数秒待たないと数字が更新されない！
        await page.waitForTimeout(conf.waitShort);
        text = await page.evaluate(elm => elm.textContent, elm);
        console.log(text, name, url);
        if (text[0] !== "0") {
            // 全て選択
            selector = "#js-main-contents table tr > td > label";
            await Promise.all([
                page.waitForSelector(selector),
                page.click(selector)
            ]);
            // 気になる送信ボタン
            xpath = '//*[@id="js-main-contents"]/div/table/thead/tr/td[8]/div/div[1]/button';
            await page.waitForXPath(xpath);
            let elementHandleList = await page.$x(xpath);
            await elementHandleList[0].click();
            await page.waitForTimeout(conf.waitLong);
        }
    }


    browser.close();
})();
