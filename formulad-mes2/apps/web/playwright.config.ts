import { defineConfig } from '@playwright/test';

// ponytail: .NET API on 5080 with dummy SQL (no real DB), Vite dev on 5173
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium',
    },
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'dotnet run --project ../../src/FormulaD.Mes.Api -- --urls http://localhost:5080 --environment Development',
      port: 5080,
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        ASPNETCORE_ENVIRONMENT: 'Development',
        'DevAuth__Enabled': 'true',
        'DevAuth__Username': 'admin',
        'DevAuth__Password': 'F7mes',
        // ponytail: dummy connection string — app starts but SQL calls fail; login still works
        'Sql__ConnectionString': 'Server=localhost;Database=FormulaD_TEST;User ID=test;Password=test;TrustServerCertificate=True',
      },
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
      timeout: 15_000,
    },
  ],
});
