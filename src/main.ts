import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';

async function bootstrap() {
  await CommandFactory.runWithoutClosing(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
}
bootstrap()
  .then(() => {
    console.log('Application has been started successfully.');
  })
  .catch((error) => {
    console.error('Error starting the application:', error);
  });
