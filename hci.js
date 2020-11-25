// node hci sp "山田 太郎" 男性 中途 (2020/3/29)
// ※日付は指定しない場合は期限一週間で自動設定

const config = require("config");
let conf = config.get("hci");
const puppeteer = require('puppeteer');

let gender;
let applicantType;

const generateYmd = () => {
    // 一週間後の日付を指定する
    let d = new Date();
    d.setDate(d.getDate() + 7);
    return [d.getYear() + 1900 + "", d.getMonth() + 1 + "", d.getDate() + ""];
};

const separateYmd = (ymd) => {
    const [y, m, d] = ymd.split("/");
    if (typeof y === "undefined" || typeof m === "undefined" || typeof d === "undefined") {
        throw new Error("日付の指定が不正です（フォーマットが YYYY/MM/DD ではありません");
    }
    const date = new Date(y-0, m-1, d-0);
    if (date <= new Date()) {
        throw new Error("日付の指定が不正です（存在しない日付か、過去の日付になっています");
    }

    return [y, m, d];
};

// configのtemp変数
let c = {};
for (let key in conf) {
    c[key] = conf[key];
}

// オプションがあった場合はconfigの上書き

let [yyyy, mm, dd] = generateYmd();
if (process.argv.length >= 6) {
    var [node, prog, type, applicantName, genderText, applicantTypeText, ymd] = process.argv;
    if (typeof ymd !== "undefined") {
        [yyyy, mm, dd]  = separateYmd(ymd);
    }
    let account = conf.get(type);
    for (key in account) {
        c[key] = account[key];
    }
    delete(c[type]);
    if (["新卒", "中途"].indexOf(applicantTypeText) === -1) {
        console.log(applicantTypeText);
        throw("新卒/中途の指定が誤っています");
    }
    if (!genderText.match(/[男|女]/)) {
        console.log(genderText);
        throw("男性/女性の指定が誤っています");
    }
    gender = genderText.match(/男/) ? "1" : "2";
    applicantType = applicantTypeText.match(/新卒/) ? "1" : "2";
} else {
    throw("オプションを指定してください: node hci task名 氏名 男性/女性 新卒/中途 (YYYY/MM/DD) ");
}

// 戻す
conf = c;

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

    // ログイン画面を開く
    await Promise.all([
        page.waitForNavigation(),
        page.goto(conf.url),
    ]);

    // ID, パスワード入力、ログイン
    await Promise.all([
        page.waitForSelector("#corporateCode"),
        page.type("#corporateCode", conf.corporateCode),
    ]);
    // 上記が成立したら下記は続けてOK
    await page.type("#mailAddress", conf.mailAddress);
    await page.type("#password",    conf.password);

    await Promise.all([
        page.waitForNavigation(),
        page.click("input[type=submit]"),
    ]);


    // 採用タスクの指定
    xpath = `//a[text() = "採用タスクの指定"]`;
    await page.waitForXPath(xpath);
    await (await page.$x(xpath))[0].click();

    // 設定で決められたタスクをクリック
    xpath = `//a[text() = "${conf.task}"]`;
    await page.waitForXPath(xpath);
    await (await page.$x(xpath))[0].click();

    // １件ずつ登録
    xpath = `//a[text() = "１件ずつ登録"]`;
    await page.waitForXPath(xpath);
    await (await page.$x(xpath))[0].click();

    // いろいろ入力
    // applicantName
    // gender: 1:男性 2:女性
    // applicantType: 1:新卒, 2:中途
    // examPlace 2:来社を強制
    // examLimit1, 2, 3
    // #btn-normal-submit .btn_registration2
    await page.waitForSelector("#applicantName");
    await Promise.all([
        page.type("#applicantName", applicantName),
        page.select("#gender", gender),
        page.select("#applicantType", applicantType),
        page.select("#examPlace", "2"),
        page.select("#examLimit1", yyyy),
        page.select("#examLimit2", mm),
        page.select("#examLimit3", dd),
    ]);
    // 登録
    await page.click("#btn-normal-submit .btn_registration2");
    // はい
    selector = ".nonback_alert .confirmation_btn button:nth-of-type(1)";
    await page.waitForSelector(selector);
    await page.click(selector);

    // 確認OKのクリック
    selector = ".nonback_alert_complete .confirmation_btn button:nth-of-type(1)";
    await page.waitForSelector(selector);
    await page.click(selector);

    // 進捗一覧・変更・削除
    xpath = `//a[text() = "進捗一覧・変更・削除"]`;
    await page.waitForXPath(xpath);
    await (await page.$x(xpath))[0].click();

    // id=name で検索して、その結果から受検票を発行する
    // 設定した条件で検索
    //
    await page.waitForSelector("#name");
    await page.type("#name", applicantName);
    xpath = `//button[text() = "設定した条件で検索"]`;
    await page.waitForXPath(xpath);
    await (await page.$x(xpath))[0].click();

    // 数秒待つ
    await page.waitFor(2000);
    // チェックを入れて
    await page.click(".fixed_table tr:nth-of-type(2) td:nth-of-type(1)");
    // 報告書
    await page.click(".both_ends_btn button:nth-of-type(1)")

    // 数秒待つ
    await page.waitFor(2000);
    await page.waitForSelector(".confirmation");
    // はい
    selector = ".nonback_alert_before_inspection_sheet .confirmation_btn button:nth-of-type(1)";
    await page.waitForSelector(selector);
    await page.click(selector);

    // 別ページで開いたやつから中身を抜き出す
    await page.waitFor(2000);
    let pages = await browser.pages();
    // 新規ページはpages[1]
    const data = await pages[1].evaluate( (selector) => {
        const personalData = document.querySelector(selector);
        const tds = personalData.querySelectorAll("td");
        let lines = [];
        for (let i=0; i < tds.length; i+=2) {
            lines.push(`${tds[i].textContent} : ${tds[i+1].textContent}`);
        }
        return lines;
    }, ".personal_data");
    data.push(`受検期限は ${yyyy}/${mm}/${dd} です`);
    console.info(data.join("\n"));
    browser.close();
})();
