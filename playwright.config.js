const { defineConfig } = require('playwright/test');
module.exports = defineConfig({
  testDir: './tests', workers: 1,
  ...(process.env.TEST_SUITE === 'water' ? { testMatch: '**/water.spec.js' } :
    process.env.TEST_SUITE === 'core' ? { testIgnore: '**/water.spec.js' } : {}),
  // Hosted runners use software WebGL; functional checks need a larger deadline than the GPU preview.
  timeout: process.env.CI ? 240000 : 45000,
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:48769/',
    viewport: { width: 390, height: 844 }, hasTouch: true,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: process.platform === 'linux' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal'] }
  },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: 'python3 -m http.server 48769 --bind 127.0.0.1',
    url: 'http://127.0.0.1:48769/', reuseExistingServer: false
  }
});
