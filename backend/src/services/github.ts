export type GitProviderType = 'github' | 'gitlab' | 'bitbucket';

export interface GitHubRepoConfig {
  provider?: GitProviderType;
  owner: string;
  repo: string;
  token?: string;
  defaultBranch?: string;
  gitlabProjectId?: string | number;
  apiBaseUrl?: string; // Optional custom self-hosted host e.g. gitlab.company.com
}

export interface PullRequestResult {
  prNumber: number;
  prUrl: string;
  branch: string;
  status: 'open' | 'simulated';
  provider: GitProviderType;
}

/**
 * Service to manage Git branches, file commits, and Pull/Merge Requests
 * Supports GitHub, GitLab, and Bitbucket with automated fallbacks.
 */
export class GitHubService {
  private config: GitHubRepoConfig;

  constructor(config: GitHubRepoConfig) {
    this.config = config;
  }

  /**
   * Opens a Pull Request / Merge Request with reproduction test and surgical patch
   */
  async createAutoFixPR(
    branchName: string,
    title: string,
    body: string,
    filePath: string,
    newFileContent: string
  ): Promise<PullRequestResult> {
    const { 
      provider = 'github', 
      owner, 
      repo, 
      token, 
      defaultBranch = 'main',
      gitlabProjectId,
      apiBaseUrl
    } = this.config;

    // 1. If real GitHub token provided
    if (provider === 'github' && token && token.trim() !== '' && !token.startsWith('mock_')) {
      try {
        console.log(`[GIT SERVICE] Creating GitHub branch ${branchName} on ${owner}/${repo}...`);
        const baseHost = apiBaseUrl || 'https://api.github.com';
        
        // 1. Get SHA of base branch
        const refRes = await fetch(`${baseHost}/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        
        if (refRes.ok) {
          const refData = await refRes.json();
          const baseSha = refData.object.sha;

          // 2. Create new branch
          await fetch(`${baseHost}/repos/${owner}/${repo}/git/refs`, {
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
          await fetch(`${baseHost}/repos/${owner}/${repo}/contents/${filePath}`, {
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
          const prRes = await fetch(`${baseHost}/repos/${owner}/${repo}/pulls`, {
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
              status: 'open',
              provider: 'github'
            };
          }
        }
      } catch (err: any) {
        console.warn('[GIT SERVICE] Real GitHub API call failed, falling back to simulated PR:', err.message);
      }
    }

    // 2. If real GitLab token provided
    if (provider === 'gitlab' && token && token.trim() !== '' && !token.startsWith('mock_')) {
      try {
        const baseHost = apiBaseUrl || 'https://gitlab.com/api/v4';
        const projectIdentifier = encodeURIComponent(String(gitlabProjectId || `${owner}/${repo}`));

        console.log(`[GIT SERVICE] Creating GitLab branch ${branchName} on ${projectIdentifier}...`);

        // 1. Create branch
        await fetch(`${baseHost}/projects/${projectIdentifier}/repository/branches`, {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            branch: branchName,
            ref: defaultBranch
          })
        });

        // 2. Commit file change
        await fetch(`${baseHost}/projects/${projectIdentifier}/repository/commits`, {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            branch: branchName,
            commit_message: `fix(autofix): ${title}`,
            actions: [
              {
                action: 'update',
                file_path: filePath,
                content: newFileContent
              }
            ]
          })
        });

        // 3. Create Merge Request
        const mrRes = await fetch(`${baseHost}/projects/${projectIdentifier}/merge_requests`, {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            source_branch: branchName,
            target_branch: defaultBranch,
            title,
            description: body
          })
        });

        if (mrRes.ok) {
          const mrData = await mrRes.json();
          return {
            prNumber: mrData.iid || mrData.id,
            prUrl: mrData.web_url,
            branch: branchName,
            status: 'open',
            provider: 'gitlab'
          };
        }
      } catch (err: any) {
        console.warn('[GIT SERVICE] Real GitLab API call failed, falling back to simulated MR:', err.message);
      }
    }

    // 3. If real Bitbucket token provided
    if (provider === 'bitbucket' && token && token.trim() !== '' && !token.startsWith('mock_')) {
      try {
        const baseHost = 'https://api.bitbucket.org/2.0';
        console.log(`[GIT SERVICE] Creating Bitbucket PR ${branchName} on ${owner}/${repo}...`);

        // 1. Create branch
        await fetch(`${baseHost}/repositories/${owner}/${repo}/refs/branches`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: branchName,
            target: { hash: defaultBranch }
          })
        });

        // 2. Create Pull Request
        const bbPrRes = await fetch(`${baseHost}/repositories/${owner}/${repo}/pullrequests`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title,
            description: body,
            source: { branch: { name: branchName } },
            destination: { branch: { name: defaultBranch } }
          })
        });

        if (bbPrRes.ok) {
          const bbData = await bbPrRes.json();
          return {
            prNumber: bbData.id,
            prUrl: bbData.links?.html?.href,
            branch: branchName,
            status: 'open',
            provider: 'bitbucket'
          };
        }
      } catch (err: any) {
        console.warn('[GIT SERVICE] Real Bitbucket API call failed, falling back to simulated PR:', err.message);
      }
    }

    // 4. Simulated Pull Request / Merge Request for preview, testing & environments without Git credentials
    const prNumber = Math.floor(100 + Math.random() * 900);
    let simulatedUrl = `https://github.com/${owner || 'agency-client'}/${repo || 'client-app'}/pull/${prNumber}`;
    if (provider === 'gitlab') {
      simulatedUrl = `https://gitlab.com/${owner || 'agency-client'}/${repo || 'client-app'}/-/merge_requests/${prNumber}`;
    } else if (provider === 'bitbucket') {
      simulatedUrl = `https://bitbucket.org/${owner || 'agency-client'}/${repo || 'client-app'}/pull-requests/${prNumber}`;
    }

    return {
      prNumber,
      prUrl: simulatedUrl,
      branch: branchName,
      status: 'simulated',
      provider
    };
  }
}
