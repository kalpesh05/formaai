export interface GitHubRepoConfig {
  owner: string;
  repo: string;
  token?: string;
  defaultBranch?: string;
}

export interface PullRequestResult {
  prNumber: number;
  prUrl: string;
  branch: string;
  status: 'open' | 'simulated';
}

/**
 * Service to manage GitHub branches, file commits, and Pull Requests
 */
export class GitHubService {
  private config: GitHubRepoConfig;

  constructor(config: GitHubRepoConfig) {
    this.config = config;
  }

  /**
   * Opens a GitHub pull request with reproduction test and surgical patch
   */
  async createAutoFixPR(
    branchName: string,
    title: string,
    body: string,
    filePath: string,
    newFileContent: string
  ): Promise<PullRequestResult> {
    const { owner, repo, token, defaultBranch = 'main' } = this.config;

    // If real GitHub token provided, dispatch real Octokit / REST calls
    if (token && token.trim() !== '' && !token.startsWith('mock_')) {
      try {
        console.log(`[GITHUB SERVICE] Creating real branch ${branchName} on ${owner}/${repo}...`);
        
        // 1. Get SHA of base branch
        const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        
        if (refRes.ok) {
          const refData = await refRes.json();
          const baseSha = refData.object.sha;

          // 2. Create new branch
          await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
            method: 'POST',
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              ref: `refs/heads/${branchName}`,
              sha: baseSha
            })
          });

          // 3. Create or update file on new branch
          const encodedContent = Buffer.from(newFileContent).toString('base64');
          await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `fix(autofix): ${title}`,
              content: encodedContent,
              branch: branchName
            })
          });

          // 4. Create Pull Request
          const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
            method: 'POST',
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              title,
              body,
              head: branchName,
              base: defaultBranch
            })
          });

          if (prRes.ok) {
            const prData = await prRes.json();
            return {
              prNumber: prData.number,
              prUrl: prData.html_url,
              branch: branchName,
              status: 'open'
            };
          }
        }
      } catch (err: any) {
        console.warn('[GITHUB SERVICE] Real GitHub API call failed, falling back to simulated PR:', err.message);
      }
    }

    // Simulated Pull Request for local testing & live demos
    const prNumber = Math.floor(100 + Math.random() * 900);
    return {
      prNumber,
      prUrl: `https://github.com/${owner || 'acme-saas'}/${repo || 'core-platform'}/pull/${prNumber}`,
      branch: branchName,
      status: 'simulated'
    };
  }
}
