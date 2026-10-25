const fs = require('fs');
const path = require('path');

const SKILL_ROLE_MAP = {
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

function getSkillsRootDir() {
  const rootSkills = path.resolve(__dirname);
  if (fs.existsSync(path.join(rootSkills, 'product-manager'))) return rootSkills;
  return path.resolve(process.cwd(), 'skills');
}

function getSkillsForRole(role) {
  const rootDir = getSkillsRootDir();
  const fileNames = SKILL_ROLE_MAP[role] || [];
  const skills = [];

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

function enhancePromptWithSkills(role, basePrompt) {
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

module.exports = {
  getSkillsForRole,
  enhancePromptWithSkills,
  SKILL_ROLE_MAP
};
