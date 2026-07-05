# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-cycle.spec.ts >> E2E Full 1-Day Cycle and Blocker Lifecycle Test >> should execute 1-day check-in, blocker, resolve, checkout, and dashboard cycle
- Location: e2e/e2e-cycle.spec.ts:217:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Target page, context or browser has been closed
```

# Test source

```ts
  235 |     });
  236 |     await page.waitForTimeout(500);
  237 | 
  238 |     // Check first checkbox which is the task (index 0)
  239 |     await page.locator('input[type="checkbox"]').first().check();
  240 | 
  241 |     // Kirim Check-in using unambiguous submit button selector
  242 |     await page.locator('button[type="submit"]').click();
  243 |     
  244 |     // Wait for OUT state
  245 |     await expect(page.locator('h2:has-text("Check-out Kehadiran & Standup")')).toBeVisible();
  246 | 
  247 |     // Do Checkout immediately for User 1
  248 |     console.log('--- User 1 (WFO Checkout) ---');
  249 |     await page.fill('textarea[placeholder="Hari ini berhasil menyelesaikan..."]', 'Finished Backend API coding tasks.');
  250 |     
  251 |     // Inject checkout selfie
  252 |     await page.evaluate(() => {
  253 |       (window as any).selfiePreview = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  254 |     });
  255 |     await page.waitForTimeout(500);
  256 | 
  257 |     await page.locator('button[type="submit"]').click();
  258 |     
  259 |     // Wait for transition back to IN state (means day complete)
  260 |     await expect(page.locator('h2:has-text("Siklus Kerja Hari Ini Selesai")')).toBeVisible();
  261 | 
  262 |     // Logout User 1 via bottom nav tab on mobile
  263 |     await page.click('button:has-text("Profil")');
  264 |     await page.click('button:has-text("Keluar")');
  265 | 
  266 |     // === USER 2: eng2.be@indotek.com (WFH check-in with reported Blocker) ===
  267 |     console.log('--- User 2 (WFH Blocker Check-in) ---');
  268 |     await page.goto('/');
  269 |     await page.fill('input[type="email"]', 'eng2.be@indotek.com');
  270 |     await page.fill('input[type="password"]', 'SuperSecurePassword123');
  271 |     await page.click('button:has-text("Masuk")');
  272 | 
  273 |     await expect(page.locator('h2:has-text("Check-in Kehadiran & Standup")')).toBeVisible();
  274 | 
  275 |     // Select WFH
  276 |     await page.click('button:has-text("🏠 WFH")');
  277 |     await page.fill('textarea[placeholder="Hari ini berencana fokus pada..."]', 'WFH Coding tasks under blocking issue.');
  278 | 
  279 |     // Inject selfie preview
  280 |     await page.evaluate(() => {
  281 |       (window as any).selfiePreview = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  282 |     });
  283 |     await page.waitForTimeout(500);
  284 | 
  285 |     // Check first checkbox (the task)
  286 |     await page.locator('input[type="checkbox"]').first().check();
  287 | 
  288 |     // Toggle blocker checkbox (index 1)
  289 |     await page.locator('input[type="checkbox"]').nth(1).check();
  290 | 
  291 |     // Fill Blocker Details
  292 |     const taskSelect = page.locator('select').first();
  293 |     await expect(taskSelect).toBeVisible();
  294 |     await taskSelect.selectOption({ index: 1 }); // select first task option
  295 |     await page.fill('textarea[placeholder="Ceritakan blocker atau hambatan teknis..."]', 'Blocked by database migration issue.');
  296 | 
  297 |     // Kirim Check-in
  298 |     await page.locator('button[type="submit"]').click();
  299 |     await expect(page.locator('h2:has-text("Check-out Kehadiran & Standup")')).toBeVisible();
  300 | 
  301 |     // Logout User 2
  302 |     await page.click('button:has-text("Profil")');
  303 |     await page.click('button:has-text("Keluar")');
  304 | 
  305 |     // === SUPER ADMIN: superadmin@indotek.com (Resolve Blocker & View Program Dashboard) ===
  306 |     console.log('--- Super Admin (Resolve Blocker) ---');
  307 |     await page.goto('/');
  308 |     await page.fill('input[type="email"]', 'superadmin@indotek.com');
  309 |     await page.fill('input[type="password"]', 'SuperSecurePassword123');
  310 |     await page.click('button:has-text("Masuk")');
  311 | 
  312 |     // Go to Feed or Dashboard to Resolve Blocker
  313 |     await page.click('button:has-text("Feed Tim")');
  314 |     
  315 |     // Resolve the Blocker
  316 |     const resolveBtn = page.locator('button:has-text("Selesaikan")').first();
  317 |     await expect(resolveBtn).toBeVisible();
  318 |     await resolveBtn.click();
  319 | 
  320 |     console.log('Blocker Resolved successfully.');
  321 | 
  322 |     // Go to Program Dashboard to verify metrics
  323 |     await page.click('button:has-text("Dashboard")');
  324 |     
  325 |     // Dismiss onboarding modal if present
  326 |     const onboardingBtn = page.locator('button:has-text("Saya Mengerti & Selesai")');
  327 |     try {
  328 |       await onboardingBtn.waitFor({ state: 'visible', timeout: 2000 });
  329 |       await onboardingBtn.click();
  330 |     } catch (e) {
  331 |       // Ignore if modal not visible
  332 |     }
  333 | 
  334 |     // Click sub-tab Program (visible to SUPER_ADMIN/PM_ADMIN)
> 335 |     await page.click('button:has-text("Program")');
      |                ^ Error: page.click: Target page, context or browser has been closed
  336 | 
  337 |     // Verify metrik cards are rendered
  338 |     await expect(page.locator('text=Total Hadir')).toBeVisible();
  339 |     await expect(page.locator('text=Blocker Aktif')).toBeVisible();
  340 |   });
  341 | });
  342 | 
```