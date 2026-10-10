import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import { mkdirSync, writeFileSync } from 'fs';

const OUT = path.join(os.tmpdir(), 'ragbot_dashboard_screenshots');
mkdirSync(OUT, { recursive: true });

const ss = (name) => path.join(OUT, name);
let step = 0;
function log(msg) { console.log(`[${++step}] ${msg}`); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', m => { if (m.type() === 'error') console.error('PAGE:', m.text()); });

// ── 1. Sign up a fresh account ────────────────────────────────────────────
const email = `verify${Date.now()}@test.com`;
const password = 'testpassword123';
const orgName = `VerifyOrg${Date.now()}`;

await page.goto('http://localhost:5173/signup');
await page.waitForLoadState('networkidle');
await page.fill('#orgName', orgName);
await page.fill('#email', email);
await page.fill('#password', password);
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.screenshot({ path: ss('01_dashboard_empty.png') });
log('signed up → landed on dashboard (no KBs yet)');

// ── 2. Open Create KB modal ───────────────────────────────────────────────
await page.click('button:has-text("New knowledge base")');
await page.waitForTimeout(300);
await page.screenshot({ path: ss('02_create_kb_modal.png') });
log('create KB modal opened');

// ── 3. Fill and submit KB form ────────────────────────────────────────────
await page.fill('#kb-name', 'Product Docs');
await page.fill('#kb-desc', 'Main product documentation knowledge base');
await page.click('button[type="submit"]:has-text("Create")');
await page.waitForTimeout(800);
await page.screenshot({ path: ss('03_kb_created_sidebar.png') });
const sidebarText = await page.$$eval('nav button', els => els.map(e => e.textContent?.trim()));
log(`KB created → sidebar buttons: ${JSON.stringify(sidebarText)}`);

// ── 4. Screenshot KB view with upload dropzone ────────────────────────────
await page.waitForSelector('[aria-label="Upload document"]');
await page.screenshot({ path: ss('04_kb_view_with_dropzone.png') });
log('KB content area loaded with upload dropzone');

// ── 5. Upload a file ──────────────────────────────────────────────────────
// Create a temp file
const tmpFile = path.join(os.tmpdir(), 'ragbot_test.txt');
writeFileSync(tmpFile, 'This is a test document for the RAG platform. It has multiple sentences for chunking. The quick brown fox jumped over the lazy dog. Knowledge retrieval should work after indexing this content.');

const [fc] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('[aria-label="Upload document"]'),
]);
await fc.setFiles(tmpFile);
await page.waitForTimeout(1500); // Let upload complete
await page.screenshot({ path: ss('05_after_upload.png') });

// Check doc card appeared
const docCards = await page.$$('.bg-surface.rounded-xl.p-4');
log(`After upload → found ${docCards.length} document card(s)`);

// Get status
const statusBadges = await page.$$eval('span.rounded-full', els => els.map(e => e.textContent?.trim()));
log(`Status badges: ${JSON.stringify(statusBadges)}`);

// ── 6. Poll for status changes ────────────────────────────────────────────
log('Polling for status updates (max 20s)...');
let finalStatus = '';
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(2000);
  const badges = await page.$$eval('span.rounded-full', els => els.map(e => e.textContent?.trim()));
  log(`  t=${i * 2 + 2}s → badges: ${JSON.stringify(badges)}`);
  finalStatus = badges[0] ?? '';

  // Screenshot while processing
  if (i === 1) {
    await page.screenshot({ path: ss('06_processing_state.png') });
    log('  screenshot taken during processing');
  }

  if (finalStatus === 'complete' || finalStatus === 'failed') {
    await page.screenshot({ path: ss('07_terminal_state.png') });
    log(`  reached terminal state: ${finalStatus}`);
    break;
  }
}

// ── 7. Upload a second document ────────────────────────────────────────────
const tmpFile2 = path.join(os.tmpdir(), 'ragbot_test2.txt');
writeFileSync(tmpFile2, 'Second test document. This one tests multi-document scenarios. Each document should be independently tracked and displayed in the knowledge base.');

const [fc2] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('[aria-label="Upload document"]'),
]);
await fc2.setFiles(tmpFile2);
await page.waitForTimeout(1500);
await page.screenshot({ path: ss('08_two_docs.png') });
const docCount = await page.$$eval('.bg-surface.rounded-xl.p-4', els => els.length);
log(`Two docs uploaded → ${docCount} cards shown`);

// ── 8. Create second KB and switch ────────────────────────────────────────
await page.click('button:has-text("New knowledge base")');
await page.waitForTimeout(300);
await page.fill('#kb-name', 'Engineering Specs');
await page.click('button[type="submit"]:has-text("Create")');
await page.waitForTimeout(800);
await page.screenshot({ path: ss('09_second_kb_empty.png') });
const sidebar2 = await page.$$eval('nav button', els => els.map(e => e.textContent?.trim()));
log(`Second KB created → sidebar: ${JSON.stringify(sidebar2)}`);

// Check second KB has no docs (fresh)
const docsInSecondKB = await page.$$('.bg-surface.rounded-xl.p-4');
log(`Second KB doc count: ${docsInSecondKB.length} (should be 0)`);

// ── 9. Switch back to first KB ────────────────────────────────────────────
await page.click('nav button:has-text("Product Docs")');
await page.waitForTimeout(600); // let cross-fade complete + docs load
await page.screenshot({ path: ss('10_switch_back_first_kb.png') });
const docsBackInFirst = await page.$$('.bg-surface.rounded-xl.p-4');
log(`Switched back to Product Docs → ${docsBackInFirst.length} doc(s) shown`);

// ── 10. Final combined screenshot ─────────────────────────────────────────
await page.screenshot({ path: ss('11_final_state.png') });
log('Final screenshot captured');

await browser.close();
console.log(`\nAll screenshots → ${OUT}`);
console.log(`Final doc status: ${finalStatus}`);
