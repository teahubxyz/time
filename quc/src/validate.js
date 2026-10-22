// Shared by the page (inlined via toString) and the server. Returns {repo?, task?} errors; {} is valid.
export function validate(repo, task) {
  const e = {};
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/.test(repo)) e.repo = "Use a public GitHub repo URL, like https://github.com/owner/name.";
  if (task.length < 10) e.task = "Say a bit more: at least 10 characters.";
  else if (task.length > 200) e.task = "Keep it to one line: 200 characters at most.";
  return e;
}
