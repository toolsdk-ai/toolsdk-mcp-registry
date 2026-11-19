const marker = "<!-- toolsdk-star-reminder -->";

// All PR data comes from GitHub's API, never from executable contributor code.
module.exports = async function remind({ github, context, core }) {
  const repo = context.repo;
  const value = context.payload.pull_request?.number ?? context.payload.inputs?.pr_number;
  let status = "Unable to confirm";
  try {
    if (!/^[1-9]\d*$/.test(String(value))) throw new Error("A valid PR number is required");
    const issue_number = Number(value);
    const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: issue_number });
    if (pr.state !== "open" || pr.draft || pr.base.ref !== "main") {
      status = "Skipped: not an open, ready submission to main";
      return;
    }
    const files = await github.paginate(github.rest.pulls.listFiles, {
      ...repo,
      pull_number: issue_number,
      per_page: 100,
    });
    if (
      !files.some(
        (file) => file.status !== "removed" && /^packages\/[^/]+\/[^/]+\.json$/.test(file.filename),
      )
    ) {
      status = "Skipped: no package JSON submission";
      return;
    }

    const author = pr.user.login;
    let starred = false;
    for await (const page of github.paginate.iterator(github.rest.activity.listStargazersForRepo, {
      ...repo,
      per_page: 100,
    })) {
      if (page.data.some((user) => user.login.toLowerCase() === author.toLowerCase())) {
        starred = true;
        break;
      }
    }
    status = starred ? `@${author}: Star confirmed` : `@${author}: Star not found`;
    const comments = await github.paginate(github.rest.issues.listComments, {
      ...repo,
      issue_number,
      per_page: 100,
    });
    const existing = comments.find(
      (comment) => comment.user?.login === "github-actions[bot]" && comment.body?.includes(marker),
    );
    // Already-starred authors need no extra notification. Update a previous reminder
    // when a later run confirms the Star, rather than posting a second comment.
    if (starred && !existing) return;
    const url = `https://github.com/${repo.owner}/${repo.repo}`;
    const message = starred
      ? `Thanks, @${author} — your Star is confirmed! Your support helps sustain maintainer reviews and helps more developers discover the registry and its listed MCP servers, including yours.`
      : `Thanks for contributing, @${author}! We could not find a Star on this repository from your submitting account at the time of this check. Please star [ToolSDK MCP Registry](${url}) to support the maintainer time and care that goes into reviewing our growing number of submissions. A Star also helps more developers discover the registry and your MCP server. One Star per account is enough.\n\nIf you have just starred, thank you! We will pick it up on the next check.`;
    const body = `${message}\n\n${marker}`;
    if (existing) {
      if (existing.body !== body) {
        await github.rest.issues.updateComment({ ...repo, comment_id: existing.id, body });
      }
    } else {
      await github.rest.issues.createComment({ ...repo, issue_number, body });
    }
  } catch (error) {
    // API/rate-limit/permission failures are unknown, never evidence of a missing Star.
    core.warning(`Star reminder could not complete: ${error.message}`);
    status = "Unable to confirm or update reminder; retry this workflow";
  } finally {
    await core.summary
      .addHeading("Submission Star Reminder")
      .addRaw(`${status}\n\nInformational only; schema and formatting checks remain independent.\n`)
      .write();
  }
};
