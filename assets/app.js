"use strict";

const screen = document.getElementById("screen");
const oldKey = "cup-recall-mistakes-v1";
const dataKey = "cup-recall-state-v2";
let state = {edits: {}, deleted: [], wrong: []};
let storageProblem = false;
try {
  const saved = localStorage.getItem(dataKey);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!parsed?.edits || !Array.isArray(parsed.deleted) || !Array.isArray(parsed.wrong)) {
      throw new Error("Invalid saved state");
    }
    const edits = Object.fromEntries(Object.entries(parsed.edits).filter(([id, card]) =>
      card?.id === id && id.startsWith("user-") && card.kind === "custom",
    ));
    const exists = id => Object.prototype.hasOwnProperty.call(edits, id);
    state = {
      edits,
      deleted: parsed.deleted.filter(exists),
      wrong: parsed.wrong.filter(exists),
    };
    if (JSON.stringify(state) !== saved) localStorage.setItem(dataKey, JSON.stringify(state));
  }
  localStorage.removeItem(oldKey);
} catch {
  storageProblem = true;
}
let view = "study";
let editor = null;
let pendingDelete = null;
let bin = false;
let round = null;
let mode = "flash";
let size = 5;
let query = "";
let limit = 24;
let noticeTimer;

const modes = [
  ["flash", "默写自测", "写下配方，再对照答案自评", "◇"],
  ["choice", "原料辨认", "四选一，找出配方卡里出现的项目", "⊙"],
  ["order", "步骤排序", "点选三个步骤，排回配方卡的顺序", "≡"],
];

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

function button(label, action, cls = "ghost") {
  const control = el("button", label, cls);
  control.type = "button";
  control.addEventListener("click", action);
  return control;
}

function choices(options, selected, action, label) {
  const group = el("div", null, "choices");
  group.setAttribute("aria-label", label);
  options.forEach(([key, caption]) => {
    const control = button(caption, () => action(key));
    control.setAttribute("aria-pressed", String(key === selected));
    group.append(control);
  });
  return group;
}

function notify(message) {
  const node = document.getElementById("notice");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { node.hidden = true; }, 4300);
}

function save(next) {
  try {
    localStorage.setItem(dataKey, JSON.stringify(next));
    state = next;
    return true;
  } catch {
    notify("保存失败，请检查应用存储空间后重试。");
    return false;
  }
}

function lookupCard(id) {
  return state.edits[id];
}

function catalog() {
  return Object.keys(state.edits)
    .filter(id => !state.deleted.includes(id))
    .map(lookupCard);
}

function wrongCards() {
  return catalog().filter(card => state.wrong.includes(card.id));
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const other = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[other]] = [copy[other], copy[i]];
  }
  return copy;
}

function ingredient(item) {
  return item.length <= 48 && !/^(?:糖(?:\s|$)|加冰|加热|搅拌|入杯|倒入|铺|撒|补|摇壶|扣盖|高温蒸汽|淋酱|冰(?:\s|$)|热水$|水(?:\s|至|上|下|中|$))/.test(item);
}

function choiceOptions(card, pool) {
  const normalized = item => item.toLowerCase().replace(/[\s\d/()（）]+/g, "");
  const answer = shuffled(card.items.filter(ingredient))[0];
  if (!answer) return null;
  const related = card.items.map(normalized);
  const alternatives = new Map();
  pool.flatMap(other => other.items).forEach(item => {
    const key = normalized(item);
    if (ingredient(item) && key && related.every(used =>
      !used || (!key.includes(used) && !used.includes(key)),
    )) alternatives.set(key, item);
  });
  if (alternatives.size < 3) return null;
  return {answer, options: shuffled([answer, ...shuffled(alternatives.values()).slice(0, 3)])};
}

function orderOptions(card) {
  if (!card.ordered) return [];
  return card.items.slice(2).map((_, i) => card.items.slice(i, i + 3))
    .filter(steps => new Set(steps).size === 3);
}

function makeQuestions(cards, selectedMode) {
  const pool = catalog();
  return cards.flatMap(card => {
    if (selectedMode === "choice") {
      const question = choiceOptions(card, pool);
      return question ? [{card, ...question}] : [];
    }
    if (selectedMode === "order") {
      const answer = shuffled(orderOptions(card))[0];
      if (!answer) return [];
      const options = shuffled(answer);
      if (options.every((item, i) => item === answer[i])) options.push(options.shift());
      return [{card, answer, options}];
    }
    return [{card}];
  });
}

function start(selectedMode, cards, count = size) {
  const questions = makeQuestions(shuffled(cards), selectedMode).slice(0, count);
  if (!questions.length) {
    notify("题库里没有适合这种题型的卡片，请补充卡片或切换题型。");
    return;
  }
  round = {mode: selectedMode, questions, index: 0, correct: 0, writtenAnswer: "", picked: [], result: null};
  render(true);
}

function answerBlock(card) {
  const body = el("div", null, "answer");
  const list = el(card.ordered ? "ol" : "ul");
  card.items.forEach(item => list.append(el("li", item)));
  body.append(list);
  if (card.note) body.append(el("p", card.note, "muted"));
  return body;
}

function record(correct) {
  const id = round.questions[round.index].card.id;
  const wrong = new Set(state.wrong);
  if (correct) wrong.delete(id);
  else wrong.add(id);
  if (!save({...state, wrong: [...wrong]})) return;
  round.result = correct;
  if (correct) round.correct++;
  if (round.mode === "flash") advance();
  else render();
}

function advance() {
  round.index++;
  round.picked = [];
  round.result = null;
  round.writtenAnswer = "";
  render(true);
}

function renderRound() {
  const back = button("‹ 退出本轮", () => { round = null; render(true); });
  const question = round.questions[round.index];
  if (!question) {
    const card = el("article", null, "ticket");
    card.append(el("h1", "本轮完成"), el("p", "答对 " + round.correct + " / " + round.questions.length + " 题", "prompt"));
    const actions = el("div", null, "actions");
    actions.append(
      button("回练习首页", () => setView("study"), "primary"),
      button("复习易错卡", () => setView("mistakes"), "secondary"),
    );
    card.append(actions);
    screen.append(card);
    return;
  }
  const {card} = question;
  const bar = el("div", null, "bar");
  bar.append(back, el("p", "第 " + (round.index + 1) + " / " + round.questions.length + " 题", "muted"));
  const progress = el("progress");
  progress.max = round.questions.length;
  progress.value = round.index;
  progress.setAttribute("aria-label", "本轮进度");
  screen.append(bar, progress);
  const ticket = el("article", null, "ticket");
  ticket.append(el("h2", card.name));
  if (card.variant) ticket.append(el("p", card.variant, "muted"));
  screen.append(ticket);

  if (round.mode === "flash" && !round.writtenAnswer) {
    const form = el("form");
    const input = el("textarea");
    input.required = true;
    input.maxLength = 1800;
    input.rows = 5;
    input.placeholder = "写下记得的原料、用量和步骤。";
    const show = el("button", "显示答案", "primary full");
    show.type = "submit";
    show.disabled = true;
    input.addEventListener("input", () => { show.disabled = !input.value.trim(); });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const writtenAnswer = input.value.trim();
      if (!writtenAnswer) return;
      round.writtenAnswer = writtenAnswer;
      render();
      document.getElementById("reference-answer-title")?.focus();
    });
    form.append(field("填写你的答案", input), show);
    ticket.append(form);
    return;
  }
  if (round.mode === "flash" || round.result !== null) {
    if (round.result !== null) {
      const solution = Array.isArray(question.answer) ? question.answer.join(" → ") : question.answer;
      ticket.append(el("p", (round.result ? "答对了" : "已加入易错卡") + " · " + solution,
        "feedback " + (round.result ? "good" : "bad")));
    }
    const actions = el("div", null, "actions");
    if (round.mode === "flash") {
      const review = el("div", null, "written-review");
      const written = el("section");
      written.append(el("h3", "你的答案"), el("p", round.writtenAnswer, "written-text"));
      const reference = el("section");
      const heading = el("h3", "参考答案");
      heading.id = "reference-answer-title";
      heading.tabIndex = -1;
      reference.append(heading, answerBlock(card));
      review.append(written, reference);
      ticket.append(review, el("p", "对照后给自己判分。", "muted prompt"));
      actions.append(button("答错了", () => record(false), "secondary"),
        button("答对了", () => record(true), "primary"));
    } else {
      ticket.append(answerBlock(card));
      actions.append(button("下一题", advance, "primary"));
    }
    actions.append(button("修改这张", () => openEditor(card)));
    ticket.append(actions);
    return;
  }

  if (round.mode === "choice") {
    ticket.append(el("p", "哪一项出现在这张配方卡上？", "prompt"));
  } else {
    ticket.append(el("p", "点选这三个步骤，排回配方卡里的顺序。", "prompt"));
    const selected = el("ol", null, "order");
    round.picked.forEach(item => selected.append(el("li", item)));
    ticket.append(selected);
    if (round.picked.length) ticket.append(button("撤回上一步", () => { round.picked.pop(); render(); }));
  }
  const options = el("div", null, "option-grid");
  question.options.forEach(item => {
    const isPicked = round.picked.includes(item);
    const control = button(item, () => {
      if (round.mode === "choice") round.picked = [item];
      else round.picked.push(item);
      render();
    }, "option");
    control.setAttribute("aria-pressed", String(isPicked));
    control.disabled = round.mode === "order" && isPicked;
    options.append(control);
  });
  ticket.append(options);
  const submit = button("提交答案", () => {
    const correct = round.mode === "choice" ? round.picked[0] === question.answer :
      question.answer.every((item, index) => item === round.picked[index]);
    record(correct);
  }, "primary full");
  submit.disabled = round.picked.length !== (round.mode === "choice" ? 1 : question.answer.length);
  ticket.append(submit);
}

function renderStudy() {
  const hero = el("section", null, "hero");
  hero.append(el("h1", "配方练习"));
  screen.append(hero);
  if (!catalog().length) {
    const empty = el("article", null, "ticket");
    empty.append(el("h2", "题库暂为空"), el("p", "添加一张新配方卡后即可开始练习。", "prompt"),
      button("新建配方卡", () => { view = "library"; openEditor(); }, "primary full"));
    screen.append(empty);
    return;
  }
  hero.append(el("p", "选一种方式，开一轮。"));
  screen.append(el("h3", "训练方式", "section"));
  const grid = el("div", null, "mode-grid");
  modes.forEach(([key, title, description, icon]) => {
    const control = button(null, () => { mode = key; render(); }, "mode");
    const copy = el("span");
    copy.append(el("strong", title), el("span", description, "muted"));
    const mark = el("span", icon, "mode-icon");
    mark.setAttribute("aria-hidden", "true");
    control.setAttribute("aria-pressed", String(mode === key));
    control.append(mark, copy);
    grid.append(control);
  });
  screen.append(grid,
    el("h3", "每轮题量", "section"),
    choices([[5,"5 题"], [10,"10 题"], [20,"20 题"]], size, key => { size = key; render(); }, "每轮题量"),
    button("开始练习", () => start(mode, catalog()), "primary full"));
}

function field(label, control) {
  const group = el("label", null, "field");
  group.append(el("span", label), control);
  return group;
}

function openEditor(card = null) {
  editor = {card, returnView: view};
  render(true);
}

function closeEditor() {
  if (editor.dirty && !window.confirm("离开编辑页？未保存的内容会丢失。")) return;
  view = editor.returnView;
  editor = null;
  render(true);
}

function renderEditor() {
  const card = editor.card;
  screen.append(button("‹ 返回", closeEditor), el("h1", card ? "修改配方" : "新建配方卡", "section"));
  const form = el("form");
  const name = el("input");
  name.required = true;
  name.maxLength = 70;
  name.value = card?.name || "";
  const variant = el("input");
  variant.maxLength = 60;
  variant.placeholder = "例如：冰 · 大杯 · 少甜";
  variant.value = card?.variant || "";
  const items = el("textarea");
  items.required = true;
  items.maxLength = 1800;
  items.placeholder = "每行一项。做顺序题时，按正确顺序输入。";
  items.value = card?.items.join("\n") || "";
  const ordered = el("input");
  ordered.type = "checkbox";
  ordered.checked = Boolean(card?.ordered);
  const check = el("label", null, "check");
  check.append(ordered, el("span", "这些是有顺序的制作步骤"));
  const note = el("input");
  note.maxLength = 180;
  note.placeholder = "例如：练习版，用量以自己的记录为准";
  note.value = card?.note || "";
  const submit = el("button", "保存配方", "primary full");
  submit.type = "submit";
  form.append(field("饮品名", name), field("规格（选填）", variant), field("原料 / 步骤", items),
    check, field("备注（选填）", note), submit);
  form.addEventListener("input", () => { editor.dirty = true; });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const steps = items.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!name.value.trim() || !steps.length) {
      notify("请填写饮品名和至少一项原料或步骤。");
      return;
    }
    const id = card?.id || "user-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
    const saved = {...(card || {id, kind: "custom"}), name: name.value.trim(),
      variant: variant.value.trim(), items: steps, ordered: ordered.checked, note: note.value.trim()};
    if (!save({...state, edits: {...state.edits, [id]: saved}})) return;
    editor = null;
    round = null;
    view = "library";
    query = saved.name;
    render(true);
    notify("配方已保存。");
  });
  screen.append(form);
}

function renderDeletion() {
  const card = pendingDelete;
  screen.append(el("h1", "移到回收站？"), el("p", card.name + (card.variant ? " · " + card.variant : ""), "prompt"));
  screen.append(el("p", "移入后会从题库和练习中隐藏，可在题库的回收站恢复。", "muted"));
  const controls = el("div", null, "actions section");
  controls.append(button("取消", () => { pendingDelete = null; render(); }), button("确认移入", () => {
    if (!save({...state, deleted: [...state.deleted, card.id]})) return;
    pendingDelete = null;
    round = null;
    render(true);
    notify("已移到回收站。");
  }, "danger"));
  screen.append(controls);
}

function renderBin() {
  screen.append(button("‹ 返回题库", () => { bin = false; render(true); }), el("h1", "回收站", "section"));
  if (!state.deleted.length) screen.append(el("p", "回收站为空。", "muted"));
  state.deleted.forEach(id => {
    const card = lookupCard(id);
    if (!card) return;
    const item = el("article", null, "ticket bar");
    item.append(el("span", card.name + (card.variant ? " · " + card.variant : "")), button("恢复", () => {
      if (!save({...state, deleted: state.deleted.filter(key => key !== id)})) return;
      render();
      notify("已恢复到题库。");
    }, "secondary"));
    screen.append(item);
  });
}

function renderLibrary() {
  const bar = el("div", null, "bar");
  const actions = el("div", null, "actions");
  actions.append(button("回收站", () => { bin = true; render(true); }),
    button("＋ 新建", () => openEditor(), "primary"));
  bar.append(el("h1", "题库"), actions);
  const search = el("input");
  search.type = "search";
  search.value = query;
  search.placeholder = "搜饮品、规格、原料";
  const list = el("div");
  const show = () => {
    const words = query.toLowerCase().trim().split(/\s+/);
    const matches = catalog().filter(card => words.every(word =>
      [card.name, card.variant, ...card.items].join(" ").toLowerCase().includes(word),
    ));
    list.replaceChildren(el("p", matches.length ? "找到 " + matches.length + " 张卡" : "没有找到卡片，试试更短的关键词。", "muted section"));
    matches.slice(0, limit).forEach(card => {
      const entry = el("details");
      const title = el("summary", card.name + (card.variant ? " · " + card.variant : ""));
      entry.append(title);
      entry.addEventListener("toggle", () => {
        if (!entry.open || entry.children.length > 1) return;
        const body = answerBlock(card);
        const controls = el("div", null, "actions");
        controls.append(button("练这张", () => { view = "study"; start("flash", [card], 1); }, "primary"),
          button("修改", () => openEditor(card)), button("删除", () => { pendingDelete = card; render(true); }, "danger"));
        body.append(controls);
        entry.append(body);
      });
      list.append(entry);
    });
    if (matches.length > limit) list.append(button("显示更多", () => { limit += 24; show(); }, "ghost full"));
  };
  search.addEventListener("input", () => { query = search.value; limit = 24; show(); });
  screen.append(bar, field("搜索题库", search), list);
  show();
}

function renderMistakes() {
  const cards = wrongCards();
  screen.append(el("h1", "易错卡"), el("p", cards.length ? "还有 " + cards.length + " 张待复习。答对后自动移出。" :
    "这里会收集答错或没记住的卡片。", "prompt"));
  if (!cards.length) {
    screen.append(button("去练习", () => setView("study"), "primary full"));
    return;
  }
  screen.append(button("默写复习", () => start("flash", cards), "primary full"));
  modes.slice(1).forEach(([key, title]) =>
    screen.append(button(title, () => start(key, cards), "secondary full")));
  cards.forEach(card => {
    const item = el("article", null, "ticket bar");
    item.append(el("span", card.name + (card.variant ? " · " + card.variant : "")),
      button("练这张", () => start("flash", [card], 1)));
    screen.append(item);
  });
}

function render(scroll = false) {
  screen.replaceChildren();
  document.getElementById("card-total").textContent = "题库 " + catalog().length + " 张";
  const badge = document.getElementById("wrong-count");
  badge.textContent = wrongCards().length;
  badge.hidden = badge.textContent === "0";
  document.querySelectorAll("[data-view]").forEach(control => {
    if (control.dataset.view === view) control.setAttribute("aria-current", "page");
    else control.removeAttribute("aria-current");
  });
  if (editor) renderEditor();
  else if (pendingDelete) renderDeletion();
  else if (bin) renderBin();
  else if (round) renderRound();
  else if (view === "study") renderStudy();
  else if (view === "library") renderLibrary();
  else renderMistakes();
  if (scroll) window.scrollTo(0, 0);
}

function setView(next) {
  if (editor?.dirty && !window.confirm("离开编辑页？未保存的内容会丢失。")) return;
  editor = null;
  pendingDelete = null;
  bin = false;
  round = null;
  view = next;
  render(true);
}

window.backInApp = () => {
  if (editor) closeEditor();
  else if (pendingDelete) { pendingDelete = null; render(true); }
  else if (bin) { bin = false; render(true); }
  else if (round) { round = null; render(true); }
  else if (view !== "study") setView("study");
  else return false;
  return true;
};

document.querySelectorAll("[data-view]").forEach(control =>
  control.addEventListener("click", () => {
    if (control.dataset.view !== view || (round && round.index === round.questions.length)) {
      setView(control.dataset.view);
    }
  }),
);
render();
if (storageProblem) notify("历史记录读取失败，请检查应用存储。");
