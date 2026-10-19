// node --test tests/*.test.mjs: where agents look: .well-known/skills/index.json, the alternate links, robots.txt
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("the skills index parses and points at a skill file that exists, with the name its front matter gives", () => {
  const index = JSON.parse(read(".well-known/skills/index.json"));
  assert.ok(Array.isArray(index.skills) && index.skills.length >= 1, "at least one skill");
  for (const s of index.skills) {
    assert.ok(s.name && s.description, "a name and a description");
    assert.equal(s.type, "skill-md");
    assert.match(s.url, /^\/[^/]/, "a path from the site root");
    assert.ok(existsSync(new URL("." + s.url, root)), `${s.url} is served from the site root`);
  }
  const havre = index.skills.find((s) => s.name === "havre");
  assert.ok(havre, "Havre's skill is listed");
  assert.equal(havre.url, "/skill.md");
  assert.match(read("skill.md"), /^---\nname: havre\n/, "skill.md's own front matter agrees on the name");
});

test("index.html carries the alternate links to llms.txt and skill.md, in the head", () => {
  const head = read("index.html").split("</head>")[0];
  assert.match(head, /<link rel="alternate" type="text\/plain" href="llms\.txt" title="For agents">/);
  assert.match(head, /<link rel="alternate" type="text\/markdown" href="skill\.md" title="Skill">/);
  for (const href of ["llms.txt", "skill.md"]) assert.ok(existsSync(new URL(href, root)), `${href} exists`);
});

test("robots.txt allows everything and names the sitemap", () => {
  const robots = read("robots.txt");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: *\S/m, "nothing is shut out");
  assert.match(robots, /^Sitemap: https:\/\/havre\.yolopreneur\.lol\/sitemap\.txt$/m);
});
