//  VARIABLES
//sessions
const sessionsTable = base.getTable("Sessions");
//trainings
const trainingsTable = base.getTable('Trainings');
//trainers
const trainersTable = base.getTable('Trainers');
//rooms
const roomsTable = base.getTable('Rooms');


// COMPONENTS & CONSTRUCTORS
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
// two buttons
async function buttonsComponent(question, labelA, labelB) { // :string
    let component = await input.buttonsAsync(`${question}`, [{ label: `${labelA}`, value: `${labelA}`, variant: 'primary' }, { label: `${labelB}`, value: `${labelB}`, variant: 'danger' }]);
    return component;
}
// table picker with validation
async function tablePickerComponent(label, table) { // :string, :string, :string
    let selection = null;
    while (selection === null) {
        selection = await input.recordAsync(label, table);

        if (selection) {
            let validation = await buttonsComponent(`Confirm ${selection.name}?`, 'Yes', 'No')

            if (validation === 'No') {
                selection = null;
            }
        }
    }
    return selection
}
//returns true if day is a week day
function isWeekDay(date) {
    let day = date.getDay();
    return day !== 0 && day !== 6;
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

// INITIALIZE FLOW - pick a request to plan
output.markdown('### Validate a new request')
const requestsTable = base.getTable("Requests");
const newRequestsView = requestsTable.getView('New requests data');
let requestRecord = await input.recordAsync('Pick the request to plan', newRequestsView);

// MAIN FLOW (validate request)
async function userFlow() {
    const requestRecordFormat = requestRecord.getCellValueAsString('Format');
    const requestedTraining = requestRecord.getCellValue('Training');
    const requestedTrainingId = requestedTraining[0].id;
    const requestedTrainingRecord = await trainingsTable.selectRecordAsync(requestedTrainingId, {});
    let trainingLength = requestedTrainingRecord.getCellValue('Duration (days)'); //selectedTrainingRecord can not be null because it is a required field in the form.

    // VALIDATE START DATE FLOW

    let expectedStartDate = requestRecord.getCellValue('Expected start date');

    if (expectedStartDate) {
        output.markdown(`The training was requested to start on **${expectedStartDate}**.`);
        let validateStartDate = await buttonsComponent('Keep this start date?', 'Yes', 'No');

        if (validateStartDate === 'No') {
            expectedStartDate = await selectDateComponent('start');
        }
    } else {
        output.markdown(`There is no requested start date for this request. Please **indicate a starting date.**`);
        expectedStartDate = await selectDateComponent('start');
    }


    // VALIDATE END DATE FLOW

    let expectedEndDate = getExpectedEndDate(expectedStartDate, trainingLength);

    let expectedEndDateString = expectedEndDate.toLocaleString('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Europe/Amsterdam'
    })
    output.markdown(`This training is expected to end on **${expectedEndDateString}**.`);

    let validateEndDate = await buttonsComponent('Keep this end date?', 'Yes', 'No');
    if (validateEndDate === 'No') {
        expectedEndDate = await selectDateComponent('end');
    }

    // start and end date confirmed:
    let trainingStart = new Date(expectedStartDate);
    let trainingEnd = new Date(expectedEndDate);
    trainingLength = getWeekdaysCount(trainingStart, trainingEnd) // reset value of tranining length based on user inputs.
    output.markdown(`This session will have **${trainingLength} days of training.**`);


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
        let eligibleTrainers = await getEligibileTrainers(); // define eligible trainers array - "all trainers that CAN perform the requested training"

        for (let eligibileTrainer of eligibleTrainers) { // for each trainer
            let trainerSessions = eligibileTrainer.getCellValue('Sessions');
            const trainerObj = new Trainer(eligibileTrainer, trainerSessions);
            let trainerDataObj = await generateTableObj(trainerObj, trainersTable, { start: trainingStart, end: trainingEnd }, trainingLength);
            eligibileTrainersTable.push(trainerDataObj);
        }

        eligibileTrainersTable.sort((a, b) => b['Availability for training (%)'] - a['Availability for training (%)']);
        return eligibileTrainersTable;
    }


    // DISPLAY AVAILABLE TRAINERS

    let eligibleTrainersTable = await getTrainersData();
    output.markdown(`### Trainers availabilities`);
    output.table(eligibleTrainersTable);

    // ASK FOR TRAINER INPUT
    let selectedTrainersArray = [];
    let selectedTrainer = await tablePickerComponent('Pick a trainer:', trainersTable);
    selectedTrainersArray.push({ id: selectedTrainer.id });

    // second trainer
    let secondTrainerValidation = await buttonsComponent('Pick a second trainer?', 'Yes', 'No');
    let secondTrainer = null;
    if (secondTrainerValidation === 'Yes') {
        secondTrainer = await tablePickerComponent('Pick a second trainer', trainersTable);
        selectedTrainersArray.push({ id: secondTrainer.id });
    }

    // FIND AVAILABLE ROOMS

    async function getRoomsData() { //{'name': roomName, availability for training (%): num, Overlapping sessions: text}
        let eligibleRoomsTable = [];
        let rooms = await roomsTable.selectRecordsAsync({ fields: ['Sessions'] });

        for (let room of rooms.records) {
            let roomSessions = room.getCellValue('Sessions');
            let roomObj = new Room(room, roomSessions);
            let roomSessionData = await generateTableObj(roomObj, roomsTable, { start: trainingStart, end: trainingEnd }, trainingLength);
            eligibleRoomsTable.push(roomSessionData);
        }

        eligibleRoomsTable.sort((a, b) => b['Availability for training (%)'] - a['Availability for training (%)']);
        return eligibleRoomsTable;
    }

    // DISPLAY ROOMS

    const eligibleRoomsTable = await getRoomsData()
    output.markdown('### Room availabilities');
    output.table(eligibleRoomsTable)

    // ASK FOR ROOM OR ONLINE FLOW
    output.markdown(`This session was requested as \` ${requestRecordFormat} \``);
    let sessionTypeValidation = await buttonsComponent('Choose a session type', 'In person', 'Online');

    let selectedRoom = null;
    if (sessionTypeValidation === 'In person') {
        selectedRoom = await tablePickerComponent('Pick a room:', roomsTable);
    }

    // VERIFY END RESULT
    output.text('')
    output.markdown( // data recap
        `### Create session
    Click \`validate\` to create this session:

    Training: ${requestedTrainingRecord.name}
    Start date: ${expectedStartDate},
    End date: ${expectedEndDateString},
    Days of training: ${trainingLength},
    Trainer: ${selectedTrainer.name},
    Second trainer: ${secondTrainer === null ? '-' : secondTrainer.name},
    Format: ${sessionTypeValidation},
    Status: New,
    Room: ${selectedRoom === null ? '-' : selectedRoom.name}`
    )

    function buildOutputData() {
        let outputData = {
            "Start date": `${expectedStartDate} 08:00`,
            "End date": `${expectedEndDateString} 17:00`,
            "Trainers": selectedTrainersArray,
            "Main trainer": [{ id: selectedTrainer.id }],
            "Format": { name: sessionTypeValidation },
            "Duration (days)": trainingLength,
        };
        if (secondTrainer) { outputData['Second trainer'] = [{ id: secondTrainer.id }] };
        if (requestedTrainingRecord) { outputData['Training'] = [{ id: requestedTrainingRecord.id }] };
        if (selectedRoom) { outputData['Room'] = [{ id: selectedRoom.id }] };
        if (requestRecord) { outputData['Request'] = [{ id: requestRecord.id }] };
        return outputData
    }

    const outputData = buildOutputData();

    let validateFlow = await input.buttonsAsync('', [{ label: 'Validate', variant: 'primary' }]);
    if (validateFlow === 'Validate') {
        const createdSession = await sessionsTable.createRecordAsync(outputData);
        const createdSessionRecord = await sessionsTable.selectRecordAsync(createdSession, {});
        if (createdSessionRecord) {
            await requestsTable.updateRecordAsync(requestRecord.id, {
                "Status": { name: 'Session created' }
            })
            const createdSessionUrl = createdSessionRecord.getCellValueAsString('Record URL');
            output.markdown(`Session created: [click here](${createdSessionUrl}) to access`);
        } else {
            console.log("Encountered an error when creating session. Please check the Sessions table.")
        }
    }
    // end VERIFY END RESULT
}

if (requestRecord) {
    await userFlow();
} else {
    let viewRecords = await newRequestsView.selectRecordsAsync({ fields: ['Status'] })
    let records = viewRecords.recordIds
    if (!records.length) {
        output.markdown(`
    You are up to date! You do not have any requests to schedule.
    `)
    } else {
        requestRecord = null;
        while (requestRecord === null) {
            requestRecord = await input.recordAsync('Pick the request to plan', newRequestsView);
        }
        await userFlow();
    }
}

//functions
function getExpectedEndDate(startDate, length) { // Returns the end date of a training based on its start date and length
    // clone the start date to avoid modifying the original date
    let date = new Date(startDate);

    while (length > 1) {
        date.setDate(date.getDate() + 1);
        if (isWeekDay(date)) { //date is not a weekend
            length--;
        }
    }

    while (!isWeekDay(date)) {
        date.setDate(date.getDate() + 1);
    }

    return date;
}
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
}
async function generateTableObj(obj, table, trainingDates, trainingLength) { //Generate a table object for a given room or session. The result is pushed in a array that is then displayed.
    let trainingEnd = trainingDates.end;
    let trainingStart = trainingDates.start
    const { id, name, sessions } = obj;
    let record = await table.selectRecordAsync(id, {});

    let availability = 100; //consider the trainer to be fully available before iterating through sessions
    let overlappingSessions = [];
    let data = { 'Name': name, 'Availability for training (%)': availability, 'Overlapping sessions': null };
    let trainerLastSession = null;

    if (table.name === 'Trainers') {
        trainerLastSession = record.getCellValue('Most recent session end date');
        data['Last session (end date)'] = trainerLastSession;
    }

    if (sessions === null) {
        return data;
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
                availability -= (overlapDays / trainingLength) * 100; //off by 1 day when sharing the same startDate. investigate later.
                if (overlapDays !== 0) overlappingSessions.push(session.name);
            }
        }
    }

    availability = Math.max(0, Math.round(availability));
    data['Availability for training (%)'] = availability;
    data['Overlapping sessions'] = overlappingSessions.join(', ');
    return data
}