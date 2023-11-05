// Initialize flow
let requestTable = base.getTable("Requests");
let requestRecord = await input.recordAsync('Pick request', requestTable);
//
let sessionTable = base.getTable("Sessions");
// End initialize flow

// COMPONENTS & CONSTRUCTORS

// Components

// Date Selector Component: allows user to input a date in the future.
async function selectDateComponent(dateType) {
    let inputLabel = `Enter a${dateType === 'end' ? 'n' : ''} ${dateType} date (YYYY-MM-DD)`;
    let errorCount = 0;
    let date;

    do {
        if (errorCount > 0) {
            console.log('Invalid date format or date is not in the future. Please try again.');
        }

        date = await input.textAsync(inputLabel);
        errorCount++;

    } while (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date) <= new Date() || isNaN(Date.parse(date)));

    return date;
}

// End Components


// Constructors

function Trainer(trainer, sessions) {
    this.name = trainer.name;
    this.id = trainer.id
    this.sessions = sessions;
}

function Room(room, sessions) {
    this.name = room.name;
    this.id = room.id;
    this.sessions = sessions;
}

// END COMPONENTS & CONSTRUCTORS


// VALIDATE START date flow

let expectedStartDate = requestRecord.getCellValue('Expected start date');

if (expectedStartDate) {
    output.text(`The training was requested to start on ${expectedStartDate}.`);
    let validateStartDate = await input.buttonsAsync('Do you want to keep this start date?', ['Yes', 'No']);

    if (validateStartDate === 'No') {
        expectedStartDate = await selectDateComponent('start');
    }
} else {
    expectedStartDate = await selectDateComponent('start');
}

// End VALIDATE START date flow


// VALIDATE END date flow

//training data
let requestedTraining = requestRecord.getCellValue('Training');
let requestedTrainingId = requestedTraining[0].id;

let trainingsTable = base.getTable('Trainings');
let trainingRecord = await trainingsTable.selectRecordAsync(requestedTrainingId, {
})
let trainingLength = trainingRecord.getCellValue('Duration (days)');
let expectedEndDate = getExpectedEndDate(expectedStartDate, trainingLength);
output.text(`This training is expected to end on ${expectedEndDate.toLocaleString('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Amsterdam'
})}.`);
let validateEndDate = await input.buttonsAsync('Do you want to keep this end date?', ['Yes', 'No']);
if (validateEndDate === 'No') {
    expectedEndDate = await selectDateComponent('end');
}

// Returns the end date of a training based on its start date and length
function getExpectedEndDate(startDate, length) {
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
// End VALIDATE END date flow


// Find available trainers
async function findAvailableTrainers() {
    let outputTable = [];

    // List eligibile first. => Those who can perform the request trainer as per the 'Trainer for' field.
    let eligibleTrainers = [];
    let trainersTable = base.getTable('Trainers');
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

    // Eligibile trainers from this point - is the trainer available on these dates?
    //console.log('eligibileTrainers', eligibleTrainers);
    let trainingStart = new Date(expectedStartDate);
    let trainingEnd = expectedEndDate;

    for (let eligibileTrainer of eligibleTrainers) {
        let trainerSessions = eligibileTrainer.getCellValue('Sessions');
        let trainerLastSession = eligibileTrainer.getCellValue('Most recent session end date');
        let trainerAvailability = 100;
        let occupationList = [];

        if (trainerSessions) {
            for (let trainerSession of trainerSessions) {
                let sessionRecord = await sessionTable.selectRecordAsync(trainerSession.id, {});
                let sessionStart = new Date(sessionRecord.getCellValue('Start date'));
                let sessionEnd = new Date(sessionRecord.getCellValue('End date'));

                let overlapDays = 0;
                if (sessionStart && sessionEnd) {
                    let overlapStart = sessionStart > trainingStart ? sessionStart : trainingStart;
                    let overlapEnd = sessionEnd < trainingEnd ? sessionEnd : trainingEnd;

                    if (overlapStart < overlapEnd) {
                        overlapDays = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24))

                        trainerAvailability -= (overlapDays / trainingLength) * 100;

                        let trainingName = trainerSession.name;
                        if (overlapDays !== 0) occupationList.push(trainingName);
                    }
                }
            }
            trainerAvailability = Math.max(0, Math.round(trainerAvailability));
        }

        trainerAvailability = Math.max(0, trainerAvailability);

        outputTable.push({ 'Name': eligibileTrainer.name, 'Availability for training (%)': trainerAvailability, 'Overlapping sessions': occupationList.join(', '), 'Last session (end date)': trainerLastSession });
    }

    outputTable.sort((a, b) => b['Availability for training (%)'] - a['Availability for training (%)']);
    return outputTable.sort();
}
let eligibleTrainersTable = await findAvailableTrainers();
// END FIND AVAILABLE TRAINERS


// DISPLAY AVAILABLE TRAINERS

output.text(`Available trainers:`);
output.table(eligibleTrainersTable);
console.log(JSON.stringify(eligibleTrainersTable));

// END DISPLAY AVAILABLE TRAINERS


// ASK FOR TRAINER INPUT

let trainerTable = await base.getTable('Trainers');
let selectedTrainer = null;
while (selectedTrainer === null) {
    selectedTrainer = await input.recordAsync('Pick a trainer:', trainerTable);

    if (selectedTrainer) {
        let validateTrainer = await input.buttonsAsync(`Validate ${selectedTrainer.name} as a trainer for this session?`, ['Yes', 'No']);

        if (validateTrainer === 'No') {
            selectedTrainer = null;
        }
    }
}

// END ASK FOR TRAINER INPUT

// FIND AVAILABLE ROOMS



// END FIND AVAILABLE ROOMS

// VERIFY END RESULT
// end VERIFY END RESULT