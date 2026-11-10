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
    const origin = "http://127.0.0.1:" + server.address().port;
    await page.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin);
    const click = name => page.getByRole("button", {name, exact:true}).click();
    const nav = name => page.locator("[data-view=" + name + "]").click();
    const title = name => page.getByRole("heading", {name,exact:true}).waitFor();
    const pick = name => page.getByRole("button", {name: new RegExp("^" + name)}).click();
    const verifyCount = async number => assert.equal(await page.locator("#card-total").innerText(), "题库 " + number + " 张");
    await verifyCount(0);
    await title("题库暂为空");
    assert.equal(await page.getByRole("button", {name:"开始练习", exact:true}).count(), 0);
    await click("新建配方卡");
    await title("新建配方卡");
    await page.evaluate(() => {
      const card = (id, kind, name, items) => ({id, kind, name, items});
      localStorage.setItem("cup-recall-mistakes-v1", JSON.stringify(["old-default"]));
      localStorage.setItem("cup-recall-state-v2", JSON.stringify({
        edits: {
          "old-default": card("old-default", "public", "旧内置卡", ["旧答案"]),
          "old-reference": card("old-reference", "public", "旧参考卡", ["旧参考答案"]),
          "user-sample": card("user-sample", "custom", "自建旧卡", ["样品甲", "样品乙", "样品丙"]),
        },
        deleted: ["old-reference"],
        wrong: ["old-default", "old-reference", "user-sample"],
      }));
    });
    await page.reload();
    await verifyCount(1);
    assert.deepEqual(await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("cup-recall-state-v2"));
      return [Object.keys(saved.edits), saved.deleted, saved.wrong, localStorage.getItem("cup-recall-mistakes-v1")];
    }), [["user-sample"], [], ["user-sample"], null]);
    assert.equal(await page.locator("#wrong-count").textContent(), "1");
    await nav("mistakes");
    await click("练这张");
    await title("自建旧卡");
    assert.equal(await page.getByRole("button", {name:"显示答案", exact:true}).isDisabled(), true);
    await page.getByLabel("填写你的答案").fill("样品甲\n样品乙\n样品丙");
    await click("显示答案");
    await title("参考答案");
    assert.equal(await page.locator(".written-text").textContent(), "样品甲\n样品乙\n样品丙");
    await click("答对了");
    assert.equal(await page.locator("#wrong-count").textContent(), "0");

    await nav("library");
    await click("＋ 新建");
    await page.getByLabel("饮品名").fill("测试配方");
    await page.getByLabel("规格（选填）").fill("冰 · 大杯");
    await page.getByLabel("原料 / 步骤").fill("配料甲\n配料乙\n配料丙");
    await page.getByText("这些是有顺序的制作步骤").click();
    await click("保存配方");
    await verifyCount(2);
    await page.locator("summary").filter({hasText:"测试配方"}).click();
    await click("修改");
    await page.getByLabel("原料 / 步骤").fill("配料甲\n配料乙\n配料丁");
    await click("保存配方");
    await page.reload();
    assert.equal(await page.locator("#wrong-count").textContent(), "0");

    await pick("原料辨认");
    await click("开始练习");
    assert.equal(await page.locator(".option").count(), 4);
    const distractor = await page.evaluate(() => round.questions[0].options.find(value => value !== round.questions[0].answer));
    await click(distractor);
    await click("提交答案");
    assert.equal(await page.locator("#wrong-count").textContent(), "1");
    const missed = await page.evaluate(() => round.questions[0].card.id);
    await click("下一题");
    assert.equal(await page.locator("#wrong-count").textContent(), "1");

    await click("‹ 退出本轮");
    await pick("步骤排序");
    await click("开始练习");
    assert.equal(await page.locator(".option").count(), 3);
    await click("配料甲");
    await click("撤回上一步");
    for (const item of ["配料甲","配料乙","配料丁"]) await click(item);
    await click("提交答案");
    assert.match(await page.locator(".feedback").innerText(), /答对了/);
    assert.equal(await page.locator("#wrong-count").textContent(), missed === "user-sample" ? "1" : "0");

    await nav("library");
    await page.getByRole("searchbox").fill("测试配方");
    await page.locator("summary").filter({hasText:"测试配方"}).click();
    await page.getByText("配料丁",{exact:true}).waitFor();
    await click("删除");
    await click("确认移入");
    await verifyCount(1);
    await page.reload();
    await nav("library");
    await click("回收站");
    await click("恢复");
    await verifyCount(2);
    await click("‹ 返回题库");
    await page.getByRole("searchbox").fill("旧内置卡");
    assert.equal(await page.locator("summary").count(), 0);
    for (const width of [320,393]) {
      await page.setViewportSize({width,height:740});
      await nav("study");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    assert.deepEqual(errors, []);
    console.log("PASS: empty install, old answer removal, custom-card preservation, three modes, editing, delete/restore, persistence.");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
