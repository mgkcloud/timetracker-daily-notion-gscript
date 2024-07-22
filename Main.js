// Main execution function
function main() {
  try {
    const config = getConfig();
    const headers = getNotionHeaders(config.notionApiKey);
    // logger('debug', `Notion API headers: ${JSON.stringify(headers)}`);
    
    const databaseConfig = fetchDatabaseConfigFromNotion(config.notionApiKey, config.configDatabaseId);
    config.databaseConfig = databaseConfig;

    verifyDatabaseIds(databaseConfig);

    const summaryFileId = "1M_B1qSFZEwBarP1iwLdcRWHEExiWlbr-";
    processSummaryCSV(summaryFileId, config, headers);
    
    // logger('info', "Notion database updated successfully!");
    // notifyUser("Notion database updated successfully!");
  } catch (e) {
    // logger('error', `An error occurred: ${e.toString()}`);
    notifyUser(`An error occurred: ${e.toString()}`);
  }
}

// Process the summary CSV file
function processSummaryCSV(fileId, config, headers) {
  logger('info', `Processing summary CSV: ${fileId}`);
  const tasks = readTasksFromCSV(fileId);
  const categorizedTasks = categorizeTasks(tasks.map(t => t.name).join("\n"), config.openaiApiKey);
  const tasksByDatabase = groupTasksByDatabase(tasks, categorizedTasks, config.databaseConfig);
  updateNotionDatabases(tasksByDatabase, headers);
}

// Read tasks from CSV file
function readTasksFromCSV(fileId) {
  const file = DriveApp.getFileById(fileId);
  const csvContent = file.getBlob().getDataAsString();
  const rows = Utilities.parseCsv(csvContent);
  const tasks = [];


rows.slice(6).forEach((row, rowIndex) => { // Include rowIndex
  if (row[0] && !row[0].startsWith("#")) {
    const [taskName, durationStr, percentage, taskId] = row; 
    const duration = parseDuration(durationStr);

    // Generate and store TaskID if not present
    const newTaskId = taskId || generateTaskId();
    if (!taskId) {
      rows[rowIndex + 6][3] = newTaskId; // Update the CSV data in memory
    }

    tasks.push({ name: taskName, duration: duration, taskId: newTaskId });
    logger('debug', `Task: ${taskName}, Duration: ${durationStr}, Parsed Duration: ${duration}, TaskID: ${newTaskId}`);
  }
});

logger('info', `Total tasks found: ${tasks.length}`);
return tasks;

}

// Group tasks by database based on categorization
function groupTasksByDatabase(tasks, categorizedTasks, databaseConfig) {
  const tasksByDatabase = {};
  const date = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd");

  categorizedTasks.forEach(catTask => {
    if (!catTask || typeof catTask !== 'object') {
      logger('warning', `Skipping invalid categorized task: ${JSON.stringify(catTask)}`);
      return;
    }

    const { task: originalTask, category, client, cleaned_task: cleanedTask, task_id: taskId } = catTask;
    const taskData = tasks.find(t => t.name === originalTask);

    if (!taskData) {
      logger('warning', `Skipping task with missing data: ${originalTask}`);
      return;
    }

    const databaseId = getDatabaseId(category, client, databaseConfig);
    if (!databaseId) {
      logger('error', `No database ID found for task: ${cleanedTask}, Category: ${category}, Client: ${client}`);
      return;
    }

    if (!tasksByDatabase[databaseId]) {
      tasksByDatabase[databaseId] = [];
    }

    tasksByDatabase[databaseId].push({
      name: cleanedTask,
      duration: taskData.duration,
      date: date,
      category: category,
      client: client,
      taskId: taskId,
      databaseId: databaseId
    });
  });

  logger('debug', `Tasks grouped by database: ${JSON.stringify(tasksByDatabase)}`);
  return tasksByDatabase;
}

// Update Notion databases with grouped tasks
function updateNotionDatabases(tasksByDatabase, headers) {
  Object.entries(tasksByDatabase).forEach(([databaseId, tasks]) => {
    logger('info', `Processing tasks for database_id: ${databaseId}`);
    const existingTasks = getExistingTasks(tasks[0].date, databaseId, headers);
    tasks.forEach(task => {
      try {
        updateNotionTask(
          task.name,
          task.duration,
          task.date,
          task.category,
          task.client,
          task.databaseId,
          headers,
          task.taskId,
          existingTasks
        );
      } catch (error) {
        logger('error', `Failed to update task: ${task.name}. Error: ${error.toString()}`);
        // Continue processing other tasks
      }
    });
  });
}

// Verify that all required database IDs are present
function verifyDatabaseIds(databaseConfig) {
  const requiredDatabases = ['default', 'work', 'personal'];
  requiredDatabases.forEach(db => {
    if (!databaseConfig[db]) {
      throw new Error(`Missing required database ID for: ${db}`);
    }
  });
  logger('info', 'All required database IDs are present');
}

// Set up time-based trigger to run main function daily
function createTimeTrigger() {
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .create();
}