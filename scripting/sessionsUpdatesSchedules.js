// When session is updated (fields: status, training, trainers, rooms, start/end dates), update schedules (delete, update or create new schedules)

// for errors
output.set('script name', 'Session updates -> Update schedules');
output.set('script url', 'https://airtable.com/apppCTq1bDNH4mV3z/wfl1S5lrjsh3uaeIr');

const inputConfig = input.config();
const id = inputConfig.id;
const sessionsTable = base.getTable('Sessions');
const record = await sessionsTable.selectRecordAsync(id, { fields: ['Status', 'Training', 'Trainers', 'Room', 'Start date', 'End date', 'Schedules'] });

if (record) {
    const newStartDate = new Date(record.getCellValue('Start date')).setHours(0, 0, 0, 0); //returns in milliseconds
    //const newEndDate = new Date(record.getCellValue('End date')).setHours(0, 0, 0, 0); //returns in milliseconds - not needed if we consider that changing session length can not happen.
    const newRoom = record.getCellValue('Room')[0].id;
    const newTrainers = record.getCellValue('Trainers');
    const newStatus = record.getCellValue('Status');

    const schedules = record.getCellValue('Schedules'); //linked records
    const schedulesTable = base.getTable('Schedules');

    if (schedules.length > 0) {

        let schedulesRecords = await schedulesTable.selectRecordsAsync({ //retrieve data for the linked records
            fields: ['Start date', 'End date', 'Event type', 'Trainer', 'Room', 'Training day'],
            recordIds: [...schedules.map(item => item.id)],
            sorts: [{ field: 'Start date', direction: 'asc' }]
        });

        let schedulesData = schedulesRecords.records.map(schedule => { //create an array of objects with id and dates
            const startDate = schedule.getCellValue('Start date');
            const endDate = schedule.getCellValue('End date');
            const trainer = schedule.getCellValue('Trainer')[0].id;
            const room = schedule.getCellValue('Room')[0].id;
            const eventType = schedule.getCellValue('Event type').name;

            return { id: schedule.id, startDate, endDate, trainer, room, eventType };
        });

        // dates
        const earliestStartDate = new Date(schedulesData[0].startDate).setHours(0, 0, 0, 0); //already sorted in airtable request
        const shiftDurationInMillis = newStartDate - earliestStartDate; // Calculate the shift duration in milliseconds
        const shiftDurationInDays = Math.floor(shiftDurationInMillis / (1000 * 60 * 60 * 24)); // Convert milliseconds to days and round to the nearest integer
        // Build an array of schedules with the shift applied to the dates
        const shiftedSchedules = schedulesData.map(schedule => {
            const originalStartDate = new Date(schedule.startDate);
            const originalEndDate = new Date(schedule.endDate);

            // Adjust the start date by adding the shift duration // refactor this part into function
            const shiftedStartDate = new Date(originalStartDate.getTime() + shiftDurationInDays * (1000 * 60 * 60 * 24));
            const shiftedEndDate = new Date(originalEndDate.getTime() + shiftDurationInDays * (1000 * 60 * 60 * 24));

            // Return the schedule with the adjusted start date
            return {
                id: schedule.id,
                startDate: shiftedStartDate.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }),
                endDate: shiftedEndDate.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }) // You may need to adjust the format based on your requirements
                // Include other properties as needed
            };
        });
        console.log(shiftedSchedules)

    } else {
        output.set('output', 'Expecting schedule items to be linked but field is empty.')
    }

} else {
    output.set('output', 'Trigger record does not exist.')
}

function shiftScheduleDates(schedulesData) {

}