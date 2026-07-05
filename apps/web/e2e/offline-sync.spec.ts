import { test, expect } from '@playwright/test';

test.describe('E2E Attendance Offline Sync Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock getUserMedia and Geolocation APIs
    await page.addInitScript(() => {
      // Mock getUserMedia to return a fake stream
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const stream = (canvas as any).captureStream ? (canvas as any).captureStream() : new MediaStream();
        return stream;
      };

      // Mock Geolocation API
      navigator.geolocation.getCurrentPosition = (success) => {
        success({
          coords: {
            latitude: -6.917464,
            longitude: 107.619122,
            accuracy: 15,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      };
    });
  });

  test('should check in successfully under offline mode and sync when connection is restored', async ({ page, context }) => {
    // 1. Sign in as Super Admin
    await page.goto('/');
    await page.fill('input[type="email"]', 'superadmin@indotek.com');
    await page.fill('input[type="password"]', 'SuperSecurePassword123');
    await page.click('button:has-text("Masuk")');

    // Verify Hari Ini page loaded
    await expect(page.locator('h2:has-text("Check-in Kehadiran & Standup")')).toBeVisible();

    // Mock camera photo by setting selfiePreview state directly or clicking selfie
    // To make this fully testable in Playwright, we can stub the capture canvas data
    await page.evaluate(() => {
      // Set fake captured selfie preview data URL directly
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 10, 10);
      }
      (window as any).selfiePreview = canvas.toDataURL('image/jpeg');
    });

    // 2. Go offline
    await context.setOffline(true);

    // 3. Fill check-in details
    await page.click('button:has-text("🏢 WFO")');
    await page.fill('textarea[placeholder="Hari ini berencana fokus pada..."]', 'Playwright E2E Offline testing');

    // 4. Submit check-in
    // We mock the selfie state in the DOM context for the submit handler
    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      // Inject fake selfie state into the window so App.tsx can read it
      (window as any).selfiePreview = 'data:image/jpeg;base64,mockdata';
    });

    // Accept dialog or assert offline save message
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Anda sedang offline. Data check-in disimpan lokal');
      await dialog.accept();
    });

    await page.click('button:has-text("Kirim Check-in")');

    // 5. Assert yellow offline warning banner is visible
    await expect(page.locator('text=Mode Offline Aktif')).toBeVisible();

    // 6. Go back online
    await context.setOffline(false);

    // 7. Click sync or let it auto-sync and verify transitioned state
    await page.click('button:has-text("Sync")');

    // Verify that check-in was successfully synced to DB and UI updated to OUT SESSION check-out form
    await expect(page.locator('h2:has-text("Check-out Kehadiran & Standup")')).toBeVisible();
  });
});
