import fs from 'fs';
import path from 'path';

export type AgentRole = 'pm' | 'architect' | 'frontend' | 'backend' | 'qa' | 'devops';

export interface AgentSkill {
  id: string;
  name: string;
  role: AgentRole;
  filePath: string;
  content: string;
}

const SKILL_ROLE_MAP: Record<AgentRole, string[]> = {
  pm: ['product-manager/requirements-spec.md'],
  architect: [
    'architect/system-design.md',
    'architect/repo-mapping.md',
    'architect/api-contract-first.md'
  ],
  frontend: [
    'frontend/ui-engineering.md',
    'frontend/web-performance.md'
  ],
  backend: [
    'backend/api-design.md',
    'backend/backend-security-owasp.md',
    'backend/database-migrations.md'
  ],
  qa: [
    'qa/test-driven-development.md',
    'qa/systematic-debugging.md'
  ],
  devops: [
    'devops/git-pr-automation.md'
  ]
};

/**
 * Resolves the root skills directory across different runtimes
 */
function getSkillsRootDir(): string {
  // Check root /skills first
  const rootSkills = path.resolve(__dirname, '../../../skills');
  if (fs.existsSync(rootSkills)) return rootSkills;

  const localSkills = path.resolve(__dirname, '../../skills');
  if (fs.existsSync(localSkills)) return localSkills;

  return path.resolve(process.cwd(), 'skills');
}

/**
 * Loads all skills assigned to a specific agent role
 */
export function getSkillsForRole(role: AgentRole): AgentSkill[] {
  const rootDir = getSkillsRootDir();
  const fileNames = SKILL_ROLE_MAP[role] || [];
  const skills: AgentSkill[] = [];

  for (const relPath of fileNames) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const id = path.basename(relPath, '.md');
      skills.push({
        id,
        name: id.replace(/-/g, ' ').toUpperCase(),
        role,
        filePath: fullPath,
        content
      });
    }
  }

  return skills;
}

/**
 * Injects compiled skills directly into an agent's system prompt to enforce accuracy
 */
export function enhancePromptWithSkills(role: AgentRole, basePrompt: string): string {
  const skills = getSkillsForRole(role);
  if (skills.length === 0) return basePrompt;

  const compiledSkills = skills
    .map(s => `\n--- ACTIVE SKILL: ${s.name} ---\n${s.content}\n--- END SKILL ---\n`)
    .join('\n');

  return `${basePrompt}

======================================================================
MANDATORY OPERATIONAL SKILLS & QUALITY GUARDRAILS
You MUST strictly adhere to the following professional skills:
======================================================================
${compiledSkills}
======================================================================`;
}
