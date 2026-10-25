'use strict';

require('./data-reset/cli.cjs')
  .main(process.argv.slice(2), 'staging')
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
