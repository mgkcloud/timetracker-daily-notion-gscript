function roundToQuarterHour(minutes) {
  return Math.round(minutes / 15) * 15 / 60;
}

function parseDuration(durationStr) {
  const [h, m, s] = durationStr.split(":").map(Number);
  return roundToQuarterHour(h * 60 + m + s / 60);
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
    const matchingTask = existingTasks.find(task =>
      task.properties.TaskID.rich_text[0]?.text.content === taskId
    );
    if (matchingTask) return matchingTask;
  }
  
  // If no match by TaskID, try matching by name
  return existingTasks.find(task =>
    task.properties.Name.title[0].text.content.toLowerCase() === taskName.toLowerCase()
  );
}