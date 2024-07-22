function roundToQuarterHour(minutes) {
  return Math.round(minutes / 15) * 15 / 60;
}

function parseDuration(durationStr) {
  const [h, m, s] = durationStr.split(":").map(Number);
  return roundToQuarterHour(h * 60 + m + s / 60);
}

function calculateDurationMonth(taskDate, billingDate, totalDuration) {
  const taskDateObj = new Date(taskDate);
  const billingDay = new Date(billingDate).getDate();

  // Calculate start and end of the billing month
  const billingMonthStart = new Date(taskDateObj.getFullYear(), taskDateObj.getMonth(), billingDay);
  const billingMonthEnd = new Date(taskDateObj.getFullYear(), taskDateObj.getMonth() + 1, billingDay);

  // Check if task falls within the billing month
  if (taskDateObj >= billingMonthStart && taskDateObj < billingMonthEnd) {
    return totalDuration; // Task fully within billing month
  } else if (taskDateObj < billingMonthStart) {
    return 0; // Task before billing month
  } else {
    // Task spans across billing month end, calculate overlap
    const overlapDays = (billingMonthEnd - taskDateObj) / (1000 * 60 * 60 * 24); // Days overlapping
    return roundToQuarterHour(overlapDays * 24); // Convert to hours and round
  }
}


function getDatabaseId(category, client, databaseConfig) {
  let databaseId;
  if (category === "Client Work" && client) {
    databaseId = databaseConfig.clients[client] || databaseConfig.default;
  } else if (category === "Work") {
    databaseId = databaseConfig.work;
  } else if (category === "Personal") {
    databaseId = databaseConfig.personal;
  } else {
    databaseId = databaseConfig.default;
  }
  
  if (!databaseId) {
    logger('error', `No database ID found for category: ${category}, client: ${client}`);
    logger('debug', `Database config: ${JSON.stringify(databaseConfig)}`);
  } else {
    logger('debug', `Database ID found: ${databaseId} for category: ${category}, client: ${client}`);
  }
  
  return databaseId;
}

function generateTaskId() {
  return Utilities.getUuid();
}

function findMatchingTask(taskName, taskId, existingTasks) {
  if (taskId) {
    return existingTasks.find(task => 
      task.properties.TaskID.rich_text[0]?.text.content === taskId
    );
  }

  // Improved task name comparison (case-insensitive and removes special characters)
  const cleanedTaskName = taskName.toLowerCase().replace(/[^a-z0-9\s]/g, ''); 
  return existingTasks.find(task => {
    const existingCleanedName = task.properties.Name.title[0].text.content.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return existingCleanedName === cleanedTaskName;
  });
}
