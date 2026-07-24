import { createApp } from './app.js';
import { config } from './lib/config.js';

async function start(): Promise<void> {
  const app = await createApp();

  try {
    await app.listen({
      host: config.HOST,
      port: config.PORT,
    });
    app.log.info(
      {
        host: config.HOST,
        port: config.PORT,
        appRoot: config.PB_APP_ROOT,
        dataDir: config.PB_DATA_DIR,
      },
      'Protect Broker API started.',
    );
  } catch (error) {
    app.log.error({ error }, 'Failed to start Protect Broker API.');
    process.exit(1);
  }
}

void start();
