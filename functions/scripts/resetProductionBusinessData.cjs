'use strict';

require('./data-reset/cli.cjs')
  .main(process.argv.slice(2), 'production')
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
