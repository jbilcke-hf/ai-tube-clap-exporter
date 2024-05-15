module.exports = {  
  name: 'ai-tube-clap-exporter',

  script: 'src/index.ts',
  interpreter: 'node',
  interpreter_args: '--import tsx',

  // every 4 hours
  // see https://freeformatter.com/cron-expression-generator-quartz.html
  cron_restart: '0 0 */4 ? * *',

  // exec_mode: 'cluster',
  // instances: 1,

  // other PM2 configuration options
}
