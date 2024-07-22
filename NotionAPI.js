function fetchDatabaseConfigFromNotion(notionApiKey, configDatabaseId) {
  const cachedConfig = getCachedDatabaseConfig();
  if (cachedConfig) {
    logger('info', 'Using cached database configuration');
    return cachedConfig;
  }

  const headers = getNotionHeaders(notionApiKey);
  const url = `https://api.notion.com/v1/databases/${configDatabaseId}/query`;
  const options = {
    method: 'post',
    headers: headers,
    muteHttpExceptions: true
  };

  return retryOperation(() => {
    const response = UrlFetchApp.fetch(url, options);
    const results = JSON.parse(response.getContentText()).results;
    const databaseConfig = {default: "", work: "", personal: "", clients: {}};
    
    results.forEach(row => {
      const properties = row.properties;
      const category = properties.Category.select.name;
      const databaseId = properties.DatabaseID.rich_text[0].text.content;
      
      if (category === "Default") databaseConfig.default = databaseId;
      else if (category === "Work") databaseConfig.work = databaseId;
      else if (category === "Personal") databaseConfig.personal = databaseId;
      else if (category === "Client") {
        const clientName = properties.ClientName.rich_text[0].text.content;
        databaseConfig.clients[clientName] = databaseId;
      }
    });
    
    setCachedDatabaseConfig(databaseConfig);
    logger('info', `Database configuration fetched and cached: ${JSON.stringify(databaseConfig)}`);
    return databaseConfig;
  });
}

function fetchBillingDate(databaseId, headers) {
  const url = `https://api.notion.com/v1/databases/${databaseId}`;
  const options = {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  };

  return retryOperation(() => {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    const billingDate = data.properties['Billing Date'].date.start; // Assuming "Billing Date" is the property name
    logger('info', `Billing Date for database ${databaseId}: ${billingDate}`);
    return billingDate;
  });
}


function getExistingTasks(date, databaseId, headers) {
  const url = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const payload = {
    filter: {
      property: "Date",
      date: {equals: date}
    }
  };
  const options = {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  return retryOperation(() => {
    const response = UrlFetchApp.fetch(url, options);
    const tasks = JSON.parse(response.getContentText()).results;
    logger('info', `Retrieved ${tasks.length} existing tasks for date ${date}`);
    return tasks;
  });
}

function updateNotionTask(taskName, duration, date, category, client, databaseId, headers, taskId, existingTasks) {
  logger('debug', `Updating task: ${taskName}, Duration: ${duration}, Date: ${date}, Category: ${category}, Client: ${client}, DatabaseID: ${databaseId}`);
  
  try {
    if (!existingTasks) {
      existingTasks = getExistingTasks(date, databaseId, headers);
    }
    
    const matchingTask = findMatchingTask(taskName, taskId, existingTasks);
    
    if (matchingTask) {
      // Update existing task
      const pageId = matchingTask.id;
      const url = `https://api.notion.com/v1/pages/${pageId}`;
      // const existingDuration = matchingTask.properties.Duration.number || 0;
      const newDuration = roundToQuarterHour(duration);
      const billingDate = fetchBillingDate(databaseId, headers);
      const durationMonth = calculateDurationMonth(date, billingDate, duration);


      const data = {
        properties: {
          Duration: { number: newDuration },
          Name: { title: [{ text: { content: taskName } }] },
          Category: { rich_text: [{ text: { content: category } }] },
          TaskID: { rich_text: [{ text: { content: matchingTask.properties.TaskID.rich_text[0]?.text.content || taskId || generateTaskId() } }] }
        }
      };

      data.properties['Duration (month)'] = { number: durationMonth };

      
      const options = {
        method: 'patch',
        headers: headers,
        payload: JSON.stringify(data),
        muteHttpExceptions: true
      };
      
      logger('debug', `Updating existing task. URL: ${url}, Options: ${JSON.stringify(options)}`);
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseBody = response.getContentText();
      logger('info', `Updated existing task: ${taskName}. Response Code: ${responseCode}, Body: ${responseBody}`);
      
      if (responseCode >= 400) {
        throw new Error(`Failed to update task. Response Code: ${responseCode}, Body: ${responseBody}`);
      }
    } else {
      const url = "https://api.notion.com/v1/pages";
      const newTaskId = taskId || generateTaskId();
      const data = {
        parent: { database_id: databaseId },
        properties: {
          Name: { title: [{ text: { content: taskName } }] },
          Duration: { number: duration },
          Date: { date: { start: date } },
          Category: { rich_text: [{ text: { content: category } }] },
          TaskID: { rich_text: [{ text: { content: newTaskId } }] }
        }
      };
      if (client) {
        data.properties.Client = { rich_text: [{ text: { content: client } }] };
      }
      
      const options = {
        method: 'post',
        headers: headers,
        payload: JSON.stringify(data),
        muteHttpExceptions: true
      };
      
      logger('debug', `Creating new task. URL: ${url}, Options: ${JSON.stringify(options)}`);
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseBody = response.getContentText();
      logger('info', `Created new task: ${taskName}. Response Code: ${responseCode}, Body: ${responseBody}`);
      
      if (responseCode >= 400) {
        throw new Error(`Failed to create task. Response Code: ${responseCode}, Body: ${responseBody}`);
      }
    }
  } catch (error) {
    logger('error', `Error in updateNotionTask: ${error.toString()}`);
    logger('error', `Failed task details: Name: ${taskName}, Duration: ${duration}, Date: ${date}, Category: ${category}, Client: ${client}, DatabaseID: ${databaseId}`);
    throw error;
  }
}

function updateExistingTask(matchingTask, taskName, duration, headers) {
  const pageId = matchingTask.id;
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const existingDuration = matchingTask.properties.Duration.number || 0;
  const newDuration = roundToQuarterHour(existingDuration + duration);
  const data = {
    properties: {
      Duration: { number: newDuration },
      Name: { title: [{ text: { content: taskName } }] }
    }
  };
  
  return retryOperation(() => {
    const options = {
      method: 'patch',
      headers: headers,
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    };
    logger('debug', `Updating existing task. URL: ${url}, Options: ${JSON.stringify(options)}`);
    const response = UrlFetchApp.fetch(url, options);
    logger('info', `Updated existing task: ${taskName}. Response Code: ${response.getResponseCode()}`);
    return JSON.parse(response.getContentText());
  });
}

function createNewTask(taskName, duration, date, category, client, databaseId, headers, taskId) {
  const url = "https://api.notion.com/v1/pages";
  taskId = taskId || generateTaskId();
  const data = {
    parent: { database_id: databaseId },
    properties: {
      Name: { title: [{ text: { content: taskName } }] },
      Duration: { number: duration },
      Date: { date: { start: date } },
      Category: { rich_text: [{ text: { content: category } }] },
      TaskID: { rich_text: [{ text: { content: taskId } }] }
    }
  };
  if (client) {
    data.properties.Client = { select: { name: client } };
  }
  
  return retryOperation(() => {
    const options = {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    };
    logger('debug', `Creating new task. URL: ${url}, Options: ${JSON.stringify(options)}`);
    const response = UrlFetchApp.fetch(url, options);
    logger('info', `Created new task: ${taskName}. Response Code: ${response.getResponseCode()}`);
    return JSON.parse(response.getContentText());
  });
}

function retryOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return operation();
    } catch (error) {
      if (attempt === maxRetries) {
        logger('error', `Operation failed after ${maxRetries} attempts: ${error.toString()}`);
        throw error;
      }
      logger('warning', `Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      Utilities.sleep(delay);
      delay *= 2; // Exponential backoff
    }
  }
}