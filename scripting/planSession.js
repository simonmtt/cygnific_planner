//config
const config = input.config({
    title: 'Trainers and rooms availabilities.',
    description: `
    Enter dates to start.
    `,
    items: [
        input.config.text('startDate', { label: 'Start date (YYYY-MM-DD)', description:'Required'}),
        input.config.text('endDate', { label: 'End date (YYYY-MM-DD)*', description:'Required'}),
    ]
})

//tables
const trainersTable = base.getTable('Trainers');
const roomsTable = base.getTable('Rooms');
const sessionsTable = base.getTable('Sessions');

//functions
async function selectDateComponent(dateType) {
    let inputLabel = `Enter a${dateType === 'end' ? 'n' : ''} ${dateType} date (YYYY-MM-DD)`;
    let errorCount = 0;
    let date;

    do {
        if (errorCount > 0) {
            output.text('Invalid date format. Please try again.');
        }

        date = await input.textAsync(inputLabel);
        errorCount++;

    } while (!isValidDate(date));

    return date;
};
function isValidDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
};
function getWeekdaysCount(startDate, endDate) { //Returns the length of a session given its start and end dates. (eliminates weekend days)
    let count = 0;
    let date = new Date(startDate);

    while (date <= endDate) {
        if (isWeekDay(date)) {
            count++;
        }
        date.setDate(date.getDate() + 1);
    }

    return count;
};
function isWeekDay(date) { //returns true if date is a weekday
    let day = date.getDay();
    return day !== 0 && day !== 6;
};
async function generateTable(table) { // calls generateTableObj
    const outputData = [];
    const result = await table.selectRecordsAsync({});
    for (let record of result.records) {
        let sessions = record.getCellValue('Sessions');
        let obj = new TableRecord(record, sessions);
        let dataObj = await generateTableObj(obj, table, { start: validStartDate, end: validEndDate }, queryLength);
        outputData.push(dataObj);
    }
    outputData.sort((a, b) => b['Availability (%)'] - a['Availability (%)']);
    return outputData;
};
async function generateTableObj(obj, table, dates, length) { //Generate a table object for a given room or session. The result is pushed in a array that is then displayed.
    let endDate = dates.end;
    let startDate = dates.start
    const { id, name, sessions } = obj;
    let record = await table.selectRecordAsync(id, {});

    let availability = 100; //consider the trainer to be fully available before iterating through sessions
    let overlappingSessions = [];
    let data = { 'Name': name, 'Availability (%)': availability, 'Overlapping sessions': null };

    if (table.name === 'Trainers') {
        let trainings = [];
        let trainerLastSession = record.getCellValue('Most recent session end date');
        let trainerFor = record.getCellValueAsString('Trainer for');
        data['Last session (end date)'] = trainerLastSession;
        data['Trainer for'] = trainerFor;
    }

    if (sessions === null) {
        return data;
    }

    for (let session of sessions) {
        let sessionRecord = await sessionsTable.selectRecordAsync(session.id, {});
        let sessionStart = new Date(sessionRecord.getCellValue('Start date'));
        let sessionEnd = new Date(sessionRecord.getCellValue('End date'));

        let overlapDays = 0;
        if (sessionStart <= endDate && sessionEnd >= startDate) {
            let overlapStart = sessionStart > startDate ? sessionStart : startDate;
            let overlapEnd = sessionEnd < endDate ? sessionEnd : endDate;

            if (overlapStart < overlapEnd) {
                overlapDays = getWeekdaysCount(overlapStart, overlapEnd);
                availability -= (overlapDays / length) * 100; //off by 1 day when sharing the same startDate. investigate later.
                if (overlapDays !== 0) overlappingSessions.push(session.name);
            }
        }
    }

    availability = Math.max(0, Math.round(availability));
    data['Availability (%)'] = availability;
    data['Overlapping sessions'] = overlappingSessions.join(', ');
    return data
}
function TableRecord(record, sessions) {
    this.name = record.name;
    this.id = record.id;
    this.sessions = sessions;
}
//display selected dates
let startDate = config.startDate;
let endDate = config.endDate;

//validate inputs
if (!isValidDate(startDate)) {
    output.markdown(`Your start date input is **invalid** (\`${startDate}\`). Please provide a valid date (YYYY-MM-DD).`);
    startDate = await selectDateComponent('start');
};
if (!isValidDate(endDate)) {
    output.markdown(`Your end date input is **invalid** (${endDate}). Please provide a valid date (YYYY-MM-DD).`);
    endDate = await selectDateComponent('end')
};

// display
let validStartDate = new Date(startDate);
let validEndDate = new Date(endDate);
let currentDate = new Date(Date.now());

const queryLength = getWeekdaysCount(validStartDate, validEndDate); // length in weekdays between the two valid input dates.

output.markdown(`Availabilities between **${validStartDate.toDateString()}** and **${validEndDate.toDateString()}** (as of ${currentDate.toDateString()})`)

//handle data

const trainersDisplayTable = await generateTable(trainersTable);
output.markdown(`## Trainers`);
output.table(trainersDisplayTable);

const roomsDisplayTable = await generateTable(roomsTable)
output.markdown(`## Rooms`);
output.table(roomsDisplayTable);