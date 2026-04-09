import { seedFromXlsx } from './run';

seedFromXlsx()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
