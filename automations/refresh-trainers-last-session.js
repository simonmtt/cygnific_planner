let inputConfig = input.config();
let id = inputConfig.id;
let trainersTable = await base.getTable('Trainers');
let trainerRecord = await trainersTable.selectRecordAsync(id, { fields: ['Most recent session end date', 'Session end dates'] })

let dates = trainerRecord.getCellValue('Session end dates');

function findMostRecentDate(dates) {
  if (dates.length === 0) {
    return undefined;
  }

  let datesArray = [];
  for (let date of dates) {
    datesArray.push(new Date(date));
  }
  return new Date(Math.max(...datesArray));
}

const mostRecentDate = findMostRecentDate(dates);
await trainersTable.updateRecordAsync(id, {
  'Most recent session end date': mostRecentDate
})