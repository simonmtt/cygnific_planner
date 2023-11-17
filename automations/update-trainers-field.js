//for errors
output.set('script name', 'Update trainers in Sessions - Fields synchronization')
output.set('script url', '')

async function updateSessionTrainers(record, table) {
    if (!record) {
        output.set('status', 'No session found for this id.')
        return
    }
    
    const { id } = record
    const trainersArray = []

    const mainTrainerField = record.getCellValue('Main trainer')
    const secondTrainerField = record.getCellValue('Second trainer')
    if (mainTrainerField) trainersArray.push({ id: mainTrainerField[0].id })
    if (secondTrainerField) trainersArray.push({ id: secondTrainerField[0].id })

    // these fields can only have a single item in the array
    if (trainersArray.length === 2 && trainersArray[0].id === trainersArray[1].id) { 
        table.updateRecordAsync(id, { 'Second trainer': [] })
        trainersArray.pop()
    }

    await table.updateRecordAsync(id, { 'Trainers': trainersArray })

output.set('status', 'OK')
return
}

const inputConfig = input.config()
const sessionId = inputConfig.sessionId
const sessionsTable = base.getTable('Sessions')

const sessionRecord = await sessionsTable.selectRecordAsync(sessionId)
await updateSessionTrainers(sessionRecord, sessionsTable)