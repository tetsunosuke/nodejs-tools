const config = require("config");
const conf = config.get("green");
const puppeteer = require('puppeteer');
(async () => {
    let selector;
    let xpath;
    let elm;
    let elms;
    let title;
    let value;
    const browser = await puppeteer.launch({
        headless: conf.headless,
        defaultViewport: {
            width: 1440,
            height: 900,
        }
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


    // あしあと表示
    await Promise.all([
        page.waitForNavigation(),
        page.goto("https://www.green-japan.com/client/search/footprint")
    ]);
    /**
     * これはなぜか押せない
    // アプローチ状況: まだ気になるしていない
    xpath = `//span[text() = "アプローチ状況"]`;
    await page.waitForXPath(xpath);
    await (await page.$x(xpath))[0].click();

    selector = "nav.mdl-navigation--selectable-tab>div>div:nth-of-type(2)>ul>li:nth-of-type(5) label";
    await page.click(selector);
    **/

    // 年齢： 25〜49
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(2)>div>span";
    await page.click(selector);
    // 下限
    await page.click("#js-over-age");
    await page.waitForTimeout(1000);
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(2)>div:nth-of-type(2)>div:nth-of-type(1)>div:nth-of-type(1)>ul>div>li:nth-of-type(9)";
    await page.click(selector);
    await page.waitForTimeout(1000);
    // 上限
    await page.click("#js-under-age");
    await page.waitForTimeout(1000);
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(2)>div:nth-of-type(2)>div:nth-of-type(1)>div:nth-of-type(2)>ul>div>li:nth-of-type(33)";
    await page.click(selector);
    await page.waitForTimeout(1000);

    // 年収 450万円以上
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(3)>div>span";
    await page.click(selector);
    await page.click("#js-over-salary");
    await page.waitForTimeout(1000);
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(3)>div:nth-of-type(2)>div:nth-of-type(1)>div:nth-of-type(1)>ul>li:nth-of-type(5)";
    await page.click(selector);
    await page.waitForTimeout(1000);

    // 最終アクション日：3日以内
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(4)>div>span";
    await page.click(selector);
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(4)>div:nth-of-type(2)>ul>li:nth-of-type(2)>span";
    await page.click(selector);
    await page.waitForTimeout(1000);

    // その他：職歴文字数：100文字以上
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(6)>div>span";
    await page.click(selector);
    await page.click("#js-resume-length");
    await page.waitForTimeout(2000);
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(6)>div:nth-of-type(2)>div>div>div:nth-of-type(12)>div>ul>li:nth-of-type(2)";
    await page.click(selector);
    // 閉じるボタン
    selector = "nav.mdl-navigation--selectable-tab>div:nth-of-type(6)>div:nth-of-type(2)>div:nth-of-type(2)>button";
    await page.click(selector);

    // 絞り込み検索でそこそこかかるので待つ
    await page.waitForTimeout(5000);

    // あしあと：0日前(（〜）」の求人）
    // ↑のように出るので、その求人に紐付けて気になるをしていく
    // 件数の取得
    // "#js-react-search-result>span" -> 1 - 100 / 102 とか出るのでその100を取る
    // 仕様上100人以上は諦める
    elm = await page.$("#js-react-search-result>span");
    value = await (await elm.getProperty('textContent')).jsonValue()
    let found = value.split(" ")[2];
    console.info(`${value}件のあしあとがあります`);
    // status のリクエストがかなり重たいので待つ
    await page.waitForTimeout(30000);

    // 検索結果の気になるをクリックして該当求人へ紐付けていく
    for (let i=1; i < found-0; i++) {
        selector = `#js-main-contents table>tbody:nth-of-type(${i})>tr>td:nth-of-type(9)>div.mdl-data-table__actions>div>span`;
        elm = await page.$(selector);
        value = await (await elm.getProperty('textContent')).jsonValue()
        // すでに気になる送信済み/気になる受信済みは除く
        if (value === "list") {
            selector = `#js-main-contents table>tbody:nth-of-type(${i})`;
            await page.hover(selector);
            elm = await page.$(selector);
            value = await (await elm.getProperty('textContent')).jsonValue()
            const regExp = /あしあと：\d+日前\(（(.*)」の求人）/;
            const match = value.match(regExp);
            if (match === null) {
                continue;
            }
            console.log("マッチしました...気になるを送ります", i, match[1]);
            selector = `#js-main-contents table>tbody:nth-of-type(${i})>tr>td:nth-of-type(9)>div.mdl-data-table__actions>div>i`;
            await page.waitForSelector(selector);
            await page.hover(selector);
            selector = `#js-main-contents table>tbody:nth-of-type(${i})>tr>td:nth-of-type(9)>div.mdl-data-table__actions>div>div>ul>li`;
            elms = await page.$$(selector);
            for (let j=0; j < elms.length; j++) {
                value = await (await elms[j].getProperty('textContent')).jsonValue()
                if (match[1] ===  value) {
                    selector = `#js-main-contents table>tbody:nth-of-type(${i})>tr>td:nth-of-type(9)>div.mdl-data-table__actions>div>div>ul>li:nth-of-type(${j+1})`;
                    await page.waitForSelector(selector);
                    console.log("気になるクリック", value);
                    await page.click(selector);
                    selector =  "#js-main-contents table>tbody:nth-of-type(${i})>tr>td input";
                    elm = await page.$(selector);
                    console.log("accountId:" + await (await elm.getProperty("id")).jsonValue());
                    continue;
                }
            }

        }
    }

    browser.close();
})();
