// INITIALIZE FLOW - pick a request to plan

const requestsTable = base.getTable("Requests");
const requestRecord = await input.recordAsync('Pick the request to plan', requestsTable);


// GLOBAL VARIABLES & FUNCTIONS

//functions
function getExpectedEndDate(startDate, length) { // Returns the end date of a training based on its start date and length
    // clone the start date to avoid modifying the original date
    let currentDate = new Date(startDate);

    while (length > 1) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) { //date is not a weekend
            length--;
        }
    }

    while (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return currentDate;
}
function getWeekdaysCount(startDate, endDate) { //Returns the length of a session given its start and end dates. (eliminates weekend days)
    let count = 0;
    let currentDay = new Date(startDate);

    while (currentDay <= endDate) {
        if (currentDay.getDay() !== 0 && currentDay.getDay() !== 6) {
            count++;
        }
        currentDay.setDate(currentDay.getDate() + 1);
    }

    return count;
}

//sessions
const sessionsTable = base.getTable("Sessions");

//trainings
const trainingsTable = base.getTable('Trainings');
const requestedTraining = requestRecord.getCellValue('Training');
const requestedTrainingId = requestedTraining[0].id;
const requestedTrainingRecord = await trainingsTable.selectRecordAsync(requestedTrainingId, {
})
const trainingLength = requestedTrainingRecord.getCellValue('Duration (days)'); //selectedTrainingRecord can not be null because it is a required field in the form.

//trainers
let trainersTable = base.getTable('Trainers');


// COMPONENTS & CONSTRUCTORS

// Components
// Date Selector Component: allows user to input a date in the future.
async function selectDateComponent(dateType) {
    let inputLabel = `Enter a${dateType === 'end' ? 'n' : ''} ${dateType} date (YYYY-MM-DD)`;
    let errorCount = 0;
    let date;

    do {
        if (errorCount > 0) {
            output.text('Invalid date format or date is not in the future. Please try again.');
        }

        date = await input.textAsync(inputLabel);
        errorCount++;

    } while (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date) <= new Date() || isNaN(Date.parse(date)));

    return date;
}

// Constructors
function Trainer(trainer, sessions) {
    this.name = trainer.name;
    this.id = trainer.id;
    this.sessions = sessions;
}

function Room(room, sessions) {
    this.name = room.name;
    this.id = room.id;
    this.sessions = sessions;
}


// VALIDATE START DATE FLOW

let expectedStartDate = requestRecord.getCellValue('Expected start date');

if (expectedStartDate) {
    output.text(`The training was requested to start on ${expectedStartDate}.`);
    let validateStartDate = await input.buttonsAsync('Do you want to keep this start date?', ['Yes', 'No']);

    if (validateStartDate === 'No') {
        expectedStartDate = await selectDateComponent('start');
    }
} else {
    output.text(`There is no requested start date for this request. Please indicate a starting date.`);
    expectedStartDate = await selectDateComponent('start');
}


// VALIDATE END DATE FLOW

let expectedEndDate = getExpectedEndDate(expectedStartDate, trainingLength);
output.text(`This training is expected to end on ${expectedEndDate.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Amsterdam'
})} (training length: ${trainingLength} days).`);
let validateEndDate = await input.buttonsAsync('Do you want to keep this end date?', ['Yes', 'No']);
if (validateEndDate === 'No') {
    expectedEndDate = await selectDateComponent('end');
}

// start and end date confirmed:
let trainingStart = new Date(expectedStartDate);
let trainingEnd = new Date(expectedEndDate);


// DEFINE ELIGIBLE TRAINERS

async function getTrainersData() {
    let eligibileTrainersTable = []; //final output return

    async function getEligibileTrainers() {
        let eligibleTrainers = [];
        let queryResult = await trainersTable.selectRecordsAsync({
            fields: ['Name', 'Session end dates', 'Sessions', 'Trainer for', 'Most recent session end date']
        });

        // Define eligibleTrainers : Trainer can perform training because it is listed in 'trainer for'
        for (let record of queryResult.records) {
            let trainings = record.getCellValue('Trainer for');
            if (trainings) {
                for (let training of trainings) {
                    if (training.id === requestedTrainingId) {
                        eligibleTrainers.push(record);
                        break;
                    }
                }
            }
        }
        return eligibleTrainers;
    }

    async function generateTrainerDataObj(trainerObj) {

        const { id, name, sessions } = trainerObj;
        let trainerRecord = await trainersTable.selectRecordAsync(id, {});

        let trainerAvailability = 100; //consider the trainer to be fully available before iterating through sessions
        let overlappingSessions = [];
        let trainerLastSession = trainerRecord.getCellValue('Most recent session end date');

        let trainerDataObj = { 'Name': name, 'Availability for training (%)': trainerAvailability, 'Overlapping sessions': null, 'Last session (end date)': trainerLastSession }

        if (sessions === null) {
            return trainerDataObj;
        }

        for (let session of sessions) {
            let sessionRecord = await sessionsTable.selectRecordAsync(session.id, {});
            let sessionStart = new Date(sessionRecord.getCellValue('Start date'));
            let sessionEnd = new Date(sessionRecord.getCellValue('End date'));

            let overlapDays = 0;
            if (sessionStart <= trainingEnd && sessionEnd >= trainingStart) {
                let overlapStart = sessionStart > trainingStart ? sessionStart : trainingStart;
                let overlapEnd = sessionEnd < trainingEnd ? sessionEnd : trainingEnd;

                if (overlapStart < overlapEnd) {
                    overlapDays = getWeekdaysCount(overlapStart, overlapEnd);
                    trainerAvailability -= (overlapDays / trainingLength) * 100;
                    if (overlapDays !== 0) overlappingSessions.push(session.name);
                }
            }
        }

        trainerAvailability = Math.round(trainerAvailability) //Math.max(0, Math.round(trainerAvailability));
        trainerDataObj = { 'Name': name, 'Availability for training (%)': trainerAvailability, 'Overlapping sessions': overlappingSessions.join(', '), 'Last session (end date)': trainerLastSession }
        return trainerDataObj
    }

    let eligibleTrainers = await getEligibileTrainers(); // define eligible trainers array - "all trainers that CAN perform the requested training"

    for (let eligibileTrainer of eligibleTrainers) { // for each trainer

        // define trainer data
        let trainerSessions = eligibileTrainer.getCellValue('Sessions');
        const trainerObj = new Trainer(eligibileTrainer, trainerSessions);

        let trainerDataObj = await generateTrainerDataObj(trainerObj);
        eligibileTrainersTable.push(trainerDataObj);
    }

    eligibileTrainersTable.sort((a, b) => b['Availability for training (%)'] - a['Availability for training (%)']);
    return eligibileTrainersTable;
}


// DISPLAY AVAILABLE TRAINERS

let eligibleTrainersTable = await getTrainersData();
output.text(`Available trainers:`);
output.table(eligibleTrainersTable);
//console.log(JSON.stringify(eligibleTrainersTable));


// ASK FOR TRAINER INPUT

let selectedTrainer = null;
while (selectedTrainer === null) {
    selectedTrainer = await input.recordAsync('Pick a trainer:', trainersTable);

    if (selectedTrainer) {
        let validateTrainer = await input.buttonsAsync(`Validate ${selectedTrainer.name} as a trainer for this session?`, ['Yes', 'No']);

        if (validateTrainer === 'No') {
            selectedTrainer = null;
        }
    }
}

// FIND AVAILABLE ROOMS


// VERIFY END RESULT
// end VERIFY END RESULT