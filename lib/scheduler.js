const cron = require('node-cron');
const recurringModel = require('../models/recurring');

let task = null;

// Runs once a day, early morning. generateDue() is safe to call repeatedly
// or after downtime — it catches up on any missed dates rather than
// skipping them, and the occurrence table's unique constraint means a date
// already generated is never generated twice even if this fires more than
// once for the same day (e.g. a restart).
function start() {
  if (task) return task;
  task = cron.schedule('0 1 * * *', () => {
    recurringModel.generateDue().catch((err) => {
      console.error('Recurring transaction generation failed:', err);
    });
  });
  return task;
}

function stop() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { start, stop };
