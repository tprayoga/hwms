import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually parse backend DB credentials into Playwright process context
try {
  const envPath = path.resolve(__dirname, '../../api/.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    for (const line of envFile.split('\n')) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        if (key && !key.startsWith('#')) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.error('Failed to load manually parsed .env:', e);
}

// Cascade cleanup helper
async function cleanUpE2ETasks(prisma: PrismaClient) {
  try {
    const u1 = await prisma.user.findFirst({ where: { email: 'eng1.be@indotek.com' } });
    const u2 = await prisma.user.findFirst({ where: { email: 'eng2.be@indotek.com' } });
    
    if (u1 && u2) {
      // Cascade delete standup items and blockers referencing checkins of test users
      await prisma.standupItem.deleteMany({
        where: {
          checkin: {
            user_id: { in: [u1.id, u2.id] }
          }
        }
      });
      await prisma.blocker.deleteMany({
        where: {
          reported_by: { in: [u1.id, u2.id] }
        }
      });
      // Delete checkins for u1 and u2
      await prisma.checkin.deleteMany({
        where: {
          user_id: { in: [u1.id, u2.id] }
        }
      });
    }

    // Delete blockers referencing ETE tasks
    await prisma.blocker.deleteMany({ where: { task: { code: { startsWith: 'ETE-' } } } });
    // Delete standup items referencing ETE tasks
    await prisma.standupItem.deleteMany({ where: { task: { code: { startsWith: 'ETE-' } } } });
    // Delete task assignments
    await prisma.taskAssignment.deleteMany({ where: { task: { code: { startsWith: 'ETE-' } } } });
    // Delete tasks
    await prisma.task.deleteMany({ where: { code: { startsWith: 'ETE-' } } });
  } catch (e) {
    console.error('E2E Clean-up cascading failed:', e);
  }
}

test.describe('E2E Full 1-Day Cycle and Blocker Lifecycle Test', () => {
  
  test.beforeAll(async () => {
    const prisma = new PrismaClient();
    
    // Find our users
    const u1 = await prisma.user.findFirst({ where: { email: 'eng1.be@indotek.com' } });
    const u2 = await prisma.user.findFirst({ where: { email: 'eng2.be@indotek.com' } });
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'indotek' } });
    const roleBE = await prisma.functionalRole.findFirst({ where: { code: 'BE' } });

    if (u1 && u2 && tenant && roleBE) {
      // Find active project
      const project = await prisma.project.findFirst({
        where: { name: 'Saft VE POC' }
      });
      
      if (!project) throw new Error('Active project Saft VE POC not found');

      // Find active sprint covering today
      const sprint = await prisma.sprint.findFirst({
        where: {
          project_id: project.id,
          start_date: { lte: new Date() },
          end_date: { gte: new Date() }
        }
      });

      if (!sprint) throw new Error('Active sprint for today not found');

      // Cascade cleanup any left-over records
      await cleanUpE2ETasks(prisma);

      // Create Task for User 1
      const t1 = await prisma.task.create({
        data: {
          tenant_id: tenant.id,
          project_id: project.id,
          sprint_id: sprint.id,
          functional_role_id: roleBE.id,
          code: 'ETE-99-0001',
          workstream: 'Testing',
          title: 'E2E User 1 Task',
          deliverable: 'Task Done',
          priority: 'HIGH',
          planned_start: sprint.start_date,
          planned_end: sprint.end_date,
          status: 'IN_PROGRESS',
          percent_complete: 10,
          weight: 1
        }
      });

      await prisma.taskAssignment.create({
        data: {
          tenant_id: tenant.id,
          task_id: t1.id,
          user_id: u1.id,
          assigned_at: new Date()
        }
      });

      // Create Task for User 2
      const t2 = await prisma.task.create({
        data: {
          tenant_id: tenant.id,
          project_id: project.id,
          sprint_id: sprint.id,
          functional_role_id: roleBE.id,
          code: 'ETE-99-0002',
          workstream: 'Testing',
          title: 'E2E User 2 Task',
          deliverable: 'Task Done',
          priority: 'HIGH',
          planned_start: sprint.start_date,
          planned_end: sprint.end_date,
          status: 'IN_PROGRESS',
          percent_complete: 20,
          weight: 1
        }
      });

      await prisma.taskAssignment.create({
        data: {
          tenant_id: tenant.id,
          task_id: t2.id,
          user_id: u2.id,
          assigned_at: new Date()
        }
      });
    }
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient();
    await cleanUpE2ETasks(prisma);
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ context, page }) => {
    // Configure Playwright native context geolocation and permissions
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -6.917464, longitude: 107.619122, accuracy: 10 });

    // Register diagnostic listeners
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
    page.on('requestfailed', request => console.error('REQUEST FAILED:', request.url(), request.failure()?.errorText));
    page.on('response', response => {
      if (response.status() >= 400) {
        response.text().then(text => console.error(`RESPONSE ERROR [${response.status()}] ${response.url()}:`, text));
      }
    });

    // Mock geolocation & non-blocking alert/confirm dialogs
    await page.addInitScript(() => {
      window.alert = (msg) => {
        console.log('BROWSER ALERT MOCKED:', msg);
      };
      window.confirm = (msg) => {
        console.log('BROWSER CONFIRM MOCKED:', msg);
        return true;
      };

      const mockGeolocation = {
        getCurrentPosition: (success: any) => {
          success({
            coords: {
              latitude: -6.917464,
              longitude: 107.619122,
              accuracy: 10,
            },
            timestamp: Date.now(),
          });
        },
        watchPosition: () => 0,
        clearWatch: () => {}
      };
      Object.defineProperty(navigator, 'geolocation', {
        value: mockGeolocation,
        configurable: true
      });
    });
  });

  test('should execute 1-day check-in, blocker, resolve, checkout, and dashboard cycle', async ({ page }) => {
    // === USER 1: eng1.be@indotek.com (WFO check-in and checkout) ===
    console.log('--- User 1 (WFO Check-in) ---');
    await page.goto('/');
    await page.fill('input[type="email"]', 'eng1.be@indotek.com');
    await page.fill('input[type="password"]', 'SuperSecurePassword123');
    await page.click('button:has-text("Masuk")');

    // Wait for Hari Ini panel
    await expect(page.locator('h2:has-text("Check-in Kehadiran & Standup")')).toBeVisible();

    // Select WFO
    await page.click('button:has-text("🏢 WFO")');
    await page.fill('textarea[placeholder="Hari ini berencana fokus pada..."]', 'WFO Backend coding task.');

    // Inject selfie preview
    await page.evaluate(() => {
      (window as any).selfiePreview = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    });
    await page.waitForTimeout(500);

    // Check first checkbox which is the task (index 0)
    await page.locator('input[type="checkbox"]').first().check();

    // Kirim Check-in using unambiguous submit button selector
    await page.locator('button[type="submit"]').click();
    
    // Wait for OUT state
    await expect(page.locator('h2:has-text("Check-out Kehadiran & Standup")')).toBeVisible();

    // Do Checkout immediately for User 1
    console.log('--- User 1 (WFO Checkout) ---');
    await page.fill('textarea[placeholder="Hari ini berhasil menyelesaikan..."]', 'Finished Backend API coding tasks.');
    
    // Inject checkout selfie
    await page.evaluate(() => {
      (window as any).selfiePreview = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    });
    await page.waitForTimeout(500);

    await page.locator('button[type="submit"]').click();
    
    // Wait for transition back to IN state (means day complete)
    await expect(page.locator('h2:has-text("Siklus Kerja Hari Ini Selesai")')).toBeVisible();

    // Logout User 1 via bottom nav tab on mobile
    await page.click('button:has-text("Profil")');
    await page.click('button:has-text("Keluar")');

    // === USER 2: eng2.be@indotek.com (WFH check-in with reported Blocker) ===
    console.log('--- User 2 (WFH Blocker Check-in) ---');
    await page.goto('/');
    await page.fill('input[type="email"]', 'eng2.be@indotek.com');
    await page.fill('input[type="password"]', 'SuperSecurePassword123');
    await page.click('button:has-text("Masuk")');

    await expect(page.locator('h2:has-text("Check-in Kehadiran & Standup")')).toBeVisible();

    // Select WFH
    await page.click('button:has-text("🏠 WFH")');
    await page.fill('textarea[placeholder="Hari ini berencana fokus pada..."]', 'WFH Coding tasks under blocking issue.');

    // Inject selfie preview
    await page.evaluate(() => {
      (window as any).selfiePreview = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    });
    await page.waitForTimeout(500);

    // Check first checkbox (the task)
    await page.locator('input[type="checkbox"]').first().check();

    // Toggle blocker checkbox (index 1)
    await page.locator('input[type="checkbox"]').nth(1).check();

    // Fill Blocker Details
    const taskSelect = page.locator('select').first();
    await expect(taskSelect).toBeVisible();
    await taskSelect.selectOption({ index: 1 }); // select first task option
    await page.fill('textarea[placeholder="Ceritakan blocker atau hambatan teknis..."]', 'Blocked by database migration issue.');

    // Kirim Check-in
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('h2:has-text("Check-out Kehadiran & Standup")')).toBeVisible();

    // Logout User 2
    await page.click('button:has-text("Profil")');
    await page.click('button:has-text("Keluar")');

    // === SUPER ADMIN: superadmin@indotek.com (Resolve Blocker & View Program Dashboard) ===
    console.log('--- Super Admin (Resolve Blocker) ---');
    await page.goto('/');
    await page.fill('input[type="email"]', 'superadmin@indotek.com');
    await page.fill('input[type="password"]', 'SuperSecurePassword123');
    await page.click('button:has-text("Masuk")');

    // Go to Feed or Dashboard to Resolve Blocker
    await page.click('button:has-text("Feed Tim")');
    
    // Resolve the Blocker
    const resolveBtn = page.locator('button:has-text("Selesaikan")').first();
    await expect(resolveBtn).toBeVisible();
    await resolveBtn.click();

    console.log('Blocker Resolved successfully.');

    // Go to Program Dashboard to verify metrics
    await page.click('button:has-text("Dashboard")');
    
    // Dismiss onboarding modal if present
    const onboardingBtn = page.locator('button:has-text("Saya Mengerti & Selesai")');
    try {
      await onboardingBtn.waitFor({ state: 'visible', timeout: 2000 });
      await onboardingBtn.click();
    } catch (e) {
      // Ignore if modal not visible
    }

    // Click sub-tab Program (visible to SUPER_ADMIN/PM_ADMIN)
    await page.click('button:has-text("Program")');

    // Verify metrik cards are rendered
    await expect(page.locator('text=Total Hadir')).toBeVisible();
    await expect(page.locator('text=Blocker Aktif')).toBeVisible();
  });
});
