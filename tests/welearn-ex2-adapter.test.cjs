const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");
const { JSDOM } = require("jsdom");

const adapterPath = path.resolve(
    __dirname,
    "../src/projects/welearn/exercise/dataSolution/adapter.ts",
);
const source = fs.readFileSync(adapterPath, "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const adapterModule = new Module(adapterPath, module);
adapterModule.filename = adapterPath;
adapterModule.paths = Module._nodeModulePaths(path.dirname(adapterPath));
adapterModule._compile(compiled, adapterPath);
const { parseDataSolutionDom, fillDataSolutionBlank } = adapterModule.exports;

const fixture = fs.readFileSync(
    path.join(__dirname, "fixtures/welearn-ex2-synthetic.html"),
    "utf8",
);
const samples = [
    "alpha beta-gamma delta",
    "twenty five",
    "Hello, world!",
    "well-known phrase",
    "case-sensitive ABC",
    "two words with punctuation, yes.",
];
const durations = [];

for (let round = 0; round < 20; round++) {
    const started = performance.now();
    const dom = new JSDOM(fixture, { url: "https://fixture.invalid/" });
    const document = dom.window.document;
    let submitClicks = 0;
    document.querySelector("#submit").addEventListener("click", () => submitClicks++);

    const answers = parseDataSolutionDom(document);
    assert.equal(answers.length, 10, "all answer-bearing nodes stay in sequence");
    assert.deepEqual(answers.map((x) => x.index), [1,2,3,4,5,6,7,8,9,10]);
    assert.deepEqual(answers.map((x) => x.type), [
        "choice", "choice", "choice", "choice",
        "blank", "blank", "blank", "blank", "blank", "blank",
    ]);
    assert.deepEqual(answers.slice(0, 4).map((x) => x.text), [
        "Choice A", "Choice B", "Choice C", "Choice D",
    ]);

    let inputEvents = 0;
    let changeEvents = 0;
    document.querySelector("#exercise").addEventListener("input", () => inputEvents++);
    document.querySelector("#exercise").addEventListener("change", () => changeEvents++);
    for (let i = 0; i < 6; i++) {
        const answer = answers[i + 4];
        const expected = samples[(round + i) % samples.length];
        fillDataSolutionBlank(answer.element, undefined, expected);
        assert.equal(answer.element.value, expected, `round ${round + 1}, textarea ${i + 1}`);
        answer.element.value = "";
        assert.equal(answer.element.value, "", "clear restores the fixture field");
    }

    assert.equal(inputEvents, 6, "bubbling input events reach the form");
    assert.equal(changeEvents, 6, "bubbling change events reach the form");
    assert.equal(submitClicks, 0, "the adapter never submits the form");

    if (round === 0) {
        const oldNode = answers[4].element;
        const replacement = oldNode.cloneNode(false);
        oldNode.replaceWith(replacement);
        const rerendered = parseDataSolutionDom(document);
        fillDataSolutionBlank(rerendered[4].element, undefined, "rerendered-value");
        assert.equal(replacement.value, "rerendered-value");
        replacement.value = "";
        assert.equal(submitClicks, 0);
    }

    durations.push(performance.now() - started);
    dom.window.close();
}

durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.ceil(p * durations.length) - 1];
const mean = durations.reduce((sum, x) => sum + x, 0) / durations.length;
console.log(`PASS rounds=${durations.length} mapped_items=10 textarea_writes=120 dynamic_rerender=1 submit_clicks=0`);
console.log(`FIXTURE_MS mean=${mean.toFixed(2)} p50=${percentile(0.50).toFixed(2)} p95=${percentile(0.95).toFixed(2)}`);
