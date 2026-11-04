const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

async function run() {
  const assets = path.join(__dirname, "assets");
  const types = {".html":"text/html", ".css":"text/css", ".js":"text/javascript"};
  const server = http.createServer((req, res) => {
    const name = req.url === "/" ? "index.html" : req.url.slice(1);
    if (!/^[a-z-]+\.(html|css|js)$/.test(name)) return res.writeHead(404).end();
    res.setHeader("Content-Type", types[path.extname(name)] + "; charset=utf-8");
    fs.createReadStream(path.join(assets, name)).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.CUP_RECALL_BROWSER});
    const page = await browser.newPage({viewport:{width:393,height:852}, isMobile:true, hasTouch:true});
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("cup-recall-mistakes-v1", JSON.stringify(["LK-1", "bogus"]));
    });
    const origin = "http://127.0.0.1:" + server.address().port;
    await page.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);
    const click = name => page.getByRole("button", {name, exact:true}).click();
    const nav = name => page.locator("[data-view=" + name + "]").click();
    const title = name => page.getByRole("heading", {name,exact:true}).waitFor();
    const pick = name => page.getByRole("button", {name: new RegExp("^" + name)}).click();
    const verifyCount = async number => assert.equal(await page.locator("#card-total").innerText(), "题库 " + number + " 张");
    const screenshot = name => process.env.CUP_RECALL_SCREENSHOTS
      ? page.screenshot({path:path.join(process.env.CUP_RECALL_SCREENSHOTS, name + ".png"), fullPage:true})
      : Promise.resolve();

    await verifyCount(44);
    assert.equal(await page.locator("#wrong-count").textContent(), "1");
    await screenshot("v11-home");
    await nav("mistakes");
    await click("练这张");
    await title("生椰拿铁");
    await click("显示答案");
    await click("记住了");
    assert.equal(await page.locator("#wrong-count").textContent(), "0");

    await nav("library");
    await click("＋ 新建");
    await page.getByLabel("饮品名").fill("测试配方");
    await page.getByLabel("规格（选填）").fill("冰 · 大杯");
    await page.getByLabel("原料 / 步骤").fill("加冰\n茉莉花茶\n浓缩咖啡");
    await page.getByText("这些是有顺序的制作步骤").click();
    await click("保存配方");
    await verifyCount(45);
    await page.locator("summary").filter({hasText:"测试配方"}).click();
    await click("修改");
    await page.getByLabel("原料 / 步骤").fill("加冰\n茉莉花茶\n椰浆饮品");
    await click("保存配方");
    await page.reload();
    assert.equal(await page.locator("#wrong-count").textContent(), "0");

    await pick("原料辨认");
    await click("我维护的");
    await click("开始练习");
    await title("测试配方");
    assert.equal(await page.locator(".option").count(), 4);
    await screenshot("v11-choice");
    const distractor = await page.evaluate(() => round.questions[0].options.find(value => value !== round.questions[0].answer));
    await click(distractor);
    await click("提交答案");
    assert.equal(await page.locator("#wrong-count").textContent(), "1");
    await click("下一题");
    await title("本轮完成");

    await nav("study");
    await pick("步骤排序");
    await click("开始练习");
    assert.equal(await page.locator(".option").count(), 3);
    await click("加冰");
    await click("撤回上一步");
    for (const item of ["加冰","茉莉花茶","椰浆饮品"]) await click(item);
    await click("提交答案");
    assert.match(await page.locator(".feedback").innerText(), /答对了/);
    assert.equal(await page.locator("#wrong-count").textContent(), "0");
    await screenshot("v11-order");

    await nav("library");
    await page.getByRole("searchbox").fill("测试配方");
    await page.locator("summary").filter({hasText:"测试配方"}).click();
    await page.getByText("椰浆饮品",{exact:true}).waitFor();
    await click("删除");
    await click("确认移入");
    await verifyCount(44);
    await page.reload();
    await nav("library");
    await click("回收站");
    await click("恢复");
    await verifyCount(45);
    await click("‹ 返回题库");
    await page.getByRole("searchbox").fill("生椰拿铁");
    await page.locator("summary").filter({hasText:/^生椰拿铁官网/}).first().click();
    await click("修改");
    await page.getByLabel("原料 / 步骤").fill("测试修正\n浓缩咖啡");
    await click("保存配方");
    await page.locator("summary").filter({hasText:"个人修订"}).click();
    await page.getByText("测试修正",{exact:true}).waitFor();
    await screenshot("v11-library");
    for (const width of [320,393]) {
      await page.setViewportSize({width,height:740});
      await nav("study");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    assert.deepEqual(errors, []);
    console.log("PASS: v1 migration, three modes, creation, editing, delete/restore, reload persistence, 320/393px layout.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
