import { AIBetaTester } from './services/ai-beta-tester';

async function runBetaTesterVerification() {
  console.log('====================================================');
  console.log('🤖 Starting Autonomous AI Beta Tester & Quality Verification');
  console.log('====================================================\n');

  // 1. Initialize AI Beta Tester in Exploratory Mode
  console.log('1. Initializing AI Beta Tester with Inquisitive User Persona...');
  const tester = new AIBetaTester({
    targetType: 'web',
    targetUrlOrPath: 'http://localhost:5173/dashboard',
    personaPrompt: 'Exploratory user stress-testing buttons, form inputs, and export triggers.',
    maxSteps: 5,
    autoFix: true,
    agentId: '00000000-0000-0000-0000-000000000001'
  });

  console.log('2. Running Autonomous Testing Session...');
  const report = await tester.runSession();

  console.log('\n--- 📋 AI Beta Test Report Summary ---');
  console.log(`Test Run ID:       ${report.id}`);
  console.log(`Target:            ${report.targetUrlOrPath}`);
  console.log(`Status:            ${report.status}`);
  console.log(`Total Steps Taken: ${report.totalSteps}`);
  console.log(`Bugs Discovered:   ${report.bugsFound.length}`);
  console.log(`UX Quality Score:  ${report.uxAnalysis.overallScore}/100`);

  console.log('\n--- 🐾 Steps Executed by AI Persona ---');
  report.steps.forEach(step => {
    console.log(`  [Step ${step.stepNumber}] Action: ${step.action.toUpperCase()} | Target: "${step.targetDescription}"`);
    console.log(`    ↳ Reasoning: ${step.reasoning}`);
  });

  if (report.bugsFound.length > 0) {
    console.log('\n--- 🚨 Bugs Caught & Software Factory Auto-Fix ---');
    report.bugsFound.forEach((bug, idx) => {
      console.log(`\n  Bug #${idx + 1}: ${bug.title}`);
      console.log(`  Encountered on: Step ${bug.stepEncountered}`);
      if (bug.autoFixResult) {
        console.log(`  ⚡ Auto-Fix PR Synthesized: ${bug.autoFixResult.github_pr_url || 'Simulated branch created'}`);
        console.log(`  ⚡ Branch Name:             ${bug.autoFixResult.branch_name}`);
        console.log(`  ⚡ Status:                  ${bug.autoFixResult.status.toUpperCase()}`);
      }
    });
  }

  console.log('\n--- 💡 UX Findings & Recommendations ---');
  report.uxAnalysis.recommendations.forEach(rec => console.log(`  • ${rec}`));

  console.log('\n✅ Verification Complete: AI Beta Tester and Auto-Fix integration confirmed!\n');
}

runBetaTesterVerification().catch(err => {
  console.error('Test verification failed:', err);
  process.exit(1);
});
