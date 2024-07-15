function categorizeTasks(tasks, openaiApiKey) {
  const prompt = `
Categorize the following tasks into these categories: Client Work, Work, Personal.
If it's Client Work, also identify the client name.
Tasks:
${tasks}
Respond in JSON format:
[
  {
    "task": "Original task name",
    "category": "Client Work/Work/Personal",
    "client": "Client name or null if not applicable",
    "cleaned_task": "Cleaned up task name",
    "task_id": null
  },
  ...
]
`;

  const url = 'https://api.openai.com/v1/chat/completions';
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    payload: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        {role: "system", content: "You are a helpful assistant that categorizes tasks."},
        {role: "user", content: prompt}
      ],
      temperature: 0.7,
      max_tokens: 1000
    }),
    muteHttpExceptions: true
  };

  return retryOperation(() => {
    const response = UrlFetchApp.fetch(url, options);
    const responseText = response.getContentText();
    logger('debug', `OpenAI API response: ${responseText}`);
    const parsedResponse = JSON.parse(responseText);
    
    if (!parsedResponse.choices || !parsedResponse.choices[0] || !parsedResponse.choices[0].message || !parsedResponse.choices[0].message.content) {
      throw new Error('Unexpected response structure from OpenAI API');
    }
    
    const contentText = parsedResponse.choices[0].message.content;
    const jsonMatch = contentText.match(/```json\n([\s\S]*)\n```/) || [null, contentText];
    const jsonContent = jsonMatch[1].trim();
    
    const categorizedTasks = JSON.parse(jsonContent);
  
    // Preserve existing TaskIDs
// Preserve existing TaskIDs
categorizedTasks.forEach(task => {
  const taskIdMatch = task.task.match(/\[TaskID: (.+?)\]/);
  if (taskIdMatch) {
    task.task_id = taskIdMatch[1];
    task.task = task.task.replace(/\[TaskID: .+?\]/, '').trim(); // Remove TaskID from task name
  }
});

  
    return categorizedTasks;
  });
}