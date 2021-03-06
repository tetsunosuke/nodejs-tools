const dateformat = require('dateformat');
const config = require("config");
const conf = config.get("kinrou");

const puppeteer = require('puppeteer');
(async() => {
    const browser = await puppeteer.launch({
        headless: conf.headless,
    });
    // よく使うものは先に宣言しておくといいかも
    let text;
    let elm;

    const [page] = await browser.pages();
    // トップページ
    await page.goto(conf.url);

    // ログイン。法人コード、社員コード、パスワードを入力し、ログインボタンを押します
    await page.type('[name=houjinCode]', conf.houjinCode);
    await page.type('[name=userId]', conf.userId);
    await page.type('[name=password]', conf.password);
    // ここは説明していませんが、次のページが読み込まれるまで待つという意味です
    await Promise.all([
        page.waitForNavigation(),
        page.click("#bt")
    ]);

    // 打刻
    try {
        await page.click("[name='dakoku']");
    } catch (error) {
        await Promise.all([
            page.waitForSelector("#error"),
            elm = await page.$("#error")
        ]);
        text = await page.evaluate(elm => elm.textContent, elm)
        console.log(text);
        await browser.close();
        return;
    }

    const d = new Date();
    const year = dateformat(d, 'yyyy');
    const month = dateformat(d, 'mm');
    const kijunDate = dateformat(d, 'yyyymmdd');

    await page.goto(`https://kinrou.sas-cloud.jp/kinrou/dakokuList/index?syainCode=${conf.userId}&year=${year}&month=${month}&kijunDate=${kijunDate}`);

    let elms = await page.$$(".dakoku-all-list tr");
    text = "最後の打刻は：";
    for (i of [3,4]) {
        elm = await page.$(`.dakoku-all-list tr:nth-of-type(${elms.length-1}) td:nth-of-type(${i})`);
        text += await page.evaluate(elm => elm.textContent, elm)
    }
    console.info(text)
    // 閉じる
    browser.close();
})();
