import {
  extractEmailAndName,
  cleanQuotedEmailBody,
  isAutomatedOrBounceEmail,
} from './services/mailboxService';

function runUnitTests() {
  console.log('--- Testing Mailbox Parser & Utilities ---');

  // Test 1: Sender Name & Email Extraction
  const sender1 = extractEmailAndName('"Sarah Connor" <sarah@cyberdyne.com>');
  console.assert(sender1.name === 'Sarah Connor', `Failed name: got ${sender1.name}`);
  console.assert(sender1.email === 'sarah@cyberdyne.com', `Failed email: got ${sender1.email}`);

  const sender2 = extractEmailAndName('john.doe@example.org');
  console.assert(sender2.email === 'john.doe@example.org', `Failed email: got ${sender2.email}`);
  console.assert(sender2.name === 'john.doe', `Failed name: got ${sender2.name}`);

  const sender3 = extractEmailAndName('<alex@startup.io>');
  console.assert(sender3.email === 'alex@startup.io', `Failed email: got ${sender3.email}`);

  console.log('✓ extractEmailAndName tests passed');

  // Test 2: Quoted History Stripping
  const emailWithQuote = `Hi, I cannot export my PDF invoices. The button is greyed out.
Can you please help?

On Wed, Oct 7, 2026 at 11:20 PM Support Team <support@formaai.com> wrote:
> Hello Sarah,
> Welcome to our support desk. How can we assist?`;

  const cleaned = cleanQuotedEmailBody(emailWithQuote);
  console.assert(!cleaned.includes('On Wed, Oct 7'), 'Should strip On ... wrote header');
  console.assert(!cleaned.includes('> Hello Sarah'), 'Should strip quoted lines');
  console.assert(cleaned.includes('The button is greyed out.'), 'Should retain core inquiry');
  console.log('✓ cleanQuotedEmailBody tests passed');

  // Test 3: Bounce and Infinite Loop Prevention
  console.assert(
    isAutomatedOrBounceEmail('mailer-daemon@googlemail.com', 'Delivery Failure') === true,
    'Should detect mailer-daemon'
  );
  console.assert(
    isAutomatedOrBounceEmail('noreply@service.com', 'Your statement') === true,
    'Should detect noreply'
  );
  console.assert(
    isAutomatedOrBounceEmail('user@company.com', 'Auto-Reply: Out of office until Monday') === true,
    'Should detect Auto-Reply'
  );
  console.assert(
    isAutomatedOrBounceEmail('customer@gmail.com', 'Need help with billing invoice') === false,
    'Should NOT flag legitimate customer'
  );
  console.log('✓ isAutomatedOrBounceEmail tests passed');

  console.log('All Mailbox Unit Tests Passed Successfully!');
}

runUnitTests();
